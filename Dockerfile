FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y \
    && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
COPY backend/README.md ./README.md
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]