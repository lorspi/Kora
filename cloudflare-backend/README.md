# Backend de Kora para Cloudflare

Backend opcional para que un proyecto de [Kora](https://github.com/lorspi/Kora) viva en la nube y se sincronice en tiempo real con todo el equipo. Se despliega en **tu propia cuenta de Cloudflare** (el plan gratuito basta): tus datos no pasan por ningún servidor de Kora.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lorspi/Kora/tree/main/cloudflare-backend)

## Instalación con un clic

1. Pulsa el botón **Deploy to Cloudflare** de arriba e inicia sesión en Cloudflare (o crea una cuenta gratuita). Cloudflare te pedirá conectar GitHub o GitLab para guardar una copia de este código en tu cuenta.
2. En **ADMIN_TOKEN** reemplaza el texto de ejemplo por una contraseña tuya de al menos 12 caracteres. Guárdala: es la llave de administración del backend.
3. Pulsa **Crear y desplegar**. Al terminar verás la dirección del Worker, por ejemplo `https://kora-backend.tu-cuenta.workers.dev`. Si la abres en el navegador debe responder `"ready": true`.
4. En Kora, **Nuevo proyecto → Nube con Cloudflare → Crear mi backend**: pega la dirección y la contraseña.

## Invitar al equipo

En el inicio del proyecto, la tarjeta **Acceso al proyecto en la nube** (visible para quien entró con la contraseña de administración, o con una invitación de administrador) crea una invitación por persona:

- **Enlace**: abre Kora en la misma dirección que usas tú (la versión en la nube o tu `localhost`) y une al proyecto con un clic.
- **Código**: para quien use Kora en otra dirección; se pega en **Nuevo proyecto → Nube con Cloudflare → Tengo una invitación**.

Cada invitación es personal (miembro o administrador) y se puede revocar en cualquier momento: quien la tenía pierde el acceso al instante. Dentro del proyecto, cada persona entra con su usuario de Kora como siempre.

No compartas la contraseña de administración; usa invitaciones.

## Varios proyectos en un mismo backend

Un backend puede guardar varios proyectos independientes ("espacios"). En **Opciones avanzadas** del diálogo de conexión, escribe un nombre de espacio distinto para cada proyecto. Las invitaciones son de cada espacio.

## Cómo funciona

- Un **Worker** recibe las peticiones de Kora (`/api/{espacio}/...`) y las pasa al **Durable Object** del espacio.
- Cada espacio es un Durable Object con **SQLite** que guarda los archivos del proyecto (los mismos JSON y Markdown que en una carpeta local), los registros de la edición colaborativa y las invitaciones (como hash).
- El tiempo real va por **WebSocket** (con hibernación, así que no consume mientras nadie escribe).
- Para ahorrar peticiones, Kora relee el proyecto con una sola petición (`/snapshot`) y cada aviso de cambio dice qué archivos cambiaron, así cada cliente relee solo lo afectado. Mientras la conexión en tiempo real está abierta no hay sondeos periódicos.
- Autenticación: `Authorization: Bearer <token>` con la contraseña de administración o un token de invitación. El token del WebSocket viaja en el primer mensaje, no en la dirección.

Límites del plan gratuito de Cloudflare relevantes: 100 000 peticiones al día y 5 GB de almacenamiento; cada archivo (incluidas imágenes adjuntas) puede pesar hasta unos 5 MB.

## Cambiar la contraseña de administración

Cloudflare → **Workers y Pages → kora-backend → Configuración → Variables y secretos** → edita `ADMIN_TOKEN`. Las invitaciones existentes siguen funcionando; vuelve a conectar Kora con la nueva contraseña.

## Actualizar

Cuando Kora publique una versión nueva del backend, actualiza tu copia del repositorio (por ejemplo con "Sync fork" en GitHub). Cloudflare la vuelve a desplegar sola. Si tu backend queda desactualizado, Kora te lo avisará al conectar.

## Desarrollo local

```bash
cd cloudflare-backend
npm install
echo "ADMIN_TOKEN=una-contrasena-local-larga" > .dev.vars
npm run dev      # http://127.0.0.1:8787
npm run check    # comprobación de tipos
```

Despliegue manual (sin el botón): `npx wrangler login` y luego `npm run deploy`; define el secreto con `npx wrangler secret put ADMIN_TOKEN`.
