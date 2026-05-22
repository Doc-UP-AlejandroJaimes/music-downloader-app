<p align="center">
  <img src="assets/icon.png" width="100" alt="AppMusic" />
</p>

# AppMusic — YouTube Music Downloader

Aplicación de escritorio Windows para descargar música de YouTube en MP3.

## Stack
- Electron 28 + Node.js
- yt-dlp (auto-descargado en primer arranque)
- ffmpeg-static
- electron-builder (NSIS .exe)

## Releases

| Versión | Fecha | Novedades |
|---------|-------|-----------|
| [v1.1.0](https://github.com/Doc-UP-AlejandroJaimes/music-downloader-app/releases/tag/v1.1.0) | 2026-05-22 | Eliminar canciones, búsqueda en tiempo real (Copiar/Historial), detección de bitrate de fuente, copia en vez de mover |
| [v1.0.0](https://github.com/Doc-UP-AlejandroJaimes/music-downloader-app/releases/tag/v1.0.0) | 2026-05-20 | Primera versión estable: descarga MP3, vista previa, copiar canciones, historial |

## Requisitos previos
- Node.js ≥ 18
- npm ≥ 9
- Conexión a internet (yt-dlp se descarga automáticamente la primera vez)

## Instalación y desarrollo

```bash
npm install
npm start
```

> Al abrir por primera vez, la app descarga automáticamente `yt-dlp.exe` desde GitHub.
> Este binario se guarda en `%APPDATA%\AppMusic\` y se reutiliza en arranques posteriores.

## Generar instalador .exe

```bash
npm run build
# El instalador queda en dist/AppMusic Setup x.x.x.exe
```

## Estructura

```
AppMusic/
├── main.js              ← Proceso principal (IPC, yt-dlp, fs)
├── preload.js           ← contextBridge (API segura al renderer)
├── package.json
├── electron-builder.yml
├── assets/
│   └── icon.ico
└── renderer/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Carpeta de descargas

Todas las canciones se guardan en:
```
C:\Users\<usuario>\Downloads\AppMusic\
```

## Canales IPC

| Canal | Dirección | Descripción |
|---|---|---|
| `yt:getInfo` | renderer → main | Obtiene título, miniatura, duración y bitrate de fuente |
| `yt:download` | renderer → main | Inicia descarga MP3 |
| `yt:progress` | main → renderer | Progreso en tiempo real |
| `files:list` | renderer → main | Lista archivos en AppMusic/ |
| `files:move` | renderer → main | Copia archivos seleccionados |
| `files:delete` | renderer → main | Elimina archivos seleccionados |
| `dialog:openFolder` | renderer → main | Abre diálogo de carpeta |
| `history:get` | renderer → main | Obtiene historial |
| `history:clear` | renderer → main | Limpia historial |
| `app:ytdlp-status` | main → renderer | Estado de bootstrap de yt-dlp |
