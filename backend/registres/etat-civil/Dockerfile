FROM node:22-alpine

WORKDIR /app

# OpenSSL requis par les moteurs Prisma sur Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3001

# Crée/met à jour les tables, charge les données de démo, puis démarre.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed.js && node src/server.js"]
