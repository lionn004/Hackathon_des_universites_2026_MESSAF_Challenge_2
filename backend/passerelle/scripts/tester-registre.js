/**
 * Teste le branchement d'un registre décrit dans le catalogue (conception § 11).
 *
 * Usage :
 *   docker compose exec passerelle npm run tester-registre -- <registre> <iue>
 *   ex : docker compose exec passerelle npm run tester-registre -- justice 784302956148
 *
 * Affiche, sans rien transmettre à personne ni rien écrire au journal :
 *   la connexion, l'identification de la personne, puis pour chaque opération du registre
 *   les données obtenues (traduites vers le dictionnaire et calculées), les données
 *   manquantes et les champs ignorés (hors dictionnaire : ils n'entrent jamais).
 * Code de sortie : 0 si tout est lu, 1 sinon.
 *
 * Outil d'administration de la plateforme, lancé dans le conteneur : il lit les données
 * d'une personne d'exemple ; à réserver aux personnes de démonstration.
 */
require('dotenv').config();
const registresClient = require('../src/clients/registres.client');

const [id, iue] = process.argv.slice(2);
if (!id || !iue) {
  console.error('Usage : npm run tester-registre -- <registre> <iue>');
  process.exit(2);
}

/**
 * Affiche une ligne « Libellé   valeur » alignée.
 * @param {string} libelle
 * @param {string} valeur
 */
function ligne(libelle, valeur) {
  console.log(`${libelle.padEnd(20)}${valeur}`);
}

/**
 * Valeur lisible d'une donnée (les listes et objets en JSON compact).
 * @param {*} v
 * @returns {string}
 */
function lisible(v) {
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
}

registresClient.diagnostiquer(id, iue).then((r) => {
  console.log(`Registre            ${r.registre} (${r.nom || 'sans nom'}) : ${r.adresse}`);
  ligne('Connexion', r.connexion.ok ? `OK (${r.connexion.ms} ms)` : `ÉCHEC : pas de réponse exploitable en ${r.connexion.ms} ms`);
  if (r.identification) ligne('Identification', `${r.identification.ok ? 'OK' : 'ÉCHEC'} : ${r.identification.detail}`);
  let toutLu = r.connexion.ok && r.identification && r.identification.ok;
  for (const op of r.operations) {
    console.log(`\n${op.operation}`);
    if (!op.ok) {
      toutLu = false;
      ligne('  Lecture', `ÉCHEC : ${op.detail}`);
      continue;
    }
    ligne('  Lecture', `OK (HTTP ${op.http})`);
    ligne('  Données obtenues', Object.entries(op.obtenues).map(([k, v]) => `${k} = ${lisible(v)}`).join(', ') || 'aucune');
    ligne('  Données manquantes', op.manquantes.join(', ') || 'aucune');
    ligne('  Champs ignorés', op.ignores.length ? `${op.ignores.join(', ')} (hors dictionnaire, jamais transmis)` : 'aucun');
  }
  process.exit(toutLu ? 0 : 1);
}).catch((err) => {
  console.error(err.message);
  process.exit(2);
});
