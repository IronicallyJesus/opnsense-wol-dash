# ── Build Stage ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime Stage ──
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY server.js package.json ./
COPY lib/ ./lib/
COPY public/ ./public/
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
