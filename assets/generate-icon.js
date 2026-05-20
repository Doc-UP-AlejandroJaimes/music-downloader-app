/**
 * Run once with Node.js to generate a placeholder icon.png.
 * For production, replace assets/icon.ico with a proper 256x256 ICO file.
 *
 * Usage: node assets/generate-icon.js
 */
const fs = require('fs');
const path = require('path');

// Minimal 1x1 pixel PNG (base64) as a placeholder
// Replace with a real 256x256 icon for production builds
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const outPath = path.join(__dirname, 'icon.png');
if (!fs.existsSync(outPath)) {
  fs.writeFileSync(outPath, PNG_1x1);
  console.log('Placeholder icon.png created. Replace with a real 256x256 PNG icon.');
} else {
  console.log('icon.png already exists. Skipped.');
}
