# Kora para Claude (servidor MCP)

Conecta un proyecto de Kora con Claude para que, desde una conversación, Claude pueda:

- **Crear y gestionar tickets**: crear tareas (también varias a la vez), cambiar estado, lista, prioridad, fecha, esfuerzo, asignados, etiquetas y dependencias, gestionar subtareas, comentar y mandar tareas a la papelera.
- **Consultar el proyecto para desarrollar**: leer un ticket con su descripción, subtareas, dependencias y actividad, buscar en tareas y documentos, y leer, crear o editar documentos Markdown.

Funciona con proyectos en **carpeta local** y en la **nube (Firebase)**. Lee y escribe los mismos archivos que la app, así que los cambios aparecen en Kora solos (en unos segundos en carpeta local y al instante en la nube) y quedan en la actividad de cada tarea, igual que si los hubiera hecho una persona.

## Instalación

Requiere Node.js 20 o superior.

```bash
cd mcp
npm install
```

## Configuración

El servidor se configura con variables de entorno:

| Variable | Para qué sirve |
| --- | --- |
| `KORA_PROJECT_DIR` | Ruta de la carpeta del proyecto (la que eliges en Kora al abrirlo). |
| `KORA_FIREBASE_CONFIG` | Para proyectos en la nube, en lugar de la anterior: la configuración de Firebase como JSON, o la ruta a un archivo `.json` con ella. Es el mismo objeto que pegaste en Kora al vincular el proyecto. |
| `KORA_FIREBASE_SPACE` | Espacio dentro del proyecto de Firebase (por defecto `default`). |
| `KORA_USER` | Usuario de Kora al que se atribuyen los cambios. Si no se indica, se usa el primer administrador del proyecto. |

### Claude Code

Regístralo para tu usuario, así está disponible desde cualquier repositorio en el que estés desarrollando:

```bash
claude mcp add kora --scope user \
  -e KORA_PROJECT_DIR="/ruta/a/mi-proyecto-kora" \
  -e KORA_USER="mi-usuario" \
  -- npx --prefix /ruta/a/Kora/mcp tsx /ruta/a/Kora/mcp/src/index.ts
```

### Claude Desktop

En *Configuración → Desarrollador → Editar configuración* (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kora": {
      "command": "npx",
      "args": ["--prefix", "/ruta/a/Kora/mcp", "tsx", "/ruta/a/Kora/mcp/src/index.ts"],
      "env": {
        "KORA_PROJECT_DIR": "/ruta/a/mi-proyecto-kora",
        "KORA_USER": "mi-usuario"
      }
    }
  }
}
```

Para un proyecto en la nube, cambia `KORA_PROJECT_DIR` por `"KORA_FIREBASE_CONFIG": "/ruta/a/firebase-config.json"`. Si tienes varios proyectos, registra un servidor por proyecto con nombres distintos (`kora-web`, `kora-app`, …).

## Herramientas

| Herramienta | Qué hace |
| --- | --- |
| `kora_get_project` | Listas y sus estados, equipo y documentos. |
| `kora_list_tasks` | Tareas con filtros (lista, estado, persona, prioridad, etiqueta, texto). |
| `kora_get_task` | Ticket completo: descripción, subtareas, dependencias y actividad. |
| `kora_create_tasks` | Crea una o varias tareas. |
| `kora_update_task` | Cambia campos de una tarea. |
| `kora_update_subtasks` | Añade, completa, reabre o elimina subtareas. |
| `kora_add_comment` | Comenta en la actividad de una tarea. |
| `kora_delete_task` | Mueve una tarea a la papelera. |
| `kora_create_list` | Crea una lista con los estados por defecto. |
| `kora_search` | Busca en tareas y documentos. |
| `kora_list_docs` / `kora_read_doc` | Lista y lee documentos. |
| `kora_create_doc` / `kora_update_doc` | Crea o edita documentos. |

También incluye el prompt **`desarrollar_ticket`** (en Claude Code: `/mcp__kora__desarrollar_ticket TSK-012`), que carga el ticket con su contexto, propone un plan y mantiene Kora al día mientras se desarrolla: lo pasa a *En Desarrollo*, marca subtareas y, al terminar, comenta lo hecho y lo mueve a *Revisión*.

## Ejemplos de uso

- «Crea en Kora un ticket en Desarrollo para el endpoint de login, prioridad alta, asignado a Ana, con subtareas para la ruta y los tests.»
- «Divide esta especificación en tickets de Kora con sus dependencias.»
- «¿Qué tengo pendiente en Kora esta semana?»
- «Desarrolla el TSK-012: lee el ticket y la documentación relacionada y empieza.»

## Cómo convive con la app

- No modifica una tarea ni un documento que alguien tenga abierto en Kora: avisa a Claude para que lo intente después.
- Los códigos `TSK-###` continúan la numeración del proyecto, sin reutilizar los de tareas borradas.
- Eliminar una tarea la manda a la papelera, desde donde se puede restaurar.
- Solo funciona con clientes que ejecutan el servidor en tu equipo (Claude Code y Claude Desktop). Para usarlo desde claude.ai en la web o el móvil haría falta publicarlo como servidor MCP remoto.
