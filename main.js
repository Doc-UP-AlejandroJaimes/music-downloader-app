const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn }  = require('child_process');
const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOWNLOAD_DIR  = path.join(os.homedir(), 'Downloads', 'AppMusic');
const YTDLP_URL     = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const PROGRESS_RE   = /\[download\]\s+([\d.]+)%\s+of\s+([\S]+)\s+at\s+([\S]+)\s+ETA\s+([\S]+)/;

let mainWindow;
let ytDlpPath    = '';
let ffmpegBinPath = '';
let historyFilePath = '';
let isDownloading = false;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0A0A0A',
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

// ---------------------------------------------------------------------------
// yt-dlp download helper (follows redirects)
// ---------------------------------------------------------------------------

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl) => {
      const lib = currentUrl.startsWith('https') ? https : http;
      const req = lib.get(currentUrl, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          attempt(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} descargando ${currentUrl}`));
          return;
        }
        const tmp = destPath + '.tmp';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmp, destPath);
            resolve();
          });
        });
        out.on('error', reject);
      });
      req.on('error', reject);
    };
    attempt(url);
  });
}

// ---------------------------------------------------------------------------
// yt-dlp bootstrap
// ---------------------------------------------------------------------------

async function ensureYtDlp() {
  const binDir = app.getPath('userData');
  ytDlpPath = path.join(binDir, 'yt-dlp.exe');

  if (!fs.existsSync(ytDlpPath)) {
    mainWindow.webContents.send('app:ytdlp-status', { downloading: true });
    try {
      await downloadFile(YTDLP_URL, ytDlpPath);
    } catch (err) {
      mainWindow.webContents.send('app:ytdlp-status', {
        downloading: false,
        error: 'Error descargando yt-dlp: ' + err.message,
      });
      return;
    }
  }

  // Ensure the binary is executable (needed on WSL / Linux)
  if (process.platform !== 'win32') {
    try { fs.chmodSync(ytDlpPath, 0o755); } catch { /* ignore */ }
  }

  mainWindow.webContents.send('app:ytdlp-status', { downloading: false, ready: true });
}

// ---------------------------------------------------------------------------
// yt-dlp runner
// ---------------------------------------------------------------------------

function spawnYtDlp(args, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) text.split('\n').forEach((line) => onLine(line.trim()));
    });

    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp salió con código ${code}`));
    });
  });
}

function parseYtDlpJson(stdout) {
  const lines = stdout.trim().split('\n').filter((l) => l.trim().startsWith('{'));
  if (!lines.length) throw new Error('No se pudo parsear la respuesta de yt-dlp.');
  return JSON.parse(lines[lines.length - 1]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 180) || 'audio';
}

function readHistory() {
  if (!fs.existsSync(historyFilePath)) return [];
  try { return JSON.parse(fs.readFileSync(historyFilePath, 'utf8')); }
  catch { return []; }
}

function writeHistory(entries) {
  fs.writeFileSync(historyFilePath, JSON.stringify(entries, null, 2), 'utf8');
}

function appendHistory(entry) {
  const entries = readHistory();
  entries.unshift(entry);
  writeHistory(entries.slice(0, 500));
}

// ---------------------------------------------------------------------------
// IPC – Window controls
// ---------------------------------------------------------------------------

ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:maximize', () =>
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
);
ipcMain.on('window:close', () => mainWindow.close());

// ---------------------------------------------------------------------------
// IPC – App
// ---------------------------------------------------------------------------

ipcMain.handle('app:getDownloadDir', () => DOWNLOAD_DIR);

// ---------------------------------------------------------------------------
// IPC – yt:getInfo
// ---------------------------------------------------------------------------

ipcMain.handle('yt:getInfo', async (_event, url) => {
  if (!ytDlpPath) throw new Error('yt-dlp no está listo todavía.');

  const args = [url, '--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificates'];
  const stdout = await spawnYtDlp(args);
  const info = parseYtDlpJson(stdout);

  // Find max audio bitrate from available formats
  let maxAudioBitrate = 0;
  if (Array.isArray(info.formats)) {
    for (const fmt of info.formats) {
      const hasAudio = fmt.acodec && fmt.acodec !== 'none';
      const abr = fmt.abr || 0;
      if (hasAudio && abr > maxAudioBitrate) maxAudioBitrate = abr;
    }
  }

  return {
    title:           info.title           || 'Sin título',
    thumbnail:       info.thumbnail       || '',
    duration:        info.duration_string || '',
    uploader:        info.uploader        || '',
    maxAudioBitrate: Math.round(maxAudioBitrate),
  };
});

// ---------------------------------------------------------------------------
// IPC – yt:download
// ---------------------------------------------------------------------------

