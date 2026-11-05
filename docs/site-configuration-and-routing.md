# SEO 1 y 2: configuración, rutas e indexación

## Alcance

Se mantiene React/Vite. Las cinco rutas públicas usan enlaces HTML normales;
no requieren un router adicional. La navegación carga la página solicitada y el
navegador administra recargas, atrás y adelante. No cambia ninguna regla de la API,
disponibilidad, autenticación, reservas, cobros ni Mercado Pago.

Vite genera una variante HTML por ruta. Antes de iniciar React, contiene los
títulos, introducciones y datos de contacto públicos configurados. React retira
ese bloque al iniciar y monta la interfaz habitual. Esta estrategia de
prerenderizado mantiene React/Vite y no consulta ni copia catálogos desde la base
de datos durante el build.

Al servir el build con el backend (`SERVE_FRONTEND=true`), Express lee servicios
y barberos activos desde los mismos modelos de la API en cada solicitud a la
portada, servicios o barberos, y los inserta en el HTML inicial. Así los precios
y el equipo no quedan congelados en el build. Las llamadas públicas existentes
siguen funcionando y entregan los mismos catálogos a React. Vite dev y preview
no tienen acceso al catálogo del backend: muestran los textos configurados en
el HTML inicial y la aplicación carga las tarjetas desde la API al iniciar.
Las páginas de reserva y administración continúan como SPA.

Cada ruta tiene title, descripción y canonical propios. El build produce
`sitemap.xml` con las cuatro rutas informativas solo cuando la instalación está
habilitada para indexación; en otros entornos contiene un sitemap vacío. También
produce `robots.txt`, que permite el rastreo y referencia el sitemap sin bloquear
las rutas que responden `noindex`. Contacto incluye JSON-LD `HairSalon` con los
datos disponibles en la configuración. No se generan coordenadas, horarios
estructurados, reseñas ni puntuaciones.

## Configurar una barbería independiente

El desarrollador edita **`frontend/site.config.json`** y vuelve a compilar. Es un
archivo público: nunca agregar contraseñas, tokens, secretos ni datos privados.
No hay un panel de personalización para el dueño. Cada instalación tiene su propio
archivo y build; no se infiere la identidad del negocio del header Host.

- `name`, `description`: identidad real del negocio; `description` es el texto
  general de respaldo.
- `address`: `street`, `locality`, `province`, `postalCode`, `country`.
- `phone`: teléfono público del negocio; puede incluir prefijo +54.
- `whatsapp`: número internacional completo solo con dígitos, sin + ni espacios.
- `instagram`: URL HTTPS del perfil oficial en instagram.com, o cadena vacía.
- `email`: correo comercial público, o cadena vacía.
- `logo`: ruta pública desde `/` o URL HTTPS, o cadena vacía. Para una imagen
  local, colocar el archivo en `frontend/public/`, por ejemplo `/branding/logo.webp`.
- `publicUrl`: origen público completo, incluido protocolo y dominio; sin rutas,
  credenciales, fragmentos ni parámetros. No se repite el dominio en otro campo.
- `texts`: textos de portada, presentaciones, lema, horario comercial y cuatro
  descripciones SEO (`seoHomeDescription`, `seoServicesDescription`,
  `seoBarbersDescription`, `seoContactDescription`). Cada descripción describe
  esa página y es distinta de las demás. El horario es informativo y **no
  modifica los horarios de reserva de los barberos**.
- `environment`: `development`, `staging` o `production`.
- `isExample`: indica expresamente una instalación de ejemplo.
- `indexable`: habilitación explícita de las páginas informativas en producción.

La configuración incluida es una **demostración**, con nombre y contacto
identificados como tales y `indexable: false`. Navbar, Footer, Contacto y los
textos configurables de las páginas leen esa misma fuente.

Para publicar una instalación indexable: completar datos reales y todos los textos,
usar dominio HTTPS real, `environment: "production"`, `isExample: false` e
`indexable: true`. La validación bloquea datos de ejemplo, campos desconocidos,
orígenes de desarrollo, protocolos peligrosos, información obligatoria ausente y
patrones reconocibles de credenciales. Los errores no imprimen sus valores.
La validación no puede certificar que una dirección o teléfono sean verdaderos:
esa revisión le corresponde al desarrollador antes de publicar.

Desarrollo de Vite siempre envía noindex. Un build en modo distinto de production
tampoco habilita indexación. `environment: production` por sí solo no la habilita.
Staging debe tener su propia configuración con `indexable: false`; no reutilizar
un build indexable de producción en un dominio de pruebas sin protección adicional.

## Rutas y compatibilidad

| Ruta | Política con instalación indexable |
| --- | --- |
| `/`, `/servicios`, `/barberos`, `/contacto` | `index, follow` |
| `/reservar` | `noindex, follow` |
| `/admin` y `/admin/*`, incluido login | `noindex, follow` |
| Ruta pública inexistente | HTTP 404 y `noindex, follow` |

Los query strings no cambian la política. La barra final se acepta sin convertir
una URL desconocida en portada. Se conserva el flujo privado existente, incluido
el retorno al login cuando no hay sesión.

