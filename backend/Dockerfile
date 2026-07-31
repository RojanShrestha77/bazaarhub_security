# ── Stage 1: install all deps and compile TypeScript ─────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
# Build toolchain for native addons (argon2, sharp compile from source
# against musl if no matching prebuilt binary exists for this platform/libc).
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: production dependencies only ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 3: runtime image ───────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user — if the app is compromised the attacker isn't root.
RUN addgroup -S bazaar && adduser -S bazaar -G bazaar

# Copy production node_modules and the compiled JS output only — no source,
# no dev tooling, no TypeScript compiler in the runtime image.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER bazaar

EXPOSE 5000

CMD ["node", "dist/index.js"]
