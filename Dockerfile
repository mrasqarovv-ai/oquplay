FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json tsconfig.base.json brand.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run db:generate
# Same-origin web build: no API key, no server environment copied into this layer.
ENV EXPO_PUBLIC_API_URL=""
RUN npm run build:web
WORKDIR /app/apps/api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 STATIC_WEB_DIR=/app/apps/mobile/dist
EXPOSE 3001
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
