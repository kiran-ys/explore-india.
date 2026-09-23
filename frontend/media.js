const cataloguePromise = fetch('data/media.json').then(r => { if (!r.ok) throw new Error('Media catalogue unavailable'); return r.json(); });
export const mediaReady = cataloguePromise.catch(() => ({}));
export function matchingMedia(catalogue, title) {
  const key = title.normalize('NFKC').toLocaleLowerCase().trim();
  return Object.values(catalogue).find(m => m.subjects.some(s => s.toLocaleLowerCase() === key));
}
export function mediaFigure(record, { eager = false, full = false } = {}) {
  const figure = document.createElement('figure'); figure.className = `reviewed-media${full ? ' full-media' : ''}`;
  const image = document.createElement('img');
  image.src = record?.src || 'images/photo-pending.svg';
  image.alt = record?.alt || 'Photograph not yet available';
  image.width = record?.width || 960; image.height = record?.height || 640;
  image.loading = eager ? 'eager' : 'lazy'; image.decoding = 'async';
  if (record) { image.srcset = record.variants.map(v => `${v.src} ${v.width}w`).join(', '); image.sizes = full ? '(max-width: 800px) 92vw, 800px' : '(max-width: 640px) 92vw, (max-width: 1000px) 45vw, 360px'; }
  image.addEventListener('error', () => { image.removeAttribute('srcset'); image.src = 'images/photo-pending.svg'; image.alt = 'Photograph unavailable'; }, { once:true });
  figure.append(image);
  if (record) {
    const caption = document.createElement('figcaption'), credit = document.createElement('a'), licence = document.createElement('a');
    credit.href = record.source; credit.target = '_blank'; credit.rel = 'noopener noreferrer'; credit.textContent = `Photo: ${record.creator}`;
    licence.href = record.licenseUrl; licence.target = '_blank'; licence.rel = 'noopener noreferrer'; licence.textContent = record.license;
    caption.append(credit, ' · ', licence); figure.append(caption);
  }
  return figure;
}
