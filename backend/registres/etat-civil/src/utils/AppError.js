// Erreur métier : convertie en { code, message } par le middleware errorHandler.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = AppError;
