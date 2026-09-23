// Explicit subject approvals from visual inspection; no image search or auto-selection.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const originals = JSON.parse(await readFile('frontend/images/commons/manifest.json', 'utf8'));
const approvals = {
  'dest-himachal-pradesh': ['Christ Church in Shimla with snow-covered hills behind it', ['Christ Church Shimla']],
  'dest-jammu-kashmir': ['Houseboats on Dal Lake in Srinagar', ['Dal Lake', 'Srinagar']],
  'dest-kerala': ['A boat travelling through Kerala backwaters near Nedumudy', ['Kerala backwaters']],
  'dest-rajasthan': ['The pink facade of Hawa Mahal in Jaipur', ['Hawa Mahal']],
  'dest-andhra-pradesh': ['Tirumala Venkateswara Temple in Andhra Pradesh', ['Tirumala Venkateswara Temple']],
  'dest-bihar': ['Mahabodhi Temple complex in Bodh Gaya', ['Mahabodhi Temple']],
  'dest-goa': ['Front facade of the Basilica of Bom Jesus in Goa', ['Basilica of Bom Jesus']],
  'dest-gujarat': ['White salt flats of the Rann of Kutch at sunset', ['Rann of Kutch']],
  'dest-karnataka': ['Virupaksha Temple complex among the ruins of Hampi', ['Hampi', 'Virupaksha Temple']],
  'dest-maharashtra': ['Gateway of India on Mumbai waterfront', ['Gateway of India']],
  'dest-punjab': ['The Golden Temple reflected in its sacred pool in Amritsar', ['Golden Temple']],
  'dest-tamil-nadu': ['Carved gopuram of Meenakshi Amman Temple in Madurai', ['Meenakshi Amman Temple']],
  'dest-uttar-pradesh': ['Taj Mahal seen from its garden in Agra', ['Taj Mahal']],
  'dest-west-bengal': ['Victoria Memorial in Kolkata', ['Victoria Memorial']],
  'place-gulmarg': ['Green meadows and grazing animals near Gulmarg', ['Gulmarg']],
  'place-pahalgam': ['River valley and wooded mountains near Pahalgam', ['Pahalgam']],
  'place-sonamarg': ['Mountain meadow at Sonamarg', ['Sonamarg']],
  'place-jammu': ['Bahu Fort in Jammu', ['Jammu']],
  'place-mysuru': ['Mysuru Palace illuminated at night', ['Mysuru']],
  'place-kodagu': ["Landscape seen from Raja's Seat in Kodagu", ['Kodagu']],
  'place-gokarna': ['People walking on Om Beach at Gokarna', ['Gokarna']],
  'place-chikkamagaluru': ['Green hills around Mullayanagiri in Chikkamagaluru', ['Chikkamagaluru']],
  'place-bengaluru': ['Vidhana Soudha illuminated in Bengaluru', ['Bengaluru']],
  'place-badami': ['Rock-cut cave temple at Badami', ['Badami']],
  'place-pattadakal': ['Stone temple at Pattadakal', ['Pattadakal']],
  'place-aihole': ['Durga Temple at Aihole', ['Aihole']],
  'place-jog-falls': ['Jog Falls dropping over a forested escarpment', ['Jog Falls']],
  'place-udupi': ['Entrance to Sri Krishna Temple at Udupi', ['Udupi']],
  'place-murudeshwar': ['Large Shiva statue at Murudeshwar', ['Murudeshwar']],
  'festival-diwali': ['Diyas arranged for Diwali', ['Diwali']],
  'festival-holi': ['People with coloured powder during Holi', ['Holi']],
  'festival-onam': ['Pookalam floral design made for Onam', ['Onam']],
  'festival-pongal': ['People celebrating Pongal in a street gathering', ['Pongal']],
  'festival-baisakhi': ['Sikh participants in a Baisakhi procession', ['Baisakhi']],
  'food-karnataka': ['Karnataka vegetarian meal served on a banana leaf', ['Karnataka meals']],
  'dance-manipuri': ['Krishna character performing Manipuri Ras Lila', ['Manipuri']],
  'dance-sattriya': ['Two dancers performing Sattriya on stage', ['Sattriya']],
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
const reviewedToday = new Set([...['himachal-pradesh', 'jammu-kashmir', 'kerala', 'rajasthan', 'andhra-pradesh', 'bihar', 'goa', 'gujarat', 'karnataka', 'maharashtra', 'punjab', 'tamil-nadu', 'uttar-pradesh', 'west-bengal'].map(slug => `dest-${slug}`), 'festival-diwali', 'festival-holi', 'festival-onam', 'festival-pongal', 'festival-baisakhi', 'food-karnataka', 'dance-manipuri', 'dance-sattriya']);
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
  const newlyReviewed = reviewedToday.has(id) || id.startsWith('place-');
  catalogue[id] = { id, alt, subjects, src: variants[1].src, variants, width: variants[1].width, height: variants[1].height, source: original.source, title: original.title, creator: original.creator, license: licence, licenseUrl, originalFile: original.file, originalSha256: createHash('sha256').update(buffer).digest('hex'), reviewedAt: newlyReviewed ? '2026-09-23' : '2026-09-17', review: 'Local photograph visually checked against its recorded Commons title; original attribution imported from the existing source manifest.', changes: 'Resized and converted to WebP. Cropped by layout on cards; full aspect ratio in detail view.' };
}
await writeFile('frontend/data/media.json', JSON.stringify(catalogue, null, 2) + '\n');
console.log(`Built ${Object.keys(catalogue).length} explicitly reviewed image records and responsive variants.`);
