# Local app portability verification (#111 / PR #112)

The maintainer requested these corrections during Windows 11 course-submission
review. Proposed ADR 0007 narrows the rootless requirement to the development/ETL
workspace; it remains Proposed until approval and merge. No scientific or data
schema contract changes; checksum validation and seed artifacts are unchanged.

## Failures and attribution

The maintainer observed on Windows 11:

1. The app wrapper rejected conventional Docker Desktop.
2. After bypassing the guard, concurrent builds of migrate/seed/auth-seed exported
   the same tools tag and failed with `image ... already exists`.
3. Building the shared image once reached seed startup, which failed with
   `SEED_COMMAND_FAILED`, `ValueError`. Git showed `i/lf w/crlf` for the manifest.
4. A conversion-disabled fresh clone and one build per image started the app and
   allowed login. This is maintainer-observed Windows evidence, not an automated
   run of the final patch on Windows.

Engineering independently reproduced the old guard failure with fake Docker,
and the old checksum failure in a disposable `core.autocrlf=true` checkout of
main `e6d4d4d`: `ValueError: Existing completed artifact manifest was modified`.
The new runtime guard regression fails against that old guard. A resolved old
Compose configuration has multiple tools build owners; the new graph has one.

## Implementation and focused checks

- `check-docker.sh --app` requires a reachable Linux-container engine and Compose.
  The default guard, Dev Containers and writable workspace/ETL commands retain
  rootless/unprivileged-host checks. Existing project/port checks are retained.
- Only migrate builds the shared tools image; tasks share it with
  `pull_policy: never`. Resolved Compose inspection confirms one build owner.
- `.gitattributes` preserves every seed input/artifact byte and forces shell LF.
  Neither seed bytes nor checksums are regenerated. No history is renormalized.
- CI adds the checkout/guard regressions and uses the app wrapper on the hosted
  runner's conventional engine. Hosted results must be checked at the delivered
  SHA; local simulated rootful acceptance is not a real rootful execution.

Container commands in `lca-diff-dev-workspace-1`:

```sh
bash -n dev .devcontainer/check-docker.sh .devcontainer/test-preflight.sh
bash .devcontainer/test-preflight.sh
uv run --frozen python ops/local/test_project_guard.py
uv run --frozen python ops/local/test_checkout.py
make backend-format-check backend-lint backend-typecheck
apps/frontend/node_modules/.bin/prettier --check README.md .github/workflows/frontend.yml
```

Results: 13 preflight cases pass; project/port regression checks pass; all 84 seed
files in a fresh autocrlf=true clone match the committed bytes and shell entry
points use LF. Ruff formatting/lint, MyPy and README/workflow Prettier checks pass.
The pinned Node CI image was checked for the existing Git and Python 3 tools used
by these regressions. Original artifact verification still succeeds; corrupt
CRLF-converted bytes still fail.

## Isolated real application

Local engineering uses the existing rootless Docker engine (29.9.3, Compose
v5.7.0), with a fresh project, new image tags and unused ports. The build cache is
reused; this is not #103's dedicated uncached-build gate. Existing user app stacks
and their data were not modified.

```sh
export LCA_APP_PROJECT=lca-diff-portable-check
export LCA_APP_FRONTEND_PORT=5380 LCA_APP_API_PORT=8380 LCA_APP_AUTH_PORT=9380
./dev app-up
./dev app-smoke
./dev app-e2e
./dev app-down
./dev app-up
./dev app-smoke
```

Results: startup succeeds with only one tools-image build, migrations/seed/account
initialization exit successfully, smoke passes 9/9, and Chromium passes all seven
real-stack journeys. A query of `release_publication`, including its activation
time, is byte-identical before/after down/up (`psql -At` output compared with
`cmp`); smoke passes 9/9 again. Named volumes persist.

Independent QA records the final reviewed SHA and verdict on #111. Actual Windows
execution of the final branch remains a maintainer follow-up; the documented
PowerShell path uses the same Compose graph as the verified Linux stack. Source
ETL on Windows and hosted deployment are not newly claimed. Issue #103 remains
open for synthetic report labeling/regeneration and uncached-build evidence.
