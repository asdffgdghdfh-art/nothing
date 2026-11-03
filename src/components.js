'use strict';
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    'cloud-upload': '<path d="M20 16.2A4.5 4.5 0 0 0 18 7.6h-1.1A6 6 0 0 0 5.4 9.2 4 4 0 0 0 6 17h3"/><path d="M12 21v-9"/><path d="m8.5 15.5 3.5-3.5 3.5 3.5"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    'video': '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/><path d="m8 9 4 3-4 3z"/>',
    'layers': '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
    'star': '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
    'map-pin': '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    'folder-down': '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/><path d="M12 10v7m-3-3 3 3 3-3"/>',
    'database': '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    'hard-drive': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 14h18"/><path d="M7 17h.01M11 17h.01"/>',
    'search': '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'refresh-cw': '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'check': '<path d="m5 12 4 4L19 6"/>',
    'shield-check': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    'copy-check': '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/><path d="m11 15 2 2 4-4"/>',
    'file-plus': '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M13 2v7h7M12 12v6m-3-3h6"/>',
    'play': '<path d="m8 5 12 7-12 7z"/>',
    'folder': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'sparkles': '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14ZM5 2l.8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8L5 2Z"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7M5 12h14"/>',
    'moon': '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    'x': '<path d="m18 6-12 12M6 6l12 12"/>'
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name, size, className) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 20));
    svg.setAttribute('height', String(size || 20));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    svg.innerHTML = ICONS[name] || ICONS.image;
    return svg;
  }

  function applyIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(node => {
      const name = node.getAttribute('data-icon');
      node.replaceChildren(icon(name, Number(node.getAttribute('data-size')) || 20));
    });
  }

  function createMetric(data) {
    const root = el('div', 'summary-metric' + (data.tone ? ' tone-' + data.tone : ''));
    const glyph = el('div', 'metric-glyph');
    glyph.append(icon(data.icon || 'image', 19));
    const copy = el('div', 'metric-copy');
    copy.append(el('span', 'metric-label', data.label || ''));
    const value = el('strong', 'metric-value', String(data.value === undefined ? '—' : data.value));
    copy.append(value);
    if (data.detail) copy.append(el('small', 'metric-detail', data.detail));
    root.append(glyph, copy);
    return root;
  }

  function createSectionHeading(data) {
    const root = el('div', 'section-title-group');
    const glyph = el('span', 'section-title-icon');
    glyph.append(icon(data.icon || 'image', 21));
    const title = el('h2', 'section-title', data.title || '');
    const count = el('span', 'section-count', data.count || '');
    root.append(glyph, title, count);
    const head = el('div', 'section-head');
    head.append(root);
    if (data.actionText) {
      const action = el('button', 'section-action', data.actionText);
      action.type = 'button';
      action.append(icon('chevron-right', 15));
      if (data.onAction) action.addEventListener('click', data.onAction);
      head.append(action);
    }
    return head;
  }

  function createMediaCard(item, options) {
    const opts = options || {};
    const card = el('article', 'media-card' + (opts.hero === 'wide' ? ' hero-wide' : '') + (opts.hero === 'tall' ? ' hero-tall' : ''));
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', '打开 ' + (item.relativePath || '媒体文件'));
    card.title = (item.relativePath || '') + '\n' + (opts.formatSize ? opts.formatSize(item.size) : '') + '\n来源：' + (item.source || '未知');

    const visual = el('div', 'media-visual');
    const fallback = el('div', 'media-fallback');
    fallback.append(icon(item.kind === 'Videos' ? 'video' : 'image', 32));
    visual.append(fallback);

    if (item.kind === 'Photos') {
      const img = el('img', 'media-image');
      img.alt = item.relativePath || '照片';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = item.mediaUrl;
      img.addEventListener('load', () => fallback.classList.add('is-hidden'), { once: true });
      img.addEventListener('error', () => fallback.classList.remove('is-hidden'), { once: true });
      visual.append(img);
    } else {
      const video = el('video', 'media-video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = item.mediaUrl;
      video.addEventListener('loadedmetadata', () => {
        try { video.currentTime = Math.min(0.15, Math.max(0, video.duration / 20)); } catch (_) {}
      }, { once: true });
      video.addEventListener('seeked', () => video.pause(), { once: true });
      video.addEventListener('loadeddata', () => fallback.classList.add('is-hidden'), { once: true });
      visual.append(video);
      const play = el('span', 'video-play-chip');
      play.append(icon('play', 12));
      visual.append(play);
      const badge = el('span', 'video-type-badge', '视频');
      visual.append(badge);
    }

    const shade = el('div', 'media-shade');
    visual.append(shade);

    const favorite = el('button', 'media-favorite' + (item.favorite ? ' is-active' : ''));
    favorite.type = 'button';
    favorite.title = item.favorite ? '取消收藏' : '添加收藏';
    favorite.setAttribute('aria-label', favorite.title);
    favorite.append(icon('star', 16));
    favorite.addEventListener('click', event => {
      event.stopPropagation();
      if (opts.onFavorite) opts.onFavorite(item);
    });

    const caption = el('div', 'media-caption');
    const text = el('div', 'media-caption-copy');
    text.append(el('strong', 'media-title', (item.relativePath || '').split(/[\\/]/).pop() || '未命名文件'));
    text.append(el('span', 'media-subtitle', (opts.monthLabel ? opts.monthLabel(item) : '') + (item.source ? ' · ' + item.source : '')));
    caption.append(text);
    card.append(visual, favorite, caption);
    card.addEventListener('click', () => { if (opts.onOpen) opts.onOpen(item); });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (opts.onOpen) opts.onOpen(item);
      }
    });
    return card;
  }

  function createFolderCard(data) {
    const card = el('button', 'collection-card');
    card.type = 'button';
    const cover = el('span', 'collection-cover');
    cover.append(icon(data.icon || 'folder', 28));
    const copy = el('span', 'collection-copy');
    copy.append(el('strong', 'collection-name', data.name || '未命名合集'));
    copy.append(el('small', 'collection-detail', data.detail || (String(data.count || 0) + ' 项')));
    card.append(cover, copy, icon('chevron-right', 17, 'collection-arrow'));
    if (data.onClick) card.addEventListener('click', data.onClick);
    return card;
  }

  function createEmptyState(data) {
    const root = el('div', 'empty-state');
    const art = el('div', 'empty-art');
    art.append(icon(data.icon || 'image', 34));
    const copy = el('div', 'empty-copy');
    copy.append(el('strong', 'empty-title', data.title || '这里还没有内容'));
    copy.append(el('p', 'empty-description', data.description || '选择一个来源文件夹，开始整理你的照片和视频。'));
    root.append(art, copy);
    if (data.actionText && data.onAction) {
      const action = el('button', 'empty-action', data.actionText);
      action.type = 'button';
      action.append(icon('arrow-left', 15));
      action.addEventListener('click', data.onAction);
      root.append(action);
    }
    return root;
  }

  window.SBComponents = {
    icon,
    applyIcons,
    createMetric,
    createSectionHeading,
    createMediaCard,
    createFolderCard,
    createEmptyState
  };
})();
