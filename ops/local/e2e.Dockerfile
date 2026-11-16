# Browser binaries and OS packages are installed only in this pinned image.
FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496
WORKDIR /app/apps/frontend
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY .devcontainer/install-browsers.sh /tmp/install-browsers.sh
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN LCA_BROWSER_IMAGE_BUILD=1 bash /tmp/install-browsers.sh node_modules/.bin/playwright
COPY apps/frontend/ ./
COPY packages/contracts/ /app/packages/contracts/
COPY apps/api/openapi.json /app/apps/api/openapi.json
USER node
