#!/bin/bash

# ============================================================
#  Kora - Servidor Local (Linux / macOS)
# ============================================================

# Ir al directorio donde está este script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || { echo "ERROR: No se pudo acceder al directorio del script."; exit 1; }

# UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Título de la terminal
printf "\033]0;Kora - Servidor Local\007"

echo ""
echo "██ ▄█▀  ▄▄▄  ▄▄▄▄   ▄▄▄  "
echo "████   ██▀██ ██▄█▄ ██▀██ "
echo "██ ▀█▄ ▀███▀ ██ ██ ██▀██"
echo ""

# Colores ANSI
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED_BG='\033[41m'
BOLD='\033[1m'
NC='\033[0m'

printf "${GREEN}  [OK] Servidor iniciado correctamente${NC}\n"
echo ""
printf "${CYAN}  >>  Abriendo http://localhost:8000 ...${NC}\n"
echo ""
printf "${YELLOW}${RED_BG}${BOLD}  [!] NO CIERRES ESTA VENTANA${NC}\n"
printf "${YELLOW}      El servidor se detendra si la cierras.${NC}\n"
echo ""

sleep 0.5

# Abrir navegador
case "$(uname -s)" in
    Darwin*)
        open "http://localhost:8000"
        ;;
    Linux*)
        if command -v xdg-open &>/dev/null; then
            xdg-open "http://localhost:8000" >/dev/null 2>&1
        elif command -v sensible-browser &>/dev/null; then
            sensible-browser "http://localhost:8000" >/dev/null 2>&1
        else
            echo "  [!] No se pudo abrir el navegador."
            echo "      Abre http://localhost:8000 manualmente."
        fi
        ;;
    *)
        echo "  [!] No se pudo abrir el navegador."
        echo "      Abre http://localhost:8000 manualmente."
        ;;
esac

# Verificar que existe el directorio dist
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo ""
    echo "ERROR: No se encuentra el directorio 'dist'."
    echo "Ejecuta primero el build del proyecto."
    echo ""
    read -p "Presiona Enter para salir..."
    exit 1
fi

cd "$SCRIPT_DIR/dist" || exit 1

# Buscar python3 o python
PYTHON=""
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
fi

if [ -z "$PYTHON" ]; then
    echo ""
    echo "ERROR: No se encontró Python (python3 o python)."
    echo "Instálalo con tu gestor de paquetes:"
    echo "  Linux (Debian/Ubuntu):  sudo apt install python3"
    echo "  Linux (Fedora):         sudo dnf install python3"
    echo "  macOS:                  brew install python3"
    echo ""
    read -p "Presiona Enter para salir..."
    exit 1
fi

echo ""
echo "  Sirviendo archivos desde: $(pwd)"
echo "  Presiona Ctrl+C para detener el servidor."
echo ""

$PYTHON -m http.server 8000
