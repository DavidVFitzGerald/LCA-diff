# Architecture decision records

Record every decision deviating from the current PRD or specification, and every
material product/architecture change. Ordinary details within those contracts do
not require an ADR. Historical folders are not decision inputs; follow root
`AGENTS.md` for active-document boundaries.

## Workflow

1. Choose the next unused four-digit number and a descriptive kebab-case filename.
   One material decision per file. Start with status **Proposed** and include date,
   context, decision, alternatives, rationale, consequences, MVP/post-MVP scope,
   affected PRD/spec sections, testing/migration impacts, and superseded IDs.
2. Include updates to **both** `docs/product/LCA_diff_PRD.md` and
   `docs/engineering/LCA_diff_Implementation_Specification.md` in the same PR.
   Explain implications in both even if detail belongs primarily in one. Update
   roadmap, agent rules and tests when affected. Do not defer reconciliation.
3. Link the issue/PR and evidence. PM checks completeness/readiness; Engineering
   includes the changes; QA checks consistency and applicable behavior. Before
   issue setup, record bootstrap decisions honestly without fabricated issue IDs.
4. An ADR is authoritative only after approval and merge into `main`. A Proposed
   record, conversation approval alone, or status edit on a branch is not an
   accepted ADR. Approval can authorize preparing changes for review without
   changing that acceptance rule. Update status/index as part of the approved
   merge workflow; verify merge evidence before relying on acceptance.
5. Preserve decisions. Supersede through a new ADR with explicit links rather
   than rewriting history. If an unexpected post-merge contradiction remains,
   accepted ADRs prevail and the current documents must be corrected promptly.

## Index

Status below reflects this branch; neither record has been approved and merged.

| ID | Decision | Status |
| --- | --- | --- |
| [0001](0001-current-document-governance.md) | Synchronized decision documentation and historical-context exclusion | Proposed |
| [0002](0002-frontend-first-delivery.md) | Frontend-first delivery through mock and real service adapters | Proposed |

## PR consistency checklist

- The decision and alternatives are clear; affected sections are named.
- Both current documents are updated and agree with the ADR.
- Historical folders were neither used as authority nor modified to change scope.
- Tests, migrations, roadmap and role instructions are addressed as applicable.
- Approval/merge status is accurate and supersession is explicit.
