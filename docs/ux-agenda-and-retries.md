# Mejoras de agenda, observaciones y recuperación de errores

## Comportamiento

- **Mi agenda:** Actualizar vuelve a consultar la fecha seleccionada incluso si
  ya es hoy. Ante un fallo aparece Reintentar. Ambos botones conservan la fecha.
- Se destaca con borde y texto **Próximo turno** el pendiente o confirmado más
  cercano cuyo inicio sea igual o posterior al momento actual, únicamente en el
  día actual de Buenos Aires. No incluye cancelados, ausentes, realizados ni
  fechas distintas. Se recalcula al actualizar tarjetas y cada 30 segundos sin
  generar consultas adicionales al servidor. No cambia el orden de la agenda.
- El detalle del turno muestra observaciones no vacías como texto escapado por
  React, conservando saltos de línea y adaptando palabras largas. No interpreta
  HTML. Usa los mismos datos y permisos del endpoint privado existente.
- Las consultas de turnos, agenda, horarios y disponibilidad usan
  `useLatestQuery`: una clave identifica la selección y una revisión identifica
  cada reintento. Al cambiar la selección se ocultan de inmediato los datos
  anteriores. La limpieza descarta éxitos y errores de consultas obsoletas o de
  vistas desmontadas. Los errores dejan la lista vacía y se muestran separados
  del estado «sin resultados». No se agregan cachés ni sondeos de la API.
- En horarios, el selector de profesional queda bloqueado mientras se edita,
  elimina o guarda un horario, para conservar el contexto de la operación.
- La reserva distingue una consulta de disponibilidad fallida de una respuesta
  exitosa sin horarios. Permite reintentar disponibilidad y la carga inicial de
  servicios/barberos. Informa al menos dos horas de anticipación y hasta 30 días.
  Continuar permanece bloqueado sin un horario vigente con instante UTC asociado.

No cambia la validación del backend, la zona horaria, la duración, los bloqueos,
la finalización, los cobros ni Mercado Pago. No se modifican reservas históricas,
incluidas #14 y #18. No requiere migraciones ni dependencias adicionales.

## Prueba manual

1. Como barbero, abrir Mi agenda y pulsar Actualizar. Debe consultar la misma fecha
   y conservar las acciones rápidas. Cambiar de fecha y volver con Hoy.
2. Comprobar el rótulo Próximo turno: solo uno pendiente/confirmado de hoy, nunca
   un realizado, cancelado o ausente. En otra fecha no debe aparecer. Al finalizar
   el próximo, debe dejar de estar destacado y seleccionarse el siguiente futuro.
3. Abrir Ver detalle de un turno con observaciones y comprobar saltos de línea.
   Un texto como `<b>ejemplo</b>` debe mostrarse literalmente, sin formato HTML.
4. Bloquear temporalmente la consulta GET de agenda en DevTools. Pulsar Actualizar:
   debe mostrar el error sin tarjetas anteriores. Restablecer la red y Reintentar.
5. Como dueño, cargar turnos y cambiar la fecha mientras la consulta nueva está
   bloqueada. No deben quedar tarjetas del filtro anterior ni un falso mensaje
   de lista vacía junto al error.
6. Con red lenta, alternar rápidamente profesionales en Horarios. El resultado
   final debe corresponder al seleccionado, aunque otra consulta termine después.
7. En reserva pública, bloquear GET de disponibilidad: debe mostrar «No se pudieron
   cargar los horarios» y Reintentar. Restablecer la red; una respuesta vacía debe
   mostrar «No hay horarios disponibles para este día». No debe mantener un horario
   seleccionado de otra fecha. No hace falta confirmar reservas ni ejecutar pagos.
8. Repetir a 360/390 px: verificar Actualizar, Reintentar y la selección de cobro
   en la tarjeta. No es necesario confirmar cobros para revisar los controles.

## Pruebas automatizadas

- `npm --prefix frontend test`: pruebas de resultados y errores fuera de orden,
  desmontaje, reintento y selección del próximo según fecha argentina. También
  monta los componentes reales con una API simulada en el navegador instalado,
  en viewports exactos de 360 y 390 px. Comprueba áreas táctiles, desbordes, notas
  escapadas y los recorridos anteriores. Se usa un frame porque Edge impone un
  ancho mínimo a la ventana exterior; las media queries reciben el ancho móvil
  exacto, que la prueba verifica.
- Las pruebas de navegador detectan Edge en Windows o Chromium/Chrome en Linux;
  también admiten `UX_TEST_BROWSER` con una ruta local. Si no hay navegador, esas
  dos pruebas se omiten y siguen ejecutándose las unitarias. No descargan nada.
  Los perfiles temporales se crean fuera del repositorio y se eliminan al terminar.
- `npm --prefix backend test`: suite completa de reservas, autenticación,
  autorización, concurrencia, cobros, webhooks, zonas horarias y reportes.
- `npm --prefix frontend run build`: compilación de producción.
