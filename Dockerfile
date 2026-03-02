FROM oven/bun:1

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lockb ./

RUN bun install --frozen-lockfile

COPY . .

EXPOSE 8000

CMD ["bun", "index.ts"]
