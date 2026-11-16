# 0006 — Local-only MVP with a single-command end-to-end stack

Status: **Accepted** through the maintainer's merge of
[PR #98](https://github.com/DavidVFitzGerald/LCA-diff/pull/98) into `main` at
`cf7f1d561dae2a8af79d7344c56bf03e28481157` on 2026-11-16, after hosted CI passed.
GitHub records no separate APPROVED review, and independent QA ran after the merge
rather than before it (recorded on #95). This records observed merge evidence, not
self-approval.
Date: 2026-11-16.
Issue: [#95](https://github.com/DavidVFitzGerald/LCA-diff/issues/95).
Scope: MVP product scope, delivery sequence and completion gates.
Partially supersedes: ADR 0002 and ADR 0005 in two respects only:
- I1 no longer waits for the complete mock-frontend Phase 1 gate.
- Infrastructure, deployment and full-data release validation are no longer MVP gates.
Their service-boundary, adapter and backend work-unit rules remain in force.

## Context

B1–B4 are merged: schema/migrations, read API with Firebase verification and
`differences_only` reads, Airflow/PySpark ingestion and atomic publication. F1–F4
and the F5 indicator tree and Scores grid are merged against mocks. No real
frontend adapter exists yet. The remaining plan requires F5's persistence,
reconciliation and polish tasks, a full mock Phase 1 gate, integration (I1), Cloud
Run/Cloud SQL/Terraform infrastructure (R1) and full-corpus release validation (R2)
before the app is usable at all.

The maintainer wants a locally working application in as few steps as possible
(at most three more implementation PRs). Deployment is removed from the MVP.

## Decision

1. **MVP is local-only.** The MVP runs on the maintainer's machine through rootless
   Docker Compose. No cloud deployment, Terraform, Cloud Run, Cloud SQL, Cloud
   Storage, Artifact Registry or Secret Manager work is required for the MVP; all of
   it becomes POST-MVP with its existing specification contracts kept as the target.
2. **End to end on one command.** A single host command (`./dev app-up`, wrapped by
   `make up`) starts PostgreSQL, applies migrations through a one-shot task, seeds and
   publishes a release, starts the Firebase Auth Emulator with a verified local demo
   account, the FastAPI service and the frontend. The frontend uses the real HTTP and
   Firebase adapters. Data persists in a named volume across restarts. Mock mode stays
   independently runnable for development and deterministic tests.
3. **Data.** The stack automatically seeds a small committed **synthetic** BAFU-shaped
   release through the same immutable revision/publication semantics. The private
   BAFU inputs load into the same database as a documented **opt-in** path using
   the existing B3/B4 commands. A representative import is verified once.
   Full-corpus validation, LCIA audit sign-off and licensing confirmation are POST-MVP
   and become required before any hosted or shared release.
4. **Authentication.** Local login uses the Firebase Auth Emulator with the real
   Firebase SDK and server-side verification; no auth bypass. A production Firebase
   project is POST-MVP.
5. **Frontend scope.** The independent "Show differences only" toggles remain MVP,
   backed by the API's exact `differences_only` reads. Browser workspace persistence
   and restoration (#31), stale-ID and publication reconciliation (#32), the
   loading/accessibility audit (#33), the mock-only Phase 1 gate (#34) and
   exhaustive mock difference predicates (#29) become POST-MVP. Clearing protected
   in-memory data and caches on logout or account change remains MVP.
6. **Delivery.** The remaining MVP is three implementation issues/PRs in sequence:
   - L1 [#96](https://github.com/DavidVFitzGerald/LCA-diff/issues/96): single-command stack and seed.
   - L2 [#97](https://github.com/DavidVFitzGerald/LCA-diff/issues/97): real adapter, generated DTOs and Auth Emulator.
   - L3 [#30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30): differences toggles and local acceptance.

   L2 replaces I1 for the local scope.
7. **CI.** The per-PR tier drops Terraform fmt/validate (no Terraform in the MVP).
   It adds a real-stack Playwright smoke when it runs reliably on hosted runners;
   otherwise that smoke is a documented local check with a tracked gap. The
   "before production publish/deploy" tier applies only post-MVP.

Unchanged: scientific/data-integrity rules, exact decimals and missingness, revision
immutability and atomic publication, verified-identity data access, least-privilege
database roles, the single uv workspace, containers-only tooling, ADR governance.

## Alternatives and rationale

- **Keep the current plan (F5 → Phase 1 gate → I1 → R1 → R2):** complete, but many
  more PRs and cloud work before anything runs end to end.
- **Mock auth with a backend bypass:** fewer moving parts, but it weakens §8's verified
  identity rule and would need removal later. The emulator is already in Compose.
- **Real BAFU import inside the single command:** realistic, but slow, dependent on
  private inputs and Spark/Airflow, and fragile as a startup step. The synthetic
  seed keeps the command fast and reproducible, while opt-in import keeps real data
  reachable.
- **Drop the differences toggles too:** saves a little work, but the backend already
  implements them and they are a core comparison feature.

## Consequences

- The MVP definition of done becomes a locally runnable, verified-login comparison
  app over a published release. It is no longer a hosted, fully validated BAFU release.
  Claims about full BAFU import completeness are still not allowed until the
  post-MVP release validation passes.
- Licensing confirmation is needed before any hosting/redistribution, not for
  private local use of the maintainer's own inputs.
- Browser reloads do not restore selections in the MVP.
- Local demo credentials and emulator configuration are development-only and must
  never be reused in a production configuration.
- Post-MVP issues keep their criteria for later re-grooming; deployment and release
  validation stay at roadmap milestone level until scheduled.

## Affected documents and testing/migration impacts

PRD §§2–7; specification §§0.3 (new), 3, 3.1, 3.2, 3.3, 6.7, 6.8, 8, 9.1–9.3, 11, 12;
`AGENTS.md` delivery sequence and gates; roadmap; frontend backlog; ADR index.
No schema or data migration. New checks arrive with L1–L3: stack/seed idempotence,
contract drift, adapter parity and a real-stack Playwright smoke.
