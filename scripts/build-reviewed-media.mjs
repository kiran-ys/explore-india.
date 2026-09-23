// Explicit subject approvals from visual inspection; no image search or auto-selection.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const originals = JSON.parse(await readFile('frontend/images/commons/manifest.json', 'utf8'));
const approvals = {
  'dest-arunachal-pradesh': ['Tawang Monastery on its hillside', ['Tawang Monastery']],
  'dest-assam': ['An Indian rhinoceros photographed in Kaziranga', ['Kaziranga National Park']],
  'dest-chhattisgarh': ['Panorama of Chitrakote Falls', ['Chitrakote Falls']],
  'dest-haryana': ['Arjun statue near Brahma Sarovar, Kurukshetra', ['Brahma Sarovar']],
  'dest-jharkhand': ['Dassam Falls in Jharkhand', ['Dassam Falls']],
  'dest-madhya-pradesh': ['Devi Jagadambi Temple at Khajuraho', ['Khajuraho']],
  'dest-manipur': ['Loktak Lake, Manipur', ['Loktak Lake']],
  'dest-meghalaya': ['A living root bridge in Meghalaya; exact bridge not established', ['Living root bridges']],
  'dest-mizoram': ['Green mountain landscape in Mizoram; exact viewpoint not established', []],
  'dest-nagaland': ['Performers at the Hornbill Festival, Nagaland', ['Hornbill Festival']],
  'dest-odisha': ['Carved stone wheel at Konark Sun Temple', ['Konark Sun Temple']],
  'dest-sikkim': ['Tsomgo Lake in mist, Sikkim', ['Tsomgo Lake']],
  'dest-telangana': ['Charminar in Hyderabad', ['Charminar']],
  'dest-tripura': ['Ujjayanta Palace in Agartala', ['Ujjayanta Palace']],
  'dest-uttarakhand': ['Mountain scenery in the Valley of Flowers, Chamoli', ['Valley of Flowers']],
  'dest-andaman-nicobar': ['Radhanagar Beach on Swaraj Dweep', ['Radhanagar Beach']],
  'dest-chandigarh': ['Palace of Assembly at the Chandigarh Capitol Complex', ['Capitol Complex']],
  'dest-dadra-nagar-haveli-daman-diu': ['Boats at the port of Daman; this is not Diu Fort', ['Daman port']],
  'dest-delhi': ['India Gate in New Delhi', ['India Gate']],
  'dest-ladakh': ['Pangong Tso in Ladakh', ['Pangong Tso']],
  'dest-lakshadweep': ['Satellite view of Lakshadweep islands, NASA Earth Observatory', []],
  'dest-puducherry': ['A street in the French Quarter of Puducherry', ['White Town']],
  'festival-navratri': ['Women in Garba dress during Navratri', ['Garba', 'Navratri']],
  'festival-durga-puja': ['Durga Puja idols at GD Block, Salt Lake, in 2018', ['Durga Puja']],
  'festival-eid': ['Historical photograph of Eid prayers in Delhi in 1942', ['Eid-ul-Fitr']],
  'food-kashmiri': ['Dishes served as part of a Kashmiri wazwan', ['Wazwan']],
  'food-gujarati': ['Gujarati thali with papad, buttermilk and mango pulp', ['Gujarati thali']],
  'food-kerala': ['Sadya served on a banana leaf', ['Sadya']],
  'food-bengali': ['A Bengali vegetarian thali', ['Bengali vegetarian thali']],
  'dance-bharatanatyam': ['A Bharatanatyam performer on stage', ['Bharatanatyam']],
  'dance-kuchipudi': ['A Kuchipudi performer on stage', ['Kuchipudi']],
  'dance-kathakali': ['A Kathakali performer preparing makeup', ['Kathakali']],
  'dance-odissi': ['An Odissi dancer in performance', ['Odissi']],
  'dance-mohiniyattam': ['Mohiniyattam at Kerala school Kalolsavam in 2019', ['Mohiniyattam']],
  'food-rajasthani': ['A Rajasthani meal photographed in Jaipur', ['Rajasthani thali']],
  'dance-kathak': ['Kathak dancer Namrata Rai, photographed by Avinash Pasricha', ['Kathak']],
  'festival-mysuru-dasara': ['Elephants in a Mysuru Dasara procession', ['Mysuru Dasara']],
  'festival-kambala': ['Buffaloes and a runner in a Kambala race', ['Kambala']]
};
const catalogue = {};
await mkdir('frontend/images/reviewed', { recursive: true });
await mkdir('frontend/data', { recursive: true });
for (const [id, [alt, subjects]] of Object.entries(approvals)) {
  const original = originals.find(item => item.slug === id);
  if (!original || !/^(CC BY|CC BY-SA|CC0|Public domain)/.test(original.license) || !original.creator || !original.source) throw new Error(`Incomplete provenance: ${id}`);
  const buffer = await readFile(`frontend/${original.file}`);
  const dimensions = await sharp(buffer).metadata();
  const variants = [];
  for (const size of [480, 960]) {
    const file = `images/reviewed/${id}-${size}.webp`;
    const info = await sharp(buffer).rotate().resize({ width: size, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`frontend/${file}`);
    variants.push({ src: file, width: info.width, height: info.height, bytes: info.size });
  }
  const licence = original.license;
  const version = licence.match(/(\d\.\d)/)?.[1];
  const licenseUrl = licence === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : licence === 'Public domain' ? original.source : `https://creativecommons.org/licenses/${licence.includes('BY-SA') ? 'by-sa' : 'by'}/${version}/`;
  catalogue[id] = { id, alt, subjects, src: variants[1].src, variants, width: variants[1].width, height: variants[1].height, source: original.source, title: original.title, creator: original.creator, license: licence, licenseUrl, originalFile: original.file, originalSha256: createHash('sha256').update(buffer).digest('hex'), reviewedAt: '2026-09-17', review: 'Local photograph visually checked against its recorded Commons title; original attribution imported from the existing source manifest.', changes: 'Resized and converted to WebP. Cropped by layout on cards; full aspect ratio in detail view.' };
}
await writeFile('frontend/data/media.json', JSON.stringify(catalogue, null, 2) + '\n');
console.log(`Built ${Object.keys(catalogue).length} explicitly reviewed image records and responsive variants.`);
