"""Entirely invented golden source generator; no provider content or scores."""

import json
import zipfile
from pathlib import Path
from uuid import uuid4
from xml.sax.saxutils import escape, quoteattr

from lca_etl.models import Manifest
from lca_etl.workbook import LETTERS


def exchange(
    number: str,
    amount: str,
    *,
    name: str = "Synthetic flow",
    unit: str = "kg",
    category: str = "air",
    subcategory: str = "urban",
    group: str = "outputGroup",
    code: str = "4",
) -> str:
    return f'<exchange number={quoteattr(number)} name={quoteattr(name)} meanValue={quoteattr(amount)} unit={quoteattr(unit)} category={quoteattr(category)} subCategory={quoteattr(subcategory)} location="CH"><{group}>{code}</{group}><generalComment>Invented, &quot;quoted&quot;\nsource detail</generalComment></exchange>'


def process(number: str, name: str, body: str, *, unit: str = "kg", amount: str = "1") -> str:
    reference = exchange(
        number,
        amount,
        name=name,
        unit=unit,
        category="Synthetic",
        subcategory="Nested/Leaf",
        code="0",
    )
    return f'<ecoSpold><dataset number={quoteattr(number)}><metaInformation><processInformation><geography location="CH"/><referenceFunction name={quoteattr(name)} unit={quoteattr(unit)} amount={quoteattr(amount)} category="Synthetic" subCategory="Nested/Leaf" infrastructureProcess="True"/></processInformation></metaInformation><flowData>{reference}{body}</flowData></dataset></ecoSpold>'


def workbook(path: Path) -> None:
    def text_cell(address: str, value: str) -> str:
        return f'<c r="{address}" t="inlineStr"><is><t xml:space="preserve">{escape(value)}</t></is></c>'

    first = (
        '<row r="1">'
        + text_cell("E1", "IPCC 2021")
        + text_cell("U1", "Ecological Scarcity 2021")
        + text_cell("AK1", "EF 3.1")
        + "</row>"
    )
    second = (
        '<row r="2">'
        + "".join(
            text_cell(
                f"{column}2",
                "GWP 100 [kg CO2-eq]" if column == "E" else f"Invented indicator {index} [Pt]",
            )
            for index, column in enumerate(LETTERS[4:])
        )
        + "</row>"
    )
    source_rows = [
        ('Alpha, "quoted"\nline - CH', "kg"),
        ("Beta - CH", "m"),
        ("Gamma - CH", "kg"),
        ("Multi - CH", "kg"),
        ("Missing reference - CH", "kg"),
        ("Missing reference - CH", "kg"),
        ("No XML process - CH", "kg"),
        ("Approved synthetic alias - CH", "kg"),
    ]
    content = first + second
    for row, (name, unit) in enumerate(source_rows, start=3):
        content += f'<row r="{row}">' + "".join(
            text_cell(f"{column}{row}", value)
            for column, value in zip(
                LETTERS[:4], (name, "Synthetic", "Nested/Leaf", unit), strict=True
            )
        )
        for column in LETTERS[4:]:
            if row == 3 and column == "G":
                continue
            value = (
                "0"
                if row == 3 and column == "E"
                else ("-1.000000000000000000000000000000001e-40" if column == "F" else "2")
            )
            content += f'<c r="{column}{row}" t="n"><v>{value}</v></c>'
        content += "</row>"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
        zipped.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="BAFU_2026 v1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        zipped.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        )
        zipped.writestr(
            "xl/worksheets/sheet1.xml",
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:AY10"/><sheetData>'
            + content
            + "</sheetData></worksheet>",
        )


def fixture(directory: Path, *, invalid: bool = False) -> Manifest:
    directory.mkdir(parents=True, exist_ok=True)
    xml = directory / "xml"
    xml.mkdir()
    alpha = 'Alpha, "quoted"\nline'
    duplicate = exchange("e1", "1.000000000000000000000000000000000000001") + exchange(
        "e1", "-1.000000000000000000000000000000000000001"
    )
    distinct = exchange("e1", "-2", subcategory="rural")
    (xml / "1.xml").write_text(
        process(
            "1",
            alpha,
            duplicate + distinct + exchange("2", "-3", group="inputGroup", code="5", unit="km"),
        )
    )
    (xml / "2.xml").write_text(process("2", "Beta", "", unit="km"))
    (xml / "3.xml").write_text(process("3", "Gamma", "", amount="0.1"))
    (xml / "4.xml").write_text(process("4", "Multi", exchange("second", "1", code="0")))
    (xml / "5.xml").write_text(process("5", "Delta", ""))
    (xml / "6.xml").write_text(
        process("6", "Missing reference", exchange("999", "-2", group="inputGroup", code="5"))
    )
    (xml / "7.xml").write_text(
        process(
            "7", "Manual reference", exchange("777", "2", group="inputGroup", code="5", unit="km")
        )
    )
    if invalid:
        (xml / "unsafe.xml").write_text(
            '<!DOCTYPE ecoSpold [<!ENTITY x SYSTEM "file:///etc/passwd">]><ecoSpold>&x;</ecoSpold>'
        )
        (xml / "unknown.xml").write_text(
            process("8", "Unknown group", exchange("e", "NaN", code="9"))
        )
    scores = directory / "scores.xlsx"
    workbook(scores)
    version = "synthetic-" + str(uuid4())
    rules = {
        "format_version": 1,
        "version": "synthetic-1",
        "rules": [
            {
                "id": str(uuid4()),
                "rule_type": "row_mapping",
                "release_version": version,
                "excel_row": 10,
                "target_number": "7",
                "author": "synthetic fixture",
                "evidence": "Invented explicit verified row alias; test-only approval",
                "approved": True,
                "approved_by": "fixture",
                "version": "1",
            },
            {
                "id": str(uuid4()),
                "rule_type": "reference_mapping",
                "release_version": version,
                "process_number": "7",
                "source_number": "777",
                "target_number": "2",
                "author": "synthetic fixture",
                "evidence": "Invented reference correction for a deterministic test",
                "approved": True,
                "approved_by": "fixture",
                "version": "1",
            },
            {
                "id": str(uuid4()),
                "rule_type": "score_basis",
                "release_version": version,
                "process_number": "2",
                "source_quantity": "1",
                "source_unit": "m",
                "target_quantity": "1",
                "target_unit": "km",
                "factor": "1000",
                "author": "synthetic fixture",
                "evidence": "Invented explicit per-metre score basis converted to one kilometre; test evidence only",
                "approved": True,
                "approved_by": "fixture",
                "version": "1",
            },
        ],
    }
    validation = directory / "validation.json"
    validation.write_text(json.dumps(rules))
    basis = directory / "basis.json"
    basis.write_text(json.dumps({"format_version": 1, "version": "synthetic-1", "rules": []}))
    manifest = Manifest.model_validate(
        {
            "release": {"release_version": version, "display_name": "Invented synthetic release"},
            "sources": {"process_xml_directory": xml, "lcia_workbook": scores},
            "work_directory": directory / "runs",
            "validation_rules": validation,
            "score_basis_rules": basis,
        }
    )
    (directory / "manifest.json").write_text(manifest.model_dump_json())
    return manifest
