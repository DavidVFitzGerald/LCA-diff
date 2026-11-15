"""Bounded, namespace-tolerant EcoSpold extraction without source rewriting."""

from typing import Any
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeET


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def source_tree(element: Element) -> dict[str, Any]:
    return {
        "tag": element.tag,
        "attributes": dict(element.attrib),
        "text": element.text,
        "tail": element.tail,
        "children": [source_tree(child) for child in element],
    }


def child(element: Element, tag: str) -> Element | None:
    return next((node for node in element if local(node.tag) == tag), None)


def parse_xml(content: bytes, *, max_bytes: int) -> dict[str, Any]:
    try:
        return _parse_xml(content, max_bytes=max_bytes)
    except Exception:
        return {"processes": [], "error": "XML_EXTRACTION_INVALID"}


def _parse_xml(content: bytes, *, max_bytes: int) -> dict[str, Any]:
    if len(content) > max_bytes:
        return {"processes": [], "error": "XML_SIZE_BUDGET"}
    try:
        root = SafeET.fromstring(
            content, forbid_dtd=True, forbid_entities=True, forbid_external=True
        )
    except Exception:
        # Source exception messages can contain licensed snippets; return a safe
        # code and retain the exact original bytes in the private archive.
        return {"processes": [], "error": "XML_PARSE_OR_UNSAFE"}
    if local(root.tag) != "ecoSpold":
        return {"processes": [], "error": "XML_ROOT_INVALID"}
    stack = [(root, 0)]
    count = 0
    while stack:
        node, depth = stack.pop()
        count += 1
        if depth > 128 or count > 200_000:
            return {"processes": [], "error": "XML_STRUCTURE_BUDGET"}
        stack.extend((node_child, depth + 1) for node_child in node)
    processes = []
    for ordinal, dataset in enumerate(node for node in root if local(node.tag) == "dataset"):
        metadata = child(dataset, "metaInformation")
        information = child(metadata, "processInformation") if metadata is not None else None
        reference = child(information, "referenceFunction") if information is not None else None
        geography = child(information, "geography") if information is not None else None
        flow_data = child(dataset, "flowData")
        exchanges = []
        for position, exchange in enumerate(
            node
            for node in (flow_data if flow_data is not None else [])
            if local(node.tag) == "exchange"
        ):
            groups = [
                (local(node.tag), (node.text or "").strip())
                for node in exchange
                if local(node.tag) in ("inputGroup", "outputGroup")
            ]
            attributes = exchange.attrib
            exchanges.append(
                {
                    "exchange_ordinal": position,
                    "number": attributes.get("number"),
                    "name": attributes.get("name"),
                    "mean_value": attributes.get("meanValue"),
                    "unit": attributes.get("unit"),
                    "category": attributes.get("category"),
                    "subcategory": attributes.get("subCategory"),
                    "location": attributes.get("location"),
                    "input_group": next(
                        (value for kind, value in groups if kind == "inputGroup"), None
                    ),
                    "output_group": next(
                        (value for kind, value in groups if kind == "outputGroup"), None
                    ),
                    "group_count": len(groups),
                    "original": source_tree(exchange),
                }
            )
        processes.append(
            {
                "dataset_number": dataset.get("number"),
                "extraction_ordinal": ordinal,
                "reference_attributes": dict(reference.attrib) if reference is not None else {},
                "geography": geography.get("location") if geography is not None else None,
                "source_metadata": {
                    "dataset_attributes": dict(dataset.attrib),
                    "metadata": source_tree(metadata) if metadata is not None else None,
                },
                "exchanges": exchanges,
            }
        )
    return {"processes": processes, "error": None if processes else "XML_DATASET_MISSING"}


def classify(exchange: dict[str, Any]) -> str | None:
    if exchange.get("group_count", 1) != 1:
        return None
    return {
        (None, "0"): "Reference",
        ("5", None): "Technosphere",
        ("4", None): "Ecosphere Input",
        (None, "4"): "Ecosphere Output",
    }.get((exchange.get("input_group"), exchange.get("output_group")))
