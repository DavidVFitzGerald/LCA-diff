# 0007 — Portable local application runtime

Status: **Proposed** — maintainer-requested implementation in issue #111 / PR #112;
requires maintainer approval and merge before becoming authoritative.
Date: 2026-11-16.
Scope: local MVP application startup and checkout portability.
Partially supersedes: ADR 0006 decision 1's rootless-only application runtime.
Preserves: ADR 0003's rootless writable development-workspace identity policy.

## Context

During course-submission review, the maintainer ran the application on Windows 11
with Docker Desktop. The shared host guard rejected the conventional Linux engine,
although the app images do not depend on a rootless daemon. Bypassing that guard
exposed concurrent tools-image exports to one tag. Git's LF-to-CRLF conversion also
invalidated the committed seed manifest and source/object checksums. Building the
shared image once and using a checkout with conversion disabled let the maintainer
start the stack and sign in. This is maintainer-observed evidence, not an automated
Windows acceptance run.

## Decision

- Application commands accept reachable Linux Docker engines, both rootless and
  conventional, including Docker Desktop in Linux-container mode. PowerShell uses
  the equivalent single Compose startup command; Bash users can use `./dev app-up`.
  App preflight checks engine reachability, Linux container mode and Compose.
- Writable source development/ETL workspaces retain ADR 0003's rootless daemon,
  unprivileged host account and namespace identity checks. Dev Containers keep that
  strict guard. App runtime is a separate boundary: compiled/built sources, named
  database/archive volumes and explicitly read-only bootstrap/private-input mounts.
- Preserve capability dropping, no-new-privileges, loopback port exposure, least-
  privilege database roles, verified authentication, revision integrity and reset
  confirmation. This is not a hosted-production deployment or permission change.
- Only `migrate` builds the shared tools image. Seed/auth-seed and opt-in task
  services reuse it without pulling a similarly named image from a registry.
- Git preserves all committed seed inputs/artifacts byte for byte, including
  intentional CSV line endings and binary workbooks. Executable shell entry points
  use LF. Existing checksum validation is unchanged; no normalization or checksum
  regeneration is performed to make corrupt inputs pass. Historical references
  remain unchanged.

## Alternatives and rationale

Requiring reviewers to install rootless Docker inside Windows adds setup unrelated
to running the application. Removing the guard everywhere would discard the
writable-workspace ownership boundary. Asking users to comment out security checks,
serialize builds manually or globally disable Git conversion hides repository
portability defects. Separating runtime/workspace checks, a single image build
owner and narrow Git attributes address the causes directly.

## Consequences, migration and validation

No data/schema migration. Existing LF worktrees and persisted app volumes remain
valid. Existing CRLF-converted seed checkouts need a fresh checkout with the new
attributes or a conversion-disabled clone; preserve unrelated work and app volumes.
The PowerShell README path avoids requiring Bash or host runtimes. Optional source
ETL still uses the rootless development environment; its Windows portability is
not established by this change.

Regression checks cover runtime rootless/rootful acceptance and unavailable/
Windows-container/Compose-missing rejection; unchanged workspace/Dev Containers
rejection; autocrlf=true checkout byte equality and executable LF; isolated default
app build/start, smoke, browser journey and persistent revision across restart.
CI exercises the wrapper on its conventional Linux engine. Actual Windows startup
verification is attributed to the maintainer until independently repeated there.

Affected documents: PRD §§2, 5; specification §§0.3, 3.1; root AGENTS.md; README;
development-environment guide; roadmap; ADR index. Scientific/product behavior and
post-MVP scope are unchanged.
