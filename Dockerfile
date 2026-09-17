# NHIH Ops Dashboard — single image: API + built SPA
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV PERSISTENCE=postgres

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY db ./db
COPY scripts ./scripts
COPY tsconfig.json tsconfig.server.json ./

RUN mkdir -p data backups

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "scripts/docker-entrypoint.ts"]
