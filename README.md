# AppMusic — YouTube Music Downloader

Aplicación de escritorio Windows para descargar música de YouTube en MP3.

## Stack
- Electron 28 + Node.js
- yt-dlp (auto-descargado en primer arranque)
- ffmpeg-static
- electron-builder (NSIS .exe)

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
# Antes del build, agrega un ícono real en assets/icon.ico (256×256 ICO)
npm run build
# El instalador queda en dist/AppMusic Setup x.x.x.exe
```

## Ícono personalizado

Reemplaza `assets/icon.ico` con tu propio ícono ICO de 256×256 antes de compilar.
Puedes convertir un PNG con: https://convertio.co/png-ico/

## Estructura

```
AppMusic/
├── main.js              ← Proceso principal (IPC, yt-dlp, fs)
├── preload.js           ← contextBridge (API segura al renderer)
├── package.json
├── electron-builder.yml
├── assets/
│   └── icon.ico         ← Reemplazar con ícono real
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
| `yt:getInfo` | renderer → main | Obtiene título, miniatura y duración |
| `yt:download` | renderer → main | Inicia descarga MP3 |
| `yt:progress` | main → renderer | Progreso en tiempo real |
| `files:list` | renderer → main | Lista archivos en AppMusic/ |
| `files:move` | renderer → main | Mueve archivos seleccionados |
| `dialog:openFolder` | renderer → main | Abre diálogo de carpeta |
| `history:get` | renderer → main | Obtiene historial |
| `history:clear` | renderer → main | Limpia historial |
| `app:ytdlp-status` | main → renderer | Estado de bootstrap de yt-dlp |
