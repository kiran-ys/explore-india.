import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const frontend = join(process.cwd(), 'frontend');
const media = JSON.parse(await readFile(join(frontend, 'data/media.json'), 'utf8'));
const destinations = JSON.parse(await readFile('backend/data/destinations.json', 'utf8'));
const places = JSON.parse(await readFile(join(frontend, 'data/places.json'), 'utf8'));
const context = { window:{} };
runInNewContext(await readFile(join(frontend, 'state-profile-details.js'), 'utf8'), context);
const profiles = context.window.stateProfiles;
const missing = [];
async function checkImage(path, label) {
  try { if ((await stat(join(frontend, path))).size === 0) missing.push(`${label}: empty ${path}`); }
  catch { missing.push(`${label}: missing ${path}`); }
}

for (const [id, item] of Object.entries(media)) {
  if (!item.alt || !item.creator || !item.source?.startsWith('https://') || !/^(CC BY|CC BY-SA|CC0|Public domain)/.test(item.license)) missing.push(`${id}: incomplete credit or licence`);
  await checkImage(item.originalFile, id);
  for (const variant of item.variants || []) await checkImage(variant.src, id);
}
for (const destination of destinations) {
  const record = media[`dest-${destination.slug}`];
  if (!record || destination.imagePath !== record.src || destination.imageAlt !== record.alt) missing.push(`${destination.slug}: destination card does not use its reviewed image`);
}
const pageFiles = (await readdir(frontend)).filter(file => /\.(?:html|css)$/.test(file));
for (const file of pageFiles) {
  const body = await readFile(join(frontend, file), 'utf8');
  const paths = [...body.matchAll(/(?:src=|url\()(?:["']?)(images\/[^"')]+)(?:["']?)/g)].map(match => match[1]);
  for (const path of paths) await checkImage(path, file);
}
const hasPhoto = (name, slug) => Object.values(media).some(item =>
  item.subjects.some(subject => subject.toLocaleLowerCase() === name.toLocaleLowerCase()) &&
  (!item.destinationSlugs || item.destinationSlugs.includes(slug))
);
const summary = { destinations:[destinations.filter(item => media[`dest-${item.slug}`]).length, destinations.length] };
for (const kind of ['places', 'food', 'culture', 'festivals']) {
  const entries = kind === 'places' ? Object.entries(places).flatMap(([slug, items]) => items.map(item => ({ name:item.name, slug }))) : Object.entries(profiles).flatMap(([slug, profile]) => (profile[kind] || []).map(item => ({ name:item[0], slug })));
  summary[kind] = [entries.filter(item => hasPhoto(item.name, item.slug)).length, entries.length];
}
const culturePage = await readFile(join(frontend, 'culture.html'), 'utf8');
const cultureImages = [...culturePage.matchAll(/<img src="(images\/[^"]+)"/g)].map(match => match[1]);
const reviewedPaths = new Set(Object.values(media).flatMap(item => [item.src, item.originalFile]));
summary.culturePage = [cultureImages.filter(path => reviewedPaths.has(path)).length, cultureImages.length];
console.log(`Reviewed photo catalogue: ${Object.keys(media).length} images`);
for (const [section, [count, total]] of Object.entries(summary)) console.log(`${section}: ${count}/${total} with subject-matched reviewed photos`);
if (missing.length) { console.error(missing.join('\n')); process.exitCode = 1; }
else console.log('All referenced local images and reviewed-image metadata are present.');
