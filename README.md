# Barbería - setup inicial

- `frontend/`: aplicación React servida por Vite.
- `backend/`: API Express, Sequelize y directorio preparado para migraciones.
- `.env.example`: plantilla de variables; copiar a `.env` y ajustar para el entorno local.

La conexión a MySQL se configura en `backend/config/config.js`. Las migraciones se gestionan con `npx sequelize-cli db:migrate` desde la raíz.
