import { mediaReady } from './media.js';
const style=document.createElement('link');style.rel='stylesheet';style.href='reviewed-pages.css';document.head.append(style);
const catalogue = await mediaReady;
const specialSlugs = { 'Jammu & Kashmir':'jammu-kashmir', 'Andaman & Nicobar Islands':'andaman-nicobar', 'Dadra & Nagar Haveli and Daman & Diu':'dadra-nagar-haveli-daman-diu' };
function stateCardMedia(img) {
  const name = img.closest('.destination-card')?.querySelector('h3')?.textContent?.trim();
  if (!name) return null;
  const slug = specialSlugs[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return catalogue[`dest-${slug}`] || null;
}
function enhance() {
  document.querySelectorAll('img:not([data-media-checked])').forEach(img => {
    img.dataset.mediaChecked = 'true';
    const record = Object.values(catalogue).find(m => img.getAttribute('src') === m.src || img.getAttribute('src') === m.originalFile) || stateCardMedia(img);
    if (record) { img.src = record.src; img.alt = record.alt; img.srcset = record.variants.map(v => `${v.src} ${v.width}w`).join(', '); img.sizes ||= '(max-width:640px) 90vw, 400px'; img.width = record.width; img.height = record.height; }
    else if (img.getAttribute('src')?.startsWith('images/') && !img.getAttribute('src')?.startsWith('images/reviewed/') && img.getAttribute('src') !== 'images/photo-pending.svg') { img.src='images/photo-pending.svg'; img.alt='Photograph not yet verified'; }
    img.decoding = 'async';
    img.addEventListener('error', () => { img.removeAttribute('srcset'); img.src = 'images/photo-pending.svg'; img.alt = 'Photograph unavailable'; }, {once:true});
  });
}
enhance(); new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
const footer = document.querySelector('footer');
if (footer && !footer.querySelector('[href="credits.html"]')) { const link=document.createElement('a'); link.href='credits.html'; link.textContent='Image credits & content policy'; footer.append(link); }
