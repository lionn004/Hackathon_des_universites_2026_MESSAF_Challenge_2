const AppError = require('../utils/AppError');

function notFound(req, res) {
  res.status(404).json({ code: 'ROUTE_NON_TROUVEE', message: `Route ${req.method} ${req.originalUrl} inexistante` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ code: 'ERREUR_INTERNE', message: 'Erreur interne du serveur' });
}

module.exports = { notFound, errorHandler };
