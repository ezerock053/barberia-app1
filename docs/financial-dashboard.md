# Bloque 3: dashboard del dueño

El resumen de `/admin` consulta `GET /api/reports/daily?date=YYYY-MM-DD`.
Solo accede un usuario activo con rol `owner`, validado en el backend en cada
petición. Un barbero recibe 403 y una sesión inexistente o inactiva recibe 401.
No admite filtros de usuario o profesional que puedan alterar ese alcance.

## Cómo se calculan las métricas

- **Cobrado:** suma de `charges.amount`, no del precio del turno ni de su estado
  de pago. Se agrupa por `charges.paidAt`, método y barbero asociado al turno.
  Incluye cobros de servicios realizados antes o después de la fecha elegida.
- **Realizados:** turnos con `status = completed` cuyo `completedAt` cae en el día.
  Su importe es el precio histórico `appointments.servicePrice`, no el precio
  actual del catálogo. No usa `startAt` ni la fecha de creación de la reserva.
- **Realizados sin cobrar:** de esos servicios, los que actualmente no tienen
  `paymentStatus = paid` ni un registro en `charges`, cualquiera sea su fecha.
  Es una deuda actual del grupo realizado ese día, no un saldo histórico al cierre
  ni la deuda acumulada de todos los días. Al cobrar mañana, desaparece del
  pendiente del reporte de hoy, pero el ingreso se cuenta mañana.
- **Por barbero:** los mismos criterios; servicios y cobros son métricas
  independientes. Los activos aparecen aunque no tengan actividad; los inactivos
  aparecen si tienen movimientos en la fecha. El detalle muestra los tres métodos.
- **Brutos en ARS:** no descuenta comisiones de Mercado Pago, reembolsos ni pagos
  a profesionales. No calcula comisiones. Los importes se suman como centavos
  enteros (`BigInt`) y se serializan como decimales, sin sumas de punto flotante.

El día usa `America/Argentina/Buenos_Aires`, desde su primer instante inclusivo
hasta el primer instante del día siguiente exclusivo, convertido a UTC para
consultar. Respeta cambios históricos de huso horario; no reinterpreta los datos
UTC existentes. La fecha por defecto es el día argentino, incluso si UTC ya está
en el siguiente día. El servidor rechaza fechas futuras, inexistentes, duplicadas
o con formato incorrecto.

Para cobros presenciales se conserva la fecha efectiva registrada por el operador.
En Mercado Pago se conserva la convención del Bloque 2: `provider_update` toma la
actualización de la Order y `verified_at` la verificación como alternativa. La
interfaz identifica esa procedencia; no garantiza la fecha bancaria de acreditación.
Este bloque no consulta Mercado Pago ni altera el checkout o el webhook.

Los pagos históricos sin `Charge` **no se inventan** ni se reparten por método.
Los realizados sin `completedAt` tampoco se asignan a la fecha de la reserva.
Se muestran contadores de esas situaciones en toda la base, fuera de las métricas
diarias. Un pagado histórico con fecha de finalización sí cuenta como servicio y
no como pendiente. Si existe un cobro pero el estado de pago está desactualizado,
se evita considerarlo deuda y se muestra una advertencia.

## Consistencia y compatibilidad

Todas las lecturas del reporte comparten una transacción `REPEATABLE READ` de
solo lectura. Una operación concurrente queda completamente antes o después de
esa vista, evitando mezclar cobros nuevos con estados viejos. La transacción
administrada se cierra automáticamente ante éxito o error; no usa bloqueos de
actualización, llamadas externas ni modifica reservas.

Se conserva la unicidad de `charges.appointmentId` y `providerOrderId` y todas las
garantías transaccionales del Bloque 2. El reporte evita repetir una fila con el
mismo ID y falla de forma genérica ante dos cobros distintos del mismo turno o
datos monetarios inválidos, en lugar de sobreestimar ingresos. No requiere
migraciones, dependencias nuevas ni cambios en el almacenamiento.

Las respuestas usan `Cache-Control: no-store`. Se exponen solo datos necesarios
para el reporte: nombres, importes, métodos y fechas, sin credenciales, firmas ni
identificadores privados de Mercado Pago. Cada fila permite abrir el turno por
ID, sin filtrarlo por su fecha de agenda (que puede ser distinta del día del cobro).

## Prueba manual

1. Iniciar backend y frontend como habitualmente e ingresar como dueño. Abrir
   **Resumen** (`/admin`): verificar la fecha argentina, las tres tarjetas y los
   totales de efectivo, transferencia y Mercado Pago.
2. En datos locales de prueba, finalizar un turno sin cobrar. Actualizar el
   resumen: suma un realizado y un pendiente, pero no ingresos.
3. Registrar un cobro presencial permitido en efectivo o transferencia. Actualizar:
   suma el importe real al método y al barbero y elimina ese pendiente. No es
   necesario ejecutar pagos ni crear nuevos checkouts de Mercado Pago.
4. Elegir un día anterior con datos: un corte y su cobro en días distintos deben
   aparecer en los detalles de sus respectivas fechas. Un servicio ya cobrado hoy
   no debe quedar como deuda al revisar su día de finalización.
5. Abrir el detalle de cada barbero y un enlace de turno desde las listas. El turno
   debe abrir aunque su horario original corresponda a otra fecha. Usar **Volver
   a todos los turnos** para recuperar los filtros de agenda.
6. Probar una fecha sin movimientos, un celular y un error de red: deben mostrarse
   los estados vacío, responsive y error con opción de reintentar, respectivamente.
7. Ingresar como barbero: conserva **Mi agenda** y no puede consultar
   `/api/reports/daily`. Sin sesión tampoco es accesible.

## Verificación automatizada

`cd backend; npm test` cubre el reporte, métodos, centavos, fechas separadas,
medianoche argentina, horario histórico, datos faltantes, pendientes actuales,
duplicados, permisos y errores; también ejecuta las pruebas existentes de
concurrencia, cobros y webhook. `cd frontend; npm run build` verifica la compilación.
