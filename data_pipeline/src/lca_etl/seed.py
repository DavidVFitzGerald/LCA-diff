"""Deterministic invented local release: sources, pre-built artifact and idempotent B4 load.

Every name, number and score here is invented for the local single-command stack
(ADR 0006). Nothing is provider data. The committed artifact is regenerated from
the committed sources with the normal B3 pipeline and loaded only through B4
`promote` and `publish`, so the local stack uses the real publication semantics.
"""

import argparse
import json
import shutil
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID
from xml.sax.saxutils import escape, quoteattr

from lca_etl.workbook import LETTERS

RELEASE_VERSION = "synthetic-local-2026.1"
DISPLAY_NAME = "Synthetic local demo release (invented data)"
# Fixed operation identities make every restart reuse the committed B4 receipts.
PROMOTE_OPERATION = UUID("6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e01")
PUBLISH_OPERATION = UUID("6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e02")
SHEET = "BAFU_2026 v1"
ZIP_DATE = (2026, 1, 1, 0, 0, 0)

# Exact values the seed tests and live smoke check assert after the round trip.
HIGH_PRECISION_FLOW = "1.234567890123456789012345678901234"
TINY_FLOW = "0.0000000000000000000000000000000012345"
HIGH_PRECISION_SCORE = "12.3456789012345678901234567890123"
TINY_SCORE = "1.000000000000000000000000000000001e-40"


@dataclass(frozen=True)
class Flow:
    number: str
    name: str
    unit: str
    category: str
    subcategory: str
    group: str
    code: str


@dataclass(frozen=True)
class Process:
    number: str
    name: str
    category: str
    subcategory: str
    unit: str
    geography: str
    amount: str = "1"
    inputs: tuple[tuple[str, str], ...] = ()
    elementary: tuple[tuple[str, str], ...] = ()
    scores: dict[str, str | None] = field(default_factory=dict)
    workbook_row: bool = True
    second_reference: bool = False


FLOWS = {
    flow.number: flow
    for flow in (
        Flow("9001", "Carbon dioxide, fossil", "kg", "air", "unspecified", "outputGroup", "4"),
        Flow("9002", "Methane, fossil", "kg", "air", "unspecified", "outputGroup", "4"),
        Flow(
            "9003",
            "Particulates, < 2.5 um",
            "kg",
            "air",
            "high population density",
            "outputGroup",
            "4",
        ),
        Flow("9004", "Mercury", "kg", "air", "unspecified", "outputGroup", "4"),
        Flow("9005", "Zinc, ion", "kg", "water", "ground-", "outputGroup", "4"),
        Flow("9006", "Water, river", "m3", "natural resource", "in water", "inputGroup", "4"),
        Flow(
            "9007",
            "Occupation, industrial area",
            "m2a",
            "natural resource",
            "land",
            "inputGroup",
            "4",
        ),
    )
}

