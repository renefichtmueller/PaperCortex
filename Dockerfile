FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

RUN addgroup -g 1001 -S papercortex && \
    adduser -S papercortex -u 1001

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data && chown papercortex:papercortex /app/data

USER papercortex

ENV NODE_ENV=production
ENV VECTOR_DB_PATH=/app/data/vectors.db

EXPOSE 3100 8140

CMD ["node", "dist/mcp-server/index.js"]
