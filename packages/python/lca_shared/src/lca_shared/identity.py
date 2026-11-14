"""Versioned BAFU scientific identity; names/signs/revisions are never key inputs."""

import json
from uuid import UUID, uuid5

from lca_shared.contracts import Boundary, FlowType

FLOW_NAMESPACE = UUID("7b847b9e-a449-5acf-bd20-5e9201c21945")
IDENTITY_KEY_VERSION = 1


class FlowIdentity(Boundary):
    release_scope: str
    source_number: str
    flow_type: FlowType
    unit: str
    category: str = ""
    subcategory: str = ""
    location: str = ""
    fallback_process: str | None = None
    fallback_exchange: str | None = None

    def canonical_key(self) -> str:
        if not self.release_scope or not self.source_number or not self.unit:
            raise ValueError("Identity needs release scope, source number and canonical unit")
        if (self.fallback_process is None) != (self.fallback_exchange is None):
            raise ValueError("Fallback identities need containing process and exchange identity")
        environmental = self.flow_type in (FlowType.ECOSPHERE_INPUT, FlowType.ECOSPHERE_OUTPUT)
        parts = [
            IDENTITY_KEY_VERSION,
            "BAFU",
            self.release_scope,
            self.source_number,
            self.flow_type.value,
            self.unit,
            self.category if environmental else "",
            self.subcategory if environmental else "",
            self.location,
            self.fallback_process,
            self.fallback_exchange,
        ]
        return json.dumps(parts, ensure_ascii=False, separators=(",", ":"))

    def flow_id(self) -> UUID:
        return uuid5(FLOW_NAMESPACE, self.canonical_key())
