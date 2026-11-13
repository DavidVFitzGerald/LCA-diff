# LCA diff

Read-only comparison of harmonized unit-process inventories and provider-supplied
LCIA scores. Application development has not started; this checkout currently
contains requirements, agent workflows and the development environment.

- [Current product requirements](docs/product/LCA_diff_PRD.md)
- [Current implementation specification](docs/engineering/LCA_diff_Implementation_Specification.md)
- [Roadmap and milestone gates](docs/engineering/roadmap.md)
- [Published frontend issues and dependencies](docs/engineering/frontend-backlog.md)
- [Agent working instructions](AGENTS.md)
- [Architecture decision records](docs/adr/README.md)
- [Development environment details and verification](docs/engineering/development-environment.md)

## Open the development workspace

Host prerequisites: an accessible Docker Engine with Docker Compose, and an
existing VS Code Remote SSH/Dev Containers setup if using the editor workflow.
Install no host runtimes or package managers. Ask before installing a missing
host prerequisite. Docker commands below run on the remote Docker host, inside
the repository checkout.

First confirm `docker version` shows both client and server. A permission error
for `/var/run/docker.sock` is a host access issue, not a container build failure;
see the development environment document. Do not change socket permissions.

```sh
./dev config
./dev up
./dev check
./dev shell
```

Or connect through VS Code Remote SSH, open this repository on the Docker host,
and choose **Dev Containers: Reopen in Container**. The post-create check runs
inside the workspace. UID/GID defaults are 1000; for other Linux users set
`LOCAL_UID`/`LOCAL_GID` in an optional `.env` before reopening (see `.env.example`).
The `./dev` wrapper normally derives them automatically from the invoking user.

Inside the container, run all development tools, package installs and checks.
There is no application server yet. Port 5173 is reserved on host loopback for
the later Vite server; after F1 it must listen on `0.0.0.0` inside its container.
Use VS Code/SSH forwarding to reach the remote host's loopback port.

To stop and remove the workspace container, run `./dev down` on the Docker host.
The source checkout is retained. Container-home caches are disposable. If Make
already exists on the host, `make dev-up`, `make dev-shell`, `make dev-check` and
`make dev-down` provide equivalent commands. Do not install host Make just for
these aliases. Inside the container only `make dev-check` is needed for the
current environment smoke check; lifecycle commands belong on the Docker host.

## Delivery boundaries

Phase 1 implements the frontend with mock services. Phase 2 introduces the backend
and real service adapter. The current Compose setup starts only the workspace:
no API, database, Firebase, Airflow, Spark, cloud resources or licensed files are
required. Application checks/import targets will be added with their components;
`dev-check` is environment verification, not an application test suite.
