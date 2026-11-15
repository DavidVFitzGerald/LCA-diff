"""Read-only inputs, immutable byte archives and bounded safe ZIP extraction."""

import hashlib
import json
import os
import shutil
import stat
import zipfile
from collections.abc import Iterator
from pathlib import Path, PurePosixPath
from typing import Any

from lca_etl.models import Manifest, RuleSet


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(canonical_json(value) + b"\n")
    os.replace(temporary, path)


def load_manifest(path: Path) -> Manifest:
    manifest = Manifest.model_validate_json(path.read_bytes())
    base = path.resolve().parent
    source = manifest.sources
    updates: dict[str, Any] = {}
    for field in ("process_xml_directory", "lcia_workbook"):
        value = getattr(source, field)
        if value is not None:
            updates[field] = (base / value).resolve()
    if source.archives is not None:
        updates["archives"] = source.archives.model_copy(
            update={
                key: (base / value).resolve() for key, value in source.archives.model_dump().items()
            }
        )
    return manifest.model_copy(
        update={
            "sources": source.model_copy(update=updates),
            "work_directory": (base / manifest.work_directory).resolve(),
            "validation_rules": (base / manifest.validation_rules).resolve(),
            "score_basis_rules": (base / manifest.score_basis_rules).resolve(),
        }
    )


def load_rules(manifest: Manifest) -> tuple[RuleSet, RuleSet]:
    sets = tuple(
        RuleSet.model_validate_json(path.read_bytes())
        for path in (
            manifest.validation_rules,
            manifest.score_basis_rules,
        )
    )
    seen = set()
    for rules in sets:
        for rule in rules.rules:
            if rule.id in seen:
                raise ValueError("Rule IDs must be unique across the two rule files")
            seen.add(rule.id)
            if rule.release_version != manifest.release.release_version:
                raise ValueError("Resolution rule belongs to a different provider release")
    return sets[0], sets[1]


def immutable_copy(source: Path, target: Path) -> dict[str, Any]:
    digest = sha256(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if sha256(target) != digest:
            raise ValueError("Immutable archive content mismatch")
    else:
        with source.open("rb") as reader, target.open("xb") as writer:
            shutil.copyfileobj(reader, writer)
        if sha256(target) != digest or target.stat().st_size != source.stat().st_size:
            target.unlink()
            raise ValueError("Source changed while it was being archived")
        target.chmod(0o440)
    return {"path": str(target), "sha256": digest, "byte_size": source.stat().st_size}


def safe_extract(archive: Path, target: Path, manifest: Manifest) -> list[dict[str, Any]]:
    target.mkdir(parents=True, exist_ok=True)
    inventory = []
    with zipfile.ZipFile(archive) as zipped:
        members = zipped.infolist()
        if len(members) > manifest.max_members:
            raise ValueError("Archive member count exceeds the manifest budget")
        total = 0
        names: set[str] = set()
        for member in members:
            raw = member.filename
            path = PurePosixPath(raw)
            mode = member.external_attr >> 16
            if (
                "\\" in raw
                or ":" in raw
                or path.is_absolute()
                or ".." in path.parts
                or "\x00" in raw
                or stat.S_ISLNK(mode)
                or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR))
                or member.flag_bits & 1
                or str(path) in names
            ):
                raise ValueError("Unsafe, encrypted or duplicate archive member")
            names.add(str(path))
            total += member.file_size
            if member.file_size > manifest.max_member_bytes or total > manifest.max_archive_bytes:
                raise ValueError("Archive exceeds the manifest byte budget")
            if member.file_size > max(1024 * 1024, member.compress_size * 1000):
                raise ValueError("Archive member compression ratio exceeds budget")
        for member in members:
            if member.is_dir():
                continue
            destination = target.joinpath(*PurePosixPath(member.filename).parts)
            if not destination.resolve().is_relative_to(target.resolve()):
                raise ValueError("Archive member escapes extraction root")
            destination.parent.mkdir(parents=True, exist_ok=True)
            # The private run directory belongs to this frozen input hash. Verify
            # existing content on retry rather than overwriting it.
            with zipped.open(member) as reader:
                content = reader.read(manifest.max_member_bytes + 1)
            if len(content) != member.file_size or len(content) > manifest.max_member_bytes:
                raise ValueError("Archive member size/CRC does not match its inventory")
            digest = hashlib.sha256(content).hexdigest()
            if destination.exists():
                if sha256(destination) != digest:
                    raise ValueError("Extracted immutable member was changed")
            else:
                with destination.open("xb") as stream:
                    stream.write(content)
                destination.chmod(0o440)
            inventory.append(
                {
                    "member": member.filename,
                    "sha256": digest,
                    "byte_size": len(content),
                }
            )
    return inventory


