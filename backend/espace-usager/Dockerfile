# Image du BFF espace usager (port 3000), seul point d'entrée du frontend.
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

EXPOSE 3000

# Crée/met à jour les tables, charge les comptes de démo, puis démarre.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed.js && node src/server.js"]