ipcMain.handle('yt:download', async (event, { url, quality }) => {
  if (!ytDlpPath) throw new Error('yt-dlp no está listo todavía.');
  if (isDownloading) throw new Error('Ya hay una descarga en curso.');

  isDownloading = true;

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  // Fetch title first for clean filename + history
  let title = 'audio';
  try {
    const infoArgs = [url, '--dump-json', '--no-playlist', '--no-warnings', '--no-check-certificates'];
    const infoOut = await spawnYtDlp(infoArgs);
    const infoJson = parseYtDlpJson(infoOut);
    title = infoJson.title || 'audio';
  } catch { /* proceed with default */ }

  const safeTitle = sanitizeFilename(title);
  const outputTemplate = path.join(DOWNLOAD_DIR, `${safeTitle}.%(ext)s`);
  const finalPath = path.join(DOWNLOAD_DIR, `${safeTitle}.mp3`);
  const qualityFlag = quality === '320' ? '320K' : '128K';

  const args = [
    url,
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', qualityFlag,
    '--ffmpeg-location', ffmpegBinPath,
    '--output', outputTemplate,
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--newline',
  ];

  const send = (data) => mainWindow.webContents.send('yt:progress', data);

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, args, { windowsHide: true });
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      chunk.toString().split('\n').forEach((line) => {
        const m = PROGRESS_RE.exec(line);
        if (m) {
          send({ percent: parseFloat(m[1]), totalSize: m[2], speed: m[3], eta: m[4], phase: 'download' });
        } else if (line.includes('[ffmpeg]') || line.includes('Merging formats') || line.includes('Converting')) {
          send({ percent: 100, phase: 'converting' });
        }
      });
    });

    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => { isDownloading = false; reject(err); });

    proc.on('close', (code) => {
      isDownloading = false;

      if (code !== 0) {
        return reject(new Error(stderr.trim() || `yt-dlp salió con código ${code}`));
      }

      appendHistory({
        id: Date.now().toString(),
        title,
        url,
        quality,
        date: new Date().toISOString(),
        filePath: finalPath,
      });

      send({ percent: 100, phase: 'done' });
      resolve({ title, filePath: finalPath });
    });
  });
});

// ---------------------------------------------------------------------------
// IPC – files:list
// ---------------------------------------------------------------------------

ipcMain.handle('files:list', () => {
  if (!fs.existsSync(DOWNLOAD_DIR)) return [];
  return fs.readdirSync(DOWNLOAD_DIR)
    .filter((f) => f.toLowerCase().endsWith('.mp3'))
    .map((f) => {
      const fp = path.join(DOWNLOAD_DIR, f);
      let size = 0;
      try { size = fs.statSync(fp).size; } catch { /* ignore */ }
      return { name: f, path: fp, size };
    });
});

// ---------------------------------------------------------------------------
// IPC – files:move
// ---------------------------------------------------------------------------

ipcMain.handle('files:move', async (_event, { files, destination }) => {
  const results = [];
  for (const filePath of files) {
    const filename = path.basename(filePath);
    const dest = path.join(destination, filename);
    try {
      fs.renameSync(filePath, dest);
      results.push({ file: filename, success: true });
    } catch {
      try {
        fs.copyFileSync(filePath, dest);
        fs.unlinkSync(filePath);
        results.push({ file: filename, success: true });
      } catch (err) {
        results.push({ file: filename, success: false, error: err.message });
      }
    }
  }
  return results;
});

// ---------------------------------------------------------------------------
// IPC – dialog:openFolder
// ---------------------------------------------------------------------------

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta de destino',
  });
  return result.canceled ? null : result.filePaths[0];
});

// ---------------------------------------------------------------------------
// IPC – history
// ---------------------------------------------------------------------------

ipcMain.handle('history:get', () => {
  const entries = readHistory();
  return entries.map((e) => ({ ...e, fileExists: fs.existsSync(e.filePath) }));
});

ipcMain.handle('history:clear', () => writeHistory([]));

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  historyFilePath = path.join(app.getPath('userData'), 'history.json');

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  // Resolve ffmpeg binary path
  if (app.isPackaged) {
    ffmpegBinPath = path.join(process.resourcesPath, 'bin', 'ffmpeg.exe');
  } else {
    try {
      ffmpegBinPath = require('ffmpeg-static');
    } catch {
      ffmpegBinPath = 'ffmpeg'; // fallback to system ffmpeg
    }
  }

  createWindow();

  // Wait for page to load before sending IPC messages
  mainWindow.webContents.once('did-finish-load', () => {
    ensureYtDlp().catch((err) => {
      mainWindow.webContents.send('app:ytdlp-status', { error: err.message });
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
