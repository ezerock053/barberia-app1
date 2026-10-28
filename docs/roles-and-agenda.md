# Usuarios, roles y agenda

## Instalación

Ejecutar las migraciones antes de iniciar la versión nueva:

```powershell
npm --prefix backend run db:migrate
```

La migración `20261028180000-add-user-roles.js` agrega `role` y `barberId`
a `admin_users`. Los usuarios existentes quedan como `owner`, conservando IDs,
contraseñas y sesiones. No modifica turnos, clientes, pagos ni fechas.
Los valores internos son `owner` (dueño) y `barber` (barbero).

## Crear accesos

El dueño ingresa en el login existente, abre **Usuarios**, selecciona un barbero
activo sin cuenta e ingresa email y contraseña inicial. Cada barbero admite una
cuenta; el vínculo tiene clave foránea y unicidad. La contraseña se almacena con
bcrypt. No hay registro público de usuarios ni asignación de roles desde el login.

El dueño también puede usar `GET /api/users` y `POST /api/users` autenticados.
El POST recibe `email`, `password`, `role` y, para `barber`, un `barberId`
entero válido. Para `owner`, `barberId` debe estar ausente o ser nulo.
Las respuestas nunca incluyen contraseñas ni hashes.
Esta versión permite crear y listar accesos; no incluye edición de roles,
restablecimiento de contraseñas ni bajas desde la pantalla de usuarios.

## Permisos

- El dueño conserva los endpoints administrativos existentes.
- El barbero solo puede leer su lista de turnos y sus turnos por ID.
- No se permiten modificaciones de turnos por barberos en este bloque,
  incluso de turnos propios. Tampoco pueden administrar catálogos, usuarios,
  horarios ni consultar la lista privada de clientes.
- La ficha del cliente de un turno propio se muestra dentro de ese turno.
- El backend obtiene el vínculo de la cuenta en cada solicitud, nunca del cliente.
  Un filtro de otro barbero devuelve 403; un ID ajeno devuelve 404.
- Cuentas inactivas, vínculos inválidos y barberos inactivos no pueden ingresar
  ni continuar usando una sesión existente.
- Login y `/api/auth/me` mantienen el objeto `admin`, agregando `role` y `barberId`.
  La sesión sigue guardando solamente `adminUserId`; los permisos se releen de DB.

## Agenda y fechas

Los barberos ingresan a `/admin/agenda`. La fecha y hora se presentan explícitamente
en `America/Argentina/Buenos_Aires`, sin depender de la zona del navegador.
`GET /api/appointments?agendaDate=YYYY-MM-DD` filtra por ese día en Buenos Aires
(UTC-03:00 para las fechas de la aplicación), con límite superior exclusivo.
No puede combinarse con `from` o `to`. Estos filtros existentes conservan su
interpretación anterior. No se reescriben ni reinterpretan los instantes históricos
guardados en la base; esta entrega no corrige la convención de carga de la reserva
pública.

La reserva pública, disponibilidad y endpoints de Mercado Pago conservan su flujo.
No se implementan cobros manuales, estadísticas ni transiciones nuevas de estados.
