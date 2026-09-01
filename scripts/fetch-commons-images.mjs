import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const assets = [
  ["dest-arunachal-pradesh", "Tawang Monastery Arunachal Pradesh India"],
  ["dest-assam", "Kaziranga National Park Assam rhinoceros landscape"],
  ["dest-chhattisgarh", "Chitrakote Falls Chhattisgarh India"],
  ["dest-haryana", "Sultanpur National Park Haryana landscape birds"],
  ["dest-jharkhand", "Dassam Falls Jharkhand India"],
  ["dest-madhya-pradesh", "Khajuraho temples Madhya Pradesh India"],
  ["dest-manipur", "Loktak Lake Manipur India"],
  ["dest-meghalaya", "living root bridge Meghalaya India"],
  ["dest-mizoram", "Mizoram India landscape hills"],
  ["dest-nagaland", "Hornbill Festival Nagaland India"],
  ["dest-odisha", "Konark Sun Temple Odisha India"],
  ["dest-sikkim", "Tsomgo Lake Sikkim India"],
  ["dest-telangana", "Charminar Hyderabad Telangana India"],
  ["dest-tripura", "Ujjayanta Palace Tripura India"],
  ["dest-uttarakhand", "Valley of Flowers Uttarakhand India"],
  ["dest-andaman-nicobar", "Radhanagar Beach Andaman India"],
  ["dest-chandigarh", "Capitol Complex Chandigarh India"],
  ["dest-dadra-nagar-haveli-daman-diu", "Diu Fort Portuguese fortress India"],
  ["dest-delhi", "India Gate Delhi India"],
  ["dest-ladakh", "Pangong Lake Ladakh India"],
  ["dest-lakshadweep", "Kavaratti beach Lakshadweep India"],
  ["dest-puducherry", "French Quarter Puducherry India street"],
  ["festival-navratri", "Garba Navratri festival Gujarat India"],
  ["festival-durga-puja", "Durga Puja Kolkata India festival"],
  ["festival-eid", "Eid prayer Jama Masjid Delhi India"],
  ["festival-baisakhi", "Baisakhi festival Punjab India"],
  ["food-punjabi", "Punjabi food India cuisine"],
  ["food-kashmiri", "Kashmiri wazwan food"],
  ["food-rajasthani", "Rajasthani cuisine thali India"],
  ["food-gujarati", "Gujarati thali India food"],
  ["food-kerala", "Kerala sadya banana leaf"],
  ["food-bengali", "Bengali thali India food"],
  ["food-karnataka", "Karnataka thali food India"],
  ["festival-mysuru-dasara", "Mysore Dasara Karnataka India festival"],
  ["festival-ugadi", "Ugadi festival Karnataka India"],
  ["festival-kambala", "Kambala Karnataka India festival"],
  ["dance-bharatanatyam", "Bharatanatyam dancer India"],
  ["dance-kathak", "Kathak performance classical dancer"],
  ["dance-kuchipudi", "Kuchipudi dance India"],
  ["dance-kathakali", "Kathakali dancer Kerala India"],
  ["dance-odissi", "Odissi dancer India"],
  ["dance-manipuri", "Manipuri dance India performance"],
  ["dance-mohiniyattam", "Mohiniyattam dancer Kerala"],
  ["dance-sattriya", "Sattriya dancer Assam"]
];

const outputDir = join(process.cwd(), "frontend", "images", "commons");
await mkdir(outputDir, { recursive: true });
let manifest = [];
try { manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8")); } catch {}
const force = process.argv.includes("--force");
const requestedSlugs = new Set(process.argv.slice(2).filter(argument => argument !== "--force"));
const requestedAssets = requestedSlugs.size ? assets.filter(([slug]) => requestedSlugs.has(slug)) : assets;

function clean(value = "") { return String(value).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(); }
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": "ExploreIndiaMajorProject/2.0 (educational project)" } });
    if (response.status !== 429) return response;
    await wait(5000 * (attempt + 1));
  }
  throw new Error(`Repeated rate limit for ${url}`);
}

for (const [slug, search] of requestedAssets) {
  const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: `${search} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "8", prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: "1200", format: "json", origin: "*" });
  const apiUrl = `https://commons.wikimedia.org/w/api.php?${params}`;
  await wait(1200);
  const response = await fetchWithRetry(apiUrl);
  if (!response.ok) throw new Error(`Search failed for ${slug}: ${response.status}`);
  const data = await response.json();
  const candidates = Object.values(data.query?.pages || {}).filter(page => {
    const info = page.imageinfo?.[0];
    return info && info.mime?.startsWith("image/") && !/svg|gif|tiff/.test(info.mime) && info.width >= 600 && info.height >= 350;
  });
  const page = candidates[0];
  if (!page) { console.warn(`No suitable image for ${slug}`); continue; }
  const info = page.imageinfo[0], metadata = info.extmetadata || {};
  const imageUrl = info.thumburl || info.url;
  let extension = extname(new URL(imageUrl).pathname).toLowerCase();
  if (!/[.](jpe?g|png|webp)$/.test(extension)) extension = info.mime === "image/png" ? ".png" : ".jpg";
  const filename = `${slug}${extension}`;
  const filePath = join(outputDir, filename);
  try {
    if (force) throw new Error("replace requested");
    await access(filePath);
  } catch {
    try {
      const imageResponse = await fetchWithRetry(imageUrl);
      if (!imageResponse.ok) throw new Error(`Download failed: ${imageResponse.status}`);
      await writeFile(filePath, Buffer.from(await imageResponse.arrayBuffer()));
    } catch (error) {
      console.warn(`Skipped ${slug}: ${error.message}`);
      continue;
    }
  }
  manifest = manifest.filter(item => item.slug !== slug);
  manifest.push({ slug, search, file: `images/commons/${filename}`, title: page.title.replace(/^File:/, ""), creator: clean(metadata.Artist?.value || metadata.Credit?.value || "Wikimedia Commons contributor"), license: clean(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || "See source"), source: metadata.DescriptionUrl?.value || info.descriptionurl, original: info.url });
  await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`${slug} -> ${filename}`);
}

await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
const attribution = ["# Wikimedia Commons image attributions", "", "Images were selected for the Explore India educational project through Wikimedia Commons. Follow each source link for the full license terms.", "", ...manifest.flatMap(item => [`## ${item.slug}`, "", `- File: \`${item.file}\``, `- Title: ${item.title}`, `- Creator: ${item.creator}`, `- License: ${item.license}`, `- Source: ${item.source}`, ""] )].join("\n");
await writeFile(join(process.cwd(), "IMAGE_ATTRIBUTIONS.md"), attribution);
console.log(`Manifest contains ${manifest.length} of ${assets.length} images.`);
