require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env') });
const app = require('./app');

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});

module.exports = server;
