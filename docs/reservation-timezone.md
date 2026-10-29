# Convención de fechas y horarios de reservas

## Problema encontrado

La selección pública enviaba `2026-10-28 10:00:00`. El backend agregaba `Z` y lo
guardaba como 10:00 UTC. La agenda, correctamente presentada en Buenos Aires,
mostraba ese instante como 07:00. Disponibilidad y validación de horarios también
comparaban horas y días UTC contra los horarios laborales locales.

## Convención vigente

- Los días y horas de trabajo de `working_schedules` representan la hora local de
  **America/Argentina/Buenos_Aires**. No se desplazan sus valores existentes.
- Disponibilidad interpreta la fecha de calendario en esa zona, convierte cada
  horario ofrecido en un instante UTC y consulta ocupación dentro del día local:
  inicio inclusivo, siguiente día exclusivo. Respeta las reglas históricas IANA.
- `GET /api/availability` mantiene `availableSlots` y agrega `slotStartsAt`, por
  ejemplo `{"10:00":"2026-10-28T13:00:00.000Z"}`. Sin horarios devuelve listas
  y mapa vacíos. El frontend conserva ese mapa y envía el instante correspondiente;
  no reconstruye fechas con la zona del dispositivo ni suma tres horas por su cuenta.
- Creación y reprogramación aceptan ISO con `Z` u offset explícito, validan el
  calendario y comparan el día y la hora **locales** con el horario del profesional.
  La hora debe ser exacta en Buenos Aires y el servicio sigue durando una hora.
- Los instantes se guardan y devuelven en UTC (conexión Sequelize `+00:00`).
  `10:00-03:00` y `13:00Z` son el mismo instante y compiten por el mismo lugar.
- Dueño, barbero y confirmación pública muestran el calendario de Buenos Aires,
  independientemente de la zona horaria del dispositivo. Los límites del selector
  público también se calculan en Buenos Aires.
- Se conserva la anticipación de **2 horas a 30 períodos de 24 horas**, límites
  inclusivos, calculada sobre instantes reales. Mostrar el último día en el
  calendario no implica que todas sus horas estén habilitadas. Se vuelve a validar
  tras adquirir el bloqueo del barbero, como antes.

No cambia la duración, el bloqueo por profesional, las reglas de cancelación,
finalización, cobros ni Mercado Pago. Los reportes siguen usando `paidAt` y
`completedAt`, no el horario reservado.

## Compatibilidad e históricos

No hay migración ni actualización masiva. Un turno guardado como `10:00Z` continúa
siendo ese instante y mostrando 07:00 en Buenos Aires. Nunca se intenta deducir
qué hora quiso elegir el cliente ni se desplaza una reserva pagada o con checkout.
La ocupación existente se compara por su instante real, sin ignorarla por su origen.
Cambiar solamente el estado tampoco reinterpreta ni modifica `startAt` o `endAt`.

Para mantener el contrato de clientes anteriores, un `startAt` sin zona conserva
su interpretación **UTC**, tanto en POST como en PUT. Las solicitudes nuevas de
la aplicación siempre usan una zona explícita. `from` y `to` sin zona conservan
su interpretación UTC; para filtrar por fecha local se usa `agendaDate`.

Publicar backend y frontend de esta corrección juntos y recargar las pestañas de
reserva abiertas con la versión anterior: el JavaScript anterior aún construye
fechas sin zona. El frontend nuevo no adivina un instante si falta `slotStartsAt`;
pide volver a consultar disponibilidad.

Las reservas anteriores que no coincidan con la intención del cliente deben
revisarse individualmente antes de una eventual reprogramación autorizada. Estar
fuera del horario laboral actual es una señal para revisar, no prueba de que el
horario original estuviera equivocado. No se incluyen datos personales de esa
revisión en el repositorio.

## Comprobación manual sin pagos

1. Reiniciar el backend y recargar el frontend. Elegir un día y profesional con
   10:00 disponible, al menos dos horas después del momento actual.
2. Elegir 10:00 y completar una reserva local de prueba en efectivo. El resumen
   y la confirmación deben mostrar 10:00.
3. En Network, la disponibilidad debe asociar `10:00` con `13:00Z` para fechas
   actuales; el POST debe enviar ese mismo ISO y la respuesta conservarlo.
4. Abrir la fecha como dueño y como el barbero asignado: ambas tarjetas deben
   mostrar 10:00. No finalizar ni cobrar para esta comprobación.
5. Volver a consultar disponibilidad: 10:00 ya no debe ofrecerse. Una solicitud
   simultánea al mismo instante, aunque use otro offset, debe recibir 409.
6. Cambiar la zona del navegador a Tokio o Los Ángeles: la fecha y hora del
   negocio deben permanecer iguales. Probar también cerca de medianoche argentina.
7. Revisar un turno anterior: debe mantener exactamente su instante y presentación.

## Pruebas

`npm --prefix backend test` incluye recorrido completo desde disponibilidad hasta
las consultas de ambas agendas y el formateador usado por sus tarjetas, cierre
de jornada, día UTC diferente del local, límites de anticipación, ocupación
histórica, duplicados concurrentes, reprogramación, calendarios inválidos y
zonas de proceso UTC, Buenos Aires, Tokio y Los Ángeles. También cubre un cambio
histórico de horario de verano y una hora local inexistente.

`npm --prefix frontend run build` compila la reserva y las agendas sin cambios de
diseño ni dependencias adicionales.