CO2 = "9001"
PROCESSES = (
    Process(
        "1",
        "electricity, hydropower, run-of-river",
        "Energy",
        "Electricity/Hydropower",
        "kWh",
        "CH",
        elementary=(("9006", "71.3"),),
        scores={"F": "0"},
    ),
    Process(
        "2",
        "electricity, hydropower, reservoir",
        "Energy",
        "Electricity/Hydropower",
        "kWh",
        "CH",
        elementary=(("9006", "52.1"), ("9002", "0.0000271")),
    ),
    Process(
        "3",
        "electricity, photovoltaic, rooftop",
        "Energy",
        "Electricity/Photovoltaic",
        "kWh",
        "CH",
        elementary=((CO2, "0"), ("9007", "0.00112")),
    ),
    Process(
        "4",
        "electricity, photovoltaic, open ground",
        "Energy",
        "Electricity/Photovoltaic",
        "kWh",
        "DE",
        elementary=(("9007", "0.0251"),),
    ),
    Process(
        "5",
        "heat, natural gas, condensing boiler",
        "Energy",
        "Heat/Natural gas",
        "MJ",
        "CH",
        inputs=(("9", "0.0275"),),
        elementary=((CO2, "0.0561"),),
    ),
    Process(
        "6",
        "heat, natural gas, industrial furnace",
        "Energy",
        "Heat/Natural gas",
        "MJ",
        "RER",
        inputs=(("9", "0.031"),),
        elementary=((CO2, "0.0605"), ("9002", "0.0000041")),
    ),
    Process(
        "7",
        "heat, wood chips, furnace 300 kW",
        "Energy",
        "Heat/Wood",
        "MJ",
        "CH",
        inputs=(("10", "0.071"),),
        elementary=(("9003", "0.0000823"),),
    ),
    Process(
        "8",
        "heat, wood pellets, furnace 50 kW",
        "Energy",
        "Heat/Wood",
        "MJ",
        "CH",
        elementary=(("9003", "0.0000391"),),
    ),
    Process(
        "9",
        "natural gas, high pressure",
        "Energy",
        "Fuels/Gaseous",
        "m3",
        "CH",
        elementary=((CO2, "0.00211"), ("9002", "0.000312")),
    ),
    Process("10", "wood chips, softwood", "Energy", "Fuels/Solid", "kg", "CH"),
    Process(
        "11",
        "steel, low-alloyed",
        "Materials",
        "Metals/Steel",
        "kg",
        "RER",
        inputs=(("1", "0.52"), ("22", "0.2")),
        elementary=((CO2, "1.21"), ("9004", TINY_FLOW)),
        scores={"G": TINY_SCORE},
    ),
    Process(
        "12",
        "steel, chromium steel 18/8",
        "Materials",
        "Metals/Steel",
        "kg",
        "RER",
        inputs=(("1", "0.94"),),
        elementary=(("9005", HIGH_PRECISION_FLOW),),
    ),
    Process(
        "13",
        "aluminium, primary, ingot",
        "Materials",
        "Metals/Aluminium",
        "kg",
        "RER",
        inputs=(("2", "14.9"),),
        elementary=((CO2, "8.6"),),
        scores={"E": HIGH_PRECISION_SCORE},
    ),
    Process(
        "14",
        "aluminium, recycled",
        "Materials",
        "Metals/Aluminium",
        "kg",
        "RER",
        inputs=(("1", "0.6"), ("22", "0.3")),
        elementary=((CO2, "-0.42"),),
    ),
    Process(
        "15",
        "concrete, normal",
        "Materials",
        "Construction/Concrete",
        "m3",
        "CH",
        inputs=(("16", "300"), ("22", "45")),
    ),
    Process(
        "16",
        "cement, Portland",
        "Materials",
        "Construction/Concrete",
        "kg",
        "CH",
        elementary=((CO2, "0.79"),),
    ),
    Process(
        "17",
        "sawn timber, softwood, dried",
        "Materials",
        "Construction/Timber",
        "m3",
        "CH",
        inputs=(("7", "1200"),),
        elementary=(("9006", "0.31"),),
    ),
    Process(
        "18",
        "glued laminated timber",
        "Materials",
        "Construction/Timber",
        "m3",
        "CH",
        inputs=(("17", "1.1"),),
        workbook_row=False,
    ),
    Process(
        "19",
        "polyethylene, high density, granulate",
        "Materials",
        "Plastics/Polyolefins",
        "kg",
        "RER",
        inputs=(("6", "17.3"), ("3", "1.1")),
        elementary=((CO2, "1.8"),),
    ),
    Process(
        "20",
        "polypropylene, granulate",
        "Materials",
        "Plastics/Polyolefins",
        "kg",
        "RER",
        inputs=(("6", "16.2"),),
    ),
    Process(
        "21",
        "polyethylene terephthalate, granulate, bottle grade",
        "Materials",
        "Plastics/Polyesters",
        "kg",
        "RER",
        inputs=(("6", "22.4"),),
    ),
    Process(
        "22",
        "transport, freight, lorry 16-32 t",
        "Transport",
        "Road/Freight",
        "tkm",
        "RER",
        elementary=((CO2, "0.0891"),),
    ),
    Process(
        "23",
        "transport, freight, rail",
        "Transport",
        "Rail/Freight",
        "tkm",
        "CH",
        inputs=(("1", "0.045"),),
        elementary=((CO2, "0.0102"),),
        scores={"E": None},
    ),
    Process(
        "24",
        "cement, Portland, packed in 25 kg bags",
        "Materials",
        "Construction/Concrete",
        "kg",
        "CH",
        amount="25",
        inputs=(("16", "25"),),
    ),
    Process(
        "25",
        "heat and power co-generation, natural gas",
        "Energy",
        "Heat/Natural gas",
        "MJ",
        "CH",
        inputs=(("9", "0.03"),),
        second_reference=True,
    ),
)

