/*
 * Map Historia — arayüz.
 * Ana menü (AC 1.1) → ulus seçimi (AC 1.2, 1.3) → oyun ekranı (AC 2–4).
 */
(function (MH) {
  'use strict';

  const SAVE_KEY = 'mapHistoria.save.v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const soldiers = (k) => Math.round(k * 1000).toLocaleString('tr-TR');
  const num = (v) => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v));
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };

  /** [etiket, değer, birim] → { text, tone } */
  function formatEffect([label, value, unit]) {
    if (value === null || value === undefined) return { text: label, tone: 'info' };
    if (unit === 'abs') return { text: label + ': ' + num(value), tone: 'info' };
    let v;
    if (unit === 'k') v = (value > 0 ? '+' : '−') + soldiers(Math.abs(value));
    else if (unit === '%') v = (value > 0 ? '+%' : '−%') + Math.abs(value);
    else if (unit === 'pp') v = signed(value) + ' puan';
    else v = signed(value);
    let good = value > 0;
    if (/yorgunluğu/i.test(label)) good = !good;
    const tone = /Vergi/.test(label) ? 'info' : good ? 'good' : 'bad';
    return { text: label + ' ' + v, tone };
  }

  function effectList(effects) {
    if (!effects?.length) return '';
    return '<ul class="fx">' + effects.map((e) => {
      const { text, tone } = formatEffect(e);
      return '<li class="' + tone + '">' + esc(text) + '</li>';
    }).join('') + '</ul>';
  }

  function opinionClass(v) {
    if (v >= 40) return 'good';
    if (v <= -30) return 'bad';
    return 'info';
  }

  function stabilityTone(v) {
    return v >= 60 ? 'good' : v >= 35 ? 'warn' : 'bad';
  }

  class App {
    constructor() {
      this.game = null;
      this.map = null;
      this.mode = 'menu';
      this.selected = null;
      this.tab = 'overview';
      this.resumeSpeed = 1;
      this._loop = this._loop.bind(this);
      this._bindStatic();
      this.showMenu();
    }

    // ============================================================ menü (AC 1.1)
    showMenu() {
      this.mode = 'menu';
      if (this.game) this.game.state.speed = 0;
      $('#screen-game').hidden = true;
      $('#screen-menu').hidden = false;
      const list = $('#scenario-list');
      list.innerHTML = MH.SCENARIOS.map((sc) => `
        <article class="scenario-card" data-id="${sc.id}" tabindex="0" role="button" aria-label="${esc(sc.title)} senaryosunu seç">
          <div class="sc-year">${sc.year}</div>
          <div class="sc-body">
            <h3>${esc(sc.title)}</h3>
            <p class="sc-sub">${esc(sc.subtitle)} · ${esc(MH.util.formatDay(MH.util.parseDay(sc.startDate)))}</p>
            <p class="sc-desc">${esc(sc.description)}</p>
            <div class="sc-foot"><span>${sc.nations.length} oynanabilir ulus</span><span class="sc-go">Dönemi seç →</span></div>
          </div>
        </article>`).join('');
      list.querySelectorAll('.scenario-card').forEach((card) => {
        const go = () => this.startScenario(card.dataset.id);
        card.addEventListener('click', go);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
      const save = storage.get(SAVE_KEY);
      const btn = $('#btn-continue');
      btn.hidden = !save;
      if (save) {
        try {
          const st = JSON.parse(save);
          const nat = st.nations[st.playerId];
          btn.textContent = 'Devam et: ' + nat.name + ' · ' + MH.util.formatDay(st.day);
        } catch {
          btn.hidden = true;
        }
      }
    }

    /** Senaryonun harita verisini yükler (ilk açılışta birkaç saniye sürebilir) */
    async _loadMap(scenarioId) {
      const sc = MH.getScenario(scenarioId);
      if (!sc) throw new Error('Bilinmeyen senaryo');
      if (MH.MAPDATA?.[sc.map]) return;
      const box = $('#loading');
      box.hidden = false;
      box.querySelector('span').textContent = sc.year + ' haritası yükleniyor…';
      try {
        await MH.geo.load(sc.map);
      } finally {
        box.hidden = true;
      }
    }

    async startScenario(id) {
      try {
        await this._loadMap(id);
      } catch (err) {
        this.toast('Harita yüklenemedi', [[err.message, null]], 'bad');
        return;
      }
      this._setGame(MH.Game.create(id));
      this.mode = 'pick';
      this.selected = null;
      this.pickFilter = '';
      this._enterGameScreen();
      this.renderPick();
    }

    async continueSaved(json = storage.get(SAVE_KEY)) {
      let game;
      try {
        const st = JSON.parse(json);
        await this._loadMap(st.scenarioId);
        game = MH.Game.load(st);
      } catch (err) {
        this.toast('Kayıt yüklenemedi', [[err.message, null]], 'bad');
        return;
      }
      this._setGame(game);
      this._enterGameScreen();
      this.startPlay(true);
    }

    _setGame(game) {
      this.game = game;
      this.map?.destroy();
      const svg = $('#map');
      this.map = new MH.MapView(svg, game, {
        onClick: (pid, owner) => this.onMapClick(pid, owner),
        onHover: (pid, owner, e) => this.onMapHover(pid, owner, e),
        onStackClick: (sid) => this.onStackClick(sid),
        onStackHover: (sid, e) => this.onStackHover(sid, e),
      });
      game.on('event', ({ prevSpeed }) => {
        if (prevSpeed > 0) this._resumeAfterEvent = true;
        this.showEvent();
      });
      game.on('speed', () => this.renderSpeed());
      game.on('gameover', () => this.showGameOver());
      game.on('world', ({ event, nationId, result }) => {
        this.toast(event.icon + ' ' + event.title, [[game.nation(nationId).name + ': ' + result.message, null]], 'world');
      });
      game.on('log', (entry) => {
        if (this.mode === 'play' && entry.type === 'war' && entry.nations.includes(game.state.playerId) === false) {
          // dünya savaşlarını kısa bildirim olarak göster
          if (/savaş ilan etti/.test(entry.text)) this.toast('⚔️ ' + entry.text, [], 'world');
        }
        if (this.tab === 'log') this._dirtySide = true;
      });
      game.on('battle', ({ winner, loser, lossL }) => {
        const pid = game.state.playerId;
        const won = winner === pid;
        const other = game.nation(won ? loser : winner).name;
        this.flashBattle(won ? '🏆 ' + other + ' ordusu yenildi (−' + soldiers(lossL) + ')' : '💥 ' + other + ' karşısında yenilgi (−' + soldiers(lossL) + ')', won);
      });
      game.on('month', () => { this._dirtySide = true; });
      game.on('siege', ({ by, province }) => this.toast('🏰 ' + MH.places.nameOf(game, province) + ' kuşatma altında', [[game.nation(by).name + ' kuşatıyor. Ordularınızı gönderin!', null]], 'bad'));
      game.on('buildings', ({ completed }) => {
        if (completed && completed.owner === game.state.playerId) {
          const def = MH.BUILDINGS[completed.type];
          this.toast(def.icon + ' ' + def.label + ' tamamlandı', [[MH.places.nameOf(game, completed.pid), null]], 'good');
        }
        this._dirtySide = true;
      });
      game.on('goal', (goal) => this.toast('🎯 Hedef tamamlandı', [[goal.label, null]], 'good'));
      game.on('scenarioEnd', () => this.showEnding());
      game.on('province', () => { this._dirtySide = true; });
    }

    _enterGameScreen() {
      $('#screen-menu').hidden = true;
      $('#screen-game').hidden = false;
      $('#map-mode').value = 'political';
      this.map.setMode('political');
    }

    // ============================================================ ulus seçimi (AC 1.2, 1.3)
    renderPick() {
      const g = this.game;
      document.body.dataset.mode = 'pick';
      $('#pick-panel').hidden = false;
      $('#play-panel').hidden = true;
      $('#tb-nation').innerHTML = `<div class="tb-title">${esc(g.scenario.title)}</div><div class="tb-sub">Ulusunu seç</div>`;
      $('#tb-stats').innerHTML = '<span class="hint">Haritada bir ülkeye tıkla ya da listeden bir lider seç.</span>';
      $('#tb-date').textContent = MH.util.formatDay(g.state.day);
      this.renderSpeed();

      const q = (this.pickFilter || '').toLocaleLowerCase('tr');
      const nations = g.aliveNations()
        .filter((n) => !q || n.name.toLocaleLowerCase('tr').includes(q) || n.leader.toLocaleLowerCase('tr').includes(q))
        .sort((a, b) => (a.generic - b.generic) || g.provincesOf(b.id).length - g.provincesOf(a.id).length);
      const sel = this.selected ? g.summary(this.selected) : null;
      $('#pick-panel').innerHTML = `
        <div class="panel-head">
          <button class="btn small ghost" id="pick-back">← Dönemler</button>
          <h2>${g.scenario.year} · ${esc(g.scenario.title)}</h2>
        </div>
        ${sel ? this._summaryHtml(sel, true, this._goalsHtml(MH.goals.goalsFor(g, sel.id), false)) : '<p class="muted pad">Kontrol etmek istediğiniz ülkeyi seçin. Büyük güçler daha kolay, küçük devletler daha zorlu bir başlangıç sunar.</p>'}
        <h3 class="list-title">Uluslar ve liderler <small class="muted">(${g.aliveNations().length})</small></h3>
        <div class="pad"><input type="search" id="pick-search" class="search" placeholder="Ülke ya da lider ara…" value="${esc(this.pickFilter || '')}" aria-label="Ülke ara"></div>
        <ul class="nation-list">
          ${nations.map((n) => `
            <li class="${n.id === this.selected ? 'active' : ''}" data-id="${n.id}" tabindex="0">
              <span class="swatch" style="background:${n.color}"></span>
              <span class="nl-name">${esc(n.name)}<small>${esc(n.leader)}</small></span>
              <span class="nl-meta">${g.provincesOf(n.id).length} eyalet</span>
            </li>`).join('')}
        </ul>`;
      $('#pick-back').addEventListener('click', () => this.showMenu());
      const search = $('#pick-search');
      search.addEventListener('input', () => {
        this.pickFilter = search.value;
        const pos = search.selectionStart;
        this.renderPick();
        const again = $('#pick-search');
        again.focus();
        again.setSelectionRange(pos, pos);
      });
      $('#pick-start')?.addEventListener('click', () => this.startPlay());
      $('#pick-panel').querySelectorAll('.nation-list li').forEach((li) => {
        const go = () => this.pickNation(li.dataset.id, true);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      });
    }

    pickNation(id, focus = false) {
      this.selected = id;
      this.map.select(id);
      if (focus) this.map.focusOn(id, 1.8);
      this.renderPick();
      $('#pick-panel').scrollTop = 0;
    }

    _difficulty(s) {
      const score = s.provinces * 0.6 + s.army * 0.3 - s.wars.length * 15 + s.allies.length * 5 - (s.stability < 40 ? 10 : 0);
      if (score > 45) return ['Kolay', 'good'];
      if (score > 18) return ['Orta', 'warn'];
      return ['Zor', 'bad'];
    }

    _summaryHtml(s, pickMode, extra = '') {
      const [diff, diffTone] = this._difficulty(s);
      const chips = (arr, tone) => (arr.length ? arr.map((x) => `<span class="chip ${tone}">${esc(x)}</span>`).join('') : '<span class="muted">—</span>');
      const rel = (arr, tone) => (arr.length ? arr.map((x) => `<span class="chip ${tone}">${esc(x.name)} <b>${x.value > 0 ? '+' : ''}${x.value}</b></span>`).join('') : '<span class="muted">—</span>');
      return `
        <div class="summary">
          <div class="sum-head" style="--nc:${s.color}">
            <div class="banner"></div>
            <div>
              <h2>${esc(s.name)}</h2>
              <p>${esc(s.leader)}${pickMode ? ` · Zorluk: <span class="tone-${diffTone}">${diff}</span>` : ''}</p>
            </div>
          </div>
          <h4>Kaynaklar</h4>
          <dl class="stat-grid">
            <div><dt>Hazine</dt><dd>${num(s.gold)} <small>altın</small></dd></div>
            <div><dt>Aylık gelir</dt><dd class="tone-${s.budget.total >= 0 ? 'good' : 'bad'}">${signed(s.budget.total)}</dd></div>
            <div><dt>Eyaletler</dt><dd>${s.provinces}</dd></div>
            <div><dt>Gelişim</dt><dd>${s.development}</dd></div>
            <div><dt>İstikrar</dt><dd class="tone-${stabilityTone(s.stability)}">${s.stability}</dd></div>
            <div><dt>Vergi</dt><dd>%${s.tax} · ${esc(MH.FOCUS[s.focus].label)}</dd></div>
          </dl>
          <h4>Askeri güç</h4>
          <dl class="stat-grid">
            <div><dt>Ordu</dt><dd>${soldiers(s.army)}</dd></div>
            <div><dt>İnsan gücü</dt><dd>${soldiers(s.manpower)}</dd></div>
            <div><dt>Güç sırası</dt><dd>${s.powerRank}. / ${s.totalNations}</dd></div>
          </dl>
          <h4>Diplomatik durum</h4>
          <div class="dip-rows">
            <div><span>Müttefikler</span><div>${chips(s.allies, 'ally')}</div></div>
            <div><span>Savaşta</span><div>${chips(s.wars, 'enemy')}</div></div>
            <div><span>Ticaret</span><div>${chips(s.trade, 'trade')}</div></div>
            <div><span>Dostlar</span><div>${rel(s.friends, 'good')}</div></div>
            <div><span>Rakipler</span><div>${rel(s.rivals, 'bad')}</div></div>
            <div><span>Komşular</span><div>${chips(s.neighbors.slice(0, 8), '')}${s.neighbors.length > 8 ? ' <span class="muted">+' + (s.neighbors.length - 8) + '</span>' : ''}</div></div>
          </div>
          ${extra}
          ${pickMode ? `<button class="btn primary wide" id="pick-start">▶ ${esc(s.name)} olarak başla</button>` : ''}
        </div>`;
    }

    // ============================================================ oyun
    startPlay(loaded = false) {
      const g = this.game;
      if (!loaded) g.setPlayer(this.selected);
      this.mode = 'play';
      document.body.dataset.mode = 'play';
      this.selected = null;
      this.target = null;
      this.selectedStack = null;
      this.provinceSel = null;
      $('#order-hint').hidden = true;
      this.tab = 'overview';
      this.map.select(null);
      this.map.setFocus(g.state.playerId);
      this.map.refreshAll();
      this.map.focusOn(g.state.playerId, 1.6);
      $('#pick-panel').hidden = true;
      $('#play-panel').hidden = false;
      this.renderTopbar();
      this.renderSide();
      this.renderSpeed();
      if (!loaded) {
        MH.events.checkScheduled(g);
        this.toast('Hoş geldiniz, ' + g.player.leader, [['Oyunu başlatmak için ▶ düğmesine veya Boşluk tuşuna basın.', null]], 'info');
      }
      if (g.currentEvent()) this.showEvent();
      this._last = performance.now();
      this._acc = 0;
      if (!this._running) {
        this._running = true;
        requestAnimationFrame(this._loop);
      }
    }

    // Zaman akışı (AC 3.1)
    _loop(now) {
      const g = this.game;
      const dt = Math.min(250, now - (this._last || now));
      this._last = now;
      if (this.mode === 'play' && g && g.state.speed > 0 && !g.currentEvent() && !g.state.gameOver) {
        this._acc += dt;
        const ms = g.msPerDay();
        let n = 0;
        while (this._acc >= ms && n < 8 && g.state.speed > 0 && !g.currentEvent()) {
          g.tick();
          this._acc -= ms;
          n++;
        }
        if (n) {
          this.renderTopbar();
          if (this._dirtySide || now - (this._lastSide || 0) > 1000) {
            this.renderSide();
            this._lastSide = now;
            this._dirtySide = false;
          }
        }
      } else this._acc = 0;
      requestAnimationFrame(this._loop);
    }

    setSpeed(speed) {
      const g = this.game;
      if (this.mode !== 'play' || !g) return;
      if (speed > 0 && g.currentEvent()) {
        this.showEvent();
        return;
      }
      g.setSpeed(speed);
      if (speed > 0) this.resumeSpeed = speed;
    }

    togglePause() {
      if (!this.game) return;
      this.setSpeed(this.game.state.speed > 0 ? 0 : this.resumeSpeed || 1);
    }

    renderSpeed() {
      const speed = this.game?.state.speed ?? 0;
      document.querySelectorAll('.speed button').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.speed) === speed);
        b.disabled = this.mode !== 'play';
      });
      $('#screen-game').classList.toggle('paused', speed === 0 && this.mode === 'play');
    }

    renderTopbar() {
      const g = this.game;
      const p = g.player;
      if (!p) return;
      const b = g.budget(p.id);
      $('#tb-nation').innerHTML = `<span class="tb-flag" style="background:${p.color}"></span><div><div class="tb-title">${esc(p.name)}</div><div class="tb-sub">${esc(p.leader)}</div></div>`;
      const stab = Math.round(p.stability);
      $('#tb-stats').innerHTML = `
        <span class="stat" title="Hazine · aylık: vergi ${num(b.tax)} + ticaret ${num(b.trade)} − ordu ${num(b.upkeep)}">💰 <b class="${p.gold < 0 ? 'tone-bad' : ''}">${num(Math.round(p.gold))}</b> <small class="tone-${b.total >= 0 ? 'good' : 'bad'}">${signed(b.total)}/ay</small></span>
        <span class="stat" title="İnsan gücü (en fazla ${soldiers(g.maxManpower(p.id))})">👥 <b>${soldiers(p.manpower)}</b></span>
        <span class="stat" title="Ordu büyüklüğü">⚔️ <b>${soldiers(p.army)}</b></span>
        <span class="stat" title="İstikrar (hedef ${g.stabilityTarget(p.id)})">⚖️ <b class="tone-${stabilityTone(stab)}">${stab}</b></span>
        ${p.warExhaustion >= 1 ? `<span class="stat" title="Savaş yorgunluğu">🏳️ <b class="tone-bad">${Math.round(p.warExhaustion)}</b></span>` : ''}
        ${g.warsOf(p.id).length ? `<span class="stat at-war" title="Aktif savaşlar">🔥 ${g.warsOf(p.id).length} savaş</span>` : ''}`;
      $('#tb-date').textContent = MH.util.formatDay(g.state.day);
    }

    renderSide() {
      const g = this.game;
      if (!g.player) return;
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
      const body = $('#tab-body');
      const scroll = body.scrollTop;
      const html = {
        overview: () => this._overviewTab(),
        economy: () => this._economyTab(),
        military: () => this._militaryTab(),
        diplomacy: () => this._diplomacyTab(),
        log: () => this._logTab(),
      }[this.tab]();
      // Kaydırıcı sürüklenirken yeniden çizmeyi atla
      if (body.contains(document.activeElement) && document.activeElement.type === 'range') return;
      body.innerHTML = html;
      body.scrollTop = scroll;
      this._bindTab();
    }

    _overviewTab() {
      const g = this.game;
      const ended = g.state.ended && !g.state.gameOver
        ? `<button class="btn wide" data-act="showEnding">📜 Senaryo sonucunu yeniden gör</button>` : '';
      const sel = this.provinceSel;
      const prov = sel !== undefined && sel !== null && (g.state.owner[sel] === g.state.playerId || g.state.owner[sel] === null)
        ? this._provinceHtml(sel, true) : '';
      return prov + this._summaryHtml(g.summary(g.state.playerId), false, this._goalsHtml(g.state.goals, true) + ended) +
        `<p class="muted pad small">İpucu: Kendi eyaletinize tıklayarak yapı inşa edin; başka bir ülkeye tıklayarak diplomasi ekranını açın. "Diplomatik" harita modu komşularınızın tutumunu gösterir.</p>`;
    }

    // AC 2.1 — ekonomi
    _economyTab() {
      const g = this.game;
      const p = g.player;
      const b = g.budget(p.id);
      const wait = Math.max(0, Math.ceil(p.focusChangedDay + 180 - g.state.day));
      return `
        <section class="card">
          <h3>Vergi oranı</h3>
          <div class="tax-row">
            <input type="range" id="tax" min="0" max="50" step="5" value="${p.tax}" aria-label="Vergi oranı">
            <output id="tax-out">%${p.tax}</output>
          </div>
          <p class="muted small" id="tax-preview">Vergi artışı anında istikrarı düşürür (her 5 puan için −2), indirim ise artırır. Yüksek vergi uzun vadede istikrar hedefini düşürür.</p>
        </section>
        <section class="card">
          <h3>Aylık bütçe</h3>
          <table class="budget">
            <tr><td>Vergi geliri</td><td class="tone-good">+${num(b.tax)}</td></tr>
            <tr><td>Ticaret anlaşmaları (${p.trade.length})</td><td class="tone-good">+${num(b.trade)}</td></tr>
            <tr><td>Pazarlar (${g.buildingsOf(p.id, 'market').length})</td><td class="tone-good">+${num(b.buildings)}</td></tr>
            <tr><td>Ordu ve kale bakımı</td><td class="tone-bad">−${num(b.upkeep)}</td></tr>
            <tr class="total"><td>Net</td><td class="tone-${b.total >= 0 ? 'good' : 'bad'}">${signed(b.total)}</td></tr>
          </table>
          <p class="muted small">İstikrar hedefi: <b>${g.stabilityTarget(p.id)}</b> · İnsan gücü artışı: +${soldiers(g.manpowerGrowth(p.id))}/ay</p>
        </section>
        ${this._buildingsSummaryHtml()}
        <section class="card">
          <h3>Halkın gönlü</h3>
          ${(() => {
            const wait = Math.max(0, Math.ceil((p.festivalDay ?? -Infinity) + 365 - g.state.day));
            const cost = g.festivalCost(p.id);
            return `<div class="btn-row"><button class="btn" data-act="festival" ${wait || p.gold < cost ? 'disabled' : ''}>🎉 Şenlik düzenle <small>${cost} altın</small></button></div>
              <p class="muted small">${wait ? 'Yeni şenlik için ' + wait + ' gün beklenmeli.' : 'İstikrar +8, savaş yorgunluğu −5. Yılda bir kez.'}</p>`;
          })()}
        </section>
        <section class="card">
          <h3>Üretim odağı</h3>
          ${wait ? `<p class="muted small">Yeni değişiklik için ${wait} gün beklenmeli.</p>` : '<p class="muted small">Odak değiştirmek istikrarı 3 puan düşürür (180 gün bekleme süresi).</p>'}
          <div class="focus-grid">
            ${Object.entries(MH.FOCUS).map(([k, v]) => `
              <button class="focus ${p.focus === k ? 'active' : ''}" data-focus="${k}" ${wait && p.focus !== k ? 'disabled' : ''}>
                <b>${v.label}</b><small>${v.desc}</small>
              </button>`).join('')}
          </div>
        </section>
        <section class="card">
          <h3>Ticaret anlaşmaları</h3>
          ${p.trade.length ? `<ul class="rows">${p.trade.map((t) => `
            <li><span class="swatch" style="background:${g.nation(t).color}"></span>${esc(g.nation(t).name)}
              <button class="btn tiny ghost" data-act="cancelTrade" data-target="${t}">İptal et</button></li>`).join('')}</ul>`
            : '<p class="muted small">Henüz ticaret anlaşmanız yok. Haritada bir ülke seçip Diplomasi sekmesinden önerin.</p>'}
        </section>`;
    }

    _unclaimedHtml(pid) {
      const g = this.game;
      const me = g.state.playerId;
      const p = g.grid.provinces[pid];
      const info = g.colonizeInfo(me, pid);
      const err = g.canColonize(me, pid);
      const busy = g.state.colonizing.find((c) => c.pid === pid);
      return `<section class="card province">
        <div class="prov-head"><div><h3>🏕️ ${esc(MH.places.nameOf(g, pid))}</h3>
          <p class="muted small">Sahipsiz topraklar · ${Math.round(p.area).toLocaleString('tr-TR')} km²${p.coastal ? ' · ⚓ Kıyı' : ''}</p></div>
          <button class="btn tiny ghost" data-act="closeProvince" aria-label="Kapat">✕</button></div>
        <p class="small">Bu topraklarda göçebe topluluklar ve küçük kabileler yaşıyor. Yerleşimci göndererek ülkenize katabilirsiniz.</p>
        ${busy ? `<p class="tone-warn small">${esc(g.nation(busy.owner).name)} buraya yerleşiyor: ${busy.done - g.state.day} gün</p>` : `
        <div class="btn-row"><button class="btn primary" data-act="colonize" data-pid="${pid}" ${err ? 'disabled' : ''}>🏕️ Kolonileştir · ${info.cost} altın · ${info.days} gün</button></div>
        ${err ? `<p class="muted small">${esc(err)}</p>` : `<p class="muted small">${info.overseas ? 'Okyanus aşırı koloni: maliyet ve süre iki katı.' : 'Sınırınıza komşu topraklar.'}</p>`}`}
      </section>`;
    }

    _buildingsSummaryHtml() {
      const g = this.game;
      const id = g.state.playerId;
      const counts = Object.entries(MH.BUILDINGS).map(([t, d]) => `<span class="chip">${d.icon} ${d.label} <b>${g.buildingsOf(id, t).length}</b></span>`).join('');
      const work = g.state.construction.filter((c) => c.owner === id);
      return `<section class="card">
        <h3>Yapılar</h3>
        <div class="flags">${counts}</div>
        ${work.length ? `<ul class="rows">${work.map((c) => `<li>🔨 ${MH.BUILDINGS[c.type].label} · ${esc(MH.places.nameOf(g, c.pid))}<span class="muted small" style="margin-left:auto">${c.done - g.state.day} gün</span></li>`).join('')}</ul>` : ''}
        <p class="muted small">İnşa etmek için haritada kendi eyaletinize tıklayın. Pazarlar zengin eyaletlerde, kaleler sınır boylarında en çok işe yarar.</p>
      </section>`;
    }

    _militaryTab() {
      const g = this.game;
      const p = g.player;
      const cost = g.recruitCost(p.id);
      const wars = g.warsOf(p.id);
      return `
        <section class="card">
          <h3>Ordu</h3>
          <dl class="stat-grid">
            <div><dt>Asker</dt><dd>${soldiers(p.army)}</dd></div>
            <div><dt>İnsan gücü</dt><dd>${soldiers(p.manpower)} <small>/ ${soldiers(g.maxManpower(p.id))}</small></dd></div>
            <div><dt>Kalite</dt><dd>×${num(g.quality(p.id))}</dd></div>
            <div><dt>Güç sırası</dt><dd>${g.powerRank(p.id)}.</dd></div>
          </dl>
          <div class="btn-row">
            ${[5, 10, 20].map((n) => `<button class="btn" data-act="recruit" data-n="${n}" ${p.manpower < n || p.gold < n * cost ? 'disabled' : ''}>+${soldiers(n)} <small>${num(n * cost)} altın</small></button>`).join('')}
            <button class="btn ghost" data-act="disband" data-n="5" ${p.army < 5 ? 'disabled' : ''}>−${soldiers(5)} terhis</button>
          </div>
          <div class="btn-row">
            <button class="btn" data-act="mercs" data-n="5" ${p.gold < 75 ? 'disabled' : ''} title="İnsan gücü gerektirmez">🗡️ Paralı asker +${soldiers(5)} <small>75 altın</small></button>
          </div>
          <p class="muted small">Her bin asker ayda 0,18 altın bakım ister. Ordu, cephe sayısına bölünerek savaşır.</p>
        </section>
        ${this._stacksHtml()}
        <section class="card">
          <h3>Savaşlar</h3>
          ${wars.length ? '<p class="muted small">Duruş, otomatik komutadaki ordularınızın davranışını belirler.</p>' : ''}
          ${wars.length ? wars.map((w) => {
            const enemy = w.a === p.id ? w.b : w.a;
            const score = g.warScore(w, p.id);
            const months = Math.floor((g.state.day - w.start) / 30);
            return `
              <div class="war">
                <div class="war-head"><span class="swatch" style="background:${g.nation(enemy).color}"></span><b>${esc(g.nation(enemy).name)}</b>
                  <span class="muted small">${months} ay · ordu ${soldiers(g.nation(enemy).army)}</span></div>
                <div class="stance" role="group" aria-label="Cephe duruşu">
                  ${Object.entries(MH.STANCES).map(([k, st]) => `<button class="${g.stanceOf(w, p.id) === k ? 'active' : ''}" data-act="stance" data-stance="${k}" data-target="${enemy}" title="${st.desc}">${st.label}</button>`).join('')}
                </div>
                <div class="score-bar" title="Savaş skoru ${score}"><div style="left:${50 + Math.min(0, score) / 2}%;width:${Math.abs(score) / 2}%" class="${score >= 0 ? 'pos' : 'neg'}"></div><span>${score > 0 ? '+' : ''}${score}</span></div>
                <div class="btn-row">
                  <button class="btn tiny" data-act="peace" data-type="white" data-target="${enemy}">Beyaz barış</button>
                  <button class="btn tiny" data-act="peace" data-type="demand" data-target="${enemy}" ${score < 30 ? 'disabled title="Savaş skoru en az 30 olmalı"' : ''}>Tazminat iste</button>
                  <button class="btn tiny ghost" data-act="peace" data-type="offer" data-target="${enemy}">Tazminat öde</button>
                </div>
              </div>`;
          }).join('') : '<p class="muted small">Barış içindesiniz.</p>'}
        </section>`;
    }

    // AC 2.2, 2.3 — diplomasi
    _diplomacyTab() {
      const g = this.game;
      const me = g.state.playerId;
      const t = this.target && g.nation(this.target)?.alive && this.target !== me ? this.target : null;
      const others = g.aliveNations().filter((n) => n.id !== me).sort((a, b) => g.opinion(b.id, me) - g.opinion(a.id, me));
      let html = '';
      if (t) {
        const n = g.nation(t);
        const opTheirs = g.opinion(t, me);
        const opMine = g.opinion(me, t);
        const war = g.warBetween(me, t);
        const truce = g.truceUntil(me, t);
        const allied = g.isAllied(me, t);
        const trade = g.hasTrade(me, t);
        const neighbor = g.neighborsOf(me).includes(t);
        const flags = [
          allied && '<span class="chip ally">Müttefik</span>',
          war && '<span class="chip enemy">Savaşta</span>',
          trade && '<span class="chip trade">Ticaret</span>',
          truce && `<span class="chip">Ateşkes: ${MH.util.formatDay(truce)}</span>`,
          neighbor && '<span class="chip">Komşu</span>',
        ].filter(Boolean).join('');
        html += `
          <section class="card target">
            <div class="sum-head" style="--nc:${n.color}">
              <div class="banner"></div>
              <div><h2>${esc(n.name)}</h2><p>${esc(n.leader)}</p></div>
              <button class="btn tiny ghost close" data-act="clearTarget" aria-label="Seçimi kaldır">✕</button>
            </div>
            <div class="flags">${flags || '<span class="muted small">Resmî ilişki yok</span>'}</div>
            <div class="opinion">
              <div><span>Size bakışı</span>${this._opinionBar(opTheirs)}</div>
              <div><span>Sizin bakışınız</span>${this._opinionBar(opMine)}</div>
            </div>
            <dl class="stat-grid">
              <div><dt>Eyalet</dt><dd>${g.provincesOf(t).length}</dd></div>
              <div><dt>Ordu</dt><dd>${soldiers(n.army)}</dd></div>
              <div><dt>Hazine</dt><dd>${num(Math.round(n.gold))}</dd></div>
              <div><dt>İstikrar</dt><dd class="tone-${stabilityTone(n.stability)}">${Math.round(n.stability)}</dd></div>
            </dl>
            ${this.provinceSel != null && g.state.owner[this.provinceSel] === t ? this._provinceHtml(this.provinceSel, false) : ''}
            <p class="muted small">Müttefikleri: ${n.allies.length ? n.allies.map((a) => esc(g.nation(a).name)).join(', ') : '—'}${g.enemiesOf(t).length ? ' · Savaşta: ' + g.enemiesOf(t).map((a) => esc(g.nation(a).name)).join(', ') : ''}</p>
            <div class="actions">
              ${war ? `
                <button class="btn" data-act="peace" data-type="white" data-target="${t}">🕊️ Beyaz barış öner</button>
                <button class="btn" data-act="peace" data-type="demand" data-target="${t}">💰 Tazminat talep et</button>
                <button class="btn ghost" data-act="peace" data-type="offer" data-target="${t}">Tazminat öde</button>
              ` : `
                ${trade ? `<button class="btn ghost" data-act="cancelTrade" data-target="${t}">Ticareti kes</button>` : `<button class="btn" data-act="proposeTrade" data-target="${t}">📦 Ticaret anlaşması öner</button>`}
                ${allied ? `<button class="btn ghost" data-act="breakAlliance" data-target="${t}">İttifakı boz</button>` : `<button class="btn" data-act="proposeAlliance" data-target="${t}">🤝 İttifak öner</button>`}
                <button class="btn" data-act="sendGift" data-target="${t}" ${g.player.gold < 50 ? 'disabled' : ''}>🎁 Hediye gönder (50)</button>
                <button class="btn danger" data-act="declareWar" data-target="${t}" ${allied ? 'disabled title="Önce ittifakı bozun"' : ''}>⚔️ Savaş ilan et</button>
              `}
            </div>
          </section>`;
      } else {
        html += '<p class="muted pad small">Diplomatik eylem için haritada bir ülkeye tıklayın veya aşağıdan seçin.</p>';
      }
      html += `
        <h3 class="list-title">Ülkelerin size bakışı</h3>
        <ul class="nation-list compact">
          ${others.map((n) => {
            const op = g.opinion(n.id, me);
            const tag = g.warBetween(me, n.id) ? '⚔️' : g.isAllied(me, n.id) ? '🤝' : g.hasTrade(me, n.id) ? '📦' : '';
            return `<li data-target="${n.id}" class="${n.id === t ? 'active' : ''}" tabindex="0">
              <span class="swatch" style="background:${n.color}"></span>
              <span class="nl-name">${tag} ${esc(n.name)}</span>
              <span class="nl-meta tone-${opinionClass(op)}">${op > 0 ? '+' : ''}${op}</span></li>`;
          }).join('')}
        </ul>`;
      return html;
    }

    _opinionBar(v) {
      const pct = (v + 100) / 2;
      return `<div class="op-bar"><div class="op-mark" style="left:${pct}%"></div></div><b class="tone-${opinionClass(v)}">${v > 0 ? '+' : ''}${v}</b>`;
    }

    _logTab() {
      const g = this.game;
      const view = this.logView || 'chronicle';
      const toggle = `<div class="seg" role="group">
          <button class="${view === 'chronicle' ? 'active' : ''}" data-act="logView" data-view="chronicle">Kroniğim</button>
          <button class="${view === 'all' ? 'active' : ''}" data-act="logView" data-view="all">Tüm olaylar</button>
        </div>`;
      if (view === 'chronicle') return toggle + this._chronicleHtml(g.state.chronicle.slice().reverse());
      return toggle + `<ul class="log">${g.state.log.slice(0, 120).map((e) => `
        <li class="log-${e.type}"><time>${MH.util.formatDay(e.day)}</time>${esc(e.text)}</li>`).join('')}</ul>`;
    }

    _chronicleHtml(entries) {
      if (!entries.length) return '<p class="muted small pad">Hikâyeniz henüz yazılmadı.</p>';
      return `<ol class="chronicle">${entries.map((e) => `
        <li><span class="ch-icon">${e.icon}</span><div><time>${MH.util.formatDay(e.day)}</time>${esc(e.text)}</div></li>`).join('')}</ol>`;
    }

    /** Hedef listesi; live=true ise ilerleme işaretleri gösterilir */
    _goalsHtml(goals, live) {
      if (!goals?.length) return '';
      const g = this.game;
      return `<h4>Hedefler <small class="muted">· senaryo sonu ${MH.util.formatDay(g.state.endDay)}</small></h4>
        <ul class="goals">${goals.map((goal) => {
          const pending = live && !goal.done && (goal.type === 'hold' || goal.type === 'survive') && MH.goals.isMet(g, goal, true);
          const cls = goal.done ? 'done' : pending ? 'pending' : '';
          const mark = goal.done ? '✓' : pending ? '◐' : '○';
          return `<li class="${cls}"><span>${mark}</span>${esc(goal.label)}${goal.done && goal.doneDay ? ` <small class="muted">${MH.util.formatDay(goal.doneDay)}</small>` : ''}</li>`;
        }).join('')}</ul>`;
    }

    _bindTab() {
      const g = this.game;
      const body = $('#tab-body');
      const tax = $('#tax', body);
      if (tax) {
        tax.addEventListener('input', () => {
          const v = Number(tax.value);
          const delta = v - g.player.tax;
          $('#tax-out').textContent = '%' + v;
          const stab = delta > 0 ? -delta * 0.4 : -delta * 0.2;
          $('#tax-preview').innerHTML = delta
            ? `Değişiklik: istikrar <b class="tone-${stab >= 0 ? 'good' : 'bad'}">${signed(stab)}</b> · bırakınca uygulanır`
            : 'Değişiklik yok.';
        });
        tax.addEventListener('change', () => {
          this.showResult(g.setTax(g.state.playerId, Number(tax.value)));
          this.refresh();
        });
      }
      body.querySelectorAll('[data-focus]').forEach((btn) => btn.addEventListener('click', () => {
        this.showResult(g.setFocus(g.state.playerId, btn.dataset.focus));
        this.refresh();
      }));
      body.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => this.action(btn.dataset)));
      body.querySelectorAll('.nation-list li[data-target]').forEach((li) => {
        const go = () => this.selectTarget(li.dataset.target);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      });
    }

    action(data) {
      const g = this.game;
      const me = g.state.playerId;
      const t = data.target;
      let res;
      switch (data.act) {
        case 'recruit': res = g.recruit(me, Number(data.n)); break;
        case 'disband': res = g.disband(me, Number(data.n)); break;
        case 'proposeTrade': res = g.proposeTrade(me, t); break;
        case 'cancelTrade': res = g.cancelTrade(me, t); break;
        case 'proposeAlliance': res = g.proposeAlliance(me, t); break;
        case 'breakAlliance': res = g.breakAlliance(me, t); break;
        case 'sendGift': res = g.sendGift(me, t, 50); break;
        case 'peace': res = g.offerPeace(me, t, data.type); break;
        case 'stance': res = g.setWarStance(me, t, data.stance); break;
        case 'build': res = g.build(me, Number(data.pid), data.type); break;
        case 'colonize': res = g.colonize(me, Number(data.pid)); break;
        case 'closeProvince': this.provinceSel = null; this.renderSide(); return;
        case 'selectStack': this.selectStack(Number(data.stack), true); return;
        case 'splitStack': res = MH.armies.splitStack(g, Number(data.stack)); break;
        case 'mergeStack': res = MH.armies.mergeStacks(g, Number(data.stack)); break;
        case 'autoStack': res = MH.armies.setAuto(g, Number(data.stack), data.auto === '1'); break;
        case 'mercs': res = g.hireMercenaries(me, Number(data.n)); break;
        case 'festival': res = g.holdFestival(me); break;
        case 'showEnding': this.showEnding(); return;
        case 'logView': this.logView = data.view; this.renderSide(); return;
        case 'clearTarget': this.selectTarget(null); return;
        case 'declareWar': this.confirmWar(t); return;
        default: return;
      }
      this.showResult(res);
      this.refresh();
    }

    confirmWar(t) {
      const g = this.game;
      const me = g.state.playerId;
      const n = g.nation(t);
      const defenders = n.allies.filter((a) => a !== me && !g.warBetween(a, me)).map((a) => g.nation(a));
      const helpers = g.player.allies.filter((a) => a !== t && !g.isAllied(a, t) && g.opinion(a, me) >= 50).map((a) => g.nation(a));
      const truce = g.truceUntil(me, t);
      const strength = (id) => Math.round(g.militaryStrength(id));
      const enemyTotal = strength(t) + defenders.reduce((s, d) => s + strength(d.id), 0);
      const ourTotal = strength(me) + helpers.reduce((s, h) => s + strength(h.id), 0);
      const neighbors = new Set([...g.neighborsOf(t), ...g.neighborsOf(me)]);
      neighbors.delete(me);
      neighbors.delete(t);
      this.modal(`
        <div class="ev-icon">⚔️</div>
        <h2>${esc(n.name)} devletine savaş ilan edilsin mi?</h2>
        <p>Bu karar ülkenizin istikrarını ve komşularınızın tutumunu etkileyecek.</p>
        <ul class="fx">
          <li class="bad">İstikrar ${g.opinion(me, t) >= 0 ? '−6 (haksız savaş)' : '−2'}</li>
          ${truce ? '<li class="bad">Ateşkes ihlali! İstikrar −12, tüm ülkelerle ilişki −10</li>' : ''}
          <li class="bad">${neighbors.size} komşu ülkenin ilişkisi −10 (saldırganlık)</li>
          ${defenders.length ? `<li class="bad">Savunmaya katılacaklar: ${defenders.map((d) => esc(d.name)).join(', ')}</li>` : ''}
          ${helpers.length ? `<li class="good">Yanınızda savaşacaklar: ${helpers.map((h) => esc(h.name)).join(', ')}</li>` : ''}
          <li class="info">Güç dengesi: siz ${ourTotal} · karşı taraf ${enemyTotal}</li>
        </ul>
        <div class="btn-row end">
          <button class="btn ghost" data-close>Vazgeç</button>
          <button class="btn danger" id="confirm-war">Savaş ilan et</button>
        </div>`);
      $('#confirm-war').addEventListener('click', () => {
        this.closeModal();
        this.showResult(g.declareWar(me, t));
        this.refresh();
      });
    }

    selectTarget(id) {
      this.target = id;
      this.map.select(id);
      this.tab = 'diplomacy';
      this.renderSide();
    }

    refresh() {
      this.renderTopbar();
      this.renderSide();
      this.map.refreshAll();
    }

    // ============================================================ harita etkileşimi
    onMapClick(pid, owner) {
      if (!owner && this.mode !== 'play') return;
      if (this.selectedStack && !MH.armies.stackById(this.game, this.selectedStack)) this.selectStack(null);
      if (this.mode === 'play' && this.selectedStack) {
        const res = MH.armies.moveStack(this.game, this.selectedStack, pid);
        this.showResult(res);
        this.map.renderStacks();
        this.renderSide();
        return;
      }
      if (this.mode === 'pick') {
        this.pickNation(owner);
        return;
      }
      if (this.mode !== 'play') return;
      this.provinceSel = pid;
      if (!owner || owner === this.game.state.playerId) {
        this.target = null;
        this.map.select(null);
        this.tab = 'overview';
        this.renderSide();
        $('#tab-body').scrollTop = 0;
      } else this.selectTarget(owner);
    }

    // ============================================================ eyaletler ve yapılar
    _provinceHtml(pid, editable) {
      const g = this.game;
      const owner = g.state.owner[pid];
      if (!owner) return this._unclaimedHtml(pid);
      const nat = g.nation(owner);
      const built = g.state.buildings[pid] || [];
      const building = g.underConstruction(pid);
      const sg = g.state.sieges?.[pid];
      const tags = [
        nat.capital === pid && '★ Başkent',
        g.grid.provinces[pid].coastal && '⚓ Kıyı',
        'Gelişim ' + g.state.dev[pid],
      ].filter(Boolean).join(' · ');
      const builtHtml = built.length
        ? built.map((t) => `<span class="chip">${MH.BUILDINGS[t].icon} ${MH.BUILDINGS[t].label}</span>`).join('')
        : building.length ? '' : '<span class="muted small">Yapı yok</span>';
      const constructionHtml = building.map((c) => `<span class="chip warn">🔨 ${MH.BUILDINGS[c.type].label} · ${c.done - g.state.day} gün</span>`).join('');
      let actions = '';
      if (editable) {
        actions = `<div class="build-grid">${Object.entries(MH.BUILDINGS).map(([type, def]) => {
          const has = built.includes(type);
          const busy = building.some((c) => c.type === type);
          const cost = g.buildingCost(pid, type);
          const disabled = has || busy || !!sg || g.player.gold < cost;
          const note = has ? 'Mevcut' : busy ? 'İnşa ediliyor' : cost + ' altın · ' + def.days + ' gün';
          return `<button class="build" data-act="build" data-pid="${pid}" data-type="${type}" ${disabled ? 'disabled' : ''} title="${esc(def.desc)}">
            <b>${def.icon} ${def.label}</b><small>${esc(def.desc)}</small><span>${note}</span></button>`;
        }).join('')}</div>`;
      }
      return `<section class="card province">
        <div class="prov-head"><div><h3>📍 ${esc(MH.places.nameOf(g, pid))}</h3><p class="muted small">${esc(nat.name)} · ${tags}</p></div>
          <button class="btn tiny ghost" data-act="closeProvince" aria-label="Kapat">✕</button></div>
        ${sg ? `<p class="tone-bad small">Kuşatma altında: ${esc(g.nation(sg.by).name)} %${Math.min(99, Math.round((sg.progress / sg.needed) * 100))}</p>` : ''}
        <div class="flags">${builtHtml}${constructionHtml}</div>
        ${actions}
      </section>`;
    }

    // ============================================================ ordular
    onStackClick(sid) {
      const g = this.game;
      if (this.mode !== 'play') return;
      const stack = MH.armies.stackById(g, sid);
      if (!stack) return;
      if (stack.owner !== g.state.playerId) {
        // Düşman ordusuna tıklamak, seçili orduyu oraya gönderir ya da düşmanı diplomasi hedefi yapar
        if (this.selectedStack) this.onMapClick(stack.prov, g.state.owner[stack.prov]);
        else this.selectTarget(stack.owner);
        return;
      }
      if (this.selectedStack === sid) {
        // Seçili orduya ikinci tıklama: seçimi bırak ve bulunduğu eyaleti göster
        this.selectStack(null);
        if (g.state.owner[stack.prov] === g.state.playerId) {
          this.provinceSel = stack.prov;
          this.tab = 'overview';
          this.renderSide();
        }
        return;
      }
      this.selectStack(sid);
    }

    selectStack(sid, focus = false) {
      this.selectedStack = sid;
      this.map.selectStack(sid);
      const hint = $('#order-hint');
      const stack = sid ? MH.armies.stackById(this.game, sid) : null;
      hint.hidden = !stack;
      if (stack) {
        hint.textContent = '⚔️ ' + stack.name + ' seçili — hedef eyalete tıklayın · Esc: bırak';
        if (focus) {
          const p = this.game.grid.provinces[stack.prov];
          const v = this.map.view;
          this.map.view = { ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 };
          this.map._clampView();
          this.map._applyView();
        }
      }
      if (this.tab === 'military') this.renderSide();
    }

    onStackHover(sid, e) {
      const g = this.game;
      const s = MH.armies.stackById(g, sid);
      const tip = $('#map-tooltip');
      if (!s) { tip.hidden = true; return; }
      const st = MH.armies.status(g, s);
      tip.innerHTML = `<b>${esc(s.name)}</b><div class="muted">${esc(g.nation(s.owner).name)}</div>
        <div>${soldiers(s.size)} asker · güç ${Math.round(MH.armies.strength(g, s))}</div><div>${esc(st.text)}</div>
        ${s.owner === g.state.playerId ? `<div class="muted">${s.auto ? 'Otomatik komuta' : 'Sizin emrinizde'}</div>` : ''}`;
      this._placeTip(e);
    }

    _stacksHtml() {
      const g = this.game;
      const stacks = MH.armies.stacksOf(g, g.state.playerId);
      if (!stacks.length) return '';
      return `<section class="card">
        <h3>Ordular</h3>
        <p class="muted small">Bir orduyu seçip haritada hedef eyalete tıklayın. Düşman eyaletinde duran ordu kuşatma başlatır. Emir verilen ordu manuel kontrole geçer.</p>
        <ul class="stack-list">${stacks.map((s) => {
          const st = MH.armies.status(g, s);
          const here = stacks.filter((x) => x !== s && x.prov === s.prov).length;
          return `<li class="${s.id === this.selectedStack ? 'selected' : ''}">
            <div class="sl-head"><b>${esc(s.name)}</b><span>${soldiers(s.size)}</span></div>
            <div class="sl-status ${st.kind}">${esc(st.text)} · 📍 ${esc(MH.places.nameOf(g, s.prov))}</div>
            <div class="btn-row">
              <button class="btn tiny ${s.id === this.selectedStack ? 'primary' : ''}" data-act="selectStack" data-stack="${s.id}">${s.id === this.selectedStack ? 'Seçili' : 'Seç'}</button>
              <button class="btn tiny ghost" data-act="autoStack" data-stack="${s.id}" data-auto="${s.auto ? '0' : '1'}">${s.auto ? '🤖 Otomatik' : '🎖️ Manuel'}</button>
              <button class="btn tiny ghost" data-act="splitStack" data-stack="${s.id}" ${s.size < 4 ? 'disabled' : ''}>Böl</button>
              ${here ? `<button class="btn tiny ghost" data-act="mergeStack" data-stack="${s.id}">Birleştir</button>` : ''}
            </div>
          </li>`;
        }).join('')}</ul>
      </section>`;
    }

    _placeTip(e) {
      const tip = $('#map-tooltip');
      const wrap = $('#map-wrap').getBoundingClientRect();
      tip.hidden = false;
      const x = e.clientX - wrap.left + 14;
      const y = e.clientY - wrap.top + 14;
      tip.style.left = Math.min(x, wrap.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.min(y, wrap.height - tip.offsetHeight - 8) + 'px';
    }

    onMapHover(pid, owner, e) {
      const tip = $('#map-tooltip');
      if (pid === null) {
        tip.hidden = true;
        return;
      }
      if (!owner) {
        const g = this.game;
        tip.innerHTML = `<b>🏕️ ${esc(MH.places.nameOf(g, pid))}</b><div class="muted">Sahipsiz topraklar</div>${this.mode === 'play' ? '<div class="tone-info">Tıkla: kolonileştir</div>' : ''}`;
        this._placeTip(e);
        return;
      }
      const g = this.game;
      const n = g.nation(owner);
      const me = g.state.playerId;
      let extra = '';
      if (me && owner !== me) {
        const op = g.opinion(owner, me);
        const st = g.warBetween(me, owner) ? ' · ⚔️ savaşta' : g.isAllied(me, owner) ? ' · 🤝 müttefik' : '';
        extra = `<div>Size bakışı: <b class="tone-${opinionClass(op)}">${op > 0 ? '+' : ''}${op}</b>${st}</div>`;
      }
      const sg = g.state.sieges?.[pid];
      if (sg) extra += `<div class="tone-warn">Kuşatma altında (${esc(g.nation(sg.by).name)}): %${Math.min(99, Math.round((sg.progress / sg.needed) * 100))}</div>`;
      if (this.selectedStack && this.mode === 'play') extra += '<div class="tone-info">Tıkla: seçili orduyu buraya gönder</div>';
      const built = (g.state.buildings[pid] || []).map((t) => MH.BUILDINGS[t].icon + ' ' + MH.BUILDINGS[t].label).join(' · ');
      tip.innerHTML = `<b>📍 ${esc(MH.places.nameOf(g, pid))}</b><div>${esc(n.name)} <span class="muted">· ${esc(n.leader)}</span></div><div>Gelişim: ${g.state.dev[pid]}${n.capital === pid ? ' · ★ başkent' : ''}</div>${built ? `<div>${built}</div>` : ''}${extra}`;
      this._placeTip(e);
    }

    // ============================================================ olaylar (AC 4.1, 4.2)
    showEvent() {
      const g = this.game;
      const pending = g.currentEvent();
      if (!pending || this.mode !== 'play') return;
      const ev = MH.events.BY_ID[pending.eventId];
      this.modal(`
        <div class="ev-icon">${ev.icon}</div>
        <p class="ev-date">${MH.util.formatDay(g.state.day)}${ev.date ? ' · Tarihî olay' : ev.dynamic ? '' : ' · Rastgele olay'}</p>
        <h2>${esc(ev.title)}</h2>
        <p class="ev-text">${esc(MH.events.textOf(g, ev, pending.ctx))}</p>
        <div class="ev-options">
          ${ev.options.map((opt, i) => `
            <button class="ev-option" data-opt="${i}">
              <b>${esc(opt.text)}</b>
              ${effectList(MH.events.preview(g, pending, opt))}
            </button>`).join('')}
        </div>`, { dismissable: false, kind: 'event' });
      document.querySelectorAll('.ev-option').forEach((btn) => btn.addEventListener('click', () => {
        const res = g.resolveEvent(Number(btn.dataset.opt));
        this.modal(`
          <div class="ev-icon">${ev.icon}</div>
          <h2>${esc(ev.title)}</h2>
          <p class="ev-text"><b>${esc(res.message)}</b></p>
          ${effectList(res.effects)}
          <div class="btn-row end"><button class="btn primary" id="ev-continue">Devam</button></div>`, { dismissable: false, kind: 'event' });
        $('#ev-continue').focus();
        $('#ev-continue').addEventListener('click', () => {
          this.closeModal();
          this.refresh();
          if (g.currentEvent()) this.showEvent();
          else if (this._resumeAfterEvent && !g.state.gameOver) {
            this._resumeAfterEvent = false;
            this.setSpeed(this.resumeSpeed || 1);
          }
        });
      }));
    }

    showGameOver() {
      this._showResult(true);
    }

    showEnding() {
      this._showResult(false);
    }

    /** Senaryo sonu veya yenilgi: puan, hedefler ve kronik (kişisel tarih) */
    _showResult(defeat) {
      const g = this.game;
      const r = g.state.ended || MH.goals.evaluate(g);
      const p = g.player;
      const by = g.state.gameOver?.by ? g.nation(g.state.gameOver.by).name : '';
      if (defeat) storage.set(SAVE_KEY, '');
      const beaten = r.beaten.map((id) => g.nation(id).name);
      this.modal(`
        <div class="ev-icon">${defeat ? '🏚️' : '📜'}</div>
        <p class="ev-date">${esc(g.scenario.title)} · ${MH.util.formatDay(r.day)}</p>
        <h2>${defeat ? 'Bir devrin sonu' : esc(r.rank)}</h2>
        <p class="ev-text">${defeat
          ? esc(p.name + ', ' + by + ' tarafından tarih sahnesinden silindi.')
          : esc(p.name + ' — ' + r.verdict)}</p>
        <div class="result-grid">
          <div><b>${r.score}</b><span>Tarih puanı</span></div>
          <div><b>${r.goalsDone}/${r.goalsTotal}</b><span>Hedef</span></div>
          <div><b>${r.startProvinces} → ${r.provinces}</b><span>Eyalet (en çok ${r.peakProvinces})</span></div>
          <div><b>${r.years}</b><span>Yıl hüküm</span></div>
        </div>
        ${this._goalsHtml(g.state.goals, false)}
        ${beaten.length ? `<p class="small">Yenilgiye uğrattıklarınız: ${beaten.map(esc).join(', ')}</p>` : ''}
        <h4>Kroniğiniz</h4>
        <div class="chronicle-box">${this._chronicleHtml(g.state.chronicle)}</div>
        <div class="btn-row end">
          ${defeat ? '' : '<button class="btn" id="keep-playing">Oynamaya devam et</button>'}
          <button class="btn primary" id="go-menu">Ana menü</button>
        </div>`, { dismissable: false, kind: 'result' });
      $('#go-menu').addEventListener('click', () => { this.closeModal(); this.showMenu(); });
      $('#keep-playing')?.addEventListener('click', () => { this.closeModal(); this.refresh(); });
    }

    // ============================================================ ortak bileşenler
    modal(html, { dismissable = true, kind = '' } = {}) {
      const m = $('#modal');
      m.hidden = false;
      m.dataset.kind = kind;
      m.dataset.dismissable = dismissable ? '1' : '';
      $('#modal-card').innerHTML = html;
      m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeModal()));
      const first = m.querySelector('button');
      first?.focus();
    }

    closeModal() {
      $('#modal').hidden = true;
      $('#modal-card').innerHTML = '';
    }

    showResult(res) {
      if (!res) return;
      this.toast(res.message, res.effects, res.ok ? 'good' : 'bad');
    }

    toast(title, effects = [], tone = 'info') {
      const box = $('#toasts');
      const t = document.createElement('div');
      t.className = 'toast ' + tone;
      t.innerHTML = `<b>${esc(title)}</b>${effectList(effects)}`;
      box.prepend(t);
      while (box.children.length > 3) box.lastChild.remove();
      setTimeout(() => t.classList.add('out'), 4800);
      setTimeout(() => t.remove(), 5400);
    }

    flashBattle(text, good) {
      const now = performance.now();
      if (now - (this._lastBattle || 0) < 700) return;
      this._lastBattle = now;
      const b = $('#battle-ticker');
      b.textContent = text;
      b.className = good ? 'good show' : 'bad show';
      clearTimeout(this._battleTimer);
      this._battleTimer = setTimeout(() => { b.className = ''; }, 2200);
    }

    save() {
      if (!this.game || this.mode !== 'play') return;
      const ok = storage.set(SAVE_KEY, this.game.serialize());
      this.toast(ok ? 'Oyun kaydedildi' : 'Kayıt başarısız (tarayıcı depolaması kapalı)', [], ok ? 'good' : 'bad');
    }

    _bindStatic() {
      $('#btn-continue').addEventListener('click', () => this.continueSaved());
      $('#btn-menu').addEventListener('click', () => {
        if (this.mode === 'play') {
          this.game.setSpeed(0);
          this.modal(`
            <h2>Ana menüye dön</h2>
            <p>Kaydedilmemiş ilerleme kaybolacak.</p>
            <div class="btn-row end">
              <button class="btn ghost" data-close>Vazgeç</button>
              <button class="btn" id="save-quit">Kaydet ve çık</button>
              <button class="btn danger" id="quit">Kaydetmeden çık</button>
            </div>`);
          $('#save-quit').addEventListener('click', () => { this.save(); this.closeModal(); this.showMenu(); });
          $('#quit').addEventListener('click', () => { this.closeModal(); this.showMenu(); });
        } else this.showMenu();
      });
      $('#btn-save').addEventListener('click', () => this.save());
      document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed))));
      document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
        this.tab = b.dataset.tab;
        this.renderSide();
      }));
      $('#zoom-in').addEventListener('click', () => this.map?.zoom(1.4));
      $('#zoom-out').addEventListener('click', () => this.map?.zoom(1 / 1.4));
      $('#zoom-reset').addEventListener('click', () => this.map?.resetView());
      $('#map-mode').addEventListener('change', (e) => {
        this.map?.setFocus(this.game?.state.playerId || this.selected);
        this.map?.setMode(e.target.value);
      });
      $('#modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal' && $('#modal').dataset.dismissable) this.closeModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.target.matches?.('input, textarea, select')) return;
        if (e.key === 'Escape' && !$('#modal').hidden && $('#modal').dataset.dismissable) this.closeModal();
        if (e.key === 'Escape' && $('#modal').hidden && this.selectedStack) this.selectStack(null);
        if (this.mode !== 'play' || !$('#modal').hidden) return;
        if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
        if (['1', '2', '3'].includes(e.key)) this.setSpeed(Number(e.key));
        if (e.key === '+' || e.key === '=') this.map.zoom(1.3);
        if (e.key === '-') this.map.zoom(1 / 1.3);
      });
    }
  }

  MH.App = App;

  /*
   * Açılış. Sayfa claude.ai üzerinde yayınlandığında görüntüleyici `window.claude.hot`
   * kancasını sağlar: sayfa güncellenirse süren oyun anlık görüntüden kaldığı yerden devam eder.
   */
  function boot() {
    const hot = typeof window !== 'undefined' ? window.claude?.hot : null;
    const start = (data) => {
      MH.app = new App();
      if (data && data.save) MH.app.continueSaved(data.save);
    };
    hot?.snapshot?.(() => {
      const app = MH.app;
      return app?.game && app.mode === 'play' && !app.game.state.gameOver ? { save: app.game.serialize() } : {};
    });
    if (hot?.ready) hot.ready(start);
    else start(hot?.data ?? {});
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})((globalThis.MH = globalThis.MH || {}));
