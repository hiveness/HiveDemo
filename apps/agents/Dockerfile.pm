FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/agents/package*.json apps/agents/
COPY packages/db/package*.json packages/db/
COPY packages/shared/package*.json packages/shared/
COPY packages/memory/package*.json packages/memory/
RUN npm install --workspaces --if-present
COPY . .
CMD ["npx", "tsx", "apps/agents/src/pm-agent.ts"]
