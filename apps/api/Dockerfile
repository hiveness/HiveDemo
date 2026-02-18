FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/db/package*.json packages/db/
COPY packages/shared/package*.json packages/shared/
COPY packages/memory/package*.json packages/memory/
RUN npm install --workspaces --if-present
COPY . .
EXPOSE ${PORT:-3000}
CMD ["npx", "tsx", "apps/api/src/index.ts"]
