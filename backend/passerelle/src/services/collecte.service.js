/**
 * Service Collecte — récupère les données des registres et applique la minimisation.
 *
 * Pour chaque registre concerné :
 *  1. on demande au registre UNIQUEMENT les champs requis (?champs=) ;
 *  2. on passe le résultat dans le filtre de minimisation du service consentement ;
 *  3. on recoupe avec la liste des champs autorisés pour cette requête.
 * L'étape 3 compte pour les administrations privées : on ne transmet jamais plus
 * que ce que le citoyen a accepté, même si les règles de la démarche ont été
 * élargies entre-temps.
 */
const registresClient = require('../clients/registres.client');
const consentementClient = require('../clients/consentement.client');

/**
 * Collecte et filtre les données d'un citoyen.
 *
 * @param {string} demarcheId Démarche (détermine le filtre de minimisation).
 * @param {string} iue Citoyen concerné.
 * @param {Array<{registre: string, champs: string[]}>} allowedFields Champs autorisés par registre
 *        (règles de la démarche, ou champs acceptés dans le consentement).
 * @returns {Promise<{donnees: object, champs_transmis: string[], registres_consultes: string[], registres_sans_dossier: string[]}>}
 *          `donnees` est regroupé par registre, comme dans le contrat RequeteResultat.
 */
async function collect(demarcheId, iue, allowedFields) {
  const perRegistre = await Promise.all(allowedFields.map(async ({ registre, champs }) => {
    const raw = await registresClient.fetchFields(registre, iue, champs);
    if (raw === null) return { registre, absent: true };

    const { donnees_filtrees: filtered } = await consentementClient.filter(demarcheId, registre, raw);
    const kept = Object.fromEntries(Object.entries(filtered).filter(([field]) => champs.includes(field)));
    return { registre, data: kept };
  }));

  const donnees = {};
  const champsTransmis = [];
  const sansDossier = [];
  for (const item of perRegistre) {
    if (item.absent) {
      // Ex : une mineure n'a pas de dossier fiscal. Le registre a bien été consulté.
      sansDossier.push(item.registre);
    } else {
      donnees[item.registre] = item.data;
      champsTransmis.push(...Object.keys(item.data));
    }
  }

  return {
    donnees,
    champs_transmis: champsTransmis,
    registres_consultes: allowedFields.map((f) => f.registre),
    registres_sans_dossier: sansDossier,
  };
}

module.exports = { collect };
