'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { sequelize, AdminUser } = require('../src/models');

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL debe contener un email válido.');
  }
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres y no superar 72 bytes UTF-8.');
  }

  const existingAdmin = await AdminUser.unscoped().findOne();
  if (existingAdmin) {
    throw new Error('Ya existe un administrador; no se realizaron cambios.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await AdminUser.create({ email, passwordHash, active: true });
  console.log(`Administrador creado: ${email}`);
}

main()
  .catch((error) => {
    console.error(error.message || 'No se pudo crear el administrador.');
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
