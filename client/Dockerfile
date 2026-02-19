# MARIAM Frontend - Development Dockerfile
# Uses Bun for fast package installation

FROM oven/bun:latest

WORKDIR /app

# Copy dependency files first
COPY package.json bun.lock ./

# Install dependencies with frozen lockfile for consistency
RUN bun install --frozen-lockfile

EXPOSE 5173
