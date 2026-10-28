# Bloque 2: servicios realizados y cobros

## Instalación y alcance

Ejecutar `npm --prefix backend run db:migrate` antes de iniciar esta versión.
La migración `20261028190000-add-appointment-charges.js` agrega `completedAt`,
`completedByUserId` y la tabla `charges`, y habilita el método interno `transfer`.
No cambia los valores históricos de turnos ni inventa fechas o usuarios para
servicios realizados y pagos anteriores. Un pago histórico `paid` sin registro
de cobro continúa bloqueando cualquier cobro nuevo.

Esta versión registra un único cobro completo por turno, por el precio histórico
`servicePrice`. No admite cuotas, pagos combinados, descuentos, propinas,
reversiones contables ni reembolsos desde el panel. No crea estadísticas.
El método `transfer` representa una transferencia presencial verificada por el
operador; no inicia transferencias ni cambia las opciones del checkout público.

## Acciones y permisos

- `POST /api/appointments/:id/complete-and-charge`: recibe `method` (`cash` o
  `transfer`) y opcionalmente `amount`. Usa el precio histórico bajo el bloqueo;
  si se envía un importe, debe coincidir. La interfaz siempre envía el importe
  visible para detectar cambios de precio desde que abrió la tarjeta.
  Finalización, cobro y auditoría se confirman en una única transacción.
  Si ya está pagado, solo finaliza sin generar otro cobro. Repetir la confirmación
  conserva el primer cobro, fecha y actor. Si falla una escritura, no se guarda
  parcialmente ninguna de las dos operaciones.
- `POST /api/appointments/:id/refresh-payment`, sin campos adicionales: verifica
  la Order por API y actualiza su estado sin marcar realizado. No cancela ni
  inicia pagos. Un error o 404 no libera un checkout incierto.

- `POST /api/appointments/:id/complete`, sin campos adicionales: marca realizado,
  con fecha del servidor y usuario de la sesión. Repetirlo conserva la primera
  fecha y actor. Nunca cambia el estado del pago.
- `POST /api/appointments/:id/charges`: recibe `method` (`cash` o `transfer`),
  `amount` y opcionalmente `paidAt` en ISO 8601 con zona horaria explícita.
  El importe se valida en centavos y debe coincidir con el precio del turno.
  Si no se indica fecha, se usa el instante actual. No admite fechas futuras.
- El dueño opera cualquier turno; el barbero únicamente los de su cuenta.
  La consulta bloqueante incluye el vínculo autorizado; un ID ajeno responde 404.
  El cliente no puede establecer el actor, la moneda ni el estado del pago.
- La respuesta de cada turno incluye su `charge`, autor del cobro, autor de la
  finalización y el indicador `checkoutStarted`, sin tokens ni URLs privadas.

La tabla de cobros conserva importe, importe esperado, moneda, método, fecha,
origen de esa fecha, usuario que registró y, para Mercado Pago, referencia externa.
No hay endpoints para editar o eliminar un cobro registrado.

## Transiciones

| Estado actual | Estados siguientes |
|---|---|
| Pendiente | Confirmado, realizado, cancelado, ausente |
| Confirmado | Realizado, cancelado, ausente |
| Realizado, cancelado, ausente | Sin transiciones nuevas |

Un turno realizado puede seguir sin cobrar. El cobro se permite antes o después
de realizar el servicio, pero nunca presencialmente si está cancelado o ausente.
Un turno cobrado no puede pasar a cancelado o ausente.
La repetición del mismo estado es un no-op.

Se impiden cambios de cliente, profesional, servicio u horario en turnos cobrados,
realizados o con checkout iniciado. Las notas siguen siendo editables por el dueño.
La ruta PUT existente del dueño aplica estas mismas reglas y registra la autoría
si recibe `status: completed`. DELETE conserva el significado de cancelación y
respeta las restricciones; no borra registros.

## Concurrencia y Mercado Pago

Finalización, cobro presencial, creación del checkout y webhook bloquean la misma
fila de `appointments` dentro de una transacción. La restricción única
`charges.appointmentId` es una segunda protección contra doble cobro. La escritura
del cobro y de `paymentStatus` es atómica. Un error revierte ambas escrituras.

Con una Order iniciada, el cobro presencial consulta la API bajo ese bloqueo:

- Order pagada: registra/reconcilia el cobro Mercado Pago y rechaza el presencial.
- Order cancelada o vencida, con importe pagado cero: permite el presencial,
  revoca el token de inicio y elimina la URL reutilizable. Conserva el ID de la Order.
