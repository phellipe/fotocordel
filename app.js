(() => {
  'use strict';
  const photos = window.FOTOCORDEL_PHOTOS || [];
  const categories = { mar: 'Mar & horizonte', terra: 'Terra & cotidiano', afetos: 'Afetos & encontros' };
  const displayOrder = ['12-jangada','06-janaina','14-kite','10-ano-novo','04-aline','03-dama-da-noite','16-areia-branca','08-conjuncao','13-amarelinho','17-perfeito-beach','05-alegria','07-marcella','11-dia-santo','02-skate','09-aniversario','15-cotidiano','01-autorretrato'];
  const ordered = [...photos].sort((a,b) => displayOrder.indexOf(a.id) - displayOrder.indexOf(b.id));
  const gallery = document.querySelector('#gallery');
  const dialog = document.querySelector('#photo-dialog');
  const viewerImage = document.querySelector('#viewer-image');
  const imageWrap = document.querySelector('#viewer-image-wrap');
  const zoomButton = document.querySelector('#viewer-zoom');
  let visible = ordered;
  let viewerPhotos = ordered;
  let currentIndex = 0;
  let returnFocus = null;
  viewerImage.addEventListener('load', () => {
    viewerImage.style.opacity = '1';
    imageWrap.removeAttribute('aria-busy');
    imageWrap.classList.remove('image-loading');
  });
  viewerImage.addEventListener('error', () => {
    viewerImage.style.opacity = '1';
    imageWrap.removeAttribute('aria-busy');
    imageWrap.classList.remove('image-loading');
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  ordered.forEach((photo, index) => {
    const figure = element('figure', 'gallery-item');
    figure.dataset.category = photo.category;
    const button = element('button', 'photo-open');
    button.type = 'button';
    button.dataset.photo = photo.id;
    button.setAttribute('aria-label', `Ampliar a fotopoesia ${photo.title}`);
    const img = element('img');
    img.src = photo.src;
    img.alt = photo.alt;
    img.width = photo.width;
    img.height = photo.height;
    img.loading = 'lazy';
    img.decoding = 'async';
    button.append(img, element('span', 'photo-open-label', 'Olhar de perto ↗'));
    const caption = element('figcaption');
    const info = element('div');
    info.append(element('h3', '', photo.title), element('p', 'work-category', categories[photo.category]));
    caption.append(info, element('span', 'work-number', String(index + 1).padStart(2, '0')));
    figure.append(button, caption);
    gallery.append(figure);
  });

  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      visible = ordered.filter(photo => category === 'todos' || photo.category === category);
      gallery.querySelectorAll('.gallery-item').forEach(item => { item.hidden = category !== 'todos' && item.dataset.category !== category; });
      document.querySelector('#gallery-count').textContent = `${visible.length} fotopoesias`;
    });
  });

  function resetZoom() {
    imageWrap.classList.remove('zoomed');
    zoomButton.setAttribute('aria-pressed', 'false');
    zoomButton.textContent = 'Ampliar imagem ↗';
    imageWrap.scrollTo(0,0);
  }
  function showPhoto(index) {
    currentIndex = (index + viewerPhotos.length) % viewerPhotos.length;
    const photo = viewerPhotos[currentIndex];
    resetZoom();
    if (viewerImage.getAttribute('src') !== (photo.full || photo.src)) {
      viewerImage.style.opacity = '0';
      imageWrap.setAttribute('aria-busy', 'true');
      imageWrap.classList.add('image-loading');
    }
    viewerImage.src = photo.full || photo.src;
    viewerImage.alt = photo.alt;
    document.querySelector('#viewer-title').textContent = photo.title;
    document.querySelector('#viewer-category').textContent = categories[photo.category];
    document.querySelector('#viewer-poem').textContent = photo.poem || 'Leia os versos na fotografia ampliada.';
    document.querySelector('#viewer-credit').textContent = photo.credit ? `Fotopoesia: ${photo.credit}` : 'Obra do acervo Fotocordel';
    document.querySelector('#viewer-counter').textContent = `${String(currentIndex + 1).padStart(2,'0')} / ${String(viewerPhotos.length).padStart(2,'0')}`;
    document.querySelector('#viewer-announcement').textContent = `${photo.title}. Fotopoesia ${currentIndex + 1} de ${viewerPhotos.length}.`;
    document.querySelector('.viewer-layout').scrollTop = 0;
    document.querySelector('.viewer-info').scrollTop = 0;
  }
  function openPhoto(id, trigger) {
    viewerPhotos = trigger.closest('#gallery') ? visible : ordered;
    const index = viewerPhotos.findIndex(photo => photo.id === id);
    if (index < 0) return;
    returnFocus = trigger;
    showPhoto(index);
    dialog.showModal();
    document.body.classList.add('viewer-open');
    document.querySelector('#viewer-close').focus();
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-photo]');
    if (trigger) openPhoto(trigger.dataset.photo, trigger);
  });
  document.querySelector('#viewer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('viewer-open');
    resetZoom();
    if (returnFocus && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
  });
  document.querySelector('#viewer-prev').addEventListener('click', () => showPhoto(currentIndex - 1));
  document.querySelector('#viewer-next').addEventListener('click', () => showPhoto(currentIndex + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(currentIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  zoomButton.addEventListener('click', () => {
    const zoomed = imageWrap.classList.toggle('zoomed');
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.textContent = zoomed ? 'Ver imagem inteira ↙' : 'Ampliar imagem ↗';
  });
})();
