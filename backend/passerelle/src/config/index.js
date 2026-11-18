/**
 * Configuration du service passerelle.
 *
 * Centralise la lecture des variables d'environnement : aucun autre fichier
 * ne doit lire process.env directement.
 * En local, les valeurs viennent du fichier .env (voir .env.example) ;
 * dans Docker, elles sont fournies par docker-compose.yml.
 *
 * Les registres (adresses, routes, correspondances) ne sont pas ici : ils sont
 * décrits dans le catalogue (config/catalogue-registres.yaml, lu par catalogue.js),
 * ce qui permet de brancher n'importe quel registre sans toucher au code. Le catalogue
 * et le diagnostic lisent aussi quelques variables d'environnement (REGISTRE_*_URL,
 * CATALOGUE_DOSSIER, SONDE_INTERVALLE_MS).
 *
 * Note : DATABASE_URL n'apparaît pas ici car elle est lue directement
 * par Prisma (voir prisma/schema.prisma).
 */
require('dotenv').config();

// Sans secret, impossible de vérifier les jetons des administrations : on refuse
// de démarrer plutôt que de tourner avec une authentification cassée.
if (!process.env.JWT_SECRET) {
  throw new Error('[passerelle] Variable JWT_SECRET manquante (voir .env.example)');
}

// Même logique pour la clé qui protège les routes internes (passerelle ↔ BFF).
if (!process.env.CLE_SERVICE_INTERNE) {
  throw new Error('[passerelle] Variable CLE_SERVICE_INTERNE manquante (voir .env.example)');
}

/**
 * Retire les « / » finaux d'une URL. Les chemins sont ajoutés avec un « / » initial :
 * « http://registre:4001/api/ » donnerait « /api//citoyens/... », route inconnue de
 * la plupart des registres, et chaque citoyen paraîtrait absent.
 * @param {string} url
 * @returns {string}
 */
function withoutTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

module.exports = {
  /** Clé partagée exigée sur les routes /interne et envoyée au BFF (en-tête X-Cle-Service). */
  serviceKey: process.env.CLE_SERVICE_INTERNE,
  /** Port HTTP du service (3004 par défaut, imposé par le contrat). */
  port: Number(process.env.PORT) || 3004,
  /** Secret HS256 partagé, qui signe les jetons des administrations. */
  jwtSecret: process.env.JWT_SECRET,
  /** Délai maximal d'attente d'un autre service (ms) avant d'abandonner. */
  callTimeoutMs: Number(process.env.DELAI_APPEL_MS) || 5000,
  /**
   * Adresses des autres services de la plateforme (préfixe /api inclus, sans « / » final).
   * Les adresses des registres sont dans le catalogue (config/catalogue-registres.yaml).
   */
  urls: Object.fromEntries(Object.entries({
    consentement: process.env.CONSENTEMENT_URL || 'http://localhost:3005/api',
    journal: process.env.JOURNAL_URL || 'http://localhost:3006/api',
    bff: process.env.BFF_URL || 'http://localhost:3000/api',
  }).map(([service, url]) => [service, withoutTrailingSlash(url)])),
};
