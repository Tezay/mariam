# MARIAM Frontend - Development Dockerfile
# Uses Bun for fast package installation

FROM oven/bun:1.4.2

WORKDIR /app

# Copy dependency files first
COPY package.json bun.lock ./

# Install dependencies with frozen lockfile for consistency
RUN bun install --frozen-lockfile

EXPOSE 5173
