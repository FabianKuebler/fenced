FROM oven/bun:1

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile
RUN bun run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["bun", "run", "apps/server/index.ts"]
