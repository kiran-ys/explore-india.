// Exact Commons file titles selected for missing destination cards; never search-and-use-first.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const selected = {
  'dest-himachal-pradesh': 'Christ Church, Shimla.jpg',
  'dest-jammu-kashmir': 'Dal Lake, Srinagar, Jammu and Kashmir.jpg',
  'dest-kerala': 'Kerala Backwaters near Nedumudy - 4.jpg',
  'dest-rajasthan': 'Hawa Mahal 2011.jpg',
  'dest-andhra-pradesh': 'A View of Tirumala Venkateswara Temple.JPG',
  'dest-bihar': 'Mahabodhi temple complex, Bodhgaya 23.jpg',
  'dest-goa': 'Front Elevation of Basilica of Bom Jesus.jpg',
  'dest-gujarat': 'White Rann of Kutch.jpg',
  'dest-karnataka': 'Complex of Virupaksha Temple, Hampi (08).jpg',
  'dest-maharashtra': 'The Gateway of India, Mumbai, Maharashtra, India.jpg',
  'dest-punjab': 'Golden Temple, Amritsar 01.jpg',
  'dest-tamil-nadu': 'Meenakshi Amman Temple Tamil Nadu India.jpg',
  'dest-uttar-pradesh': 'Taj Mahal, Agra, India edit2.jpg',
  'dest-west-bengal': 'Victoria Memorial, Kolkata, West Bengal (1).jpg',
  'place-gulmarg': 'Landscape view of Gulmarg, Kashmir 01.jpg',
  'place-pahalgam': 'Pahalgam Valley.jpg',
  'place-sonamarg': 'Mountain Meadow in Sonamarg, Kashmir, India.jpg',
  'place-jammu': 'Bahu Fort, Jammu, India.jpg',
  'place-mysuru': 'Mysuru Palace - Night View.jpg',
  'place-kodagu': "View from Raja's Seat 2.jpg",
  'place-gokarna': 'PXL 20260103 101009613 People and Beach Om Beach Gokarna, Karnataka 08.jpg',
  'place-chikkamagaluru': 'Mullayanagiri, Chikmagalur district of Karnataka.jpg',
  'place-bengaluru': 'Vidhana Soudha LE.jpg',
  'place-badami': 'A-cave-temple-at-badami.JPG',
  'place-pattadakal': 'The Pattadakal (Pattadakallu) temple complex in Karnataka (26).jpg',
  'place-aihole': 'DurgaTempleAihole.JPG',
  'place-jog-falls': 'Jog Falls Wide.jpg',
  'place-udupi': 'Udupi Sri Krishna Temple, Udupi, Karnataka, India (2007).jpg',
  'place-murudeshwar': 'Lord Shiva at Murudeshwar, Karnataka..jpg',
  'festival-diwali': 'Diyas Diwali Decor India.jpg',
  'festival-holi': 'Festival of Colours, HOLI.jpg',
  'festival-onam': 'Onam-Pookalam(floral designs).jpg',
  'festival-pongal': 'Pongal Festival.jpg',
  'festival-baisakhi': 'Baisakhi a Sikh festival.jpg',
  'food-karnataka': 'Karnataka Vegetarian Meal.jpg',
  'dance-manipuri': 'Lord Krishna in Manipuri Ras Lila dance 01.jpg',
  'dance-sattriya': 'Sattriya Dance Performance.jpg'
};
const directory = join(process.cwd(), 'frontend/images/commons');
await mkdir(directory, { recursive: true });
const manifestPath = join(directory, 'manifest.json');
let manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const clean = value => String(value || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const requested = new Set(process.argv.slice(2));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': 'ExploreIndiaPortfolio/2.0 (curated image catalogue)' } });
    if (response.status !== 429) return response;
    await pause(3000 * (attempt + 1));
  }
  throw new Error('Commons rate limit persisted after retries');
}

for (const [slug, title] of Object.entries(selected)) {
  if (requested.size && !requested.has(slug)) continue;
  const params = new URLSearchParams({ action: 'query', titles: `File:${title}`, prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1200', format: 'json' });
  const response = await request(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error(`${slug}: metadata request failed (${response.status})`);
  const page = Object.values((await response.json()).query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  const metadata = info?.extmetadata || {};
  const license = clean(metadata.LicenseShortName?.value || metadata.UsageTerms?.value);
  const creator = clean(metadata.Artist?.value || metadata.Credit?.value);
  if (!info?.thumburl || !/^image\//.test(info.mime) || !/^(CC BY|CC BY-SA|CC0|Public domain)/.test(license) || !creator || !info.descriptionurl) {
    throw new Error(`${slug}: Commons source, licence, author or usable thumbnail missing`);
  }
  const filename = `${slug}.jpg`;
  const imageResponse = await request(info.thumburl);
  if (!imageResponse.ok) throw new Error(`${slug}: image request failed (${imageResponse.status})`);
  await writeFile(join(directory, filename), Buffer.from(await imageResponse.arrayBuffer()));
  manifest = manifest.filter(item => item.slug !== slug);
  manifest.push({ slug, search: `Exact Commons file: ${title}`, file: `images/commons/${filename}`, title, creator, license, source: info.descriptionurl, original: info.url });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${slug}: ${title} (${license}; ${creator})`);
  await pause(1200);
}
const attribution = ['# Wikimedia Commons image attributions', '', 'The photographs below are credited to their named creators. Follow each source link for the full licence and attribution details.', '', ...manifest.flatMap(item => [`## ${item.slug}`, '', `- File: \`${item.file}\``, `- Title: ${item.title}`, `- Creator: ${item.creator}`, `- License: ${item.license}`, `- Source: ${item.source}`, ''])].join('\n');
await writeFile(join(process.cwd(), 'IMAGE_ATTRIBUTIONS.md'), attribution.trimEnd() + '\n');
