FROM node:20-alpine
WORKDIR /app

# 1. Copy root level package files
COPY package*.json ./

# 2. Copy ALL workspace package.json files so npm can resolve the graph
COPY apps/api/package*.json ./apps/api/
COPY apps/agents/package*.json ./apps/agents/
COPY apps/orchestrator/package*.json ./apps/orchestrator/
COPY packages/db/package*.json ./packages/db/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/memory/package*.json ./packages/memory/

# 3. Install all dependencies
RUN npm install --workspaces

# 4. Copy everything else
COPY . .

EXPOSE ${PORT:-3000}
CMD ["npx", "tsx", "apps/api/src/index.ts"]
