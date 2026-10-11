/*
 * Map Historia — etkileşimli dünya haritası (AC 1.2, 3.2).
 * Gerçek sınırlardan üretilmiş eyalet poligonlarını SVG ile çizer. Eyalet sahipliği değiştiğinde
 * ilgili eyaletin rengi, ülke sınırları ve ülke adları anında güncellenir.
 */
(function (MH) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  const f = (n) => Math.round(n * 10) / 10;
  const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  const UNCLAIMED = '#c9bd9c';
  const EARTH_KM = 6371;

  /** Karaya hafif arazi dokusu için tuvalde üretilen döşenebilir gürültü */
  function terrainTexture() {
    if (typeof document === 'undefined') return null;
    const size = 192;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(size, size);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const layers = [8, 16, 32, 64].map((n) => Array.from({ length: n * n }, rnd));
    const sample = (grid, n, x, y) => {
      const gx = (x / size) * n;
      const gy = (y / size) * n;
      const x0 = Math.floor(gx) % n;
      const y0 = Math.floor(gy) % n;
      const x1 = (x0 + 1) % n;
      const y1 = (y0 + 1) % n;
      const tx = gx - Math.floor(gx);
      const ty = gy - Math.floor(gy);
      const s = (t) => t * t * (3 - 2 * t);
      const a = grid[y0 * n + x0] + (grid[y0 * n + x1] - grid[y0 * n + x0]) * s(tx);
      const b = grid[y1 * n + x0] + (grid[y1 * n + x1] - grid[y1 * n + x0]) * s(tx);
      return a + (b - a) * s(ty);
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0;
        let amp = 0.5;
        layers.forEach((grid, i) => { v += sample(grid, [8, 16, 32, 64][i], x, y) * amp; amp *= 0.55; });
        const g = Math.round(150 + v * 105);
        const i = (y * size + x) * 4;
        img.data[i] = g;
        img.data[i + 1] = g;
        img.data[i + 2] = g;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  class MapView {
    constructor(svg, game, handlers = {}) {
      this.svg = svg;
      this.game = game;
      this.grid = game.grid;
      this.handlers = handlers;
      this.mode = 'political';
      this.selected = null;
      this.focusId = null; // diplomatik görünümde referans ulus
      this.dirty = { fills: true, borders: true, labels: true };
      this.abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
      this._pxArea = this.grid.provinces.map((p) => {
        const k = this.grid.width / (2 * Math.PI * EARTH_KM * Math.cos((p.lat * Math.PI) / 180));
        return p.area * k * k;
      });
      this._build();
      this._bindInput();
      this.resetView();

      game.on('province', ({ id }) => {
        this._fillProv(id);
        this._flash(id);
        this.dirty.borders = true;
        this.dirty.labels = true;
        this.requestRender();
      });
      game.on('wars', () => {
        if (this.mode === 'diplomatic') this.dirty.fills = true;
        this.dirty.borders = true;
        this.requestRender();
      });
      game.on('day', () => this.requestStacks());
      game.on('buildings', () => this.renderBuildings());
      game.on('month', () => {
        if (this.mode === 'diplomatic') {
          this.dirty.fills = true;
          this.requestRender();
        }
      });
    }

    /** Dinleyicileri kaldırır (yeni oyunda harita yeniden kurulurken) */
    destroy() {
      this.abort?.abort();
      this.destroyed = true;
    }

    _build() {
      const svg = this.svg;
      const g = this.grid;
      svg.innerHTML = '';
      svg.setAttribute('xmlns', NS);
      const defs = el('defs', {}, svg);
      const pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'rgba(170,20,20,.6)', 'stroke-width': 2.2 }, pat);
      const grad = el('linearGradient', { id: 'sea', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': 'var(--sea-1)' }, grad);
      el('stop', { offset: '55%', 'stop-color': 'var(--sea-2)' }, grad);
      el('stop', { offset: '100%', 'stop-color': 'var(--sea-1)' }, grad);
      const tex = terrainTexture();
      if (tex) {
        const tp = el('pattern', { id: 'terrain', width: 96, height: 96, patternUnits: 'userSpaceOnUse' }, defs);
        el('image', { href: tex, width: 96, height: 96, preserveAspectRatio: 'none' }, tp);
      }

      this.root = el('g', {}, svg);
      el('rect', { x: -g.width, y: -g.height, width: g.width * 3, height: g.height * 3, fill: 'url(#sea)' }, this.root);
      // Sığ deniz: kıyı boyunca açık renkli hale
      const coastAll = g.coast.join('');
      el('path', { d: coastAll, class: 'shallow shallow-1' }, this.root);
      el('path', { d: coastAll, class: 'shallow shallow-2' }, this.root);

      this.provLayer = el('g', { class: 'provinces' }, this.root);
      this.provEls = g.provinces.map((p) => el('path', { d: g.rings[p.id], 'data-id': p.id, class: 'prov', 'fill-rule': 'evenodd' }, this.provLayer));
      if (tex) el('path', { d: g.rings.join(''), class: 'terrain', fill: 'url(#terrain)', 'fill-rule': 'evenodd' }, this.root);
      this.warLayer = el('path', { class: 'war-hatch', fill: 'url(#hatch)', 'fill-rule': 'evenodd' }, this.root);
      el('path', { d: coastAll, class: 'coast' }, this.root);
      this.borderPath = el('path', { class: 'borders' }, this.root);
      this.enemyPath = el('path', { class: 'enemy-outline' }, this.root);
      this.playerPath = el('path', { class: 'player-outline' }, this.root);
      this.selectPath = el('path', { class: 'select-outline' }, this.root);
      this.buildingLayer = el('g', { class: 'buildings' }, this.root);
      this.capitalLayer = el('g', { class: 'capitals' }, this.root);
      this.labelLayer = el('g', { class: 'labels' }, this.root);
      this.pathLayer = el('g', { class: 'army-paths' }, this.root);
      this.stackLayer = el('g', { class: 'stacks' }, this.root);
      this.requestRender();
    }

    // ------------------------------------------------------------ çizim
    requestRender() {
      if (this._raf) return;
      this._raf = raf(() => {
        this._raf = null;
        if (!this.destroyed) this.render();
      });
    }

    render() {
      if (this.dirty.fills) {
        this.grid.provinces.forEach((p) => this._fillProv(p.id));
        this.dirty.fills = false;
      }
      if (this.dirty.borders) {
        this._renderBorders();
        this.dirty.borders = false;
      }
      if (this.dirty.labels) {
        this._renderLabels();
        this.renderBuildings();
        this.dirty.labels = false;
      }
    }

    colorOf(owner) {
      const g = this.game;
      if (!owner) return UNCLAIMED;
      if (this.mode === 'political') return g.nation(owner).color;
      const ref = this.focusId;
      if (!ref) return g.nation(owner).color;
      if (owner === ref) return '#f4d35e';
      if (g.warBetween(ref, owner)) return '#c0392b';
      if (g.isAllied(ref, owner)) return '#3d7dd8';
      if (g.hasTrade(ref, owner)) return '#3aa17e';
      const op = g.opinion(owner, ref);
      const t = (op + 100) / 200;
      return 'rgb(' + Math.round(196 - 90 * t) + ',' + Math.round(120 + 70 * t) + ',' + Math.round(110 + 20 * t) + ')';
    }

    _fillProv(id) {
      const owner = this.game.state.owner[id];
      const node = this.provEls[id];
      const color = this.colorOf(owner);
      node.setAttribute('fill', color);
      node.classList.toggle('unclaimed', !owner);
    }

    _flash(id) {
      const node = this.provEls[id];
      node.classList.remove('flash');
      void node.getBBox?.();
      node.classList.add('flash');
      setTimeout(() => node.classList.remove('flash'), 1400);
    }

    /** Bir koşulu sağlayan eyaletlerin dış sınırı (komşu sınırları + kıyılar) */
    _outline(pred) {
      const owner = this.game.state.owner;
      let d = '';
      for (const [a, b, path] of this.grid.pairs) if (pred(owner[a]) !== pred(owner[b])) d += path;
      this.grid.coast.forEach((path, pid) => { if (path && pred(owner[pid])) d += path; });
      return d;
    }

    _renderBorders() {
      const g = this.game;
      const owner = g.state.owner;
      let nation = '';
      let inner = '';
      for (const [a, b, path] of this.grid.pairs) {
        if (owner[a] !== owner[b]) nation += path;
        else inner += path;
      }
      this.borderPath.setAttribute('d', nation);
      if (!this.innerPath) this.innerPath = el('path', { class: 'inner-borders' }, this.root, this.borderPath);
      this.root.insertBefore(this.innerPath, this.borderPath);
      this.innerPath.setAttribute('d', inner);

      const pid = g.state.playerId;
      this.playerPath.setAttribute('d', pid ? this._outline((o) => o === pid) : '');
      const enemies = new Set(pid ? g.enemiesOf(pid) : []);
      this.enemyPath.setAttribute('d', enemies.size ? this._outline((o) => enemies.has(o)) : '');
      let hatch = '';
      if (enemies.size) owner.forEach((o, i) => { if (enemies.has(o)) hatch += this.grid.rings[i]; });
      this.warLayer.setAttribute('d', hatch);
      this.selectPath.setAttribute('d', this.selected && this.selected !== pid ? this._outline((o) => o === this.selected) : '');
    }

    /**
     * Pax tarzı ülke adları: her ulusun büyük kara parçalarına, ana eksen boyunca döndürülmüş,
     * harf aralıklı büyük yazılar.
     */
    _renderLabels() {
      const g = this.game;
      const { provinces } = this.grid;
      const owner = g.state.owner;
      this.labelLayer.innerHTML = '';
      this.capitalLayer.innerHTML = '';
      this.labels = [];
      for (const nat of g.aliveNations()) {
        const mine = new Set(g.provincesOf(nat.id));
        const seen = new Set();
        const comps = [];
        for (const start of mine) {
          if (seen.has(start)) continue;
          const comp = [];
          const stack = [start];
          seen.add(start);
          while (stack.length) {
            const cur = stack.pop();
            comp.push(cur);
            for (const nb of provinces[cur].neighbors) if (mine.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
          }
          comps.push({ ids: comp, area: comp.reduce((s, i) => s + this._pxArea[i], 0) });
        }
        comps.sort((a, b) => b.area - a.area);
        const biggest = comps[0]?.area || 0;
        for (const comp of comps) {
          if (comp !== comps[0] && comp.area < biggest * 0.35) continue;
          if (comp.area < 40) continue;
          this._addLabel(nat, comp);
        }
        const cap = provinces[nat.capital];
        if (cap && owner[nat.capital] === nat.id) {
          el('circle', { cx: f(cap.x), cy: f(cap.y), r: 2.2, class: 'capital' + (nat.id === g.state.playerId ? ' is-player' : '') }, this.capitalLayer);
        }
      }
      this._updateLabelVisibility();
    }

    _addLabel(nat, comp) {
      const { provinces } = this.grid;
      let W = 0;
      let mx = 0;
      let my = 0;
      for (const i of comp.ids) {
        const w = this._pxArea[i];
        W += w;
        mx += provinces[i].x * w;
        my += provinces[i].y * w;
      }
      mx /= W;
      my /= W;
      let xx = 0;
      let yy = 0;
      let xy = 0;
      for (const i of comp.ids) {
        const w = this._pxArea[i] / W;
        const dx = provinces[i].x - mx;
        const dy = provinces[i].y - my;
        xx += w * dx * dx;
        yy += w * dy * dy;
        xy += w * dx * dy;
      }
      // Eyalet içi yayılımı da hesaba kat (tek eyaletli ülkeler için)
      const own = comp.area / (4 * Math.PI * comp.ids.length);
      xx += own;
      yy += own;
      const tr = xx + yy;
      const det = xx * yy - xy * xy;
      const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      const l1 = tr / 2 + disc;
      const l2 = Math.max(0, tr / 2 - disc);
      let angle = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
      let major = 3.6 * Math.sqrt(l1);
      const minor = 3.6 * Math.sqrt(l2);
      // Okunabilirlik: dik açılı yazıları sınırla
      if (Math.abs(angle) > 35) {
        major *= Math.cos(((Math.abs(angle) - 35) * Math.PI) / 180);
        angle = Math.sign(angle) * 35;
      }
      const text = nat.name.toLocaleUpperCase('tr');
      const len = Math.max(3, text.length);
      let fs = Math.min(minor * 0.42, (major * 0.9) / (len * 0.68));
      fs = Math.max(2.5, Math.min(80, fs));
      const width = Math.max(len * fs * 0.68, Math.min(major * 0.86, len * fs * 1.55));
      const t = el('text', {
        x: f(mx),
        y: f(my),
        'font-size': f(fs),
        transform: 'rotate(' + f(angle) + ' ' + f(mx) + ' ' + f(my) + ')',
        textLength: f(width),
        lengthAdjust: 'spacing',
        class: 'nation-label' + (nat.id === this.game.state.playerId ? ' is-player' : ''),
      }, this.labelLayer);
      t.textContent = text;
      this.labels.push({ el: t, fs });
    }

    _updateLabelVisibility() {
      if (!this.labels || !this.view) return;
      const rect = this.svg.getBoundingClientRect?.() || { width: 1000, height: 600 };
      const scale = Math.min((rect.width || 1000) / this.view.w, (rect.height || 600) / this.view.h);
      for (const l of this.labels) {
        const px = l.fs * scale;
        l.el.style.display = px < 7 ? 'none' : '';
      }
      this._tokenScale = Math.max(0.45, Math.min(2.2, 1.15 / Math.max(0.05, scale)));
    }

    setMode(mode) {
      this.mode = mode;
      this.dirty.fills = true;
      this.requestRender();
    }

    setFocus(id) {
      this.focusId = id;
      if (this.mode === 'diplomatic') {
        this.dirty.fills = true;
        this.requestRender();
      }
    }

    select(id) {
      this.selected = id;
      this.dirty.borders = true;
      this.requestRender();
    }

    refreshAll() {
      this.dirty = { fills: true, borders: true, labels: true };
      this.requestRender();
      this.requestStacks();
    }

    // ------------------------------------------------------------ ordular
    requestStacks() {
      if (this._stackRaf) return;
      this._stackRaf = raf(() => {
        this._stackRaf = null;
        if (!this.destroyed) this.renderStacks();
      });
    }

    selectStack(id) {
      this.selectedStack = id;
      this.renderStacks();
    }

    renderStacks() {
      const g = this.game;
      const stacks = g.state.stacks || [];
      const { provinces } = this.grid;
      const pid = g.state.playerId;
      const s0 = this._tokenScale || 1;
      this.stackLayer.innerHTML = '';
      this.pathLayer.innerHTML = '';
      const slot = new Map();
      for (const s of stacks) {
        const p = provinces[s.prov];
        const k = slot.get(s.prov) || 0;
        slot.set(s.prov, k + 1);
        // Simgeler eyaletin alt yarısında durur; üst yarı eyalete tıklamak için açık kalır
        const x = p.x + (k % 2 ? 1 : -1) * (k ? 11 * s0 : 0);
        const y = p.y + 6 * s0 + Math.floor(k / 2) * 12 * s0;
        const mine = s.owner === pid;
        if (mine && s.path.length) {
          const pts = [[p.x, p.y], ...s.path.map((i) => [provinces[i].x, provinces[i].y])];
          el('polyline', {
            points: pts.map((q) => f(q[0]) + ',' + f(q[1])).join(' '),
            class: 'army-path' + (s.id === this.selectedStack ? ' selected' : ''),
            'stroke-width': f(1.5 * s0),
          }, this.pathLayer);
          const end = pts[pts.length - 1];
          el('circle', { cx: f(end[0]), cy: f(end[1]), r: f(2.6 * s0), class: 'army-path-end' }, this.pathLayer);
        }
        const st = MH.armies.status(g, s);
        const cls = ['stack', mine ? 'mine' : 'foe', st.kind, s.id === this.selectedStack ? 'selected' : '', s.auto && mine ? 'auto' : '']
          .filter(Boolean).join(' ');
        const node = el('g', { class: cls, 'data-stack': s.id, transform: 'translate(' + f(x) + ',' + f(y) + ') scale(' + f(s0) + ')' }, this.stackLayer);
        el('rect', { x: -10, y: -5.5, width: 20, height: 11, rx: 3, fill: g.nation(s.owner).color }, node);
        const t = el('text', { x: 0, y: 0.5 }, node);
        t.textContent = s.size >= 1 ? Math.round(s.size) + 'k' : '<1k';
        if (st.kind === 'siege') {
          const sg = g.state.sieges[s.prov];
          const pct = Math.min(1, sg.progress / sg.needed);
          el('rect', { x: -10, y: 6, width: 20, height: 2.6, class: 'siege-bg' }, node);
          el('rect', { x: -10, y: 6, width: f(20 * pct), height: 2.6, class: 'siege-fg' }, node);
        }
      }
    }

    /** Kaleler (tüm uluslar), oyuncunun süren inşaatları ve kolonileri */
    renderBuildings() {
      const g = this.game;
      const { provinces } = this.grid;
      const s0 = this._tokenScale || 1;
      this.buildingLayer.innerHTML = '';
      for (const [pid, list] of Object.entries(g.state.buildings || {})) {
        if (!list.includes('fort')) continue;
        const p = provinces[pid];
        el('path', {
          d: 'M0 0h7v-6h-1.4v1.6h-1.4v-1.6h-1.4v1.6h-1.4v-1.6h-1.4z',
          transform: 'translate(' + f(p.x + 5 * s0) + ',' + f(p.y - 2 * s0) + ') scale(' + f(s0) + ')',
          class: 'fort-mark',
        }, this.buildingLayer);
      }
      for (const c of [...(g.state.construction || []), ...(g.state.colonizing || [])]) {
        if (c.owner !== g.state.playerId) continue;
        const p = provinces[c.pid];
        el('circle', { cx: f(p.x - 6 * s0), cy: f(p.y - 4 * s0), r: f(2.4 * s0), class: 'construction-mark' }, this.buildingLayer);
      }
    }

    // ------------------------------------------------------------ yakınlaştırma ve kaydırma
    resetView() {
      this.view = { x: 0, y: 0, w: this.grid.width, h: this.grid.height };
      this._applyView();
    }

    focusOn(id, zoom = 2.2) {
      const ids = this.game.provincesOf(id);
      if (!ids.length) return;
      // Başkentin çevresine odaklan (dünyaya dağılmış imparatorluklarda tüm haritayı göstermemek için)
      const cap = this.grid.provinces[this.game.nation(id).capital] || this.grid.provinces[ids[0]];
      const near = ids.map((i) => this.grid.provinces[i]).filter((p) => Math.hypot(p.x - cap.x, p.y - cap.y) < this.grid.width / 6);
      const minX = Math.min(...near.map((p) => p.x));
      const maxX = Math.max(...near.map((p) => p.x));
      const minY = Math.min(...near.map((p) => p.y));
      const maxY = Math.max(...near.map((p) => p.y));
      const w = Math.max(this.grid.width / (zoom * 2.5), (maxX - minX) * 1.8, (maxY - minY) * 2.6);
      const h = w * 0.62;
      this.view = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
      this._clampView();
      this._applyView();
    }

    centerOn(pid) {
      const p = this.grid.provinces[pid];
      const v = this.view;
      this.view = { ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 };
      this._clampView();
      this._applyView();
    }

    zoom(factor, cx, cy) {
      const v = this.view;
      const nw = Math.min(this.grid.width * 1.05, Math.max(this.grid.width / 28, v.w / factor));
      const nh = nw * (v.h / v.w);
      if (cx === undefined) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
      const rx = (cx - v.x) / v.w;
      const ry = (cy - v.y) / v.h;
      this.view = { x: cx - rx * nw, y: cy - ry * nh, w: nw, h: nh };
      this._clampView();
      this._applyView();
    }

    _clampView() {
      const v = this.view;
      const W = this.grid.width;
      const H = this.grid.height;
      v.x = Math.min(Math.max(v.x, -v.w * 0.3), W - v.w * 0.7);
      v.y = Math.min(Math.max(v.y, -v.h * 0.3), H - v.h * 0.7);
    }

    _applyView() {
      const v = this.view;
      this.svg.setAttribute('viewBox', f(v.x) + ' ' + f(v.y) + ' ' + f(v.w) + ' ' + f(v.h));
      const before = this._tokenScale;
      this._updateLabelVisibility();
      if (this._tokenScale !== before) {
        this.requestStacks();
        clearTimeout(this._bTimer);
        this._bTimer = setTimeout(() => this.renderBuildings(), 120);
      }
    }

    _toMap(evt) {
      const rect = this.svg.getBoundingClientRect();
      const v = this.view;
      // preserveAspectRatio "xMidYMid meet" dönüşümü
      const scale = Math.min(rect.width / v.w, rect.height / v.h);
      const ox = (rect.width - v.w * scale) / 2;
      const oy = (rect.height - v.h * scale) / 2;
      return { x: v.x + (evt.clientX - rect.left - ox) / scale, y: v.y + (evt.clientY - rect.top - oy) / scale, scale };
    }

    _bindInput() {
      const svg = this.svg;
      const opts = this.abort ? { signal: this.abort.signal } : undefined;
      const passiveOff = this.abort ? { signal: this.abort.signal, passive: false } : { passive: false };
      const pointers = new Map();
      let drag = null;
      let pinch = null;
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const p = this._toMap(e);
        this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
      }, passiveOff);
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          // İki parmakla yakınlaştırma
          const [a, b] = [...pointers.values()];
          const mid = this._toMap({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
          pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), w0: this.view.w, mid };
          drag = null;
          return;
        }
        const p = this._toMap(e);
        drag = { sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, scale: p.scale, moved: false };
      }, opts);
      window.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pointers.size >= 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 10) this.zoom((this.view.w / pinch.w0) * (d / pinch.d0), pinch.mid.x, pinch.mid.y);
          return;
        }
        if (drag) {
          const dx = e.clientX - drag.sx;
          const dy = e.clientY - drag.sy;
          if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
          if (drag.moved) {
            this.view.x = drag.vx - dx / drag.scale;
            this.view.y = drag.vy - dy / drag.scale;
            this._clampView();
            this._applyView();
            svg.classList.add('dragging');
          }
        }
      }, opts);
      const end = (e) => {
        pointers.delete(e.pointerId);
        if (pinch) {
          if (pointers.size < 2) pinch = null;
          drag = null;
          return;
        }
        if (!drag) return;
        const wasDrag = drag.moved;
        drag = null;
        svg.classList.remove('dragging');
        if (wasDrag || e.type === 'pointercancel') return;
        const stackEl = e.target.closest?.('.stack');
        if (stackEl && svg.contains(stackEl)) {
          this.handlers.onStackClick?.(Number(stackEl.getAttribute('data-stack')));
          return;
        }
        const target = e.target.closest?.('.prov');
        if (target && svg.contains(target)) {
          const pid = Number(target.getAttribute('data-id'));
          this.handlers.onClick?.(pid, this.game.state.owner[pid]);
        }
      };
      window.addEventListener('pointerup', end, opts);
      window.addEventListener('pointercancel', end, opts);
      svg.addEventListener('pointermove', (e) => {
        if (drag?.moved || pinch || e.pointerType === 'touch') return;
        const stackEl = e.target.closest?.('.stack');
        if (stackEl) {
          this.handlers.onStackHover?.(Number(stackEl.getAttribute('data-stack')), e);
          return;
        }
        const target = e.target.closest?.('.prov');
        if (target) {
          const pid = Number(target.getAttribute('data-id'));
          this.handlers.onHover?.(pid, this.game.state.owner[pid], e);
        } else this.handlers.onHover?.(null, null, e);
      }, opts);
      svg.addEventListener('pointerleave', (e) => this.handlers.onHover?.(null, null, e), opts);
    }
  }

  MH.MapView = MapView;
})((globalThis.MH = globalThis.MH || {}));