METHODS = (("E", "IPCC 2021"), ("U", "Ecological Scarcity 2021"), ("AK", "EF 3.1"))


def indicator_heading(index: int, column: str) -> str:
    if column == "E":
        return "GWP 100 [kg CO2-eq]"
    if column == "F":
        return "GWP 20 [kg CO2-eq]"
    if column == "U":
        return "Total [UBP]"
    if column == "AK":
        return "Climate change [kg CO2-eq]"
    unit = ("kg CO2-eq", "UBP", "Pt")[0 if index < 16 else 1 if index < 32 else 2]
    return f"Synthetic indicator {index + 1} [{unit}]"


def score(process_index: int, column_index: int) -> str:
    # Varied invented values; deterministic and exactly representable as text.
    whole = (process_index * 37 + column_index * 11) % 997
    fraction = (process_index * 131 + column_index * 17) % 1000
    return f"{whole}.{fraction:03d}"


def exchange(flow: Flow, amount: str, location: str) -> str:
    return (
        f"<exchange number={quoteattr(flow.number)} name={quoteattr(flow.name)}"
        f" meanValue={quoteattr(amount)} unit={quoteattr(flow.unit)}"
        f" category={quoteattr(flow.category)} subCategory={quoteattr(flow.subcategory)}"
        f" location={quoteattr(location)}><{flow.group}>{flow.code}</{flow.group}>"
        "<generalComment>Invented synthetic exchange</generalComment></exchange>"
    )


def reference_flow(process: Process) -> Flow:
    return Flow(
        process.number,
        process.name,
        process.unit,
        process.category,
        process.subcategory,
        "outputGroup",
        "0",
    )


def process_xml(process: Process) -> str:
    by_number = {item.number: item for item in PROCESSES}
    body = exchange(reference_flow(process), process.amount, process.geography)
    if process.second_reference:
        coproduct = Flow(
            process.number + "-co",
            "electricity, co-generation, natural gas",
            "kWh",
            "Energy",
            "Electricity/Co-generation",
            "outputGroup",
            "0",
        )
        body += exchange(coproduct, "0.25", process.geography)
    for number, amount in process.inputs:
        supplier = by_number[number]
        technosphere = Flow(
            supplier.number,
            supplier.name,
            supplier.unit,
            supplier.category,
            supplier.subcategory,
            "inputGroup",
            "5",
        )
        body += exchange(technosphere, amount, supplier.geography)
    for number, amount in process.elementary:
        body += exchange(FLOWS[number], amount, "GLO")
    reference = (
        f"<referenceFunction name={quoteattr(process.name)} unit={quoteattr(process.unit)}"
        f" amount={quoteattr(process.amount)} category={quoteattr(process.category)}"
        f' subCategory={quoteattr(process.subcategory)} infrastructureProcess="False"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f"<ecoSpold><dataset number={quoteattr(process.number)}><metaInformation>"
        f"<processInformation>{reference}<geography location={quoteattr(process.geography)}/>"
        "</processInformation></metaInformation>"
        f"<flowData>{body}</flowData></dataset></ecoSpold>\n"
    )


def text_cell(address: str, value: str) -> str:
    return (
        f'<c r="{address}" t="inlineStr"><is><t xml:space="preserve">{escape(value)}</t></is></c>'
    )


