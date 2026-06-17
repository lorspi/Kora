# Compilar Kora para Linux (AppImage Portable)

Esta guía explica cómo generar un ejecutable **AppImage** portable de Kora para Linux x86_64. El AppImage es un formato que corre en **cualquier distribución de Linux** sin necesidad de instalación — solo descargas, le das permisos de ejecución y corres.

---

## 📋 Requisitos

- El proyecto en un repositorio de **GitHub**
- Node.js 22+
- Rust (rustup)
- Dependencias del sistema para Tauri v2 (GTK, WebKit, etc.)

---

## 🚀 Método 1: GitHub Actions (recomendado)

Es la forma más simple y confiable. Cada vez que hagas push a la rama `tauri`, GitHub compila el AppImage automáticamente.

### Ya tienes el workflow configurado

El archivo `.github/workflows/build-linux.yml` ya está creado en el proyecto. Solo necesitas:

**1. Subir el workflow a GitHub:**
```bash
git add .github/workflows/build-linux.yml
git commit -m "feat: add Linux portable build workflow"
git push origin tauri
```

**2. Ir a la pestaña Actions** de tu repositorio en GitHub.

**3. Verás el workflow** `Build Linux Portable AppImage` ejecutándose automáticamente (o puedes ejecutarlo manualmente desde la UI de GitHub Actions con el botón **"Run workflow"**).

**4. Descargar el artifact.** Cuando termine (5-10 min aprox.), verás dos artifacts descargables:
- `Kora-Linux-x86_64-AppImage` → **El ejecutable portable** (`.AppImage`)
- `Kora-Linux-x86_64-deb` → Paquete `.deb` (para Debian/Ubuntu)

### Uso del AppImage

Una vez descargado:

```bash
# Dar permisos de ejecución
chmod +x Kora_*.AppImage

# Ejecutar
./Kora_*.AppImage
```

> **Nota:** Si tu sistema no tiene FUSE instalado, puedes extraer el AppImage en vez de ejecutarlo directamente:
> ```bash
> ./Kora_*.AppImage --appimage-extract
> cd squashfs-root
> ./AppRun
> ```

---

## 🛠️ Método 2: Compilar localmente en Linux (WSL / Máquina real)

Si tienes acceso directo a un entorno Linux (nativo, WSL, o VM), puedes compilar localmente.

### Paso 1: Instalar dependencias

```bash
# Actualizar paquetes
sudo apt-get update

# Dependencias de Tauri v2
sudo apt-get install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  build-essential \
  pkg-config \
  curl \
  wget

# Node.js 22 (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

# Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

### Paso 2: Clonar y compilar

```bash
# Clonar el repositorio
git clone <URL-DE-TU-REPO> kora
cd kora

# Instalar dependencias npm
npm install

# Instalar Tauri CLI
npm install -D @tauri-apps/cli

# Compilar para Linux (genera AppImage + .deb)
npx tauri build --bundles appimage
```

### Paso 3: Encontrar el ejecutable

Después de la compilación, los archivos están en:

```
src-tauri/target/release/bundle/appimage/  → Kora_*.AppImage
src-tauri/target/release/bundle/deb/       → kora_*.deb
```

---

## 📦 ¿Qué es un AppImage?

- ✅ **Portable:** Corre en cualquier Linux (Ubuntu, Fedora, Arch, Debian, etc.)
- ✅ **Sin instalación:** Solo descargas y ejecutas
- ✅ **Auto-contenido:** Incluye todas las librerías necesarias
- ✅ **Aislado:** No modifica el sistema

---

## ❓ Solución de problemas comunes

| Problema | Solución |
|----------|----------|
| **El workflow falla al instalar dependencias npm** | Verifica que `package.json` y `package-lock.json` estén en el repositorio |
| **El AppImage no se ejecuta** | Prueba con `./Kora_*.AppImage --appimage-extract && cd squashfs-root && ./AppRun` |
| **Error: `libfuse.so.2 not found`** | Instala FUSE: `sudo apt-get install libfuse2` (o extrae el AppImage) |
| **Build muy lento en GitHub Actions (~30 min)** | El primer build compila todas las dependencias Rust; builds subsecuentes usan cache y son mucho más rápidos (~5 min) |
| **WSL no arranca** | Asegúrate de haber completado el primer inicio interactivo (crear usuario/contraseña). Si se queda colgado, reinicia desde PowerShell: `wsl --shutdown` y luego `wsl -d Ubuntu` |

---

## 🔧 Personalización del workflow

El archivo `.github/workflows/build-linux.yml` está configurado para:

- **Dispararse** en pushes a la rama `tauri`
- **Ejecutarse manualmente** desde la UI de GitHub Actions (`workflow_dispatch`)
- **Compilar solo AppImage** (portable)
- **Subir también .deb** como bonus

Si quieres cambiar algo, edita el archivo `.github/workflows/build-linux.yml`:

```yaml
# Para compilar también .deb y .rpm:
run: npx tauri build --bundles appimage,deb,rpm

# Para cambiar la rama que dispara el build:
on:
  push:
    branches: [main, develop]
```

---

## 📚 Referencias

- [Tauri v2 Documentation - Building](https://v2.tauri.app/distribute/)
- [AppImage Documentation](https://docs.appimage.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
