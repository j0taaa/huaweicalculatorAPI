FROM oven/bun:1.3.10 AS app

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl nodejs \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN node node_modules/next/dist/bin/next build
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV CATALOG_DB_PATH=/app/data/catalog.db
EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start"]
