FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY tools ./tools
RUN pnpm install --frozen-lockfile --filter @madart/api...
RUN pnpm --filter @madart/api... build

FROM node:24-alpine
WORKDIR /repo
COPY --from=base /repo ./
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @madart/database migrate:deploy && node apps/api/dist/main.js"]
