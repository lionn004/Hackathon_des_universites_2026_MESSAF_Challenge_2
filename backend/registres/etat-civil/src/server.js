const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`[registre-etat-civil] à l'écoute sur http://localhost:${config.port}/api`);
});
