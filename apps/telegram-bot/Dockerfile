FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/telegram-bot/package*.json apps/telegram-bot/
RUN npm install --workspaces --if-present
COPY . .
CMD ["npx", "tsx", "apps/telegram-bot/src/index.ts"]
