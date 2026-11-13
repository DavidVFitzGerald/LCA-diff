# LCA diff

Read-only comparison of harmonized unit-process inventories and provider-supplied
LCIA scores. The frontend currently contains a technical React mount scaffold;
product journeys arrive in subsequent issues.

- [Current product requirements](docs/product/LCA_diff_PRD.md)
- [Current implementation specification](docs/engineering/LCA_diff_Implementation_Specification.md)
- [Roadmap and milestone gates](docs/engineering/roadmap.md)
- [Published frontend issues and dependencies](docs/engineering/frontend-backlog.md)
- [Agent working instructions](AGENTS.md)
- [Architecture decision records](docs/adr/README.md)
- [Development environment details and verification](docs/engineering/development-environment.md)

## Open the development workspace

Host prerequisites: an accessible rootless Docker Engine with Docker Compose, and an
existing VS Code Remote SSH/Dev Containers setup if using the editor workflow.
Install no host runtimes or package managers. Ask before installing a missing
host prerequisite. Docker commands below run on the remote Docker host, inside
the repository checkout.

First confirm `docker context show` selects your intended rootless daemon and
`docker info` reports rootless security. Supported launch paths refuse a rootful
daemon. Do not change socket permissions or add yourself to the Docker group.

```sh
./dev config
./dev up
./dev check
./dev shell
```

Or connect through VS Code Remote SSH, open this repository on the Docker host,
and choose **Dev Containers: Reopen in Container**. The post-create check runs
inside the workspace. The development shell uses namespace UID 0, mapped to your
unprivileged host account; all capabilities are dropped. No host UID/GID build
overrides are needed. See ADR 0003 for the rootless-only development boundary.

Inside the container, run all development tools, package installs and checks.
The following commands run inside `./dev shell` (or the editor's container terminal):

```sh
npm --prefix apps/frontend ci
npm --prefix apps/frontend run dev
```

Vite listens on `0.0.0.0:5173` inside the container, published on host loopback.
Use VS Code/SSH forwarding to reach http://localhost:5173. The page is a technical
mount target, without product shell, authentication or service calls.

For reproducible, noninteractive checks inside the container:

```sh
npm --prefix apps/frontend run format:check
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run typecheck
npm --prefix apps/frontend run test:unit
npm --prefix apps/frontend run build
```

`make format` rewrites formatting; `make lint`, `make typecheck`, `make test-unit`
(`make test`) and `make frontend-build` wrap the corresponding frontend commands.
These targets refuse host execution. Dependencies and `dist/` are ignored
container-created artifacts; the committed lockfile pins installation. Frontend
CI runs the same locked install and checks in the digest-pinned Node container.
Browser smoke checks arrive in #10; real integration remains Phase 2 work.

To stop and remove the workspace container, run `./dev down` on the Docker host.
The source checkout is retained. Container-home caches are disposable. If Make
already exists on the host, `make dev-up`, `make dev-shell`, `make dev-check` and
`make dev-down` provide equivalent commands. Do not install host Make just for
these aliases. `make dev-check` verifies the environment; frontend checks above
verify the application scaffold. Lifecycle commands belong on the Docker host.

## Delivery boundaries

Phase 1 implements the frontend with mock services. Phase 2 introduces the backend
and real service adapter. The current Compose setup starts only the workspace:
no API, database, Firebase, Airflow, Spark, cloud resources or licensed files are
required. Application checks/import targets will be added with their components;
`dev-check` is environment verification, not an application test suite.
