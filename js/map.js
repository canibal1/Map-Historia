/*
 * Map Historia — etkileşimli SVG harita (AC 1.2, 3.2).
 * Eyalet sahipliği değiştiğinde ilgili altıgen ve sınırlar anında yeniden çizilir.
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
      this._buildEdges();
      this._build();
      this._bindInput();
      this.resetView();

      game.on('province', ({ id }) => {
        this._fillHex(id);
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
      game.on('month', () => {
        if (this.mode === 'diplomatic') {
          this.dirty.fills = true;
          this.requestRender();
        }
      });
    }

    // Her altıgenin 6 kenarı ve o kenarın karşısındaki komşu eyalet
    _buildEdges() {
      const { provinces, hexRadiusPx: r, hexCorners } = this.grid;
      this.edges = provinces.map((p) => {
        const c = hexCorners(p.x, p.y, r);
        const out = [];
        for (let i = 0; i < 6; i++) {
          const a = c[i];
          const b = c[(i + 1) % 6];
          const ex = p.x + (a[0] + b[0] - 2 * p.x);
          const ey = p.y + (a[1] + b[1] - 2 * p.y);
          let nb = null;
          for (const n of p.neighbors) {
            const q = provinces[n];
            if (Math.abs(q.x - ex) < 3 && Math.abs(q.y - ey) < 3) { nb = n; break; }
          }
          out.push({ a, b, nb });
        }
        return out;
      });
    }

    _build() {
      const svg = this.svg;
      svg.innerHTML = '';
      svg.setAttribute('xmlns', NS);
      const defs = el('defs', {}, svg);
      const pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'rgba(160,20,20,.55)', 'stroke-width': 2.2 }, pat);
      const grad = el('radialGradient', { id: 'sea', cx: '50%', cy: '45%', r: '75%' }, defs);
      el('stop', { offset: '0%', 'stop-color': 'var(--sea-1)' }, grad);
      el('stop', { offset: '100%', 'stop-color': 'var(--sea-2)' }, grad);

      this.root = el('g', {}, svg);
      el('rect', { x: -2000, y: -2000, width: this.grid.width + 4000, height: this.grid.height + 4000, fill: 'url(#sea)' }, this.root);
      this.hexLayer = el('g', { class: 'hexes' }, this.root);
      const r = this.grid.hexRadiusPx + 0.35;
      this.hexEls = this.grid.provinces.map((p) => {
        const pts = this.grid.hexCorners(p.x, p.y, r).map((c) => f(c[0]) + ',' + f(c[1])).join(' ');
        return el('polygon', { points: pts, 'data-id': p.id, class: 'hex' }, this.hexLayer);
      });
      this.warLayer = el('path', { class: 'war-hatch', fill: 'url(#hatch)' }, this.root);
      this.coastPath = el('path', { class: 'coast' }, this.root);
      this.borderPath = el('path', { class: 'borders' }, this.root);
      this.enemyPath = el('path', { class: 'enemy-outline' }, this.root);
      this.playerPath = el('path', { class: 'player-outline' }, this.root);
      this.selectPath = el('path', { class: 'select-outline' }, this.root);
      this.capitalLayer = el('g', { class: 'capitals' }, this.root);
      this.labelLayer = el('g', { class: 'labels' }, this.root);

      let coast = '';
      this.edges.forEach((edges) => {
        for (const e of edges) if (e.nb === null) coast += 'M' + f(e.a[0]) + ' ' + f(e.a[1]) + 'L' + f(e.b[0]) + ' ' + f(e.b[1]);
      });
      this.coastPath.setAttribute('d', coast);
      this.requestRender();
    }

    // ------------------------------------------------------------ çizim
    requestRender() {
      if (this._raf) return;
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
      this._raf = raf(() => {
        this._raf = null;
        this.render();
      });
    }

    render() {
      if (this.dirty.fills) {
        this.grid.provinces.forEach((p) => this._fillHex(p.id));
        this.dirty.fills = false;
      }
      if (this.dirty.borders) {
        this._renderBorders();
        this.dirty.borders = false;
      }
      if (this.dirty.labels) {
        this._renderLabels();
        this.dirty.labels = false;
      }
    }

    colorOf(owner) {
      const g = this.game;
      if (!owner) return '#777';
      if (this.mode === 'political') return g.nation(owner).color;
      const ref = this.focusId;
      if (!ref) return g.nation(owner).color;
      if (owner === ref) return '#f4d35e';
      if (g.warBetween(ref, owner)) return '#c0392b';
      if (g.isAllied(ref, owner)) return '#3d7dd8';
      if (g.hasTrade(ref, owner)) return '#3aa17e';
      const op = g.opinion(owner, ref);
      // −100 kırmızımsı … +100 yeşilimsi
      const t = (op + 100) / 200;
      const rC = Math.round(196 - 90 * t);
      const gC = Math.round(120 + 70 * t);
      const bC = Math.round(110 + 20 * t);
      return 'rgb(' + rC + ',' + gC + ',' + bC + ')';
    }

    _fillHex(id) {
      const owner = this.game.state.owner[id];
      this.hexEls[id].setAttribute('fill', this.colorOf(owner));
    }

    _flash(id) {
      const node = this.hexEls[id];
      node.classList.remove('flash');
      // reflow ile animasyonu yeniden başlat
      void node.getBBox?.();
      node.classList.add('flash');
      setTimeout(() => node.classList.remove('flash'), 1400);
    }

    _outline(predicate) {
      let d = '';
      const owner = this.game.state.owner;
      this.edges.forEach((edges, pid) => {
        if (!predicate(owner[pid])) return;
        for (const e of edges) {
          if (e.nb !== null && predicate(owner[e.nb])) continue;
          d += 'M' + f(e.a[0]) + ' ' + f(e.a[1]) + 'L' + f(e.b[0]) + ' ' + f(e.b[1]);
        }
      });
      return d;
    }

    _renderBorders() {
      const g = this.game;
      const owner = g.state.owner;
      let d = '';
      this.edges.forEach((edges, pid) => {
        for (const e of edges) {
          if (e.nb === null || e.nb < pid || owner[e.nb] === owner[pid]) continue;
          d += 'M' + f(e.a[0]) + ' ' + f(e.a[1]) + 'L' + f(e.b[0]) + ' ' + f(e.b[1]);
        }
      });
      this.borderPath.setAttribute('d', d);

      const pid = g.state.playerId;
      this.playerPath.setAttribute('d', pid ? this._outline((o) => o === pid) : '');
      const enemies = new Set(pid ? g.enemiesOf(pid) : []);
      this.enemyPath.setAttribute('d', enemies.size ? this._outline((o) => enemies.has(o)) : '');

      // Oyuncunun düşmanlarının toprakları taralı gösterilir
      let hatch = '';
      if (enemies.size) {
        const r = this.grid.hexRadiusPx + 0.35;
        this.grid.provinces.forEach((p) => {
          if (!enemies.has(owner[p.id])) return;
          const c = this.grid.hexCorners(p.x, p.y, r);
          hatch += 'M' + c.map((pt) => f(pt[0]) + ' ' + f(pt[1])).join('L') + 'Z';
        });
      }
      this.warLayer.setAttribute('d', hatch);
      this.selectPath.setAttribute('d', this.selected && this.selected !== pid ? this._outline((o) => o === this.selected) : '');
    }

    _renderLabels() {
      const g = this.game;
      const { provinces } = this.grid;
      const owner = g.state.owner;
      this.labelLayer.innerHTML = '';
      this.capitalLayer.innerHTML = '';
      for (const nat of g.aliveNations()) {
        // En büyük bitişik toprak parçasının ağırlık merkezine yaz
        const mine = new Set(g.provincesOf(nat.id));
        let best = [];
        const seen = new Set();
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
          if (comp.length > best.length) best = comp;
        }
        if (!best.length) continue;
        const cx = best.reduce((s, i) => s + provinces[i].x, 0) / best.length;
        const cy = best.reduce((s, i) => s + provinces[i].y, 0) / best.length;
        const size = Math.max(6, Math.min(17, Math.sqrt(best.length) * 2.4));
        if (best.length >= 2) {
          const t = el('text', { x: f(cx), y: f(cy), 'font-size': f(size), class: 'nation-label' + (nat.id === g.state.playerId ? ' is-player' : '') }, this.labelLayer);
          t.textContent = nat.name;
        }
        const cap = provinces[nat.capital];
        if (cap && owner[nat.capital] === nat.id) {
          el('circle', { cx: f(cap.x), cy: f(cap.y), r: 2.6, class: 'capital' + (nat.id === g.state.playerId ? ' is-player' : '') }, this.capitalLayer);
        }
      }
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
    }

    // ------------------------------------------------------------ yakınlaştırma ve kaydırma
    resetView() {
      this.view = { x: 0, y: 0, w: this.grid.width, h: this.grid.height };
      this._applyView();
    }

    focusOn(id, zoom = 2.2) {
      const ids = this.game.provincesOf(id);
      if (!ids.length) return;
      const ps = ids.map((i) => this.grid.provinces[i]);
      const minX = Math.min(...ps.map((p) => p.x));
      const maxX = Math.max(...ps.map((p) => p.x));
      const minY = Math.min(...ps.map((p) => p.y));
      const maxY = Math.max(...ps.map((p) => p.y));
      const w = Math.max(this.grid.width / zoom, (maxX - minX) * 1.6);
      const h = w * (this.grid.height / this.grid.width);
      this.view = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
      this._clampView();
      this._applyView();
    }

    zoom(factor, cx, cy) {
      const v = this.view;
      const nw = Math.min(this.grid.width * 1.2, Math.max(this.grid.width / 8, v.w / factor));
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
      v.x = Math.min(Math.max(v.x, -v.w * 0.4), W - v.w * 0.6);
      v.y = Math.min(Math.max(v.y, -v.h * 0.4), H - v.h * 0.6);
    }

    _applyView() {
      const v = this.view;
      this.svg.setAttribute('viewBox', f(v.x) + ' ' + f(v.y) + ' ' + f(v.w) + ' ' + f(v.h));
      this.svg.classList.toggle('zoomed', v.w < this.grid.width * 0.6);
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
      let drag = null;
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const p = this._toMap(e);
        this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
      }, { passive: false });
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const p = this._toMap(e);
        drag = { sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, scale: p.scale, moved: false };
      });
      window.addEventListener('pointermove', (e) => {
        if (drag) {
          const dx = e.clientX - drag.sx;
          const dy = e.clientY - drag.sy;
          if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
          if (drag.moved) {
            this.view.x = drag.vx - dx / drag.scale;
            this.view.y = drag.vy - dy / drag.scale;
            this._clampView();
            this._applyView();
            svg.classList.add('dragging');
          }
        }
      });
      window.addEventListener('pointerup', (e) => {
        if (!drag) return;
        const wasDrag = drag.moved;
        drag = null;
        svg.classList.remove('dragging');
        if (wasDrag) return;
        const target = e.target.closest?.('.hex');
        if (target && svg.contains(target)) {
          const pid = Number(target.getAttribute('data-id'));
          this.handlers.onClick?.(pid, this.game.state.owner[pid]);
        }
      });
      svg.addEventListener('pointermove', (e) => {
        if (drag?.moved) return;
        const target = e.target.closest?.('.hex');
        if (target) {
          const pid = Number(target.getAttribute('data-id'));
          this.handlers.onHover?.(pid, this.game.state.owner[pid], e);
        } else this.handlers.onHover?.(null, null, e);
      });
      svg.addEventListener('pointerleave', (e) => this.handlers.onHover?.(null, null, e));
    }
  }

  MH.MapView = MapView;
})((globalThis.MH = globalThis.MH || {}));