Los enlaces antiguos `/#inicio`, `/#servicios`, `/#barberos`, `/#contacto`,
`/#reservar` y los enlaces de listas de la portada se reemplazan por su ruta real,
conservando el query string de la URL. La compatibilidad solo se aplica en `/`;
no interfiere con anclas privadas como `#report-collections`. Los fragmentos no
llegan al servidor, por lo que esta compatibilidad necesita JavaScript.

## Servidor que entrega el HTML

La política **no depende de cambiar robots desde React**. El plugin de Vite
aplica metadatos iniciales y `X-Robots-Tag` en desarrollo y preview. También
devuelve 404 real en rutas desconocidas, evitando el fallback genérico a portada.

El build genera `index.html`, las variantes prerenderizadas de las rutas,
`admin/index.html`, `404.html`, `sitemap.xml`, `robots.txt` y un manifiesto
técnico `site-policy.json`. El canonical de cada página se forma con
`publicUrl` y su ruta. El sitemap no incluye reserva, administración ni rutas
desconocidas y no inventa `lastmod`.
No editar manualmente esos artefactos: reemplazarlos juntos al publicar.

Para una instalación sencilla, el backend existente puede servir el build:

```powershell
npm --prefix frontend run build
$env:SERVE_FRONTEND = 'true'
npm --prefix backend start
```

La opción no está habilitada por defecto. Con `SERVE_FRONTEND=true`, Express sirve
los archivos públicos, aplica la política por ruta y entrega todas las rutas
privadas desde el shell administrativo noindex. La API y `/health` conservan sus
endpoints y nunca reciben el fallback HTML. No se crean migraciones ni se cambian
reservas históricas. En producción se mantiene la configuración existente de
HTTPS, proxy y cookies seguras; esta opción no reemplaza esas condiciones.

**Si se usa otro hosting**, debe servir el archivo correcto en cada ruta y
publicar `robots.txt` y `sitemap.xml` en la raíz: cuatro páginas informativas,
reserva, shell `/admin/*` y página 404 con estado 404.
Además debe respetar `X-Robots-Tag: noindex, follow` en administración, reserva y
errores. Las respuestas de `/`, `/servicios` y `/barberos` también deben rellenar
los marcadores del catálogo desde la API o base de datos en cada solicitud; servir
los archivos estáticos directamente dejaría las tarjetas fuera del HTML inicial.
No usar un rewrite global que responda siempre con `/index.html`: podría
entregar metadatos incorrectos y HTTP 200 para URLs inválidas. Revisar esa
configuración antes de habilitar indexación. `vite preview` sirve para comprobar
el build, no se propone como servidor de producción.

`noindex` y robots.txt no son seguridad. Se mantienen intactos la sesión y los
permisos del backend; ningún dato privado se coloca en HTML ni en configuración.

## Verificación

1. Reiniciar Vite si se modifica la configuración. Visitar directamente `/`,
   `/servicios`, `/barberos`, `/contacto` y `/reservar`; recargar cada ruta.
2. Navegar con los enlaces y probar atrás/adelante. Abrir `/#reservar` y comprobar
   que se convierte en `/reservar`. Los enlaces administrativos siguen funcionando.
3. Visitar una URL inexistente: debe mostrar Página no encontrada y devolver 404
   en Network, tanto en Vite como en el servidor de producción elegido.
4. Inspeccionar la respuesta HTML y las cabeceras de `/admin/login` y `/reservar`
   sin ejecutar JavaScript: ambas deben incluir noindex.
5. Con configuración de desarrollo todas las rutas deben ser noindex. Con una
   configuración real indexable, solo las cuatro rutas informativas pueden indexarse.
6. Inspeccionar el HTML inicial de las cuatro páginas y confirmar que incluya
   título, descripción, canonical y contenido prerenderizado. En Contacto,
   revisar el JSON-LD y compararlo con la información visible.
7. Abrir `/robots.txt` y `/sitemap.xml`; con el ejemplo local el sitemap estará
   vacío y robots mostrará la URL local configurada. Con una configuración
   indexable de prueba deben figurar solo las cuatro rutas permitidas.
8. Cambiar un servicio o barbero desde la base de datos: sus tarjetas siguen
   actualizándose en las llamadas API, sin rebuild. Con `SERVE_FRONTEND=true`,
   confirmar que también aparecen en el HTML inicial de la respuesta; `vite
   preview` por sí solo no hace esa consulta a la base de datos.

El dominio HTTPS real es necesario para canonicals que Google pueda usar, un
sitemap publicable y para habilitar indexación. Los templates, validaciones,
metadatos, XML, `robots.txt` y el JSON-LD pueden probarse en local con fixtures;
el ejemplo de desarrollo permanece `noindex` y no emite datos estructurados.

Pruebas: `npm --prefix backend test`, `npm --prefix frontend test` y
`npm --prefix frontend run build`. Cubren validación, bloqueo de ejemplos,
   prerenderizado/metadatos, catálogos actuales en el HTML de Express, sitemap,
   robots, JSON-LD, cabeceras/estados de Express
y navegación real en navegador con API simulada, sin ejecutar pagos ni modificar
datos reales.
