# 0004 — Solo-maintainer review and enforced quality checks

Status: **Proposed**; authoritative only after maintainer approval and merge.
Date: 2026-11-14.
Scope: repository governance for MVP and subsequent solo maintenance, issue #4.
Supersedes: no whole ADR; refines ADR 0001's approval evidence for solo operation.

## Context

The repository is now public, resolving the private-plan entitlement blocker.
The sole collaborator is the maintainer, and Codex opens PRs under that same
GitHub identity. GitHub does not allow authors to approve their own PRs.
The maintainer explicitly selected solo maintenance instead of adding a reviewer.

## Decision

Require a PR, independent QA role verification of its delivered commit, passing
relevant CI and an explicit maintainer merge. The deliberate maintainer merge
after QA/checks records review approval, including for ADRs. Agent QA is distinct
from approval by another human; never claim native independent-human review.
Zero native approving reviews are required. Agents must not merge merely because
checks or QA pass.

Protect `main` using `.github/main-protection.json`: require GitHub Actions
`quality` (app ID 15368), an up-to-date branch, PRs, resolved conversations and
administrator enforcement. Disallow force pushes and deletion; configure no bypass
allowance. Add future check contexts only after their jobs exist and have run.
GitHub does not enforce agent QA or prevent administrators editing settings;
those remain workflow duties.

Apply this exception to `main` only after this ADR and synchronized requirements
are approved and merged. Isolated branch validation neither accepts this ADR nor
proves `main` enforcement.

## Alternatives and rationale

- Add a collaborator and require one native approval: stronger human independence,
  but not the selected operating model.
- Leave `main` unprotected or permit administrator bypass: allows failing checks
  to merge; rejected.
- Solo PRs with enforced CI and explicit QA/merge evidence: supports the account
  model while preserving automated gates and review evidence; selected.

## Consequences, scope and affected documents

PRD §6, specification §0.2, root agent rules, ADR workflow, roadmap and index must
agree. Product/scientific behavior and production privileges are unchanged.
Revisit native approvals through a new ADR if another regular maintainer joins.
No schema/data migration is required. This applies to MVP and later solo operation.

## Validation and activation

Read back protection settings. Demonstrate failed `quality` blocks an isolated
probe PR, then fix it and demonstrate recovery without merging. Independently QA
the delivered policy PR. After its approved merge, apply the same payload to
`main`, verify readback and actual-main failing/recovered probe behavior, then
close #4 only with all criteria verified.

See [review-protection.md](../engineering/review-protection.md) for commands,
evidence and pending activation. Main enforcement is not claimed by this proposal.
