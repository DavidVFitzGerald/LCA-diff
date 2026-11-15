FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496
WORKDIR /emulator
COPY apps/api/emulator/package.json apps/api/emulator/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY apps/api/emulator/firebase.json ./
RUN mkdir /emulator-state && chown node:node /emulator-state
ENV HOME=/emulator-state CI=true
WORKDIR /emulator-state
USER node
CMD ["/emulator/node_modules/.bin/firebase", "emulators:start", "--only", "auth", "--project", "demo-lca", "--config", "/emulator/firebase.json"]
