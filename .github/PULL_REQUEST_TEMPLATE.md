## Outcome

Describe the concrete problem and resulting behavior. Refs #ISSUE.

## Scope and acceptance evidence

State delivery phase/milestone and map the issue's criteria to the change. Link
follow-ups for deferred required work. Name the reviewed commit for QA.

## Validation

Include exact container commands and results, manual evidence, and any unrun or
blocked checks. Distinguish mock-only checks from real integration. Documentation
changes can use inspection; do not claim application checks that do not exist.

## Decisions and handoff

- Any PRD/spec deviation has a numbered ADR and updates to both current documents
  in this PR; ordinary choices within the contract need no ADR.
- Historical archive/reference folders were excluded from agent context.
- Changes to docs/issue_templates are synchronized to .github/ISSUE_TEMPLATE.
- No host dependency installs, secrets or licensed raw fixtures were introduced.
- Engineering handoff and independent QA verdict are linked on the issue.

Use Refs rather than automatic closing keywords until QA has passed. Leave issues
open until required checks, QA and approved merge are complete. Bootstrap PRs must
state that they have not undergone the later implementation role/QA workflow.
