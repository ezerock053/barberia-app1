# Barbería

Aplicación de reservas con React, Vite, Express, Sequelize y MySQL.

## Preparar la base de datos

1. Instalá e iniciá MySQL.
2. Copiá `.env.example` a `.env` y completá `DB_USER`, `DB_PASSWORD` y el resto de la conexión si hace falta. La base configurada por defecto es `barberia_db`.
3. Desde la raíz del proyecto, ejecutá las migraciones y los datos de demostración:

   ```powershell
   npm --prefix backend run db:migrate
   npm --prefix backend run db:seed
   ```

La carga de demostración es repetible: agrega cuatro servicios, tres barberos y horarios de lunes a sábado (10:00 a 19:00; sábados hasta las 17:00), sin duplicarlos al ejecutarla de nuevo.

## Iniciar la aplicación

Abrí dos terminales en la raíz del proyecto:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

Abrí <http://127.0.0.1:5173/>. Vite reenvía `/api` al puerto configurado en `PORT` (por defecto, `3000`). El flujo permite elegir servicio, barbero, fecha y horario, ingresar los datos del cliente y confirmar la reserva.

Los nombres y precios cargados son datos ficticios para desarrollo; reemplazalos por la información de la barbería antes de publicar la aplicación.
