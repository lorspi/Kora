/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Script para generar un paquete distribuible de Kora.
 *
 * Uso: npm run release
 *
 * Genera una carpeta `release/` con todo lo necesario para ejecutar
 * Kora como servidor local sin necesidad de Node.js.
 * - Windows: usa un servidor HTTP embebido en PowerShell.
 * - Linux/macOS: usa python3 -m http.server.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');
const VERSION = fs.readFileSync(path.join(ROOT, 'public', 'version.txt'), 'utf-8').trim();

console.log(`\n🔨 Construyendo Kora v${VERSION} para distribución...\n`);

// 1. Build frontend
console.log('1/3 Compilando frontend...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

// 2. Create release folder
console.log('\n2/3 Creando paquete de distribución...');
if (fs.existsSync(RELEASE)) {
  fs.rmSync(RELEASE, { recursive: true });
}
fs.mkdirSync(RELEASE, { recursive: true });

// Copy dist (frontend build output)
fs.cpSync(path.join(ROOT, 'dist'), path.join(RELEASE, 'dist'), { recursive: true });

// Copy startup scripts from servidor-local/
fs.copyFileSync(
  path.join(ROOT, 'servidor-local', 'iniciar-servidor.bat'),
  path.join(RELEASE, 'iniciar-servidor.bat')
);
fs.copyFileSync(
  path.join(ROOT, 'servidor-local', 'iniciar-servidor.sh'),
  path.join(RELEASE, 'iniciar-servidor.sh')
);

// 3. Create LEEME.txt
console.log('\n3/3 Generando LEEME.txt...');
fs.writeFileSync(path.join(RELEASE, 'LEEME.txt'), `KORA - Gestión de Proyectos Offline
====================================
Versión: ${VERSION}

REQUISITOS:
- Windows: Ninguno (usa PowerShell, incluido en Windows 7+).
- Linux/macOS: Python 3 (preinstalado en la mayoría de distribuciones).

NO se necesita Node.js para ejecutar el servidor local.

INSTRUCCIONES:
====================================

## Windows

1. Extrae todo el contenido del zip en una carpeta.
2. Haz doble clic en "iniciar-servidor.bat".
3. Se abrirá automáticamente el navegador en http://localhost:8000.

Para detener el servidor, cierra la ventana de la terminal.

## Linux / macOS

1. Extrae todo el contenido del zip en una carpeta.
2. Abre una terminal y navega hasta esa carpeta:
       cd ruta/de/la/carpeta
3. Dale permisos de ejecución al script:
       chmod +x iniciar-servidor.sh
4. Ejecuta el script:
       ./iniciar-servidor.sh
5. Se abrirá automáticamente el navegador en http://localhost:8000.

Para detener el servidor, presiona Ctrl+C en la terminal.

ACCESO:
====================================
- Desde este computador: http://localhost:8000
- Desde otros dispositivos en la misma red: http://<IP-DE-ESTE-PC>:8000

ACTUALIZACIONES:
====================================
Cuando abras Kora, la aplicación revisará si hay una versión más
reciente disponible. Si la hay, verás un aviso en la sección
"Acerca de" con un enlace para descargar la nueva versión.

SOLUCIÓN DE PROBLEMAS:
====================================
| Problema                          | Solución                                         |
|-----------------------------------|--------------------------------------------------|
| "No se encuentra 'dist'"         | Verifica que extrajiste el zip completo.         |
| "No se encontró Python" (Linux)  | Instala Python 3 con tu gestor de paquetes.      |
| "Permiso denegado" (Linux/macOS) | Ejecuta: chmod +x iniciar-servidor.sh            |
| localhost:8000 no carga           | Verifica que no haya otro programa en puerto 8000.|

NOTAS:
====================================
- Todos tus datos se almacenan localmente en el navegador (IndexedDB).
- No se envía información a servidores externos.
- Mantén la ventana de la terminal abierta mientras uses Kora.

Más información: https://github.com/lorspi/Kora
`);

// Done
console.log(`\n✅ Paquete generado en: ${RELEASE}`);
console.log('\nContenido:');
const files = fs.readdirSync(RELEASE);
files.forEach(f => {
  const stat = fs.statSync(path.join(RELEASE, f));
  console.log(`  ${stat.isDirectory() ? '📁' : '📄'} ${f}`);
});
console.log(`\nPara usar: extrae el contenido y ejecuta "iniciar-servidor.bat" (Windows) o "./iniciar-servidor.sh" (Linux/macOS).`);
