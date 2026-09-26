import { mediaReady, mediaFigure, matchingMedia } from './media.js';
const slug = new URLSearchParams(location.search).get('slug');
const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; };
const link = (label, href) => { const a = el('a', label); a.href = href; if (href.startsWith('https:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
const officialSlug = { 'andaman-nicobar':'andaman-and-nicobar-islands','jammu-kashmir':'jammu-and-kashmir','dadra-nagar-haveli-daman-diu':'dadra-and-nagar-haveli-and-daman-and-diu' };
const labels = { places:'Places', food:'Food', culture:'Traditions & craft', festivals:'Festivals' };
const dialog = $('#guideDialog');
let destination, catalogue = {}, entries = [];
function sourceNode(item) {
  const p = el('p', '', 'entry-source');
  if (item.sourceUrl) p.append(link(item.sourceTitle || 'Read the source', item.sourceUrl));
  if (item.checkedAt) p.append(` · Checked ${item.checkedAt}`);
  return p;
}
function openDetail(item, trigger) {
  const content = $('#guideDialogContent'); content.replaceChildren();
  content.append(el('p', `${destination.name} / ${labels[item.kind]}`, 'eyebrow'), el('h2', item.name));
  content.querySelector('h2').id = 'guideDialogTitle';
  content.append(mediaFigure(matchingMedia(catalogue, item.name, slug, item.kind), { full:true, eager:true }), el('p', item.description, 'detail-description'));
  if (item.area) content.append(el('p', `Associated with: ${item.area}`));
  if (item.kind === 'festivals') content.append(el('p', 'Festival dates and public access vary. Confirm the current programme with the organiser before booking travel.', 'visitor-note'));
  if (item.kind === 'places') content.append(link('Open this place in Google Maps ↗', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name}, ${destination.name}, India`)}`));
  content.append(sourceNode(item));
  if (item.sourceScope) content.append(el('p', item.sourceScope, 'source-scope'));
  dialog.showModal(); $('#closeGuide').focus();
  dialog.addEventListener('close', () => trigger.focus(), { once:true });
}
$('#closeGuide').onclick = () => dialog.close();
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
function entryCard(item) {
  const article = el('article', '', 'guide-card'), button = el('button', '', 'guide-card-open'); button.type = 'button';
  button.setAttribute('aria-label', `Read about ${item.name}`);
  const figure = mediaFigure(matchingMedia(catalogue, item.name, slug, item.kind));
  // Photo credits are separate links, never nested inside a button.
  button.append(figure.querySelector('img'));
  const body = el('div', '', 'guide-card-body');
  body.append(el('span', item.category || labels[item.kind], 'card-category'), el('h3', item.name), el('p', item.description), el('span', 'Read the story →', 'card-action'));
  button.append(body); button.onclick = () => openDetail(item, button); article.append(button);
  if (figure.querySelector('figcaption')) article.append(figure.querySelector('figcaption'));
  if (item.kind === 'places') article.append(link('Open map ↗', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name}, ${destination.name}, India`)}`));
  return article;
}
function renderResults() {
  const query = $('#guideSearch').value.trim().toLocaleLowerCase(), category = $('#guideCategory').value;
  let total = 0;
  for (const kind of Object.keys(labels)) {
    const matches = entries.filter(i => i.kind === kind && (category === 'all' || category === kind) && `${i.name} ${i.description} ${i.area || ''}`.toLocaleLowerCase().includes(query));
    const section = $(`#${kind}`); section.hidden = !matches.length;
    section.querySelector('.guide-grid').replaceChildren(...matches.map(entryCard));
    section.querySelector('.section-count').textContent = `${matches.length} stories`; total += matches.length;
  }
  $('#guideResultCount').textContent = `${total} ${total === 1 ? 'story' : 'stories'}${query ? ` matching “${$('#guideSearch').value.trim()}”` : ''}`;
  $('#guideEmpty').hidden = total > 0;
}
$('#guideSearch').addEventListener('input', renderResults); $('#guideCategory').addEventListener('change', renderResults);
$('#clearGuideFilters').onclick = () => { $('#guideSearch').value=''; $('#guideCategory').value='all'; renderResults(); $('#guideSearch').focus(); };
document.querySelectorAll('.destination-sections a').forEach(a => a.addEventListener('click', () => { $('#guideSearch').value=''; $('#guideCategory').value='all'; renderResults(); }));
async function load() {
  if (!slug) { location.replace('states.html'); return; }
  const response = await fetch(`/api/destinations/${encodeURIComponent(slug)}`);
  if (!response.ok) throw new Error(response.status === 404 ? 'This destination is not available.' : 'We could not load this destination.');
  destination = (await response.json()).data;
  const [places, media] = await Promise.all([fetch('data/places.json').then(r => { if (!r.ok) throw new Error('The destination guide is unavailable.'); return r.json(); }), mediaReady]);
  catalogue = media;
  const profile = window.stateProfiles?.[slug];
  document.title = `${destination.name}: places, food & culture | Explore India`;
  $('meta[name="description"]').content = `Explore ${destination.name}: specific places, local food, traditions and festivals with sources and practical planning links.`;
  $('#destinationName').textContent = destination.name; $('#destinationRegion').textContent = `${destination.region} India`;
  $('#destinationSummary').textContent = profile?.speciality || destination.summary;
  const heroMedia = catalogue[`dest-${slug}`] || (slug === 'karnataka' ? catalogue['festival-mysuru-dasara'] : null);
  if (heroMedia) $('#heroPicture').replaceChildren(mediaFigure(heroMedia, { eager:true, full:true }));
  else { $('#heroPicture').replaceChildren(el('p', 'A place to discover, a story to understand.', 'hero-type')); }
  const unique = new Set();
  entries = (places[slug] || []).filter(p => { const k=p.name.normalize('NFKC').toLowerCase(); if(unique.has(k))return false; unique.add(k);return true; }).map(p=>({...p,kind:'places'}));
  for (const kind of ['food','culture','festivals']) for (const [title, description, meta = {}] of profile?.[kind] || []) entries.push({ ...meta, name:title, description, kind });
  const counts = ['food','culture','festivals'].map(kind => `${entries.filter(i=>i.kind===kind).length} ${labels[kind].toLowerCase()}`).join(' · ');
  $('#coverageNote').textContent = `${counts}. This is a selected guide, not an exhaustive inventory. ${profile?.coverageNote || 'More source-backed stories will be added as research is completed.'}`;
  $('#officialGuide').href = `https://www.incredibleindia.gov.in/en/${officialSlug[slug] || slug}`;
  const tools = $('#travelLinks'), query = encodeURIComponent(`${destination.name}, India`);
  tools.append(link('Map search ↗', `https://www.google.com/maps/search/?api=1&query=${query}`), link('Hotel search ↗', `https://www.google.com/travel/search?q=hotels+in+${query}`), link('Transport search ↗', `https://www.google.com/search?q=travel+to+${query}`), link('Build a trip →', 'planner.html'));
  $('#destinationContent').hidden = false; $('#guideLoading').hidden = true; renderResults();
  document.dispatchEvent(new CustomEvent('destination:ready', { detail:destination }));
}
load().catch(error => { $('#destinationName').textContent = 'Let’s try that again'; $('#destinationSummary').textContent = error.message; $('#guideLoading').textContent = 'Reload the page or return to all destinations. Your saved information has not changed.'; });
