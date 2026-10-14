# MARIAM Frontend - Development Dockerfile
# Node runs the dev server; Bun installs the dependencies.

FROM node:22-slim
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

WORKDIR /app

# Copy dependency files first
COPY package.json bun.lock ./

# Install dependencies with frozen lockfile for consistency
RUN bun install --frozen-lockfile

EXPOSE 5173
