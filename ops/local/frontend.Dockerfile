# Local app-stack frontend: locked install and an explicit-mode production build,
# served by Vite preview as the unprivileged node user. The mode is explicit; the app has no fallback.
FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496
WORKDIR /app/apps/frontend
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY apps/frontend/ ./
COPY packages/contracts/ /app/packages/contracts/
COPY apps/api/openapi.json /app/apps/api/openapi.json
ARG VITE_SERVICE_MODE
ARG VITE_API_BASE=/api/v1
ARG VITE_FIREBASE_PROJECT_ID=demo-lca
ARG VITE_FIREBASE_API_KEY=local-emulator-only
ARG VITE_AUTH_EMULATOR=same-origin
RUN test -n "$VITE_SERVICE_MODE" && npm run build
RUN mkdir -p node_modules/.vite-temp node_modules/.vite && chown node:node node_modules/.vite-temp node_modules/.vite
USER node
CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
