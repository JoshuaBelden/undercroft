# One image for both production processes (see docs/dev/deployment.md):
#   web:  the SvelteKit app (adapter-node), `node build`
#   game: the authoritative game server, `tsx server/index.ts`
FROM node:24-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY --from=build /app/build ./build
# The game server runs from source and shares src/lib/shared and src/lib/content with the app.
COPY server ./server
COPY src ./src
EXPOSE 3000 8787
CMD ["node", "build"]
