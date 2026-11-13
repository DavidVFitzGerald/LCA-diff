# 0002 — Frontend-first delivery through a services boundary

Status: **Accepted** through the maintainer's merge of
[PR #35](https://github.com/DavidVFitzGerald/LCA-diff/pull/35) into `main`,
commit `f809b179c5c54f47be32ec7b24a9abce36b64982` (2026-11-13).
Date: 2026-11-13.
Scope: MVP delivery order; product scope and technology choices unchanged.
Supersedes: no previous ADR; revises specification §12's suggested sequencing.

## Context

The maintainer requested workflow, roadmap, container setup and issue setup before
product implementation. The complete frontend should then run independently of a
backend, followed by backend development and connection. This order was recorded
in agent instructions and roadmap but must also be reflected in both current
requirements documents.

## Decision

Deliver Phase 1's complete MVP frontend through centralized typed services and
deterministic asynchronous mock adapters, including simulated authentication.
Require no real API, database, Firebase project, cloud credentials or proprietary
inputs to run the demo. Keep components independent of HTTP/Firebase/fixtures;
select adapters at one explicit configuration boundary. Mark mock mode clearly.

In Phase 2 implement the prescribed backend/ETL and real authentication, generate
TS DTOs from FastAPI OpenAPI, reconcile provisional interfaces, check adapter
parity, and connect the real adapter. Preserve decimal strings, missingness,
revision snapshots, pagination/windows, errors and cancellation. Never fall back
silently to mocks on production failures. All real integration, publication and
production readiness gates remain required for MVP completion.

## Alternatives and rationale

- Specification §12's original backend/data-first sequence: valid technically,
  but does not follow the requested delivery order.
- Build UI directly around fixtures or component-level calls: quick initially,
  but makes integration/retesting harder and obscures the service contract.
- Typed services with replaceable adapters: enables complete frontend review
  early and a controlled later integration; selected.

## Consequences

Mock and real implementations need parity checks. Provisional DTOs must be
replaced deliberately by generated types. Mock tests cannot prove security,
full ingestion, publication or production performance. This is not permission to
omit any backend requirement or install tools on the host.

## Affected documents and validation

- Current PRD §6; specification §12 clarifies timing of §§3, 6 and 7.
- Root `AGENTS.md` and `docs/engineering/roadmap.md` describe the same sequence.

No runtime change or migration in this documentation PR. Future verification:
Phase 1 container-only mock UI/component/E2E checks, then Phase 2 real auth/API,
generated-contract parity and E2E checks per the roadmap and §9.2. Merge evidence
is linked above; the original preparation preceded issue setup (now tracked in #1).
