/* ═══════════════════════════════════════════════════════
   AppMusic – Renderer process
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── State ────────────────────────────────────────────────
let currentPreview = null;   // { title, thumbnail, duration, uploader }
let isDownloading  = false;
let downloadDir    = '';

// ── Boot ─────────────────────────────────────────────────
(async function boot() {
  try {
    downloadDir = await window.electronAPI.getDownloadDir();
    document.getElementById('destHint').textContent = `Destino: ${downloadDir}`;
  } catch (_) {}

  window.electronAPI.onYtDlpStatus((status) => {
    const overlay = document.getElementById('bootOverlay');
    const msg     = document.getElementById('bootMsg');

    if (status.error) {
      msg.textContent = status.error;
      msg.style.color = '#FF4444';
      return;
    }

    if (status.downloading) {
      msg.textContent = 'Descargando yt-dlp (primera vez)…';
      return;
    }

    if (status.ready) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .3s';
      setTimeout(() => {
        overlay.style.display = 'none';
        document.getElementById('mainLayout').style.display = 'flex';
      }, 300);
    }
  });
})();

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');

    if (target === 'move')    loadFiles();
    if (target === 'history') loadHistory();
  });
});

// ── Window controls ───────────────────────────────────────
document.getElementById('btnMin').addEventListener('click',   () => window.electronAPI.minimize());
document.getElementById('btnMax').addEventListener('click',   () => window.electronAPI.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.electronAPI.close());

// ════════════════════════════════════════════════════════
// DOWNLOAD TAB
// ════════════════════════════════════════════════════════

const urlInput    = document.getElementById('urlInput');
const previewBtn  = document.getElementById('previewBtn');
const downloadBtn = document.getElementById('downloadBtn');
const previewCard = document.getElementById('previewCard');

// Preview
previewBtn.addEventListener('click', fetchPreview);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchPreview(); });

function updateQualityOptions(maxBitrate) {
  const note       = document.getElementById('qualityNote');
  const radio320   = document.querySelector('#qualityPill320 input');
  const radio128   = document.querySelector('#qualityPill128 input');

  if (maxBitrate > 0 && maxBitrate < 256) {
    // Source audio is below 256 kbps — 320 kbps would just upsample
    radio128.checked = true;
    radio320.checked = false;
    note.textContent = `Fuente de audio: ~${maxBitrate} kbps. Se seleccionó 128 kbps para evitar upsampling.`;
    note.style.display = 'block';
  } else if (maxBitrate >= 256) {
    radio320.checked = true;
    radio128.checked = false;
    note.textContent = `Fuente de audio: ~${maxBitrate} kbps.`;
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }
}

async function fetchPreview() {
  const url = urlInput.value.trim();
  if (!url) return showDownloadStatus('Ingresa una URL de YouTube.', 'error');

  previewBtn.disabled = true;
  previewBtn.textContent = 'Buscando…';
  hideDownloadStatus();
  previewCard.style.display = 'none';
  downloadBtn.disabled = true;
  currentPreview = null;

  try {
    const info = await window.electronAPI.getInfo(url);
    currentPreview = info;

    document.getElementById('previewThumb').src  = info.thumbnail || '';
    document.getElementById('previewTitle').textContent = info.title || 'Sin título';
    document.getElementById('previewMeta').textContent  =
      [info.uploader, info.duration].filter(Boolean).join(' · ');

    updateQualityOptions(info.maxAudioBitrate || 0);

    previewCard.style.display  = 'flex';
    downloadBtn.disabled       = false;
  } catch (err) {
    showDownloadStatus('No se pudo obtener info: ' + (err.message || err), 'error');
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = 'Vista previa';
  }
}

// Download
downloadBtn.addEventListener('click', startDownload);

async function startDownload() {
  if (isDownloading) return;
  if (!currentPreview) return showDownloadStatus('Primero haz vista previa.', 'error');

  const url     = urlInput.value.trim();
  const quality = document.querySelector('input[name="quality"]:checked').value;

  isDownloading = true;
  downloadBtn.disabled = true;
  previewBtn.disabled  = true;
  showProgress(0);
  showDownloadStatus('Iniciando descarga…', 'info');

  window.electronAPI.onProgress((data) => {
    if (data.phase === 'done') return; // handled in resolve

    if (data.phase === 'converting') {
      setProgress(100);
      showDownloadStatus('Convirtiendo a MP3…', 'info');
      return;
    }

    const pct = Math.round(data.percent || 0);
    setProgress(pct);
    let label = `${pct}%`;
    if (data.speed) label += `  ·  ${data.speed}`;
    if (data.eta)   label += `  ·  ETA ${data.eta}`;
    document.getElementById('progressLabel').textContent = label;
    showDownloadStatus(`Descargando… ${pct}%`, 'info');
  });

  try {
    const result = await window.electronAPI.download(url, quality);
    setProgress(100);
    showDownloadStatus(`✓ Descargado: "${result.title}"`, 'success');

    // Reset
    urlInput.value     = '';
    currentPreview     = null;
    previewCard.style.display = 'none';
    downloadBtn.disabled = true;
    setTimeout(() => hideProgress(), 2000);
  } catch (err) {
    showDownloadStatus('Error: ' + (err.message || err), 'error');
    hideProgress();
  } finally {
    isDownloading       = false;
    downloadBtn.disabled = false;
    previewBtn.disabled  = false;
  }
}

// Progress helpers
function showProgress(pct) {
  document.getElementById('progressWrap').style.display = 'block';
  setProgress(pct);
}
function hideProgress() {
  document.getElementById('progressWrap').style.display = 'none';
  setProgress(0);
}
function setProgress(pct) {
  document.getElementById('progressFill').style.width = `${Math.min(pct, 100)}%`;
  document.getElementById('progressLabel').textContent = `${pct}%`;
}

// Status helpers
function showDownloadStatus(msg, type) {
  const el = document.getElementById('downloadStatus');
  el.textContent = msg;
  el.className = `status-msg show ${type}`;
}
function hideDownloadStatus() {
  const el = document.getElementById('downloadStatus');
  el.className = 'status-msg';
  el.textContent = '';
}

// ════════════════════════════════════════════════════════
// MOVE TAB
// ════════════════════════════════════════════════════════

document.getElementById('refreshFilesBtn').addEventListener('click', loadFiles);
document.getElementById('selectAllBtn').addEventListener('click', toggleSelectAll);
document.getElementById('moveBtn').addEventListener('click', moveSelected);
document.getElementById('deleteBtn').addEventListener('click', deleteSelected);
document.getElementById('searchFilesInput').addEventListener('input', renderFiles);

let allFiles = [];
let allSelected = false;

async function loadFiles() {
  try {
    allFiles = await window.electronAPI.listFiles();
    renderFiles();
  } catch (err) {
    document.getElementById('fileList').innerHTML =
      `<p class="empty-msg">Error al listar archivos: ${err.message}</p>`;
  }
}

function renderFiles() {
  const container = document.getElementById('fileList');
  const query = document.getElementById('searchFilesInput').value.trim().toLowerCase();
  const filtered = query ? allFiles.filter(f => f.name.toLowerCase().includes(query)) : allFiles;

  if (!filtered.length) {
    container.innerHTML = query
      ? '<p class="empty-msg">Sin resultados para esa búsqueda.</p>'
      : '<p class="empty-msg">No hay canciones en la carpeta AppMusic/</p>';
    updateMoveBtn();
    return;
  }

  container.innerHTML = '';
  filtered.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.path = file.path;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'file-checkbox';
    cb.addEventListener('change', () => {
      item.classList.toggle('selected', cb.checked);
      updateMoveBtn();
    });

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.classList.add('file-icon');
    icon.innerHTML = '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;

    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = formatSize(file.size);

    item.addEventListener('click', (e) => {
      if (e.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });

    item.append(cb, icon, name, size);
    container.appendChild(item);
  });

  updateMoveBtn();
}

function toggleSelectAll() {
  allSelected = !allSelected;
  document.querySelectorAll('.file-item').forEach((item) => {
    const cb = item.querySelector('.file-checkbox');
    cb.checked = allSelected;
    item.classList.toggle('selected', allSelected);
  });
  document.getElementById('selectAllBtn').textContent = allSelected ? 'Deseleccionar todo' : 'Seleccionar todo';
  updateMoveBtn();
}

function updateMoveBtn() {
  const checked = document.querySelectorAll('.file-checkbox:checked').length;
  document.getElementById('selectedCount').textContent = `${checked} seleccionada${checked !== 1 ? 's' : ''}`;
  document.getElementById('moveBtn').disabled = checked === 0;
  document.getElementById('deleteBtn').disabled = checked === 0;
}

async function moveSelected() {
  const selected = [...document.querySelectorAll('.file-item.selected')]
    .map(item => item.dataset.path);

  if (!selected.length) return;

  const destination = await window.electronAPI.openFolderDialog();
  if (!destination) return;

  const moveBtn   = document.getElementById('moveBtn');
  const moveBtnLbl = document.getElementById('moveBtnLabel');
  moveBtn.disabled  = true;
  moveBtnLbl.textContent = 'Copiando…';

  try {
    const results = await window.electronAPI.moveFiles(selected, destination);
    const failed  = results.filter(r => !r.success);

    if (failed.length === 0) {
      showMoveStatus(`✓ ${results.length} archivo${results.length !== 1 ? 's' : ''} copiado${results.length !== 1 ? 's' : ''} correctamente.`, 'success');
    } else {
      showMoveStatus(
        `${results.length - failed.length} copiado(s). ${failed.length} error(es): ${failed.map(f => f.file).join(', ')}`,
        'error',
      );
    }

    await loadFiles();
  } catch (err) {
    showMoveStatus('Error al mover: ' + err.message, 'error');
  } finally {
    moveBtn.disabled = false;
    moveBtnLbl.textContent = 'Copiar a…';
  }
}

async function deleteSelected() {
  const selected = [...document.querySelectorAll('.file-item.selected')]
    .map(item => item.dataset.path);

  if (!selected.length) return;

  const n = selected.length;
  if (!confirm(`¿Eliminar ${n} archivo${n !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return;

  const deleteBtn = document.getElementById('deleteBtn');
  deleteBtn.disabled = true;

  try {
    const results = await window.electronAPI.deleteFiles(selected);
    const failed = results.filter(r => !r.success);

    if (failed.length === 0) {
      showMoveStatus(`✓ ${results.length} archivo${results.length !== 1 ? 's' : ''} eliminado${results.length !== 1 ? 's' : ''}.`, 'success');
    } else {
      showMoveStatus(`${results.length - failed.length} eliminado(s). ${failed.length} error(es).`, 'error');
    }

    await loadFiles();
  } catch (err) {
    showMoveStatus('Error al eliminar: ' + err.message, 'error');
  } finally {
    deleteBtn.disabled = false;
  }
}

function showMoveStatus(msg, type) {
  const el = document.getElementById('moveStatus');
  el.textContent = msg;
  el.className = `status-msg show ${type}`;
  setTimeout(() => { el.className = 'status-msg'; }, 5000);
}

// ════════════════════════════════════════════════════════
// HISTORY TAB
// ════════════════════════════════════════════════════════

document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if (!confirm('¿Limpiar todo el historial?')) return;
  await window.electronAPI.clearHistory();
  await loadHistory();
});
document.getElementById('searchHistoryInput').addEventListener('input', () => renderHistory(allHistory));

let allHistory = [];

async function loadHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<p class="empty-msg">Cargando…</p>';

  try {
    allHistory = await window.electronAPI.getHistory();
    renderHistory(allHistory);
  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

function renderHistory(entries) {
  const container = document.getElementById('historyList');
  const query = document.getElementById('searchHistoryInput').value.trim().toLowerCase();
  const filtered = query ? entries.filter(e => (e.title || '').toLowerCase().includes(query)) : entries;

  if (!filtered.length) {
    container.innerHTML = query
      ? '<p class="empty-msg">Sin resultados para esa búsqueda.</p>'
      : '<p class="empty-msg">Sin historial todavía.</p>';
    return;
  }

  container.innerHTML = '';
  filtered.forEach((entry) => renderHistoryEntry(entry, container));
}

function renderHistoryEntry(entry, container) {
  const item = document.createElement('div');
  item.className = `history-item${entry.fileExists ? '' : ' missing'}`;

  // Disc icon
  const disc = document.createElement('div');
  disc.className = 'history-disc';
  disc.innerHTML = `<svg viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </svg>`;

  // Info
  const info = document.createElement('div');
  info.className = 'history-info';

  const title = document.createElement('p');
  title.className = 'history-title';
  title.textContent = entry.title || 'Sin título';

  const meta = document.createElement('div');
  meta.className = 'history-meta';
  meta.innerHTML = `
    <span class="history-badge quality">${entry.quality || '?'} kbps</span>
    <span class="history-badge">${formatDate(entry.date)}</span>
  `;

  info.append(title, meta);

  if (!entry.fileExists) {
    const tag = document.createElement('p');
    tag.className = 'history-missing-tag';
    tag.textContent = '⚠ Archivo no encontrado';
    info.appendChild(tag);
  }

  // Re-download button
  const reBtn = document.createElement('button');
  reBtn.className = 'btn-redownload';
  reBtn.textContent = 'Re-descargar';
  reBtn.title = entry.url;
  reBtn.addEventListener('click', () => triggerRedownload(entry.url));

  item.append(disc, info, reBtn);
  container.appendChild(item);
}

function triggerRedownload(url) {
  // Switch to download tab and prefill URL
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="download"]').classList.add('active');
  document.getElementById('tab-download').classList.add('active');

  document.getElementById('urlInput').value = url;
  fetchPreview();
}

// ════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}
