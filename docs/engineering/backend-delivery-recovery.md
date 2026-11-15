# Backend delivery recovery — issue #81

The maintainer merged B1 PR #61 into `main` at
`f790803cde32a13c8115abed0fb09f448a85ff9a`. Subsequently PR #70 merged into
`feat/b1-domain-schema` at `3e6efabbe9e884d5de29aea29053c148896d27a4`, and PR #72
merged into `feat/b2-read-api` at `ae0d9fe01d1f233860f72c418471aa3f2eea321d`.
Those latter merges preserved the backend code on feature branches, without
delivering B2/B3 to `main`.

Recovery branch `fix/backend-main-delivery` starts from the current `main` and
merges the preserved `feat/b2-read-api` history. No history is rewritten. B2/B3
application code, tests, dependencies, migrations, containers, scripts and backend
workflows are byte-identical to independently QA-passed B3 delivery
`9e8fcc2aedf6ac3f20bd9629946a8e56863f26db`. Frontend source, frontend workflow
and Dev Container files are byte-identical to the recovery's `main` base.

Only delivery bookkeeping changes are authored for recovery. Existing exact-SHA
behavior evidence is retained; the recovery receives its own independent tree
reconciliation review and applicable hosted checks. No new tests are needed for
this Git/documentation reconciliation. Private data and historical/reference
folders are unchanged and remain outside the recovery diff.

The maintainer reviews and merges the recovery PR directly into `main` after
QA/checks pass. Issues #58 and #59 remain open until actual delivery to `main` is
verified. B4 #60 and real frontend integration remain separate; the prior stop
after B3 is preserved. This recovery performs no deployment or publication.
