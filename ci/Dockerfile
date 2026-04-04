FROM node:20-bookworm-slim

# Electron/Chromium system dependencies + Xvfb virtual display
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Virtual framebuffer — provides a display without a window manager
    xvfb \
    xauth \
    # GTK and accessibility
    libgtk-3-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    # Network / security
    libnss3 \
    libnspr4 \
    libcups2 \
    # Graphics / DRM
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    # X11 / display
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    # Fonts / rendering
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    # Audio (Electron links against it even when unused)
    libasound2 \
    # xdpyinfo — used by entrypoint to wait until Xvfb is ready
    x11-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell launch.ts to pass --no-sandbox (required when running as root in Docker)
ENV CI=true

WORKDIR /app

# Install Node dependencies first (layer-cached until package.json changes)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

COPY ci/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# entrypoint.sh starts Xvfb on :99 with access control disabled, then execs the command
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npx", "playwright", "test"]