def xml_files(directory: Path) -> Iterator[Path]:
    # No historical repository folders are traversed: this directory is an
    # explicitly configured private provider input root.
    yield from sorted(path for path in directory.rglob("*.xml") if path.is_file())


def prepare(manifest: Manifest) -> dict[str, Any]:
    load_rules(manifest)
    inputs: list[dict[str, Any]] = []
    archives = manifest.sources.archives
    if archives is not None:
        for kind, path in archives.model_dump(by_alias=True).items():
            inputs.append(
                {
                    "kind": kind,
                    "path": str(path),
                    "sha256": sha256(path),
                    "byte_size": path.stat().st_size,
                }
            )
    else:
        assert manifest.sources.process_xml_directory is not None
        assert manifest.sources.lcia_workbook is not None
        for path in (
            *xml_files(manifest.sources.process_xml_directory),
            manifest.sources.lcia_workbook,
        ):
            inputs.append(
                {
                    "kind": "expanded",
                    "path": str(path),
                    "sha256": sha256(path),
                    "byte_size": path.stat().st_size,
                }
            )
    implementation = hashlib.sha256()
    for module in sorted(Path(__file__).parent.glob("*.py")):
        implementation.update(module.name.encode())
        implementation.update(module.read_bytes())
    frozen = {
        "format_version": 1,
        "manifest": manifest.model_dump(mode="json"),
        "inputs": inputs,
        "rules": [
            {"name": path.name, "sha256": sha256(path)}
            for path in (
                manifest.validation_rules,
                manifest.score_basis_rules,
            )
        ],
        "pipeline": {"version": "0.1.0", "implementation_sha256": implementation.hexdigest()},
    }
    digest = hashlib.sha256(canonical_json(frozen)).hexdigest()
    directory = manifest.work_directory / digest
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink():
        raise ValueError("Generated run directory cannot be a symlink")
    directory.chmod(0o700)
    existing = directory / "frozen_manifest.json"
    if existing.exists() and json.loads(existing.read_bytes()) != frozen:
        raise ValueError("Frozen manifest has been changed")
    write_json(existing, frozen)
    archive_entries = []
    if archives is not None:
        for kind, path in archives.model_dump(by_alias=True).items():
            copied = directory / "archives" / kind / path.name
            entry = immutable_copy(path, copied)
            expected = next(item for item in inputs if item["kind"] == kind)
            if entry["sha256"] != expected["sha256"] or entry["byte_size"] != expected["byte_size"]:
                raise ValueError("Source changed after its manifest fingerprint was frozen")
            entry["kind"] = kind
            entry["members"] = safe_extract(copied, directory / "sources" / kind, manifest)
            archive_entries.append(entry)
        xml_directory = directory / "sources" / "xml"
        workbooks = sorted((directory / "sources" / "scores").rglob("*.xlsx"))
        if len(workbooks) != 1:
            raise ValueError("Scores archive must contain exactly one XLSX workbook")
        workbook = workbooks[0]
    else:
        assert manifest.sources.process_xml_directory is not None
        assert manifest.sources.lcia_workbook is not None
        xml_directory = directory / "sources" / "xml"
        for path in xml_files(manifest.sources.process_xml_directory):
            copied = immutable_copy(
                path, xml_directory / path.relative_to(manifest.sources.process_xml_directory)
            )
            expected = next(item for item in inputs if item["path"] == str(path))
            if copied["sha256"] != expected["sha256"]:
                raise ValueError("Expanded source changed after the manifest was frozen")
        workbook = directory / "sources" / "scores" / manifest.sources.lcia_workbook.name
        copied = immutable_copy(manifest.sources.lcia_workbook, workbook)
        expected = next(
            item for item in inputs if item["path"] == str(manifest.sources.lcia_workbook)
        )
        if copied["sha256"] != expected["sha256"]:
            raise ValueError("Workbook changed after its manifest fingerprint was frozen")
    for name, path in (
        ("validation", manifest.validation_rules),
        ("score_basis", manifest.score_basis_rules),
    ):
        immutable_copy(path, directory / "rules" / f"{name}.json")
    result = {
        "manifest_sha256": digest,
        "directory": str(directory),
        "xml_directory": str(xml_directory),
        "workbook": str(workbook),
        "archives": archive_entries,
        "representative": manifest.sample_process_limit is not None,
    }
    write_json(directory / "prepared.json", result)
    return result
