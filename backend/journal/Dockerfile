# Image du service journal (port 3006).
# Construite et lancée par docker-compose.yml à la racine du dépôt.
FROM node:22-alpine

WORKDIR /app

# OpenSSL requis par les moteurs Prisma sur Alpine
RUN apk add --no-cache openssl

# Dépendances copiées avant le code : Docker réutilise ce cache tant que
# package.json ne change pas, ce qui accélère les reconstructions.
COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
# Outil de démonstration : simulation d'une altération de la base (npm run simuler-alteration).
COPY scripts ./scripts

EXPOSE 3006

# Crée/met à jour les tables, charge les données de démo, puis démarre.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed.js && node src/server.js"]
