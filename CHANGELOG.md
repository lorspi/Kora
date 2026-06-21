# Changelog

## [0.1.22-beta] — 2026-06-17

### Added

- **Dashboard con estadísticas básicas y configuración del proyecto**
  Se agregó un nuevo dashboard que muestra estadísticas básicas del proyecto, junto con la configuración inicial del mismo.

- **Papelera de reciclaje**
  Implementación de una papelera de reciclaje para gestionar documentos y elementos eliminados, permitiendo su recuperación.

- **Soporte para diagramas en los documentos**
  Los documentos ahora soportan diagramas, ampliando las capacidades de edición y representación visual.

- **Mensaje al intentar salir de un documento sin guardar**
  Se agregó una advertencia al usuario cuando intenta cerrar o salir de un documento que tiene cambios sin guardar.

- **Bloqueo de documento abierto por otro usuario**
  Ahora cuando un documento está siendo editado por otro usuario, se bloquea para evitar conflictos de edición simultánea.

## [0.1.23-beta] — 2026-06-17

### Added

- **Sistema de notas no leídas por usuario**
  Cada usuario puede identificar visualmente qué notas de tareas no ha leído. Las notas sin leer muestran un punto azul pulsante en la tarea, el panel de notas y el sidebar. Al pasar el mouse sobre una nota se marca automáticamente como leída (con debounce de 2s para evitar escrituras excesivas). Las notas propias nunca aparecen como no leídas para su autor.

## [0.1.24-beta] — 2026-06-17

### Fixed

- **Render de tablas en documentos**
  Los documentos ahora soportan tablas Markdown estilo pipe (`| col1 | col2 |`). Se agregó detección y conversión a `table` HTML tanto en la vista previa (`markdown.tsx`) como en el editor por bloques (`DocView.tsx`), incluyendo un editor de código colapsable tipo mermaid y un comando `/table` en el menú de bloques.

- **Agregados nuevos tipos de contenidos en datos de ejemplo**
  Se agregaron al seed de datos de ejemplo: un nuevo documento Markdown con diagrama Mermaid y referencia a imagen (`og-image.png`), una nota de tarea con imagen adjunta (`mobile-icon.png`), y cuatro imágenes copiadas desde `public/` a la biblioteca de medios (`og-image.png`, `mobile-icon.png`, `logo-dark.svg`, `logo-light.svg`).

### Changed

- **Quitado encabezado de los diagramas y tablas**
  Se eliminaron las etiquetas "mermaid" y "tabla (X filas)" del encabezado de los bloques de diagrama y tabla en el editor. El botón de edición ahora se alinea a la derecha.

## [0.1.26-beta] — 2026-06-21

### Added

- **Persistencia de proyectos en el navegador**
  La lista de proyectos registrados ahora se guarda en `localStorage` y persiste al recargar o cerrar y volver a abrir la pestaña. Se corrigieron tres problemas: (1) `initialize()` ahora siempre relee los proyectos de `localStorage` como fallback, (2) `initializeNewProject()` ya no crea registros duplicados sino que actualiza el proyecto existente, y (3) `goToProjectBrowser()` recarga explícitamente la lista desde `localStorage` al navegar de vuelta.

### Fixed

- **Prevención de tareas duplicadas al hacer clic múltiple en "Agregar"**
  Se agregó un bloqueo de estado (`creatingTask`) que evita la creación de tareas duplicadas cuando el usuario hace clic repetidamente en el botón "Agregar" mientras se está procesando la primera solicitud. El botón se deshabilita visualmente durante la operación.

- **Arrastre continuo de bloques en el editor de documentos**
  Al arrastrar un bloque con el grip, ahora se mueve continuamente mientras se mantiene el mouse presionado, en lugar de moverse solo una vez por arrastre.

### Changed

- **Vista Kanban: columnas flexibles al ancho de pantalla**
  Las columnas del Kanban ahora tienen un ancho mínimo de 288px (`w-72`) pero se expanden automáticamente para llenar el ancho disponible de la pantalla, en lugar de tener un ancho fijo.

- **Ajustes responsive en pantallas de inicio, onboarding y autenticación**
  Se agregó padding superior e inferior (`pt-14`/`pb-14`) en móvil para que el botón de tema y el texto de versión no se solapen con el contenido. El texto de versión (`VersionBadge`) dejó de ser `fixed` y ahora fluye en el flujo normal debajo de todo.

- **Textos y márgenes reducidos en móvil para pantallas iniciales**
  En las pantallas de carga, navegador de proyectos, autenticación y onboarding se redujeron: título principal (`text-3xl → text-2xl`), logo (`h-12 → h-10`), descripción (`text-sm → text-xs`), padding de la tarjeta (`p-8 → p-5`), márgenes laterales (`px-6 → px-4`) y espaciado general de formularios. Los tamaños originales se restauran en desktop mediante breakpoints `sm:`.

### Removed

- **Funcionalidad de disco virtual**
  Se eliminó el modo de disco virtual (IndexedDB) debido a bugs persistentes y problemas de compatibilidad entre navegadores. La aplicación ahora opera exclusivamente con acceso directo al sistema de archivos local.

## [0.1.25-beta] — 2026-06-18

### Added

- **Opción "Salir sin guardar" en documento con cambios**
  Al intentar salir de un documento con cambios sin guardar, el modal ahora ofrece tres opciones: "Guardar" (guarda y sale), "Salir sin guardar" (descarta los cambios y sale) y "Cancelar" (permanece en el documento). Se agregó el campo `neutralLabel` al sistema de diálogos `confirm()` para soportar un tercer botón opcional.

- **Apartado de accesibilidad en el dashboard**
  Se agregó una sección de accesibilidad en el dashboard con controles para ajustar el tamaño general de la fuente (4 niveles: Pequeño, Normal, Grande, Extra Grande) y un interruptor para activar o desactivar el modo de alto contraste.

### Fixed

- **Auto-actualización forzada al detectar nueva versión desplegada**
  Se incrustó la versión de compilación (`__APP_VERSION__`) en el bundle JS mediante Vite `define`. Al cargar la app, se compara esta versión compilada contra `version.txt` del servidor. Si hay diferencia, se eliminan todos los cachés del Service Worker, se desregistra el SW y se recarga la página con un parámetro `?v=...` que evita la caché HTTP del navegador. Todo esto ocurre automáticamente 3 segundos después de detectar la nueva versión, sin intervención del usuario y sin perder los proyectos, sesiones ni auth almacenados en `localStorage`.

### Changed

- **Orden inverso y auto-scroll en notas y actividad de tareas**
  Se invirtió el orden de visualización de notas y registros de actividad para que los más recientes aparezcan al final (orden tradicional). El scroll del contenedor se posiciona automáticamente al fondo al abrir una tarea o cambiar de pestaña, mostrando el último registro. Se usó `scrollIntoView` con doble `requestAnimationFrame` y `setTimeout` de respaldo para capturar contenido asíncrono como imágenes.

### Removed