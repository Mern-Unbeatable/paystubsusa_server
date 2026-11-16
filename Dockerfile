# Production API image: Node 24 + Chromium for Playwright PDF rendering.
# Coolify: set Build Pack to Dockerfile, context = this server repository root.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all deps (including Vite) so `npm run build` can compile the renderer.
# NODE_ENV=production is set after the build so `npm ci` does not omit devDependencies.
COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.* ./
COPY src ./src
COPY renderer ./renderer
COPY scripts ./scripts
COPY tsconfig.json ./

# prisma generate + vite build:renderer → /app/dist-renderer
RUN npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    RENDERER_BUNDLE_PATH=/app/dist-renderer/index.html \
    LOCAL_STORAGE_DIR=/app/.storage

EXPOSE 4000

CMD ["npm", "start"]
