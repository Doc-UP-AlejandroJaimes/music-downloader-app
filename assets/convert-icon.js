/**
 * Converts assets/icon.png → assets/icon.ico
 * Run: node assets/convert-icon.js
 */
const path = require('path');
const fs   = require('fs');

const src = path.join(__dirname, 'icon.png');
const dst = path.join(__dirname, 'icon.ico');

if (!fs.existsSync(src)) {
  console.error('ERROR: assets/icon.png not found.');
  process.exit(1);
}

// png-to-ico v3 is ESM-only — use dynamic import
import('png-to-ico').then(({ default: pngToIco }) => {
  return pngToIco(src);
}).then((buf) => {
  fs.writeFileSync(dst, buf);
  console.log('✓ assets/icon.ico generated successfully.');
}).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
