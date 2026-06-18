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
