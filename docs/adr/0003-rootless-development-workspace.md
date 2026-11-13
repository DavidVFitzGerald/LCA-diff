# 0003 — Rootless development workspace identity

Status: **Accepted** through the maintainer's merge of
[PR #35](https://github.com/DavidVFitzGerald/LCA-diff/pull/35) into `main`,
commit `f809b179c5c54f47be32ec7b24a9abce36b64982` (2026-11-13).
Date: 2026-11-13.
Scope: local development and bootstrap M1, issue #2; no production privilege change.
Supersedes: no accepted ADR; replaces the unverified bootstrap `vscode` UID strategy.

## Context

The maintainer configured rootless Docker to avoid membership in the host Docker
group and explicitly authorized completing M1. The daemon is now accessible.
The initial workspace used container UID 1000 to match host UID 1000 under rootful
Docker. Under rootless Docker, host `david` is mapped to namespace UID 0; container
UID 1000 maps to a subordinate host ID and cannot normally write the host checkout.
Giving the user access to the root-owned system socket is not the requested solution.

## Decision

Use a rootless Docker daemon for the local development workspace. Run the workspace
as namespace UID/GID 0, mapping to the daemon owner's unprivileged host identity.
This is not host-root execution. Drop all container capabilities and enable
`no-new-privileges`; mount neither Docker sockets nor host credential directories.
Keep the bind-mounted checkout owned by the host user without ACL/chown workarounds.

Supported host launch paths (`./dev` and Dev Containers initialization) must verify
the effective Docker daemon reports rootless before executing bind-mounted code.
The container smoke check must reject an identity mapping compatible with host root
and verify the expected identity/capability restrictions and workspace writes.
Combine namespace mapping evidence with a host-side file-owner check; a mapping
file alone can describe an intermediate namespace and is not sufficient proof.

Keep tools, dependency resolution, builds and checks inside the container. Image
builds install packages in image layers, never on the host. Production runtime
images continue using unprivileged application users; the workspace policy must
not be copied to production or used to grant Airflow access to a Docker socket.

## Alternatives and rationale

- Add `david` to the Docker group/use host sudo: contrary to the requested access
  model; unnecessary after the rootless daemon is configured.
- Keep container `vscode` UID 1000 and add host ACLs/chown to subordinate IDs:
  complicates permissions, Git/editor access and cleanup for a shared checkout.
- Use a volume-owned clone with synchronization: adds a second working copy and
  synchronization risks; unnecessary for a directly writable rootless bind mount.
- Namespace UID 0 with rootless-only preflight and restricted capabilities:
  preserves ordinary host ownership and a single working copy; selected.

## Consequences

The development shell may show `root` even though it has no host-root identity.
Documentation and QA must verify both namespace and host semantics rather than
asserting that `id -u` must be nonzero. Rootful Docker is not supported for this
workspace configuration; fail closed instead of silently running it as host root.
Direct ad hoc Docker commands bypass project launch guards and are unsupported.
The rootless daemon and any host prerequisites are maintainer-managed.

## Affected documents and validation

- Current PRD §5 and specification §3.1 document the development identity boundary.
- Root agent rules, README, development-environment guide and roadmap track it.
- Compose, Dockerfile, Dev Container metadata, launch/preflight and smoke checks
  must agree; remove the old host UID/GID build arguments.

Validate actual rootless daemon access, capability/no-new-privileges settings,
container UID map plus host ownership of a created file, pinned tool versions,
single container-generated uv lock/frozen sync, restart and clean-checkout rebuild.
Test rootful/unreachable preflight rejection without executing project code on a
rootful daemon. Editor attachment is a separate gate and cannot be claimed from
Compose success. No data/schema migration or product behavior change is involved.
Runtime results are recorded in the environment guide and issue #2 when obtained.

References: [Docker rootless mode](https://docs.docker.com/engine/security/rootless/).
