/*
 * Map Historia — oyun motoru.
 * Tarayıcıdan bağımsızdır; tüm durum JSON olarak kaydedilebilir.
 *
 *  - Ulus ve senaryo kurulumu ............ AC 1.1–1.3
 *  - Ekonomi / diplomasi kararları ........ AC 2.1–2.3
 *  - Günlük zaman akışı ve fetihler ....... AC 3.1–3.2
 *  - Olay kuyruğu ......................... AC 4.1–4.2 (tanımlar events.js içinde)
 */
(function (MH) {
  'use strict';

  const DAY_MS = 86400000;
  const TRUCE_DAYS = 365 * 5;
  const MAX_ALLIES = 4;
  const RECRUIT_COST = 5; // bin asker başına altın
  const UPKEEP = 0.18; // bin asker başına aylık altın
  const SPEEDS = { 1: 450, 2: 160, 3: 45 }; // gün başına milisaniye

  const FOCUS = {
    agriculture: { label: 'Tarım', desc: '+%30 insan gücü artışı, +İstikrar' },
    industry: { label: 'Sanayi', desc: '+%15 vergi geliri, +%10 ordu kalitesi' },
    trade: { label: 'Ticaret', desc: 'Ticaret anlaşmalarından +%60 gelir' },
    military: { label: 'Askeri', desc: '+%20 ordu kalitesi, −%25 asker toplama maliyeti, −İstikrar' },
  };

  // weight: ordunun cepheye ayrılan payı · aggression: saldırı sıklığı
  // defense: savunurken güç çarpanı · capture: kazanılan saldırıda toprak alma olasılığı
  const STANCES = {
    offensive: { label: 'Taarruz', desc: 'Ordunun daha büyük kısmı bu cepheye; sık saldırı, daha fazla kayıp', weight: 2, aggression: 3, defense: 1.15, capture: 0.75 },
    balanced: { label: 'Dengeli', desc: 'Ordunun eşit payı; ölçülü saldırı ve savunma', weight: 1, aggression: 2, defense: 1.2, capture: 0.6 },
    defensive: { label: 'Savunma', desc: 'Tahkimatlı hatlar; düşman saldırılarına karşı güçlü, nadiren saldırır', weight: 1, aggression: 1, defense: 1.45, capture: 0.5 },
  };

  const CHRONICLE_TYPES = { war: '⚔️', peace: '🕊️', event: '📜', player: '👑', goal: '🎯' };

  const PEACE_TYPES = {
    white: 'Beyaz Barış',
    demand: 'Tazminat Talep Et',
    offer: 'Tazminat Öde',
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  function parseDay(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(0);
    dt.setUTCFullYear(y, m - 1, d);
    dt.setUTCHours(0, 0, 0, 0);
    return Math.round(dt.getTime() / DAY_MS);
  }

  function dayToDate(day) {
    const dt = new Date(day * DAY_MS);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function formatDay(day) {
    const { y, m, d } = dayToDate(day);
    return d + ' ' + MONTHS[m - 1] + ' ' + y;
  }

  function mulberry(state) {
    let t = (state + 0x6d2b79f5) | 0;
    const next = t;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { next, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  // Basit ikili yığın (Dijkstra için)
  function heapPush(h, item) {
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  function heapPop(h) {
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  class Game {
    constructor(state) {
      this.state = state;
      this.grid = MH.geo.buildGrid();
      this.listeners = {};
      this.scenario = MH.getScenario(state.scenarioId);
      this._borderCache = null;
    }

    // ------------------------------------------------------------------ kurulum
    static create(scenarioId) {
      const sc = MH.getScenario(scenarioId);
      if (!sc) throw new Error('Bilinmeyen senaryo: ' + scenarioId);
      const grid = MH.geo.buildGrid();
      const n = grid.provinces.length;
      const state = {
        version: 1,
        scenarioId,
        day: parseDay(sc.startDate),
        startDay: parseDay(sc.startDate),
        endDay: parseDay(sc.endDate),
        ended: null,
        goals: [],
        startProvinces: 0,
        beaten: [],
        chronicle: [],
        rng: sc.seed,
        speed: 0,
        playerId: null,
        owner: new Array(n).fill(null),
        dev: new Array(n).fill(1),
        nations: {},
        order: [],
        wars: [],
        truces: {},
        log: [],
        eventQueue: [],
        firedEvents: {},
        lastEventDay: parseDay(sc.startDate) - 30, // ilk rastgele olay ~1 ay sonra mümkün
        gameOver: null,
        nextWarId: 1,
      };
      const game = new Game(state);

      for (const def of sc.nations) {
        state.order.push(def.id);
        state.nations[def.id] = {
          id: def.id,
          name: def.name,
          leader: def.leader,
          color: def.color,
          capital: -1,
          gold: def.gold,
          manpower: def.manpower,
          army: def.army,
          tax: def.tax ?? 20,
          focus: def.focus ?? 'agriculture',
          stability: def.stability ?? 50,
          warExhaustion: 0,
          opinions: {},
          allies: [],
          trade: [],
          alive: true,
          focusChangedDay: -Infinity,
          peakProvinces: 0,
        };
      }

      game._assignTerritory(sc);

      for (const def of sc.nations) {
        const nat = state.nations[def.id];
        for (const pid of game.provincesOf(def.id)) {
          const base = def.dev ?? 3;
          state.dev[pid] = Math.max(1, base + Math.floor(game.random() * 3) - 1 + (grid.provinces[pid].coastal ? 1 : 0));
        }
        if (nat.capital >= 0) state.dev[nat.capital] += 4;
        nat.peakProvinces = game.provincesOf(def.id).length;
      }

      for (const id of state.order) {
        for (const other of state.order) if (other !== id) state.nations[id].opinions[other] = 0;
      }
      for (const [a, b] of sc.alliances) {
        game._link(a, b, 'allies');
        game._setMutualOpinion(a, b, 60);
      }
      for (const [a, b] of sc.trades) {
        game._link(a, b, 'trade');
        game._changeOpinion(a, b, 15);
        game._changeOpinion(b, a, 15);
      }
      for (const [viewer, subject, v] of sc.opinions) state.nations[viewer].opinions[subject] = v;
      for (const [a, b] of sc.wars) {
        game._startWar(a, b);
        game._setMutualOpinion(a, b, -80);
      }

      game.addLog(sc.title + ' senaryosu başladı.', 'info');
      return game;
    }

    static load(json) {
      const state = typeof json === 'string' ? JSON.parse(json) : json;
      if (!state || state.version !== 1 || !MH.getScenario(state.scenarioId)) throw new Error('Geçersiz kayıt dosyası');
      for (const nat of Object.values(state.nations)) {
        if (nat.focusChangedDay === null) nat.focusChangedDay = -Infinity;
        if (nat.festivalDay === null) nat.festivalDay = -Infinity;
      }
      const sc = MH.getScenario(state.scenarioId);
      state.endDay ??= parseDay(sc.endDate);
      state.ended ??= null;
      state.goals ??= [];
      state.beaten ??= [];
      state.chronicle ??= [];
      // Eski kayıtlarda 0 (1970) değeri tarihî tarihlerin ilerisinde kalıyordu
      if (state.lastEventDay > state.day) state.lastEventDay = state.day - 30;
      return new Game(state);
    }

    serialize() {
      return JSON.stringify(this.state);
    }

    _assignTerritory(sc) {
      const { provinces, nearest } = this.grid;
      const owner = this.state.owner;
      const cost = new Array(provinces.length).fill(Infinity);
      const heap = [];
      const taken = new Set();

      const nearestFree = (lon, lat) => {
        let pid = nearest(lon, lat);
        if (!taken.has(pid)) return pid;
        const queue = [pid];
        const seen = new Set(queue);
        while (queue.length) {
          const cur = queue.shift();
          if (!taken.has(cur)) return cur;
          for (const nb of provinces[cur].neighbors) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
        }
        return pid;
      };

      for (const def of sc.nations) {
        const points = [def.capital, ...(def.seeds || [])];
        points.forEach((pt, i) => {
          const pid = nearestFree(pt[0], pt[1]);
          if (taken.has(pid)) return;
          taken.add(pid);
          owner[pid] = def.id;
          cost[pid] = 0;
          if (i === 0) this.state.nations[def.id].capital = pid;
          heapPush(heap, [0, pid, def.id]);
        });
      }

      const weight = Object.fromEntries(sc.nations.map((d) => [d.id, d.weight || 1]));
      while (heap.length) {
        const [c, pid, nid] = heapPop(heap);
        if (c > cost[pid] || owner[pid] !== nid) continue;
        const prov = provinces[pid];
        const step = (nb, mult) => {
          const nc = c + (mult * (1 + 0.35 * this.random())) / weight[nid];
          if (nc < cost[nb]) {
            cost[nb] = nc;
            owner[nb] = nid;
            heapPush(heap, [nc, nb, nid]);
          }
        };
        for (const nb of prov.neighbors) step(nb, 1);
        for (const nb of prov.straits) step(nb, 4);
      }
      // Hiçbir tohuma bağlanamayan adalar en yakın eyaletin sahibine verilir
      for (const prov of provinces) {
        if (owner[prov.id]) continue;
        let best = null;
        let bestD = Infinity;
        for (const other of provinces) {
          if (!owner[other.id]) continue;
          const d = (other.x - prov.x) ** 2 + (other.y - prov.y) ** 2;
          if (d < bestD) { bestD = d; best = owner[other.id]; }
        }
        owner[prov.id] = best;
      }
    }

    // ------------------------------------------------------------------ yardımcılar
    random() {
      const r = mulberry(this.state.rng);
      this.state.rng = r.next;
      return r.value;
    }

    pick(arr) {
      return arr[Math.floor(this.random() * arr.length)];
    }

    on(evt, fn) {
      (this.listeners[evt] = this.listeners[evt] || []).push(fn);
    }

    emit(evt, payload) {
      for (const fn of this.listeners[evt] || []) fn(payload);
    }

    addLog(text, type = 'info', nations = []) {
      const entry = { day: this.state.day, text, type, nations };
      this.state.log.unshift(entry);
      if (this.state.log.length > 200) this.state.log.length = 200;
      // Kronik: oyuncunun hikâyesindeki önemli anlar (kırpılmaz)
      const pid = this.state.playerId;
      if (pid && nations.includes(pid) && CHRONICLE_TYPES[type]) {
        this.state.chronicle.push({ day: entry.day, icon: CHRONICLE_TYPES[type], text });
        if (this.state.chronicle.length > 400) this.state.chronicle.shift();
      }
      this.emit('log', entry);
    }

    nation(id) {
      return this.state.nations[id];
    }

    get player() {
      return this.state.playerId ? this.state.nations[this.state.playerId] : null;
    }

    aliveNations() {
      return this.state.order.map((id) => this.state.nations[id]).filter((n) => n.alive);
    }

    provincesOf(id) {
      const out = [];
      this.state.owner.forEach((o, i) => { if (o === id) out.push(i); });
      return out;
    }

    totalDev(id) {
      let s = 0;
      this.state.owner.forEach((o, i) => { if (o === id) s += this.state.dev[i]; });
      return s;
    }

    /** Kara veya dar boğaz üzerinden komşu olan uluslar */
    neighborsOf(id) {
      const set = new Set();
      const { provinces } = this.grid;
      const owner = this.state.owner;
      owner.forEach((o, i) => {
        if (o !== id) return;
        for (const nb of provinces[i].neighbors) if (owner[nb] !== id && owner[nb]) set.add(owner[nb]);
        for (const nb of provinces[i].straits) if (owner[nb] !== id && owner[nb]) set.add(owner[nb]);
      });
      return [...set].filter((n) => this.state.nations[n].alive);
    }

    opinion(viewer, subject) {
      return this.state.nations[viewer]?.opinions[subject] ?? 0;
    }

    _changeOpinion(viewer, subject, delta) {
      const v = this.state.nations[viewer];
      if (!v || viewer === subject) return;
      v.opinions[subject] = clamp(Math.round((v.opinions[subject] || 0) + delta), -100, 100);
    }

    _setMutualOpinion(a, b, value) {
      this.state.nations[a].opinions[b] = value;
      this.state.nations[b].opinions[a] = value;
    }

    _link(a, b, field) {
      const na = this.state.nations[a];
      const nb = this.state.nations[b];
      if (!na.alive || !nb.alive) return;
      if (!na[field].includes(b)) na[field].push(b);
      if (!nb[field].includes(a)) nb[field].push(a);
    }

    _unlink(a, b, field) {
      const na = this.state.nations[a];
      const nb = this.state.nations[b];
      na[field] = na[field].filter((x) => x !== b);
      nb[field] = nb[field].filter((x) => x !== a);
    }

    isAllied(a, b) {
      return this.state.nations[a].allies.includes(b);
    }

    hasTrade(a, b) {
      return this.state.nations[a].trade.includes(b);
    }

    warBetween(a, b) {
      return this.state.wars.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)) || null;
    }

    warsOf(id) {
      return this.state.wars.filter((w) => w.a === id || w.b === id);
    }

    enemiesOf(id) {
      return this.warsOf(id).map((w) => (w.a === id ? w.b : w.a));
    }

    truceUntil(a, b) {
      const until = this.state.truces[pairKey(a, b)];
      return until && until > this.state.day ? until : 0;
    }

    /** Savaş skoru: pozitif değer `id` lehinedir (−100…100) */
    warScore(war, id) {
      const other = war.a === id ? war.b : war.a;
      const cap = (war.captured[id] || 0) - (war.captured[other] || 0);
      const bat = (war.battles[id] || 0) - (war.battles[other] || 0);
      const capitalBonus = (war.capitals[id] || 0) * 25 - (war.capitals[other] || 0) * 25;
      return clamp(Math.round(cap * 8 + bat * 3 + capitalBonus), -100, 100);
    }

    quality(id) {
      const nat = this.state.nations[id];
      let q = 1 + (nat.stability - 50) / 250;
      if (nat.focus === 'military') q += 0.2;
      if (nat.focus === 'industry') q += 0.1;
      if (nat.gold < 0) q -= 0.15;
      return Math.max(0.4, q);
    }

    militaryStrength(id) {
      const nat = this.state.nations[id];
      return nat.army * this.quality(id);
    }

    powerRank(id) {
      const sorted = this.aliveNations().sort((a, b) => this.militaryStrength(b.id) - this.militaryStrength(a.id));
      return sorted.findIndex((n) => n.id === id) + 1;
    }

    /** Aylık bütçe dökümü (AC 2.1, 1.3) */
    budget(id) {
      const nat = this.state.nations[id];
      const dev = this.totalDev(id);
      const stabMod = 0.6 + nat.stability / 125;
      let tax = dev * (nat.tax / 100) * 0.4 * stabMod;
      if (nat.focus === 'industry') tax *= 1.15;
      if (nat.stability < 20) tax *= 0.75;
      let trade = nat.trade.filter((t) => this.state.nations[t]?.alive).length * (2 + dev * 0.025);
      if (nat.focus === 'trade') trade *= 1.6;
      const upkeep = nat.army * UPKEEP;
      return { tax: round1(tax), trade: round1(trade), upkeep: round1(upkeep), total: round1(tax + trade - upkeep) };
    }

    manpowerGrowth(id) {
      const nat = this.state.nations[id];
      let g = this.totalDev(id) * 0.05;
      if (nat.focus === 'agriculture') g *= 1.3;
      if (nat.focus === 'military') g *= 1.15;
      return round1(g);
    }

    maxManpower(id) {
      return Math.round(this.totalDev(id) * 0.6 + 10);
    }

    recruitCost(id) {
      return this.state.nations[id].focus === 'military' ? RECRUIT_COST * 0.75 : RECRUIT_COST;
    }

    stabilityTarget(id) {
      const nat = this.state.nations[id];
      let t = 60;
      t -= Math.max(0, nat.tax - 20) * 1.2;
      t += Math.max(0, 20 - nat.tax) * 0.6;
      t -= nat.warExhaustion * 0.3;
      t -= this.warsOf(id).length * 3;
      if (nat.focus === 'agriculture') t += 6;
      if (nat.focus === 'military') t -= 4;
      if (nat.gold < 0) t -= 15;
      return clamp(Math.round(t), 0, 100);
    }

    // ------------------------------------------------------------------ oyuncu seçimi
    setPlayer(id) {
      const nat = this.state.nations[id];
      if (!nat || !nat.alive) throw new Error('Geçersiz ulus');
      this.state.playerId = id;
      this.addLog(nat.leader + ' liderliğinde ' + nat.name + ' yönetimi devralındı.', 'player', [id]);
      MH.goals?.init(this);
    }

    /** AC 1.3 — seçilen ülkenin başlangıç durumunun özeti */
    summary(id) {
      const nat = this.state.nations[id];
      const provinces = this.provincesOf(id);
      const name = (x) => this.state.nations[x].name;
      const rels = Object.entries(nat.opinions)
        .filter(([o]) => this.state.nations[o].alive)
        .sort((a, b) => b[1] - a[1]);
      return {
        id,
        name: nat.name,
        leader: nat.leader,
        color: nat.color,
        capital: nat.capital,
        provinces: provinces.length,
        development: this.totalDev(id),
        gold: Math.round(nat.gold),
        budget: this.budget(id),
        manpower: Math.round(nat.manpower),
        maxManpower: this.maxManpower(id),
        army: Math.round(nat.army),
        strength: Math.round(this.militaryStrength(id)),
        powerRank: this.powerRank(id),
        totalNations: this.aliveNations().length,
        stability: Math.round(nat.stability),
        tax: nat.tax,
        focus: nat.focus,
        warExhaustion: Math.round(nat.warExhaustion),
        allies: nat.allies.map(name),
        trade: nat.trade.map(name),
        wars: this.enemiesOf(id).map(name),
        neighbors: this.neighborsOf(id).map(name),
        friends: rels.filter(([, v]) => v >= 40).slice(0, 4).map(([o, v]) => ({ name: name(o), value: v })),
        rivals: rels.filter(([, v]) => v <= -30).reverse().slice(0, 4).map(([o, v]) => ({ name: name(o), value: v })),
      };
    }

    // ------------------------------------------------------------------ zaman (AC 3.1)
    setSpeed(speed) {
      if (![0, 1, 2, 3].includes(speed)) throw new Error('Geçersiz hız');
      if (speed > 0 && this.state.eventQueue.length) return false; // olay bekliyorsa akış durur
      if (this.state.gameOver) speed = 0;
      this.state.speed = speed;
      this.emit('speed', speed);
      return true;
    }

    msPerDay() {
      return SPEEDS[this.state.speed] || 0;
    }

    /** Bir gün ilerletir */
    tick() {
      if (this.state.gameOver) return;
      this.state.day += 1;
      this._dailyCombat();
      const { d } = dayToDate(this.state.day);
      if (d === 1) this._monthly();
      MH.events?.checkScheduled(this);
      if (!this.state.ended && this.state.playerId && this.state.day >= this.state.endDay) this.endScenario();
      this.emit('day', this.state.day);
    }

    advanceDays(n) {
      for (let i = 0; i < n && !this.state.gameOver && !this.state.eventQueue.length; i++) this.tick();
    }

    _monthly() {
      for (const nat of this.aliveNations()) {
        const b = this.budget(nat.id);
        nat.gold = round1(nat.gold + b.total);
        nat.manpower = Math.min(this.maxManpower(nat.id), round1(nat.manpower + this.manpowerGrowth(nat.id)));
        const wars = this.warsOf(nat.id).length;
        nat.warExhaustion = clamp(nat.warExhaustion + (wars ? 1.5 * wars : -2.5), 0, 100);
        const target = this.stabilityTarget(nat.id);
        nat.stability = clamp(round1(nat.stability + clamp((target - nat.stability) * 0.12, -3, 3)), 0, 100);
        if (nat.gold < 0) {
          nat.army = round1(nat.army * 0.96);
          if (nat.id === this.state.playerId) this.addLog('Hazine boş! Ödenmeyen askerler firar ediyor.', 'bad', [nat.id]);
        }
        this._driftOpinions(nat);
      }
      MH.ai?.monthly(this);
      MH.events?.checkRandom(this);
      MH.goals?.check(this);
      this.emit('month', this.state.day);
    }

    _driftOpinions(nat) {
      const neighbors = new Set(this.neighborsOf(nat.id));
      for (const other of Object.keys(nat.opinions)) {
        let base = 0;
        if (nat.allies.includes(other)) base += 40;
        else if (neighbors.has(other)) base -= 20; // sınır sürtüşmesi
        if (nat.trade.includes(other)) base += 15;
        if (this.warBetween(nat.id, other)) base = -60;
        const v = nat.opinions[other];
        if (v < base) nat.opinions[other] = Math.min(base, v + 1);
        else if (v > base) nat.opinions[other] = Math.max(base, v - 1);
      }
    }

    // ------------------------------------------------------------------ ekonomi (AC 2.1)
    setTax(id, value) {
      const nat = this.state.nations[id];
      value = clamp(Math.round(value / 5) * 5, 0, 50);
      const delta = value - nat.tax;
      if (!delta) return this._result(true, 'Vergi oranı değişmedi.');
      nat.tax = value;
      const effects = [];
      if (delta > 0) {
        const hit = -round1(delta * 0.4);
        nat.stability = clamp(nat.stability + hit, 0, 100);
        effects.push(['İstikrar', hit]);
      } else {
        const gain = round1(-delta * 0.2);
        nat.stability = clamp(nat.stability + gain, 0, 100);
        effects.push(['İstikrar', gain]);
      }
      effects.push(['Aylık gelir', this.budget(id).total, 'abs']);
      this.addLog('Vergi oranı %' + value + ' olarak belirlendi.', delta > 0 ? 'warn' : 'good', [id]);
      return this._result(true, 'Vergi oranı %' + value + ' yapıldı.', effects);
    }

    setFocus(id, focus) {
      const nat = this.state.nations[id];
      if (!FOCUS[focus]) return this._result(false, 'Geçersiz üretim odağı.');
      if (nat.focus === focus) return this._result(false, 'Bu odak zaten etkin.');
      const wait = nat.focusChangedDay + 180 - this.state.day;
      if (wait > 0) return this._result(false, 'Üretim odağı ' + wait + ' gün sonra yeniden değiştirilebilir.');
      nat.focus = focus;
      nat.focusChangedDay = this.state.day;
      nat.stability = clamp(nat.stability - 3, 0, 100);
      this.addLog('Üretim odağı "' + FOCUS[focus].label + '" olarak değiştirildi.', 'info', [id]);
      return this._result(true, 'Yeni odak: ' + FOCUS[focus].label, [['İstikrar', -3], [FOCUS[focus].desc, null]]);
    }

    recruit(id, amount = 5) {
      const nat = this.state.nations[id];
      const cost = round1(amount * this.recruitCost(id));
      if (nat.manpower < amount) return this._result(false, 'Yeterli insan gücü yok.');
      if (nat.gold < cost) return this._result(false, 'Yeterli altın yok (' + cost + ' gerekli).');
      nat.manpower = round1(nat.manpower - amount);
      nat.gold = round1(nat.gold - cost);
      nat.army = round1(nat.army + amount);
      const effects = [['Ordu', amount, 'k'], ['Altın', -cost], ['İnsan gücü', -amount, 'k']];
      // Sınır komşuları büyüyen orduyu tehdit olarak görür
      if (nat.army > this.totalDev(id) * 0.9) {
        for (const nb of this.neighborsOf(id)) this._changeOpinion(nb, id, -2);
        effects.push(['Komşu ilişkileri', -2]);
      }
      return this._result(true, (amount * 1000).toLocaleString('tr-TR') + ' asker toplandı.', effects);
    }

    /** Paralı asker: insan gücü gerektirmez, ancak üç kat pahalıdır */
    hireMercenaries(id, amount = 5) {
      const nat = this.state.nations[id];
      const cost = round1(amount * RECRUIT_COST * 3);
      if (nat.gold < cost) return this._result(false, 'Paralı askerler için ' + cost + ' altın gerekli.');
      nat.gold = round1(nat.gold - cost);
      nat.army = round1(nat.army + amount);
      return this._result(true, (amount * 1000).toLocaleString('tr-TR') + ' paralı asker kiralandı.', [['Ordu', amount, 'k'], ['Altın', -cost]]);
    }

    festivalCost(id) {
      return Math.round(40 + this.totalDev(id) * 0.4);
    }

    /** Altın karşılığında halkın gönlünü kazanmak (yılda bir) */
    holdFestival(id) {
      const nat = this.state.nations[id];
      const wait = (nat.festivalDay ?? -Infinity) + 365 - this.state.day;
      if (wait > 0) return this._result(false, 'Yeni bir şenlik için ' + wait + ' gün beklenmeli.');
      const cost = this.festivalCost(id);
      if (nat.gold < cost) return this._result(false, 'Şenlik için ' + cost + ' altın gerekli.');
      nat.gold = round1(nat.gold - cost);
      nat.festivalDay = this.state.day;
      nat.stability = clamp(nat.stability + 8, 0, 100);
      nat.warExhaustion = clamp(nat.warExhaustion - 5, 0, 100);
      this.addLog('Başkentte büyük bir şenlik düzenlendi.', 'good', [id]);
      return this._result(true, 'Halk şenlikte coştu!', [['Altın', -cost], ['İstikrar', 8], ['Savaş yorgunluğu', -5]]);
    }

    disband(id, amount = 5) {
      const nat = this.state.nations[id];
      amount = Math.min(amount, Math.floor(nat.army));
      if (amount <= 0) return this._result(false, 'Terhis edilecek asker yok.');
      nat.army = round1(nat.army - amount);
      nat.manpower = Math.min(this.maxManpower(id), round1(nat.manpower + amount / 2));
      return this._result(true, (amount * 1000).toLocaleString('tr-TR') + ' asker terhis edildi.', [['Ordu', -amount, 'k'], ['İnsan gücü', amount / 2, 'k']]);
    }

    // ------------------------------------------------------------------ diplomasi (AC 2.2, 2.3)
    _result(ok, message, effects = []) {
      return { ok, message, effects };
    }

    _broadcastOpinion(subject, delta, filter) {
      let count = 0;
      for (const n of this.aliveNations()) {
        if (n.id === subject || (filter && !filter(n.id))) continue;
        this._changeOpinion(n.id, subject, delta);
        count++;
      }
      return count;
    }

    proposeTrade(from, to) {
      if (from === to) return this._result(false, 'Geçersiz hedef.');
      const target = this.state.nations[to];
      if (this.hasTrade(from, to)) return this._result(false, 'Zaten bir ticaret anlaşması var.');
      if (this.warBetween(from, to)) return this._result(false, 'Savaştaki bir ülkeyle ticaret yapılamaz.');
      const op = this.opinion(to, from);
      if (op < -10) return this._result(false, target.name + ' teklifi reddetti (ilişki: ' + op + ').');
      this._link(from, to, 'trade');
      this._changeOpinion(to, from, 10);
      this._changeOpinion(from, to, 10);
      this.addLog(this.state.nations[from].name + ' ile ' + target.name + ' ticaret anlaşması imzaladı.', 'good', [from, to]);
      return this._result(true, target.name + ' ticaret anlaşmasını kabul etti.', [[target.name + ' ilişkisi', 10], ['Aylık gelir', this.budget(from).total, 'abs']]);
    }

    cancelTrade(from, to) {
      if (!this.hasTrade(from, to)) return this._result(false, 'Ticaret anlaşması yok.');
      this._unlink(from, to, 'trade');
      this._changeOpinion(to, from, -20);
      this.addLog(this.state.nations[from].name + ', ' + this.state.nations[to].name + ' ile ticareti kesti.', 'warn', [from, to]);
      return this._result(true, 'Ticaret anlaşması iptal edildi.', [[this.state.nations[to].name + ' ilişkisi', -20]]);
    }

    proposeAlliance(from, to) {
      const a = this.state.nations[from];
      const b = this.state.nations[to];
      if (from === to) return this._result(false, 'Geçersiz hedef.');
      if (this.isAllied(from, to)) return this._result(false, 'Zaten müttefiksiniz.');
      if (this.warBetween(from, to)) return this._result(false, 'Önce barış yapmalısınız.');
      if (a.allies.length >= MAX_ALLIES) return this._result(false, 'En fazla ' + MAX_ALLIES + ' müttefikiniz olabilir.');
      if (b.allies.length >= MAX_ALLIES) return this._result(false, b.name + ' daha fazla ittifak kuramıyor.');
      const enemiesOfB = this.enemiesOf(to);
      if (b.allies.some((x) => this.warBetween(x, from))) return this._result(false, b.name + ' müttefikleriyle savaştığınız için reddetti.');
      const op = this.opinion(to, from);
      const need = enemiesOfB.length ? 35 : 50;
      if (op < need) return this._result(false, b.name + ' ittifakı reddetti (ilişki ' + op + ', gerekli ' + need + ').');
      this._link(from, to, 'allies');
      this._changeOpinion(to, from, 20);
      this._changeOpinion(from, to, 20);
      // Hedefin düşmanları bu yakınlaşmadan hoşlanmaz
      const rivals = this.aliveNations().filter((n) => n.id !== from && this.opinion(n.id, to) <= -40);
      for (const r of rivals) this._changeOpinion(r.id, from, -15);
      this.addLog(a.name + ' ile ' + b.name + ' ittifak kurdu.', 'good', [from, to]);
      const effects = [[b.name + ' ilişkisi', 20]];
      if (rivals.length) effects.push([rivals.length + ' rakip ülkenin ilişkisi', -15]);
      return this._result(true, b.name + ' ittifakı kabul etti!', effects);
    }

    breakAlliance(from, to) {
      if (!this.isAllied(from, to)) return this._result(false, 'Müttefik değilsiniz.');
      const a = this.state.nations[from];
      this._unlink(from, to, 'allies');
      this._changeOpinion(to, from, -50);
      for (const al of a.allies) this._changeOpinion(al, from, -10);
      a.stability = clamp(a.stability - 3, 0, 100);
      this.addLog(a.name + ', ' + this.state.nations[to].name + ' ile ittifakını bozdu.', 'warn', [from, to]);
      const effects = [[this.state.nations[to].name + ' ilişkisi', -50], ['İstikrar', -3]];
      if (a.allies.length) effects.push(['Diğer müttefiklerle ilişki', -10]);
      return this._result(true, 'İttifak bozuldu.', effects);
    }

    sendGift(from, to, amount = 50) {
      const a = this.state.nations[from];
      if (a.gold < amount) return this._result(false, 'Yeterli altın yok.');
      a.gold = round1(a.gold - amount);
      this.state.nations[to].gold = round1(this.state.nations[to].gold + amount);
      const gain = Math.min(30, Math.round(amount / 3));
      this._changeOpinion(to, from, gain);
      return this._result(true, this.state.nations[to].name + ' hediyeyi memnuniyetle kabul etti.', [['Altın', -amount], [this.state.nations[to].name + ' ilişkisi', gain]]);
    }

    canDeclareWar(from, to) {
      if (from === to) return 'Kendinize savaş açamazsınız.';
      if (!this.state.nations[to]?.alive) return 'Bu ülke artık yok.';
      if (this.warBetween(from, to)) return 'Zaten savaştasınız.';
      if (this.isAllied(from, to)) return 'Önce ittifakı bozmalısınız.';
      return null;
    }

    declareWar(from, to) {
      const err = this.canDeclareWar(from, to);
      if (err) return this._result(false, err);
      const a = this.state.nations[from];
      const b = this.state.nations[to];
      const effects = [];
      const truce = this.truceUntil(from, to);
      if (this.hasTrade(from, to)) this._unlink(from, to, 'trade');

      // AC 2.3: iç istikrar ve komşuların tutumu
      let stab = this.opinion(from, to) >= 0 ? -6 : -2;
      if (truce) {
        stab -= 12;
        this._broadcastOpinion(from, -10);
        effects.push(['Ateşkes ihlali — tüm ülkelerle ilişki', -10]);
      }
      a.stability = clamp(a.stability + stab, 0, 100);
      effects.push(['İstikrar', stab]);
      this._changeOpinion(to, from, -60);
      effects.push([b.name + ' ilişkisi', -60]);
      const worried = new Set([...this.neighborsOf(to), ...this.neighborsOf(from)]);
      worried.delete(from);
      worried.delete(to);
      for (const w of worried) this._changeOpinion(w, from, -10);
      if (worried.size) effects.push([worried.size + ' komşu ülkenin ilişkisi (saldırganlık)', -10]);
      for (const al of b.allies) this._changeOpinion(al, from, -30);

      this._startWar(from, to);
      this.addLog(a.name + ', ' + b.name + ' devletine savaş ilan etti!', 'war', [from, to]);

      // Savunma ittifakları devreye girer
      const joined = [];
      for (const al of [...b.allies]) {
        if (al === from || this.warBetween(al, from) || !this.state.nations[al].alive) continue;
        if (this.isAllied(al, from)) {
          this._unlink(al, from, 'allies');
          this._changeOpinion(al, from, -40);
        }
        this._startWar(al, from, true);
        joined.push(this.state.nations[al].name);
      }
      if (joined.length) {
        this.addLog(joined.join(', ') + ' müttefiki ' + b.name + ' yanında savaşa girdi.', 'war', [to]);
        effects.push(['Savunmaya katılanlar: ' + joined.join(', '), null]);
      }
      // Saldırganın müttefikleri, ilişkileri iyiyse çağrıya uyar
      const helpers = [];
      for (const al of [...a.allies]) {
        if (al === to || this.warBetween(al, to) || this.isAllied(al, to)) continue;
        if (this.opinion(al, from) >= 50) {
          this._startWar(al, to, true);
          helpers.push(this.state.nations[al].name);
        }
      }
      if (helpers.length) {
        this.addLog(helpers.join(', ') + ' çağrıya uyarak ' + a.name + ' yanında savaşa girdi.', 'war', [from]);
        effects.push(['Yanınızda savaşanlar: ' + helpers.join(', '), null]);
      }
      return this._result(true, b.name + ' ile savaş başladı!', effects);
    }

    _startWar(a, b, joined = false) {
      if (this.warBetween(a, b)) return null;
      const war = {
        id: this.state.nextWarId++,
        a,
        b,
        start: this.state.day,
        joined,
        captured: {},
        battles: {},
        capitals: {},
      };
      this.state.wars.push(war);
      this._unlink(a, b, 'allies');
      this._unlink(a, b, 'trade');
      delete this.state.truces[pairKey(a, b)];
      this.emit('wars', war);
      return war;
    }

    /** Barış teklifi; `to` yapay zekâ ise kabul edip etmeyeceğine karar verir */
    offerPeace(from, to, type = 'white', force = false) {
      const war = this.warBetween(from, to);
      if (!war) return this._result(false, 'Bu ülkeyle savaşta değilsiniz.');
      if (!PEACE_TYPES[type]) return this._result(false, 'Geçersiz barış türü.');
      const a = this.state.nations[from];
      const b = this.state.nations[to];
      const myScore = this.warScore(war, from);
      const theirScore = -myScore;
      const effects = [];

      if (!force) {
        if (type === 'white' && theirScore >= 25 && b.warExhaustion < 50) {
          return this._result(false, b.name + ' beyaz barışı reddetti — savaşı kazandığını düşünüyor (skor ' + theirScore + ').');
        }
        if (type === 'demand' && myScore < 30) {
          return this._result(false, b.name + ' tazminat talebini reddetti (savaş skoru ' + myScore + ', en az 30 gerekli).');
        }
        if (type === 'offer' && theirScore > 70) {
          return this._result(false, b.name + ' tazminatla yetinmiyor; tam zafer istiyor.');
        }
      }

      if (type === 'demand') {
        const amount = round1(Math.max(20, b.gold * 0.4));
        b.gold = round1(b.gold - amount);
        a.gold = round1(a.gold + amount);
        this._changeOpinion(to, from, -15);
        effects.push(['Altın', amount]);
      } else if (type === 'offer') {
        const amount = round1(Math.max(20, a.gold * 0.3));
        a.gold = round1(a.gold - amount);
        b.gold = round1(b.gold + amount);
        a.stability = clamp(a.stability - 4, 0, 100);
        effects.push(['Altın', -amount], ['İstikrar', -4]);
      }
      const pid = this.state.playerId;
      if ((pid === from || pid === to) && this.warScore(war, pid) >= 20) this._recordWin(pid === from ? to : from);
      this._endWar(war);
      a.stability = clamp(a.stability + 2, 0, 100);
      a.warExhaustion = clamp(a.warExhaustion - 10, 0, 100);
      b.warExhaustion = clamp(b.warExhaustion - 10, 0, 100);
      this._changeOpinion(to, from, 10);
      effects.push(['İstikrar', 2], ['Savaş yorgunluğu', -10], [b.name + ' ile 5 yıllık ateşkes', null]);
      this.addLog(a.name + ' ile ' + b.name + ' arasında barış imzalandı (' + PEACE_TYPES[type] + ').', 'peace', [from, to]);
      return this._result(true, b.name + ' barışı kabul etti: ' + PEACE_TYPES[type] + '.', effects);
    }

    _endWar(war) {
      this.state.wars = this.state.wars.filter((w) => w !== war);
      this.state.truces[pairKey(war.a, war.b)] = this.state.day + TRUCE_DAYS;
      this.emit('wars', war);
    }

    // ------------------------------------------------------------------ savaş ve harita (AC 3.2)
    _frontier(attacker, defender) {
      const { provinces } = this.grid;
      const owner = this.state.owner;
      const targets = new Set();
      owner.forEach((o, i) => {
        if (o !== defender) return;
        const p = provinces[i];
        if (p.neighbors.some((nb) => owner[nb] === attacker) || p.straits.some((nb) => owner[nb] === attacker)) targets.add(i);
      });
      return [...targets];
    }

    stanceOf(war, id) {
      return war.stance?.[id] || 'balanced';
    }

    /** Bir cephedeki savaş duruşunu belirler: taarruz, dengeli veya savunma */
    setWarStance(id, enemy, stance) {
      const war = this.warBetween(id, enemy);
      if (!war) return this._result(false, 'Bu ülkeyle savaşta değilsiniz.');
      if (!STANCES[stance]) return this._result(false, 'Geçersiz duruş.');
      war.stance = war.stance || {};
      war.stance[id] = stance;
      return this._result(true, this.state.nations[enemy].name + ' cephesi: ' + STANCES[stance].label, [[STANCES[stance].desc, null]]);
    }

    _dailyCombat() {
      const wars = [...this.state.wars];
      // Ordular yalnızca gerçek cephesi olan savaşlara, duruş ağırlığına göre bölünür
      const active = [];
      const weightSum = {};
      for (const w of wars) {
        if (!this._frontier(w.a, w.b).length && !this._frontier(w.b, w.a).length) continue;
        active.push(w);
        for (const id of [w.a, w.b]) weightSum[id] = (weightSum[id] || 0) + STANCES[this.stanceOf(w, id)].weight;
      }
      const committed = (war, id) => {
        const nat = this.state.nations[id];
        return Math.max(0, nat.army) * (STANCES[this.stanceOf(war, id)].weight / (weightSum[id] || 1));
      };
      for (const war of active) {
        if (!this.state.wars.includes(war)) continue;
        const A = this.state.nations[war.a];
        const B = this.state.nations[war.b];
        if (!A.alive || !B.alive) continue;
        const stA = STANCES[this.stanceOf(war, war.a)];
        const stB = STANCES[this.stanceOf(war, war.b)];
        if (this.random() > 0.08 * ((stA.aggression + stB.aggression) / 4)) continue;
        const frontB = this._frontier(war.a, war.b);
        const frontA = this._frontier(war.b, war.a);
        if (!frontA.length && !frontB.length) continue;
        const cA = committed(war, war.a);
        const cB = committed(war, war.b);
        const sA = cA * this.quality(war.a);
        const sB = cB * this.quality(war.b);
        // Saldıran taraf duruşa göre seçilir; savunan kendi topraklarında avantajlıdır
        const aAttacks = this.random() < stA.aggression / (stA.aggression + stB.aggression);
        const eA = sA * (aAttacks ? 1 : stA.defense);
        const eB = sB * (aAttacks ? stB.defense : 1);
        const pA = (eA ** 1.5 + 0.5) / (eA ** 1.5 + eB ** 1.5 + 1);
        const aWins = this.random() < pA;
        const [win, lose, frontLose, sWin, sLose, cWin, cLose] = aWins
          ? [war.a, war.b, frontB, sA, sB, cA, cB]
          : [war.b, war.a, frontA, sB, sA, cB, cA];
        const W = this.state.nations[win];
        const L = this.state.nations[lose];
        const attacker = aAttacks ? war.a : war.b;
        const attackerWon = attacker === win;
        const lossMult = (id) => (this.stanceOf(war, id) === 'offensive' && id === attacker ? 1.2 : 1);
        const lossL = round1(Math.min(L.army, cLose * (0.06 + this.random() * 0.08) * lossMult(lose) + 0.5));
        const lossW = round1(Math.min(W.army, cWin * (0.02 + this.random() * 0.04) * (sLose / Math.max(1, sWin + sLose)) * 2 * lossMult(win)));
        L.army = round1(L.army - lossL);
        W.army = round1(W.army - lossW);
        war.battles[win] = (war.battles[win] || 0) + 1;
        if (lose === this.state.playerId || win === this.state.playerId) {
          L.warExhaustion = clamp(L.warExhaustion + 1, 0, 100);
        }
        const captureChance = STANCES[this.stanceOf(war, win)].capture;
        let captured = null;
        if (frontLose.length && attackerWon && this.random() < captureChance) captured = this._capture(war, win, lose, frontLose);
        if (win === this.state.playerId || lose === this.state.playerId) {
          this.emit('battle', { war, winner: win, loser: lose, lossW, lossL, captured });
        }
      }
    }

    _capture(war, winner, loser, front) {
      const L = this.state.nations[loser];
      let options = front.filter((p) => p !== L.capital);
      if (!options.length) options = front;
      // Daha az gelişmiş, savunması zayıf eyaletler önce düşer
      options.sort((x, y) => this.state.dev[x] - this.state.dev[y]);
      const pid = options[Math.floor(this.random() * Math.min(3, options.length))];
      // Başkentler surlarla korunur; düşmeleri daha zordur
      const lastStand = this.provincesOf(loser).length === 1;
      if (pid === L.capital && this.random() > (lastStand ? 0.15 : 0.3)) return null;
      this.transferProvince(pid, winner, war);
      return pid;
    }

    /** Eyaletin sahibini değiştirir ve haritayı anında günceller */
    transferProvince(pid, newOwner, war = null) {
      const old = this.state.owner[pid];
      if (old === newOwner) return;
      this.state.owner[pid] = newOwner;
      const W = this.state.nations[newOwner];
      W.peakProvinces = Math.max(W.peakProvinces, this.provincesOf(newOwner).length);
      if (war) war.captured[newOwner] = (war.captured[newOwner] || 0) + 1;
      this._borderCache = null;
      this.emit('province', { id: pid, from: old, to: newOwner });

      const L = old ? this.state.nations[old] : null;
      if (!L) return;
      if (L.capital === pid) {
        if (war) war.capitals[newOwner] = (war.capitals[newOwner] || 0) + 1;
        L.stability = clamp(L.stability - 10, 0, 100);
        const rest = this.provincesOf(old);
        if (rest.length) {
          L.capital = rest.reduce((best, p) => (this.state.dev[p] > this.state.dev[best] ? p : best), rest[0]);
          this.addLog(L.name + ' başkentini kaybetti! Yeni başkent belirlendi.', 'war', [old, newOwner]);
        }
      }
      if (newOwner === this.state.playerId || old === this.state.playerId) {
        this.addLog(
          (newOwner === this.state.playerId ? 'Fetih: ' : 'Kayıp: ') + 'bir eyalet ' + L.name + ' → ' + W.name + ' eline geçti.',
          newOwner === this.state.playerId ? 'good' : 'bad',
          [old, newOwner],
        );
      }
      if (!this.provincesOf(old).length) this._eliminate(old, newOwner);
    }

    _eliminate(id, by) {
      const nat = this.state.nations[id];
      nat.alive = false;
      nat.army = 0;
      for (const w of this.warsOf(id)) this.state.wars = this.state.wars.filter((x) => x !== w);
      for (const other of [...nat.allies]) this._unlink(id, other, 'allies');
      for (const other of [...nat.trade]) this._unlink(id, other, 'trade');
      this.state.eventQueue = this.state.eventQueue.filter((e) => e.ctx?.target !== id);
      this.addLog(nat.name + ' tarih sahnesinden silindi! (' + this.state.nations[by].name + ' tarafından)', 'war', [id, by]);
      if (by === this.state.playerId) this._recordWin(id);
      this.emit('wars', null);
      if (id === this.state.playerId) {
        this.state.gameOver = { type: 'defeat', day: this.state.day, by };
        this.state.ended = MH.goals?.evaluate(this) || null;
        this.state.speed = 0;
        this.emit('gameover', this.state.gameOver);
      }
    }

    _recordWin(enemy) {
      if (!this.state.beaten.includes(enemy)) this.state.beaten.push(enemy);
    }

    /** Senaryo bitiş tarihine ulaşıldı: sonuçları değerlendirir; oyuncu isterse devam edebilir */
    endScenario() {
      this.state.ended = MH.goals ? MH.goals.evaluate(this) : { day: this.state.day };
      this.addLog('📜 ' + this.scenario.title + ' senaryosu sona erdi.', 'player', [this.state.playerId]);
      this.state.speed = 0;
      this.emit('speed', 0);
      this.emit('scenarioEnd', this.state.ended);
    }

    /** Farklı sahipli komşu eyaletler arasındaki sınır kenarları (harita çizimi için) */
    borderPairs() {
      if (this._borderCache) return this._borderCache;
      const { provinces } = this.grid;
      const owner = this.state.owner;
      const out = [];
      for (const p of provinces) {
        for (const nb of p.neighbors) if (nb > p.id && owner[nb] !== owner[p.id]) out.push([p.id, nb]);
      }
      this._borderCache = out;
      return out;
    }

    // ------------------------------------------------------------------ olaylar (AC 4)
    queueEvent(eventId, nationId, ctx = {}) {
      const prevSpeed = this.state.speed;
      this.state.eventQueue.push({ eventId, nationId, ctx });
      this.state.speed = 0;
      this.emit('speed', 0);
      this.emit('event', { pending: this.state.eventQueue[0], prevSpeed });
    }

    currentEvent() {
      return this.state.eventQueue[0] || null;
    }

    resolveEvent(optionIndex) {
      const pending = this.state.eventQueue[0];
      if (!pending) return this._result(false, 'Bekleyen olay yok.');
      const res = MH.events.apply(this, pending, optionIndex);
      this.state.eventQueue.shift();
      if (this.state.eventQueue.length) this.emit('event', { pending: this.state.eventQueue[0], prevSpeed: 0 });
      return res;
    }

    /** Olay seçeneklerinde kullanılan genel etki uygulayıcı */
    applyEffects(id, fx, ctx = {}) {
      const nat = this.state.nations[id];
      const out = [];
      if (!fx) return out;
      const add = (field, delta, label, unit) => {
        if (!delta) return;
        nat[field] = round1(nat[field] + delta);
        out.push([label, round1(delta), unit]);
      };
      if (fx.goldPct) add('gold', Math.round(Math.max(0, nat.gold) * fx.goldPct), 'Altın');
      add('gold', fx.gold, 'Altın');
      if (fx.manpowerPct) add('manpower', round1(nat.manpower * fx.manpowerPct), 'İnsan gücü', 'k');
      add('manpower', fx.manpower, 'İnsan gücü', 'k');
      if (fx.armyPct) add('army', round1(nat.army * fx.armyPct), 'Ordu', 'k');
      add('army', fx.army, 'Ordu', 'k');
      if (fx.stability) {
        nat.stability = clamp(round1(nat.stability + fx.stability), 0, 100);
        out.push(['İstikrar', fx.stability]);
      }
      if (fx.warExhaustion) {
        nat.warExhaustion = clamp(nat.warExhaustion + fx.warExhaustion, 0, 100);
        out.push(['Savaş yorgunluğu', fx.warExhaustion]);
      }
      if (fx.tax) {
        nat.tax = clamp(nat.tax + fx.tax, 0, 50);
        out.push(['Vergi oranı', fx.tax, '%']);
      }
      if (fx.capitalDev && nat.capital >= 0) {
        this.state.dev[nat.capital] = Math.max(1, this.state.dev[nat.capital] + fx.capitalDev);
        out.push(['Başkent gelişimi', fx.capitalDev]);
      }
      if (fx.devAll) {
        this.state.owner.forEach((o, i) => { if (o === id) this.state.dev[i] = Math.max(1, this.state.dev[i] + fx.devAll); });
        out.push(['Tüm eyaletlerin gelişimi', fx.devAll]);
      }
      if (fx.opinionTarget && ctx.target) {
        this._changeOpinion(ctx.target, id, fx.opinionTarget);
        out.push([this.state.nations[ctx.target].name + ' ilişkisi', fx.opinionTarget]);
      }
      if (fx.opinionNeighbors) {
        for (const nb of this.neighborsOf(id)) this._changeOpinion(nb, id, fx.opinionNeighbors);
        out.push(['Komşu ilişkileri', fx.opinionNeighbors]);
      }
      if (fx.opinionAll) {
        this._broadcastOpinion(id, fx.opinionAll);
        out.push(['Tüm ülkelerle ilişki', fx.opinionAll]);
      }
      if (fx.opinionWith) {
        for (const [other, v] of Object.entries(fx.opinionWith)) {
          if (!this.state.nations[other]?.alive) continue;
          this._changeOpinion(other, id, v);
          out.push([this.state.nations[other].name + ' ilişkisi', v]);
        }
      }
      return out;
    }
  }

  MH.Game = Game;
  MH.FOCUS = FOCUS;
  MH.PEACE_TYPES = PEACE_TYPES;
  MH.STANCES = STANCES;
  MH.util = { clamp, round1, parseDay, dayToDate, formatDay, pairKey, MONTHS, SPEEDS };
})((globalThis.MH = globalThis.MH || {}));
