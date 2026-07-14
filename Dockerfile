# ── Build Stage ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime Stage ──
FROM node:22-alpine
RUN apk upgrade --no-cache

# npm CLI and its bundled dependencies (~150 packages) are NOT needed at
# runtime — the app runs `node server.js` directly.  Removing them
# eliminates all Docker Hub Scout CVEs in npm internal packages:
#   picomatch, sigstore/@sigstore/core, tar, brace-expansion, ip-address
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY server.js package.json ./
COPY lib/ ./lib/
COPY public/ ./public/
RUN mkdir -p /app/data && chown -R node:node /app/data

# Custom user theme: mount at /app/custom.css
#   docker run -v /path/to/your-theme.css:/app/custom.css ...
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
