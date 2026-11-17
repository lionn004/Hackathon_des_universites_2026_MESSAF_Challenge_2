/**
 * Filtre des champs demandés via le paramètre ?champs= (commun aux registres).
 *
 * Les champs inconnus sont ignorés silencieusement : le registre renvoie
 * uniquement ce qu'il connaît, sans erreur, pour rester tolérant envers
 * les passerelles d'autres équipes (test d'interopérabilité).
 *
 * @param {object} data Données complètes au format du contrat.
 * @param {string} [fieldsParam] Valeur brute de ?champs= (ex : "ifu,en_regle").
 * @param {string[]} allowedFields Liste blanche des champs du schéma du contrat.
 * @returns {object} Toutes les données si fieldsParam est absent, sinon le sous-ensemble demandé.
 */
function pickFields(data, fieldsParam, allowedFields) {
  if (!fieldsParam) return data;
  const requested = fieldsParam.split(',').map((f) => f.trim()).filter((f) => allowedFields.includes(f));
  return Object.fromEntries(requested.map((f) => [f, data[f]]));
}

module.exports = pickFields;
