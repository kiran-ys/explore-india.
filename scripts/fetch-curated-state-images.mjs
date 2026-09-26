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
  'dance-sattriya': 'Sattriya Dance Performance.jpg',
  'place-leh-palace': 'The Leh Palace.jpg',
  'place-nubra-valley': 'Sand dunes of Nubra Valley, Ladakh.jpg',
  'place-hemis-monastery': 'Hemis Monastery, Ladakh (2563965489).jpg',
  'place-alchi-monastery': 'Alchi Monastery, Leh, Ladakh, India 01.jpg',
  'festival-hemis-festival': 'Hemis Monastery Festival 1.jpg',
  'festival-ladakh-festival': 'Leh, Ladakh Festival, Ladakh, India.jpg',
  'festival-losar': "Ladakh's New Year.jpg",
  'food-udupi-cuisine': 'Delicious Udupi style food with rice, tomato rasum, payasa, papas, pickel, mango chutney, kosaumbari, vegetable palya, having in banana leaf.jpg',
  'food-kundapura-chicken': 'Neer dosa with kundapur style kori(country chicken) gassy(curry).jpg',
  'food-bisi-bele-bath': 'Bisi Bele Bath.jpg',
  'food-ragi-mudde': 'Ragi Muddde.jpg',
  'food-neer-dosa': 'Neer-dosa.jpg',
  'food-jolada-rotti': 'Jolada rotti.jpg',
  'food-mysore-pak': 'Mysore pak.jpg',
  'food-mangalore-buns': 'Mangalore buns in Udupi.jpg',
  'food-dharwad-peda': 'Dharwad pedha.jpg',
  'food-dham': 'Dham.jpg',
  'food-siddu': 'Siddu (73518).jpg',
  'food-madra': 'White Chana Madra.jpg',
  'culture-nati-dance': 'Nati dance of Himachal Pradesh.jpg',
  'culture-pahari-miniature-art': 'Krishna playing the flute.jpg',
  'festival-kullu-dussehra': 'Kullu Dussehra - main procession.jpg',
  'festival-minjar-fair': 'Procession in the Minjar fair of Chamba.jpg',
  'culture-yakshagana': 'Yakshagana Performance.jpg',
  'culture-dollu-kunitha': 'Dollu kunita.jpg',
  'culture-channapatna-toys': 'Channapatna toys104.jpg',
  'culture-ilkal-sarees': 'Ilkal saree.jpg',
  'culture-bidriware': 'Bidri ware art in craft museum.JPG',
  'place-cellular-jail': 'Cellular Jail Andaman outside view.jpg',
  'place-shaheed-dweep': 'Shaheed Island, Andaman Islands, Tropical beach.jpg',
  'place-chidiya-tapu': 'Chidiya tapu sunset, Andaman.jpg',
  'place-wandoor': 'Wandoor Beach, Andaman & Nicobar Islands.jpg',
  'place-aizawl': 'Aizawl City in 2023.jpg',
  'place-reiek': 'Reiek Tlang Mamit Mizoram.jpg',
  'place-vantawng-falls': 'Vantawng Falls, Mizoram.jpg',
  'place-phawngpui': 'Phawngpui national park.jpg',
  'place-tam-dil': 'Tam Dil Lake in Saitual.jpg',
  'place-kolkata': 'Kolkata skyline at night.jpg',
  'place-darjeeling': 'Darjeeling, India, Tea plantations on hills.jpg',
  'place-sundarbans': 'Tourist Boat in Sundarbans, West Bengal, India 03.jpg',
  'place-santiniketan': 'Shantiniketan Bari of Rabindranath Tagore.jpg',
  'place-bishnupur': 'Rasmancha Temple of Bishnupur, West Bengal, India.jpg',
  'place-majuli': 'Doriya River of Majuli.jpg',
  'place-kanger-valley-national-park': 'Kanger valley National Park.png',
  'place-fontainhas': 'Road along Vasco-da-gama residence in Fontainhas, Panaji.jpg',
  'place-rani-ki-vav': 'Rani ki vav 02.jpg',
  'place-sultanpur-national-park': 'Sultanpur Bird Sanctuary, Gurgaon.jpg',
  'place-betla-national-park': 'Entrance of Betla national park.jpg',
  'place-bandipur-national-park': 'Bandipur Forest Landscape.jpg',
  'place-alappuzha': 'Alappuzha Boat Beauty W.jpg',
  'place-jallianwala-bagh': 'Jallianwala Bagh, Amritsar 01.jpg',
  'place-chennai': 'Chennai Central.jpg',
  'place-neermahal': 'Neer Mahal, the water palace of Tripura 02.jpg',
  'place-rishikesh': 'Trayambakeshwar Temple VK.jpg',
  'place-red-fort': 'Delhi fort.jpg',
  'place-promenade-beach': 'Pondicherry-Rock beach aerial view.jpg',
  'place-rock-garden': 'Chandigarh Rock Garden 4.jpg',
  'place-sanchi': 'East Gateway - Stupa 1 - Sanchi Hill 2013-02-21 4398.JPG',
  'place-ziro-valley': 'A cross section of luch green valley of Ziro.jpg',
  'place-agatti': 'Agatti Airstrip.jpg',
  'food-machher-jhol': 'Khaira machher jhol, cuisine of West Bengal 20200519132544.jpg',
  'food-shorshe-ilish': 'Shorshe Ilish.jpg',
  'food-kolkata-biryani': 'Kolkata mutton biryani.jpg',
  'food-kathi-roll': 'Paneer kathi roll homemade.jpg',
  'food-mishti-doi': 'Mishti Doi.jpg',
  'food-rosogolla': 'Rosogolla 2.jpg',
  'culture-cheraw-dance': 'Cheraw Mizoram.jpg',
  'festival-chapchar-kut': 'CHAPCHAR KUT 2013.jpg',
  'place-keibul-lamjao-national-park': 'THE FLOATING NATIONAL PARK- The Keibul Lamjao National Park, Manipur.jpg',
  'place-shillong': 'Shillong City View.jpg',
  'place-kohima': 'Top view of Kohima.jpg',
  'place-gangtok': 'View of Gangtok city from Ropeway.jpg',
  'place-puri': 'Jagannath Temple, Puri 04.jpg',
  'place-golconda-fort': 'Golconda Fort and Hyderabad city.jpg',
  'place-diu-fort': 'Diu Fortress, Jan. 2010.jpg',
  'food-dal-baati-churma': 'Dal Baati Churma.jpg',
  'culture-ghoomar': 'Udaipur Ghoomar Folk Dance.jpg',
  'festival-pushkar-fair': '(A) Camel Pushkar fair.jpg',
  'food-vada-pav': 'Aran Vada Pav Mumbai.jpg',
  'culture-lavani': 'Lavani Dance.jpg',
  'festival-ganesh-chaturthi': 'Ganesh Chaturthi Festival (269).jpg',
  'food-litti-chokha': 'Litti Chokha 2.jpg',
  'culture-madhubani-painting': 'Dilli Haat Madhubani Mithila Painting Artist.jpg',
  'place-lepakshi': 'Sculpture at the Veerabhadra Temple, Lepakshi, Andhra Pradesh, India a2.jpg',
  'place-nalanda': 'Temple 3 - Sariputta Stupa - Nalanda Mahavihara (10).jpg',
  'place-modhera-sun-temple': 'Sun Temple, Modhera 08.jpg',
  'place-bhimbetka': 'Rock Shelter 8, Bhimbetka 02.jpg',
  'place-ajanta-caves': 'Cave 26, Ajanta.jpg',
  'place-rumtek-monastery': 'Rumtek Monastery seen from across courtyard, Sikkim.jpg',
  'place-ramappa-temple': 'WHS Ramappa Temple 1.jpg',
  'place-unakoti': 'Unakoti.jpg',
  'place-bhoramdeo-temple': '11th century Bhoramdeo temple Kawardha, Chhattisgarh - 117.jpg',
  'place-dudhsagar-falls': 'Dudhsagar Falls, Goa (51821730751).jpg',
  'place-belur': '12th-century Belur Hindu temples complex, exterior.jpg',
  'place-ellora-caves': 'Ellora Caves, India, Kailasanatha Temple 2.jpg',
  'place-qutb-shahi-tombs': 'Qutb Shahi Tombs - small tomb.jpg',
  'place-qutub-minar': 'Qutb Minar tower.jpg',
  'place-kedarnath': 'Kedarnath Temple in Uttarakhand, India, by Yogabrata Chakraborty.jpg',
  'place-fatehpur-sikri': 'Panch Mahal-Fatehpur-Fatehpur Sikri India0014.JPG',
  'place-humayuns-tomb': "Humayun's Tomb, Delhi 1.jpg",
  'food-idli': 'Idli.jpg',
  'food-dosa': 'Dosa 01.jpg',
  'food-sambar': 'Indian Sambar.jpg',
  'food-pongal': 'Ven Pongal with cashew.jpg',
  'food-dhokla': 'Dhokla 6.jpg',
  'food-khandvi': 'Khandvi, Gujarati snack.jpg',
  'food-undhiyu': 'Undhiyu.jpg',
  'food-thepla': 'Thepla 2.jpg',
  'food-handvo': 'Handvo Gujarati Food.jpg',
  'food-khaman': 'SPECIAL SURATI KHAMAN.jpg'
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

const entries = Object.entries(selected).filter(([slug]) => !requested.size || requested.has(slug));
const pages = new Map();
// Batch exact-title metadata lookups to avoid one API request per photograph.
for (let start = 0; start < entries.length; start += 20) {
  const params = new URLSearchParams({ action: 'query', titles: entries.slice(start, start + 20).map(([, title]) => `File:${title}`).join('|'), prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1200', format: 'json' });
  const response = await request(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error(`Metadata request failed (${response.status})`);
  const result = await response.json();
  for (const page of Object.values(result.query?.pages || {})) pages.set(page.title, page);
  for (const normal of result.query?.normalized || []) pages.set(normal.from, pages.get(normal.to));
}
for (const [slug, title] of entries) {
  const page = pages.get(`File:${title}`);
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
