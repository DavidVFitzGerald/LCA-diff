"""Streaming OOXML cells: retain numeric lexemes and original types, never floats."""

import posixpath
import re
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from defusedxml import ElementTree as SafeET

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
UNIT = re.compile(r"^(.*?)\s*\[([^\[\]]+)\]\s*$")


def letter(index: int) -> str:
    result = ""
    while index:
        index, digit = divmod(index - 1, 26)
        result = chr(65 + digit) + result
    return result


LETTERS = tuple(letter(index) for index in range(1, 52))


def member_path(target: str) -> str:
    path = posixpath.normpath(target.lstrip("/") if target.startswith("/") else "xl/" + target)
    if path.startswith("../") or not path.startswith("xl/"):
        raise ValueError("Workbook relationship escapes its package")
    return path


def rows(path: Path, sheet: str) -> Iterator[tuple[int, dict[str, dict[str, Any]]]]:
    with zipfile.ZipFile(path) as workbook:
        entries = workbook.infolist()
        if len(entries) > 10_000 or sum(item.file_size for item in entries) > 1024**3:
            raise ValueError("Workbook package exceeds resource budget")
        strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            with workbook.open("xl/sharedStrings.xml") as stream:
                for _, element in SafeET.iterparse(
                    stream,
                    events=("end",),
                    forbid_dtd=True,
                    forbid_entities=True,
                    forbid_external=True,
                ):
                    if element.tag == "{" + NS["s"] + "}si":
                        strings.append("".join(element.itertext()))
                        element.clear()
        relationships = {
            element.get("Id"): element.get("Target", "")
            for element in SafeET.fromstring(
                workbook.read("xl/_rels/workbook.xml.rels"), forbid_dtd=True
            )
            if element.get("TargetMode") != "External"
        }
        document = SafeET.fromstring(workbook.read("xl/workbook.xml"), forbid_dtd=True)
        requested = next(
            (
                element
                for element in document.findall("s:sheets/s:sheet", NS)
                if element.get("name") == sheet
            ),
            None,
        )
        if requested is None:
            raise ValueError("Required worksheet is missing")
        target = member_path(relationships[requested.get(RELATIONSHIP)])
        with workbook.open(target) as stream:
            for _, element in SafeET.iterparse(
                stream, events=("end",), forbid_dtd=True, forbid_entities=True, forbid_external=True
            ):
                if element.tag != "{" + NS["s"] + "}row":
                    continue
                result: dict[str, dict[str, Any]] = {}
                for cell in element.findall("s:c", NS):
                    address = cell.get("r", "")
                    column = re.sub("[0-9]", "", address)
                    value_node = cell.find("s:v", NS)
                    raw = None if value_node is None else value_node.text
                    kind = cell.get("t", "n")
                    value = raw
                    if kind == "s" and raw is not None:
                        value = strings[int(raw)]
                    elif kind == "inlineStr":
                        inline = cell.find("s:is", NS)
                        value = "".join(inline.itertext()) if inline is not None else None
                    formula = cell.find("s:f", NS)
                    result[column] = {
                        "value": value,
                        "type": kind,
                        "raw_value": raw,
                        "formula": formula.text if formula is not None else None,
                        "style": cell.get("s"),
                    }
                yield int(element.get("r", "0")), result
                element.clear()


def cells51(cells: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        column: cells.get(
            column,
            {"value": None, "type": "absent", "raw_value": None, "formula": None, "style": None},
        )
        for column in LETTERS
    }


def headers(
    first: dict[str, dict[str, Any]], second: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    columns = []
    issues = []
    method = None
    for index, column in enumerate(LETTERS[4:], start=5):
        raw_method = first.get(column, {}).get("value")
        if raw_method:
            method = str(raw_method)
        heading = second.get(column, {}).get("value")
        match = UNIT.fullmatch(heading) if isinstance(heading, str) else None
        if method is None or match is None:
            issues.append(
                {
                    "code": "LCIA_HEADER_INVALID",
                    "column": column,
                    "column_index": index,
                    "original_row1": first.get(column),
                    "original_row2": second.get(column),
                    "message": "Missing method, indicator or verified trailing bracket unit",
                }
            )
        columns.append(
            {
                "column_index": index,
                "column_letter": column,
                "method_heading": method,
                "indicator_heading": heading,
                "indicator_name": match[1].strip() if match else None,
                "unit": match[2].strip() if match else None,
                "source_order": index - 5,
                "original_cells": {"row1": first.get(column), "row2": second.get(column)},
            }
        )
    for column in set(first) | set(second):
        if column not in LETTERS:
            issues.append(
                {
                    "code": "LCIA_UNEXPECTED_COLUMN",
                    "column": column,
                    "message": "Column outside required A:AY span",
                    "original_row1": first.get(column),
                    "original_row2": second.get(column),
                }
            )
    return columns, issues
