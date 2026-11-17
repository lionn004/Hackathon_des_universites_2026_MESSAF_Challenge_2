/**
 * Génère des jetons JWT d'administration pour tester la passerelle (démo, jury).
 *
 * Usage :
 *   docker compose exec passerelle npm run jeton:admin            → toutes les administrations
 *   docker compose exec passerelle npm run jeton:admin -- <uuid>  → une seule
 *
 * Puis : curl -H "Authorization: Bearer <jeton>" http://localhost:3004/api/requetes ...
 * Les jetons sont valables 24 h et signés avec JWT_SECRET (le même que la passerelle).
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { ADMINISTRATIONS } = require('../prisma/reference');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET manquant (voir .env.example)');
  process.exit(1);
}

const wantedId = process.argv[2];
const targets = wantedId ? ADMINISTRATIONS.filter((a) => a.id === wantedId) : ADMINISTRATIONS;
if (targets.length === 0) {
  console.error(`Administration inconnue : ${wantedId}`);
  process.exit(1);
}

for (const admin of targets) {
  const token = jwt.sign({ administration_id: admin.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '24h' });
  console.log(`# ${admin.nom} (${admin.type}, ${admin.domaine_mission})\n${token}\n`);
}
