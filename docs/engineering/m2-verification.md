# M2 activation verification — issue #3

Verified 2026-11-13 against merged PR #35, main commit
`f809b179c5c54f47be32ec7b24a9abce36b64982`. This follow-up reconciles gate records;
it adds no product behavior or new architecture decision.

- AC1: both canonical forms compare byte-for-byte with active copies using
  `cmp docs/issue_templates/task.yml .github/ISSUE_TEMPLATE/task.yml` and the
  equivalent Bug command. GitHub Contents API at `ref=main` returns blobs
  `4237636a79e2becbe330880b506187ead2aa1302` (Task) and
  `64ad49482d4db33da11bc79eaaea7763d4e12562` (Bug), matching Git.
  Task/bug labels exist. The maintainer confirmed both forms visible at
  https://github.com/DavidVFitzGerald/LCA-diff/issues/new/choose in this session.
  This is attributed user evidence: the agent's HTTP request reached sign-in,
  and GraphQL `issueTemplates: []` did not establish YAML form visibility.
- AC2: GitHub milestones contain F1–F5 counts 6/5/4/7/8 (30 tasks).
  Prior independent planning QA is recorded on #3; implementation remains unstarted.
- AC3: #1 baseline and #2 QA-passed environment were merged in PR #35.
  ADR status/index and roadmap now record that delivery. The maintainer confirmed
  the merge; GitHub has no separate APPROVED review record. Original preparation
  and later runtime/editor evidence retain their original attribution.
- AC4: merged PR #35 includes the PR handoff template, roadmap and linked frontend
  issue index. This follow-up records the post-merge verification.
- AC5: the original protection probe returned HTTP 403 on the private plan.
  Current `gh api repos/DavidVFitzGerald/LCA-diff` reports public and the
  `branches/main/protection` endpoint returns HTTP 404, "Branch not protected".
  Effective protection remains #4; this session changed no repository settings.
  No nonexistent CI checks were required or reported passing.

Host Git/GitHub inspection only: `gh pr view 35`, `gh issue view 3`, labels,
milestones and Contents API reads, source/active form comparisons, and
`git diff --check`. Rootless Docker is accessible (server security options include
`name=rootless`); no container development or application tests were necessary
for these documentation changes. No host dependency installation occurred.

Next: independent QA of this delivered documentation commit, then review/merge.
Leave #3 open until that workflow completes. Re-groom #5 as the first frontend
implementation issue after #3; later tasks retain their predecessor gates.
