import io
import json
from decimal import Decimal, localcontext
from pathlib import Path
from uuid import uuid4

import pytest
from lca_shared.config import load_settings
from lca_shared.contracts import FlowType, FlowValue, ScoreStatus, ScoreValue
from lca_shared.decimal import decimal, exact_product, exact_sum
from lca_shared.identity import FlowIdentity
from lca_shared.logging import configure_logging, event
from pydantic import ValidationError

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("value", ["NaN", "Infinity", " 1 ", "1_000", "1e", 0.1])
def test_invalid_measurements(value: str) -> None:
    with pytest.raises((ValueError, TypeError)):
        decimal(value)


def test_exact_arithmetic_and_wire_states() -> None:
    large = decimal("1234567890123456789012345678901234567890.12345678901234567890")
    tiny = decimal("0.000000000000000000000000000000000000000001")
    with localcontext() as context:
        context.prec = 3
        assert exact_sum([large, tiny, large.copy_negate()]) == tiny
        assert exact_product(large, Decimal("1000")) == decimal(
            "1234567890123456789012345678901234567890123.45678901234567890"
        )
    present = FlowValue(present=True, amount="0")
    absent = FlowValue(present=False, amount=None)
    assert present.model_dump(mode="json") == {"present": True, "amount": "0"}
    assert absent.amount is None
    assert ScoreValue(status=ScoreStatus.VALID, amount="0").model_dump(mode="json")["amount"] == "0"
    for status in (ScoreStatus.MISSING, ScoreStatus.UNRESOLVED_BASIS):
        assert ScoreValue(status=status, amount=None).amount is None
        with pytest.raises(ValidationError):
            ScoreValue(status=status, amount="0")
    with pytest.raises(ValidationError):
        FlowValue(present=False, amount="0")
    assert (
        FlowValue.model_json_schema(mode="validation")["properties"]["amount"]["anyOf"][0]["type"]
        == "string"
    )


def test_identity_scoping_and_fallback() -> None:
    identity = FlowIdentity(
        release_scope="BAFU:2026 v1",
        source_number="42",
        flow_type=FlowType.ECOSPHERE_OUTPUT,
        unit="kg",
        category="air",
        subcategory="urban",
    )
    assert identity.flow_id() == FlowIdentity(**identity.model_dump()).flow_id()
    for changes in (
        {"subcategory": "rural"},
        {"release_scope": "BAFU:2027"},
        {"flow_type": FlowType.ECOSPHERE_INPUT},
        {"unit": "g"},
    ):
        other = FlowIdentity(**(identity.model_dump() | changes))
        assert other.flow_id() != identity.flow_id()
    assert "name" not in FlowIdentity.model_fields
    fallback1 = FlowIdentity(
        **(identity.model_dump() | {"fallback_process": "1", "fallback_exchange": "file:0"})
    )
    fallback2 = FlowIdentity(
        **(identity.model_dump() | {"fallback_process": "2", "fallback_exchange": "file:0"})
    )
    assert fallback1.flow_id() != fallback2.flow_id()


def test_settings_precedence_and_safe_logs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    source = tmp_path / ".env"
    source.write_text("LCA_DATABASE_URL=postgresql://dotenv-secret\nLCA_LOG_LEVEL=DEBUG\n")
    monkeypatch.setenv("LCA_DATABASE_URL", "postgresql://environment-secret")
    monkeypatch.delenv("LCA_LOG_LEVEL", raising=False)
    settings = load_settings(environment="test", dotenv_path=source)
    assert settings.database_url.get_secret_value() == "postgresql://environment-secret"
    assert "environment-secret" not in repr(settings)
    assert settings.log_level == "DEBUG"
    with pytest.raises(ValueError):
        load_settings(environment="production", dotenv_path=source)
    capture = io.StringIO()
    configure_logging(capture)
    revision = str(uuid4())
    event(
        "IMPORT_STARTED",
        revision_id=revision,
        token="secret-token",
        raw_row="licensed-row",
        password="private-password",
    )
    output = capture.getvalue()
    assert revision in output
    assert all(
        secret not in output for secret in ("secret-token", "licensed-row", "private-password")
    )
    assert json.loads(output)["record"]["extra"]["revision_id"] == revision
