# 0001 — Current-document governance and historical-context exclusion

Status: **Accepted** through the maintainer's merge of
[PR #35](https://github.com/DavidVFitzGerald/LCA-diff/pull/35) into `main`,
commit `f809b179c5c54f47be32ec7b24a9abce36b64982` (2026-11-13).
Date: 2026-11-13.
Scope: MVP development governance and subsequent maintenance.
Supersedes: no previous ADR.

## Context

The maintainer requires deviations to be recorded and current requirements kept
aligned. Specification §0.2 previously allowed deferred reconciliation; its
precedence chain included historical material. Old PRD/spec copies and reference
documents must remain available for humans without confusing implementation agents.

## Decision

Every deviation from either current requirements document requires a numbered
ADR plus updates to **both** current documents in the same PR. Material architecture
changes also require ADRs. No deferred document reconciliation. Approval and merge
into `main` remain prerequisites for ADR authority.

Exclude `docs/product/archive/`, `docs/engineering/archive/` and `docs/reference/`
from routine agent reading, searching, citations, decisions and delegated context.
Permit reading only on an explicit request for historical investigation; historical
documents never become normative. Retain all existing historical files unchanged.
Use root/nested instructions and `.ignore` search exclusions, not Git ignore or
deletion. Actual raw data still governs its own content when supplied for work.

## Alternatives and rationale

- Keep history in the authority chain or update docs later: risks stale behavior
  and knowingly inconsistent contracts; rejected by the maintainer.
- Delete history or use `.gitignore`: loses useful history or fails to hide already
  tracked files from ordinary search; unsuitable.
- Workflow instructions plus search exclusions: preserves history and reduces
  accidental context loading without claiming filesystem isolation; selected.

## Consequences

PRs changing requirements need synchronized documentation. PM checks readiness,
Engineering includes changes, QA verifies consistency. `.ignore` affects default
ripgrep discovery but explicit paths/other tools can bypass it; agents must follow
the written rule. No security/access-control guarantee is claimed.

## Affected documents and validation

- Current PRD §6; specification §§0.1–0.2 and §13.
- Root `AGENTS.md`, team roles, roadmap and Task/Bug context guidance.
- `docs/adr/README.md`, `.ignore`, and historical folder instructions.

Validate active-document consistency, default search exclusions, continued Git
tracking and unchanged historical file contents. No runtime tests or data/schema
migrations: this is a documentation/workflow change. Merge evidence is linked
above; the original preparation preceded issue setup (now tracked in #1).
