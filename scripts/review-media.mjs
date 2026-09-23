import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const manifest = JSON.parse(await readFile('frontend/images/commons/manifest.json', 'utf8'));
await mkdir('.qa/media', { recursive: true });
for (let start = 0; start < manifest.length; start += 15) {
  const tiles = [];
  for (const [index, item] of manifest.slice(start, start + 15).entries()) {
    const top = Math.floor(index / 3) * 240, left = index % 3 * 330;
    try {
      tiles.push({ input: await sharp(`frontend/${item.file}`).rotate().resize(320, 190, { fit: 'inside' }).extend({ top: 0, bottom: 0, left: 0, right: 0, background: '#fff' }).toBuffer(), top, left });
      const label = item.slug.replace(/&/g, '&amp;');
      tiles.push({ input: Buffer.from(`<svg width="330" height="45"><rect width="330" height="45" fill="white"/><text x="5" y="25" font-family="Arial" font-size="15">${start + index}: ${label}</text></svg>`), top: top + 191, left });
    } catch (e) { console.log(item.slug, e.message); }
  }
  await sharp({ create: { width: 990, height: 1200, channels: 3, background: '#eee' } }).composite(tiles).png().toFile(`.qa/media/sheet-${start}.png`);
}
console.log(manifest.map((x,i)=>`${i} ${x.slug} | ${x.title} | ${x.license}`).join('\n'));
