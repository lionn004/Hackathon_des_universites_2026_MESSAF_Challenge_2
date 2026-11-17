/**
 * Erreur métier du service.
 *
 * Les services lèvent une AppError quand une règle métier n'est pas respectée
 * (ex : citoyen introuvable). Le middleware errorHandler la convertit ensuite
 * en réponse HTTP au format commun { code, message }.
 *
 * @example
 *   throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
 */
class AppError extends Error {
  /**
   * @param {number} status  Code HTTP à renvoyer (ex : 404).
   * @param {string} code    Code d'erreur en MAJUSCULES, stable et lisible par une machine.
   * @param {string} message Message lisible par un humain, en français.
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = AppError;
