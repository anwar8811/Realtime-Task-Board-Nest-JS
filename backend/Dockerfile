# ---- Builder stage -------------------------------------------------------
# Compiles the NestJS app to dist/ and generates the Prisma client that the
# runtime stage will reuse. Build tools (python3/make/g++) are only needed
# here because `bcrypt` compiles a native addon during `npm ci` on musl/alpine.
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy manifest + Prisma schema first so `npm ci`'s `postinstall: prisma generate`
# script has the schema available, and so this layer is cached until either changes.
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

# Now copy the rest of the source and build.
COPY . .

RUN npm run build

# ---- Runtime stage ---------------------------------------------------------
# Slim image: no build tools, no dev dependencies, just the compiled app,
# the generated Prisma client, and what `prisma migrate deploy` needs at boot.
FROM node:20-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# WORKDIR creates /app as root; chown just that one directory entry (cheap,
# non-recursive — it's still empty at this point) so `node` can create
# node_modules inside it below.
RUN chown node:node /app

# `prisma migrate deploy` needs to write into node_modules/@prisma/engines at
# startup (engine binary bookkeeping), so the non-root `node` user needs to
# own its files from the start. `COPY --chown` sets ownership as part of the
# copy itself (cheap, single layer) and switching to `USER node` before
# `npm ci` means the install itself produces node-owned files directly —
# avoiding a separate `chown -R` pass, which would otherwise force a
# copy-on-write duplication of the whole (~270MB) node_modules tree into a
# new layer and roughly double the image size.
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./

USER node

# --ignore-scripts: skip the `postinstall: prisma generate` script here.
# It's redundant — the client generated in the builder stage is copied in
# below, so the runtime's @prisma/client is guaranteed to match what was
# actually built and tested, instead of being regenerated a second time.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
