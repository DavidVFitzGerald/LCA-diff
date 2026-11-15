"""Strict versioned import and approved-rule boundaries."""

from datetime import date
from pathlib import Path
from typing import Literal, Self
from uuid import UUID

from lca_shared.contracts import Amount, Boundary
from pydantic import Field, model_validator


class Release(Boundary):
    database_code: Literal["BAFU"] = "BAFU"
    release_version: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=200)
    published_date: date | None = None
    license_policy: str = "all_verified_users"


class Archives(Boundary):
    xml: Path
    scores: Path
    schema: Path


class Sources(Boundary):
    process_xml_directory: Path | None = None
    lcia_workbook: Path | None = None
    lcia_sheet: str = "BAFU_2026 v1"
    archives: Archives | None = None

    @model_validator(mode="after")
    def source_shape(self) -> Self:
        expanded = self.process_xml_directory is not None and self.lcia_workbook is not None
        if (self.archives is not None) == expanded:
            raise ValueError("Choose three intake archives or an XML directory and workbook")
        if self.archives is not None and (
            self.process_xml_directory is not None or self.lcia_workbook is not None
        ):
            raise ValueError("Archive and expanded source paths cannot be mixed")
        return self


class Manifest(Boundary):
    format_version: Literal[1] = 1
    release: Release
    sources: Sources
    work_directory: Path
    validation_rules: Path
    score_basis_rules: Path
    sample_process_limit: int | None = Field(default=None, ge=1)
    max_xml_bytes: int = Field(default=16 * 1024 * 1024, ge=1024, le=64 * 1024 * 1024)
    max_archive_bytes: int = Field(default=4 * 1024**3, ge=1024)
    max_member_bytes: int = Field(default=64 * 1024**2, ge=1024)
    max_members: int = Field(default=100_000, ge=1)


class Rule(Boundary):
    id: UUID
    rule_type: Literal["reference_mapping", "row_mapping", "score_basis", "unit_alias"]
    database_code: Literal["BAFU"] = "BAFU"
    release_version: str
    process_number: str | None = None
    source_number: str | None = None
    target_number: str | None = None
    excel_row: int | None = Field(default=None, ge=3)
    source_quantity: Amount | None = None
    source_unit: str | None = None
    target_quantity: Amount | None = None
    target_unit: str | None = None
    factor: Amount | None = None
    author: str = Field(min_length=1)
    evidence: str = Field(min_length=1)
    approved_by: str | None = None
    approved: bool = False
    version: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_rule(self) -> Self:
        if self.approved and not self.approved_by:
            raise ValueError("Approved rules require an explicit approver")
        if self.rule_type in ("score_basis", "unit_alias") and any(
            value is None
            for value in (
                self.source_quantity,
                self.source_unit,
                self.target_quantity,
                self.target_unit,
                self.factor,
            )
        ):
            raise ValueError(
                "Basis rules require complete source/target quantities, units and factor"
            )
        return self


class RuleSet(Boundary):
    format_version: Literal[1] = 1
    version: str = Field(min_length=1)
    allow_isolated_reference_fallback: bool = True
    rules: tuple[Rule, ...] = ()
