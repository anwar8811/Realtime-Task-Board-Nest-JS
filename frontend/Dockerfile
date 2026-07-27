# Multi-stage production build for the Next.js frontend.
# Base image: node:20-alpine for every stage - there are no native dependencies
# in this frontend, so no build tooling (python/make/g++) is needed anywhere.

# ---------------------------------------------------------------------------
# Stage: builder
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first so this layer is cached unless package*.json changes.
COPY package*.json ./
RUN npm ci

# Copy the rest of the source.
COPY . .

# NEXT_PUBLIC_* environment variables are inlined into the client JS bundle
# at build time by Next.js (not read at runtime) - see
# node_modules/next/dist/docs/01-app/02-guides/self-hosting.md ("Environment
# Variables" section). They therefore MUST be present before `npm run build`
# runs below. IMPORTANT: because the value is baked into the compiled
# bundle, changing the backend URL later requires rebuilding this image with
# a new --build-arg; restarting/recreating the container with a different
# runtime env var will have no effect.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ---------------------------------------------------------------------------
# Stage: runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
# Matches the project's existing `-p 3001` dev-server convention (see
# package.json "dev"/"start" scripts).
ENV PORT=3001

# `output: "standalone"` (frontend/next.config.ts) traces only the files
# needed to run the app and emits a minimal server.js entry point. The
# standalone output does not include the public/ or .next/static folders by
# default, so they are copied in separately below.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Run as the non-root `node` user built into the official alpine image
# rather than root.
USER node

EXPOSE 3001

CMD ["node", "server.js"]