- Order pendiente, rechazada sin cierre confirmado o resultado incierto: bloquea.
- Error de API, 404, referencia incorrecta o creación sin ID: no desbloquea.

La aplicación no cancela automáticamente órdenes externas. El operador debe
resolverlas en Mercado Pago o esperar su vencimiento, y luego volver a intentar.
Un intento sin ID requiere reconciliar su creación; no se asume impago.

El webhook sigue exigiendo HMAC y consulta autenticada de la Order. Nunca acepta
el estado o importe del body como prueba de pago. El registro Mercado Pago toma
`total_paid_amount`, valida ARS e importe suficiente contra el precio histórico.
El actor queda nulo (sistema). `dateSource: provider_update` identifica la fecha
de actualización de la Order, que no debe confundirse con una fecha exacta de
acreditación; si falta, `verified_at` identifica el instante de verificación.

Duplicados no crean registros nuevos. Un evento pendiente o fallido tardío no
revierte un cobro. Una aprobación contradictoria con un cobro presencial existente
responde 502 sin sobrescribirlo: requiere revisión, no una segunda imputación.
Si llega un pago real de una reserva ya cancelada o ausente, se conserva su cobro
verificado sin reactivar ni marcar realizado el servicio.

## Fechas e interfaz

Los instantes se almacenan con conexión UTC y se devuelven en ISO 8601.
Agenda, finalización y cobros se presentan en `America/Argentina/Buenos_Aires`.
El formulario interpreta la fecha local con UTC-03:00, vigente para estas fechas.
No se reescriben fechas de reservas existentes ni se cambia el flujo público.

Mi agenda y la gestión de turnos del dueño comparten acciones y confirmaciones.
Se muestran dos indicadores separados: servicio y cobro. El cobro muestra el
importe real, método, fecha y usuario. Los importes conservan los centavos.

La interfaz usa tarjetas compactas tanto en celular como en escritorio. El flujo
rápido abre un panel dentro de la tarjeta, con dos botones de método y una única
confirmación; no abre modales ni pide volver a escribir importe o fecha.
La fecha del flujo rápido es el instante del servidor. El endpoint de cobro
individual conserva `paidAt` para clientes que requieran registrar fechas efectivas.

| Situación | Acción principal |
|---|---|
| Servicio pendiente/confirmado, sin cobrar y sin checkout abierto | Finalizar y cobrar |
| Realizado sin cobrar | Cobrar |
| Pagado y todavía sin realizar | Finalizar |
| Checkout pendiente | Solo marcar realizado; verificar estado de Mercado Pago |
| Realizado y pagado, cancelado o ausente | Sin acciones de finalización/cobro |

Las acciones secundarias **Solo marcar realizado** y **Solo registrar cobro**
siguen disponibles cuando corresponden. Un cobro bloqueado no se ofrece; primero
hay que verificar que Mercado Pago haya cerrado la Order. Los botones se bloquean
durante el envío y la tarjeta se actualiza con la respuesta, sin recargar la página.
La protección definitiva continúa estando en el backend y en la base de datos.

## Prueba manual sin Mercado Pago

Para probar el flujo rápido, abrir **Mi agenda** o **Turnos** (por defecto muestran
el día de Buenos Aires), pulsar **Finalizar y cobrar**, elegir efectivo o
transferencia y confirmar. Verificar ambos indicadores en la misma tarjeta.
Repetir el intento desde otra pestaña no debe crear un segundo cobro.
En un turno pagado debe aparecer **Finalizar**; en uno realizado impago, **Cobrar**.
Las acciones independientes se prueban con los pasos siguientes.

1. Ingresar como dueño o barbero y abrir un turno propio pendiente/confirmado,
   con pago pendiente y sin checkout iniciado.
2. Marcar realizado. Verificar que el cobro siga pendiente y aparezcan fecha y actor.
3. Registrar efectivo o transferencia por el importe histórico. Confirmar recepción.
4. Verificar el detalle del cobro y que desaparezca la opción de cobrar nuevamente.
5. Repetir en otro turno cobrando primero y marcando realizado después.
6. Probar con otra cuenta de barbero: no debe acceder ni operar ese turno.
7. Intentar cambiar servicio o cancelar un turno cobrado/realizado: debe rechazarse.

Las pruebas automáticas simulan Mercado Pago y cubren HMAC, duplicados,
concurrencia, errores de persistencia, fechas, permisos y restricciones.
No requieren crear pagos reales ni credenciales del proveedor.
