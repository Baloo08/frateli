# ==============================================================================
# Frateli LMS — Multi-stage Dockerfile (EasyPanel + Hostinger KVM 2)
# Default stage (sin --target): web (puerto 3000)
# Worker dedicado: usar Dockerfile.worker (o --target worker)
# Regla de seguridad: NINGÚN secreto se declara como ARG en build time.
# ==============================================================================

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Stage 1: Dependencias
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Compilación Next.js standalone + Worker + Migrador
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN npm run build && npm run build:scripts

# Stage 3A: Worker opcional (BullMQ + FFmpeg nativo + Google SMTP + Drive Import)
FROM base AS worker
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 worker \
    && mkdir -p /tmp/frateli-transcode /var/lib/frateli/media \
    && chown -R worker:nodejs /tmp/frateli-transcode /var/lib/frateli/media

COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/dist/worker ./dist/worker

USER worker

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const net=require('net');const u=new URL(process.env.REDIS_QUEUE_URL||process.env.REDIS_URL||'redis://127.0.0.1:6379');const s=net.connect(Number(u.port||6379),u.hostname,()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));"

CMD ["node", "dist/worker/index.js"]

# Stage 3B (DEFAULT): Runner Web (Next.js standalone + migraciones SQL automáticas)
FROM base AS web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /var/lib/frateli/media \
    && chown -R nextjs:nodejs /var/lib/frateli/media

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/dist/db ./dist/db
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-web.sh ./scripts/start-web.sh

RUN sed -i 's/\r$//' ./scripts/start-web.sh && chmod +x ./scripts/start-web.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./scripts/start-web.sh"]
