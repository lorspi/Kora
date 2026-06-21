Este es un script que despliega un servidor local con Kora a partir de los archivos de la compilación en una carpeta dist/

# Ejecutar en Windows

### 1. Extrae todo el contenido del zip en una carpeta vacía

### 2. Abre el archivo: iniciar-servidor.bat

### 3. ¡Listo!

El script:

1. Abre automáticamente el navegador en `http://localhost:8000`.
2. Inicia un servidor HTTP que sirve los archivos desde la carpeta `dist/`.

Para **detener** el servidor, cierra la ventana de la terminal.

# Ejecutar en Linux o MacOS

### 1. Extrae todo el contenido del zip en una carpeta vacía

### 2. En una terminal navega hasta la carpeta del proyecto

```bash
cd ruta/del/proyecto/Kora
```

Por ejemplo, si el proyecto está en tu escritorio:

```bash
cd ~/Escritorio/Kora
```
### 3. Ejecuta el script

```bash
./iniciar-servidor.sh
```

Si te aparece un error de permisos, hazlo ejecutable primero:

```bash
chmod +x iniciar-servidor.sh
./iniciar-servidor.sh
```

### 4. ¡Listo!

El script:

1. Abre automáticamente el navegador en `http://localhost:8000`.
2. Inicia un servidor HTTP que sirve los archivos desde la carpeta `dist/`.

Para **detener** el servidor, presiona `Ctrl + C` en la terminal.



## ❓ Solución de problemas

| Error | Solución |
|-------|----------|
| `No se encuentra el directorio 'dist'` | Asegurate de haber extraído el zip completo en la carpeta. |
| `No se encontró Python` | Instala Python 3 con el comando de tu sistema (ver sección de arriba). |
| `Permiso denegado` al ejecutar el script | Ejecuta `chmod +x iniciar-servidor.sh` para darle permisos de ejecución. |
| `localhost:8000 no carga` | Verifica que el script se esté ejecutando sin errores y que ningún otro programa esté usando el puerto 8000. |

---

## 💡 Consejos

- **Deja la terminal abierta** mientras uses Kora. Si la cierras, el servidor se detiene.
