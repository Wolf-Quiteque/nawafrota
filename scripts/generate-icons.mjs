// One-off icon rasterizer: turns the two hand-drawn SVGs in scripts/ into
// every PNG size the PWA manifest and iOS need. Run with `npm run icons`.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'icons');

const anySvg = path.join(__dirname, 'icon-any.svg');
const maskableSvg = path.join(__dirname, 'icon-maskable.svg');

async function render(svgPath, size, outPath) {
  await sharp(svgPath).resize(size, size).png().toFile(outPath);
  console.log('wrote', path.relative(root, outPath));
}

async function main() {
  await mkdir(outDir, { recursive: true });

  await render(anySvg, 192, path.join(outDir, 'icon-192.png'));
  await render(anySvg, 512, path.join(outDir, 'icon-512.png'));
  await render(maskableSvg, 192, path.join(outDir, 'icon-maskable-192.png'));
  await render(maskableSvg, 512, path.join(outDir, 'icon-maskable-512.png'));

  // iOS home-screen icon: no transparency, no rounding (iOS applies its own mask).
  await render(anySvg, 180, path.join(root, 'public', 'apple-touch-icon.png'));
  await render(anySvg, 32, path.join(root, 'public', 'favicon-32.png'));
  await render(anySvg, 16, path.join(root, 'public', 'favicon-16.png'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
