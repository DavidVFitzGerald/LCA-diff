# Tooling/runtime image for local ETL; source and private input are explicit mounts.
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim@sha256:7cf77f594be8042dab6daa9fe326f90962252268b4f120a7f5dccce4d947e6c1
ARG DEBIAN_SNAPSHOT=20261112T000000Z
RUN rm -f /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources \
    && printf 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian/%s/ bookworm-updates main\ndeb [check-valid-until=no] https://snapshot.debian.org/archive/debian-security/%s/ bookworm-security main\n' "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" > /etc/apt/sources.list \
    && apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless bash make ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    LCA_DEV_CONTAINER=1 UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    AIRFLOW_HOME=/workspaces/lca-diff/private/airflow \
    PYSPARK_PYTHON=/workspaces/lca-diff/.venv/bin/python
RUN printf 'umask 022\n' > /etc/lca-etl-shell.sh && printf '\n. /etc/lca-etl-shell.sh\n' >> /root/.bashrc
ENV BASH_ENV=/etc/lca-etl-shell.sh
WORKDIR /workspaces/lca-diff
CMD ["sleep", "infinity"]
