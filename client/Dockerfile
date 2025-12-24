# MARIAM Frontend - Development Dockerfile
# Uses Bun for fast package installation

FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile || bun install

EXPOSE 5173