def worksheet() -> str:
    methods = dict(METHODS)
    first = (
        '<row r="1">'
        + "".join(text_cell(f"{column}1", name) for column, name in methods.items())
        + "</row>"
    )
    second = (
        '<row r="2">'
        + "".join(
            text_cell(f"{column}2", indicator_heading(index, column))
            for index, column in enumerate(LETTERS[4:])
        )
        + "</row>"
    )
    content = first + second
    row = 3
    for process_index, process in enumerate(PROCESSES, start=1):
        if not process.workbook_row:
            continue
        identity = (
            f"{process.name} - {process.geography}",
            process.category,
            process.subcategory,
            process.unit,
        )
        content += f'<row r="{row}">' + "".join(
            text_cell(f"{column}{row}", value)
            for column, value in zip(LETTERS[:4], identity, strict=True)
        )
        for column_index, column in enumerate(LETTERS[4:]):
            value = process.scores.get(column, score(process_index, column_index))
            if value is not None:
                content += f'<c r="{column}{row}" t="n"><v>{value}</v></c>'
        content += "</row>"
        row += 1
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:AY{row - 1}"/><sheetData>{content}</sheetData></worksheet>'
    )


def write_workbook(path: Path) -> None:
    members = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{SHEET}" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>"
        ),
        "xl/worksheets/sheet1.xml": worksheet(),
    }
    # Stored members and a fixed timestamp keep the package byte-for-byte stable.
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as workbook:
        for name, content in members.items():
            info = zipfile.ZipInfo(name, date_time=ZIP_DATE)
            info.external_attr = 0o644 << 16
            workbook.writestr(info, content.encode())


def write_sources(root: Path) -> list[Path]:
    """Write every committed seed input below `root`; returns the written files."""
    xml = root / "sources" / "xml"
    xml.mkdir(parents=True, exist_ok=True)
    written = []
    for process in PROCESSES:
        path = xml / f"{int(process.number):03d}.xml"
        path.write_text(process_xml(process), encoding="utf-8")
        written.append(path)
    workbook = root / "sources" / "scores.xlsx"
    write_workbook(workbook)
    written.append(workbook)
    rules = root / "rules"
    rules.mkdir(exist_ok=True)
    for name in ("validation.json", "score_basis.json"):
        path = rules / name
        path.write_text(
            json.dumps({"format_version": 1, "version": "synthetic-local-1", "rules": []}, indent=2)
            + "\n"
        )
        written.append(path)
    manifest = root / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "format_version": 1,
                "release": {"release_version": RELEASE_VERSION, "display_name": DISPLAY_NAME},
                "sources": {
                    "process_xml_directory": "sources/xml",
                    "lcia_workbook": "sources/scores.xlsx",
                    "lcia_sheet": SHEET,
                },
                "work_directory": "../../private/seed-build",
                "validation_rules": "rules/validation.json",
                "score_basis_rules": "rules/score_basis.json",
            },
            indent=2,
        )
        + "\n"
    )
    written.append(manifest)
    return written


def check_sources(root: Path, scratch: Path) -> list[str]:
    """Return committed source files that differ from a fresh deterministic generation."""
    generated = write_sources(scratch)
    differences = []
    for path in generated:
        relative = path.relative_to(scratch)
        committed = root / relative
        if not committed.is_file() or committed.read_bytes() != path.read_bytes():
            differences.append(relative.as_posix())
    committed_xml = {path.name for path in (root / "sources" / "xml").glob("*.xml")}
    generated_xml = {path.name for path in (scratch / "sources" / "xml").glob("*.xml")}
    differences.extend(sorted(f"sources/xml/{name}" for name in committed_xml - generated_xml))
    return differences


def build(root: Path) -> dict[str, Any]:
    """Regenerate sources, run the Spark-backed B3 pipeline and refresh the artifact.

    Requires the ETL container and a disposable import database in LCA_DATABASE_URL.
    """
    from lca_etl.intake import load_manifest
    from lca_etl.pipeline import execute

    write_sources(root)
    result = execute(load_manifest(root / "manifest.json"), use_spark=True)
    if result["status"] != "ready" or result.get("representative"):
        raise RuntimeError("Synthetic seed candidate is not a ready full candidate")
    source = Path(result["directory"]) / "artifact"
    destination = root / "artifact"
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)
    return {
        "revision_id": result["revision_id"],
        "artifact": str(destination / "manifest.json"),
    }


