FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Utilise le schéma PostgreSQL pour la production Docker
RUN cp prisma/schema.postgresql.prisma prisma/schema.prisma \
  && npx prisma generate \
  && npm run build

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl wget

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm install --no-save prisma@6.6.0

COPY --from=builder /app/prisma ./prisma
RUN cp prisma/schema.postgresql.prisma prisma/schema.prisma \
  && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
