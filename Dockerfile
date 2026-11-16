# Production API: Node 24 + system Chromium + Playwright browser fallback.
# Coolify: Build Pack = Dockerfile, context = this server repo root (where this file lives).
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    ca-certificates \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/* \
    && test -x /usr/bin/chromium

WORKDIR /app

# Install all deps (including Vite) so `npm run build` can compile the renderer.
COPY package.json package-lock.json* ./
RUN npm ci \
    && npx playwright-core install chromium

COPY prisma ./prisma
COPY prisma.config.* ./
COPY src ./src
COPY renderer ./renderer
COPY scripts ./scripts
COPY tsconfig.json ./

# prisma generate + vite build:renderer → /app/dist-renderer
RUN npm run build \
    && npm prune --omit=dev \
    && test -f /app/dist-renderer/index.html

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    RENDERER_BUNDLE_PATH=/app/dist-renderer/index.html \
    LOCAL_STORAGE_DIR=/app/.storage

EXPOSE 3000

CMD ["npm", "start"]
