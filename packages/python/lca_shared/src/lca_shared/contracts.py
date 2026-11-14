"""Strict domain boundary types; transport-specific DTOs arrive with the API."""

from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, PlainSerializer, model_validator

from lca_shared.decimal import decimal

Amount = Annotated[
    Decimal,
    BeforeValidator(decimal, json_schema_input_type=str),
    PlainSerializer(str, return_type=str, when_used="json"),
]


class Boundary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FlowType(StrEnum):
    REFERENCE = "Reference"
    TECHNOSPHERE = "Technosphere"
    ECOSPHERE_INPUT = "Ecosphere Input"
    ECOSPHERE_OUTPUT = "Ecosphere Output"


class ScoreStatus(StrEnum):
    VALID = "valid"
    MISSING = "missing"
    UNRESOLVED_BASIS = "unresolved_basis"


class RevisionRef(Boundary):
    release_id: UUID
    revision_id: UUID


class FlowValue(Boundary):
    present: bool
    amount: Amount | None

    @model_validator(mode="after")
    def validate_presence(self) -> Self:
        if self.present != (self.amount is not None):
            raise ValueError("Only present flows have an amount")
        return self


class ScoreValue(Boundary):
    status: ScoreStatus
    amount: Amount | None

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if (self.status == ScoreStatus.VALID) != (self.amount is not None):
            raise ValueError("Only valid scores have an amount")
        return self
