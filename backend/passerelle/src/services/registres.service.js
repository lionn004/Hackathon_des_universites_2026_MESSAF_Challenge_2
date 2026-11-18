/**
 * Service Registres : informations publiques sur le catalogue des registres et le
 * dictionnaire des données (conception § 4, § 5 et § 10).
 *
 * Aucune donnée citoyenne ici, et aucune adresse de registre (information interne) :
 * seulement ce qui permet à une administration, au citoyen et au jury de voir quels
 * registres sont branchés, s'ils répondent, et ce que signifie chaque donnée.
 */
const catalogue = require('../config/catalogue');
const registresClient = require('../clients/registres.client');

/**
 * GET /registres : état de chaque registre, et sources de chaque opération.
 * @returns {{registres: object[], sources: object}}
 */
function getEtat() {
  return { registres: registresClient.etatRegistres(), sources: catalogue.sources };
}

/**
 * GET /dictionnaire : données de la plateforme, par domaine, avec leur libellé.
 * Les règles de calcul ne sont pas détaillées : seul le fait qu'une donnée soit calculée l'est.
 * @returns {{version: string, domaines: object}}
 */
function getDictionnaire() {
  const domaines = {};
  for (const [domaine, donnees] of Object.entries(catalogue.dictionnaire.domaines || {})) {
    domaines[domaine] = Object.fromEntries(Object.entries(donnees).map(([nom, def]) => [nom, {
      libelle: def.libelle,
      type: def.type,
      sensibilite: def.sensibilite || 'personnelle',
      operation: `${domaine}.${def.operation}`,
      calculee: Boolean(def.calcul),
    }]));
  }
  return { version: String(catalogue.dictionnaire.version || ''), domaines };
}

module.exports = { getEtat, getDictionnaire };
