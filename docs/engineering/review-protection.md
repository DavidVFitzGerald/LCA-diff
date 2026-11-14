# Solo-maintainer branch protection — issue #4

## Review and deployment boundary

The maintainer selected solo operation on 2026-11-14. Proposed
[ADR 0004](../adr/0004-solo-maintainer-review.md), PRD §6 and specification §0.2
define the exception together. Native approvals are zero; independent agent QA
and the maintainer's explicit merge remain required review evidence.

Main is currently unprotected. Do not apply the solo exception to main before
the maintainer approves and merges this policy PR. Candidate verification below
is scoped to an isolated target; it does not complete #4's main enforcement gate.

## Reproducible configuration

`.github/main-protection.json` is the exact REST update payload. It requires PRs,
the real GitHub Actions `quality` check (app ID 15368), up-to-date branches,
administrator enforcement and resolved conversations. Force pushes and deletion
are disabled. No bypass actors are configured. GitHub rejects user/team bypass
allowance fields for this personal repository, so those fields are omitted;
readback confirms no bypass allowances. No backend/browser placeholder checks.

After approved policy merge, fetch/check out its main revision and apply using
the host's existing GitHub CLI (repository administration, not host development):

```sh
gh api --method PUT repos/DavidVFitzGerald/LCA-diff/branches/main/protection \
  --input .github/main-protection.json
gh api repos/DavidVFitzGerald/LCA-diff/branches/main/protection
gh api repos/DavidVFitzGerald/LCA-diff/rules/branches/main
```

Read back every field; an API 200 alone is insufficient. Check strict/app binding,
zero approval count, PR requirement, administrator/conversation enforcement,
force/deletion flags and absence of bypass actors. Administrators can still edit
settings; enforced checks do not enforce the agent-QA workflow itself.

## Candidate verification

The original private-plan protection request returned 403. This session observed
the repository already public; it changed neither visibility nor billing.
Protection requests are now supported. The exact payload was applied to isolated
`verify/issue-4-target`, based on main `04779ea`, leaving main unchanged.

[Probe PR #38](https://github.com/DavidVFitzGerald/LCA-diff/pull/38) intentionally
failed a Vitest assertion at `617b70e`. The failure was reproduced through
`docker compose exec -T workspace bash -lc 'npm --prefix apps/frontend run test:unit'`
(exit 1, existing mount test passed). Hosted `quality` failed and GitHub reported
`mergeStateStatus: BLOCKED`. No merge was attempted.

The recovery result and independent QA are recorded on #4 and the policy PR.
The temporary probe must remain unmerged. Remove its temporary protection before
deleting its target branch; do not alter main as part of probe cleanup.

## Completion after merge

Apply the accepted payload to main and independently verify its readback. Repeat
a failing/recovered probe against actual main; observe both failed quality with
blocked merge and passing quality with a clean merge state, without merging it.
Close the probe unmerged. Record exact policy commit, run URLs and QA results on
#4. Only then is main enforcement complete and #4 eligible for closure. Future
real CI contexts (including #10's browser checks) are added as they become runnable.
