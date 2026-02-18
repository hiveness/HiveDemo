FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/orchestrator/package*.json apps/orchestrator/
COPY packages/db/package*.json packages/db/
COPY packages/shared/package*.json packages/shared/
COPY packages/memory/package*.json packages/memory/
RUN npm install --workspaces --if-present
COPY . .
EXPOSE ${PORT:-3001}
CMD ["npx", "tsx", "apps/orchestrator/src/index.ts"]
