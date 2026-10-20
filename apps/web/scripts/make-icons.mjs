// Genera los iconos de la PWA a partir de un SVG (node scripts/make-icons.mjs).
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const GREEN = "#1d6b45";
// Cesta con una marca de "precio" en el asa; dibujada en una caja de 100x100.
const glyph = `
  <path d="M27 42 L35 26 M73 42 L65 26" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  <path d="M18 42 H82 L75 76 Q74 80 70 80 H30 Q26 80 25 76 Z" fill="#fff"/>
  <path d="M38 54 V68 M50 54 V68 M62 54 V68" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/>`;

function svg({ size, radius, scale }) {
  const offset = (100 - 100 * scale) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="${radius}" fill="${GREEN}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${glyph}</g>
  </svg>`);
}

mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["public/icons/icon-192.png", 192, 22, 0.86],
  ["public/icons/icon-512.png", 512, 22, 0.86],
  // maskable: fondo a sangre y dibujo dentro de la zona segura (80 % central)
  ["public/icons/icon-maskable-512.png", 512, 0, 0.62],
  ["public/icons/apple-touch-icon.png", 180, 0, 0.8],
  ["src/app/icon.png", 64, 22, 0.86],
];
for (const [file, size, radius, scale] of jobs) {
  await sharp(svg({ size, radius, scale })).png().toFile(file);
}
console.log("iconos generados");