class SeedStateError(RuntimeError):
    """The target is not empty, seeded or partially seeded by this release."""


@dataclass(frozen=True)
class SeedState:
    revisions: tuple[UUID, ...]
    active: UUID | None


def check_state(state: SeedState, revision: UUID) -> None:
    """Refuse every state the seed did not create; never republish or add revisions."""
    if any(item != revision for item in state.revisions):
        raise SeedStateError("SEED_UNEXPECTED_REVISION")
    if state.active not in (None, revision):
        raise SeedStateError("SEED_UNEXPECTED_ACTIVE_REVISION")


def read_state(url: str, release: UUID) -> SeedState:
    from lca_shared.db import schema as db
    from sqlalchemy import create_engine, select

    database = create_engine(url, hide_parameters=True)
    try:
        with database.connect() as connection:
            revisions = tuple(
                connection.scalars(
                    select(db.release_revision.c.id)
                    .where(db.release_revision.c.database_release_id == release)
                    .order_by(db.release_revision.c.id)
                )
            )
            active = connection.scalar(
                select(db.release_publication.c.active_revision_id).where(
                    db.release_publication.c.database_release_id == release
                )
            )
    finally:
        database.dispose()
    return SeedState(revisions, active)


def load(artifact: Path, target_path: Path) -> dict[str, Any]:
    """Promote and publish the committed seed with fixed operation IDs (B4 reuse)."""
    from lca_etl.publication import activate, promote
    from lca_etl.publication_models import Target

    target = Target.model_validate_json(target_path.read_bytes())
    manifest = json.loads(artifact.read_bytes())
    release, revision = UUID(manifest["release_id"]), UUID(manifest["revision_id"])
    url = target.database_url("promote")
    before = read_state(url, release)
    check_state(before, revision)
    promoted = promote(artifact, target, PROMOTE_OPERATION)
    published = activate(
        target, "publish", revision, PUBLISH_OPERATION, expected=None, release_id=release
    )
    after = read_state(url, release)
    if after.revisions != (revision,) or after.active != revision:
        raise SeedStateError("SEED_UNEXPECTED_FINAL_STATE")
    return {
        "release_id": str(release),
        "revision_id": str(revision),
        "promote_reused": promoted["reused"],
        "publish_reused": published["reused"],
        "seeded": not published["reused"],
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m lca_etl.seed")
    commands = parser.add_subparsers(dest="command", required=True)
    sources = commands.add_parser("sources", help="write or check the committed seed sources")
    sources.add_argument("--root", type=Path, required=True)
    sources.add_argument("--check", type=Path, metavar="SCRATCH")
    built = commands.add_parser("build", help="regenerate the pre-built artifact (Spark)")
    built.add_argument("--root", type=Path, required=True)
    loaded = commands.add_parser("load", help="promote and publish the seed idempotently")
    loaded.add_argument("--artifact", type=Path, required=True)
    loaded.add_argument("--target", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "sources":
            if args.check is not None:
                differences = check_sources(args.root, args.check)
                result: dict[str, Any] = {"differences": differences}
                print(json.dumps(result, sort_keys=True))
                if differences:
                    raise SystemExit(1)
                return
            result = {"written": len(write_sources(args.root))}
        elif args.command == "build":
            result = build(args.root)
        else:
            result = load(args.artifact, args.target)
    except SeedStateError as error:
        print(json.dumps({"ok": False, "code": str(error)}))
        raise SystemExit(1) from None
    except Exception as error:
        from lca_etl.publication_models import OperationError

        code = str(error) if isinstance(error, OperationError) else "SEED_COMMAND_FAILED"
        print(json.dumps({"ok": False, "code": code, "error_type": type(error).__name__}))
        raise SystemExit(1) from None
    print(json.dumps(result, sort_keys=True))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
