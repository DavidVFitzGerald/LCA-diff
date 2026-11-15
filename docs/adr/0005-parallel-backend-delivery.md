# 0005 — Parallel backend delivery in four work units

Status: **Accepted** through the maintainer's explicit authorization to merge
[PR #56](https://github.com/DavidVFitzGerald/LCA-diff/pull/56), merged into `main`
at `125b0909595a6db89b214ac3db59b0d108a44226` on 2026-11-14 after independent
QA and hosted CI passed. This records observed merge evidence, not self-approval.
Date: 2026-11-14.
Issue: [#55](https://github.com/DavidVFitzGerald/LCA-diff/issues/55).
Scope: MVP scheduling, issue granularity and focused validation; no stack or
scientific/product scope change.
Partially supersedes: ADR 0002's requirement to finish the mock frontend before
backend implementation. Its service boundary and integration requirements remain.

## Context

F3–F5 are being implemented by another agent. The maintainer requests concurrent
backend development and large uninterrupted work units: exactly one issue and one
PR for each of B1, B2, B3 and B4. Tests should be kept to the minimum needed to
establish a working MVP. The previous Phase 1 prerequisite and session-sized
issue rule prevent this execution model.

## Decision

After the verified M1/M2 foundation and this decision's approved merge, allow
B1–B4 to overlap F3–F5. B1 precedes B2 and B3; B3 precedes B4; B4's API visibility
gate also requires B2. I1 requires the Phase 1 gate, B2 and B4.

Use exactly four backend implementation issues and PRs, one per milestone B1–B4.
Each may span sessions and contain incremental commits, internal checklists and
handoffs. Do not split their required scope into extra implementation issues/PRs
without a new maintainer instruction. This exception does not apply to F3–F5.

Use separate worktrees/branches and one implementation writer per issue. Backend
owns `apps/api/`, `packages/python/lca_shared/`, `db/`, `data_pipeline/` and `ops/`.
Frontend retains `apps/frontend/`, including mocks and provisional contracts.
Coordinate edits to root tooling, locks, Compose, CI and shared documentation.
Use distinct Compose projects, ports and volumes; do not stop the frontend's
containers. Keep mock mode independently runnable. Treat specification §7 as the
wire authority and track provisional-contract discrepancies for reconciliation in
I1; generate frontend types and introduce the real adapter there.

Use focused behavior tests and the existing tiered CI gates (§9.2). Prioritize
precision/missingness, migrations/revision isolation, verified authorization,
golden ingestion/reconciliation and atomic publication/rollback. Avoid redundant
tests, arbitrary coverage targets and repeated full suites without new evidence.
Full-data validation and release checks remain release gates; this decision does
not waive scientific correctness, security or publication evidence.

Store the three original ZIP archives unchanged in ignored
`data/private/bafu-2026-v1/incoming/` in the primary checkout. Use descriptive
subdirectories `xml/`, `scores/` and `schema/`, preserving original filenames.
This is a local intake convention, not a new source format or ingestion contract.
Backend worktrees must use an explicitly configured read-only mount of this
directory; private inputs are not copied by Git. Hash/inventory and inspect the
archives during B3 before extraction; preserve original bytes and provenance.
Raw schema contents are authorized source inputs, not historical documentation.

## Alternatives and rationale

- Finish F5 first: lower coordination cost, but delays the requested backend work.
- Small issues per slice: easier reviews, but conflicts with the requested four
  uninterrupted work units.
- Shared checkout or early adapter replacement: risks interfering with the
  frontend agent. Isolated backend work preserves the existing demo boundary.

## Consequences and migration/testing impacts

Larger PRs require criterion checklists and exact-SHA independent QA. Shared
tooling changes require coordination and branch reconciliation. No schema/data
migration or runtime behavior is introduced by this documentation PR. Verify
document consistency, synchronized forms, private-path ignores and whitespace.
Implementation will introduce focused container-backed checks with each component.
Supplying full inputs does not itself prove import completeness or licensing.

## Affected documents

PRD §6; specification §12 (existing §9.2 gates preserved); roadmap dependencies
and work granularity; AGENTS.md; PM/engineering roles; synchronized Task forms;
development-environment private-input guidance. ADR 0002 remains unchanged as
historical decision evidence, with partial supersession explicit here.
