# Node runs the dev server; Bun installs the dependencies.

FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
COPY --from=oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

EXPOSE 5173
