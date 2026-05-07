# MARIAM Backend - Development Dockerfile

FROM python:3.11-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Place the venv outside /app so the ./server volume mount doesn't shadow it
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH=/opt/venv/bin:$PATH

COPY pyproject.toml uv.lock ./
RUN uv sync --group dev --no-install-project --frozen

EXPOSE 5000
