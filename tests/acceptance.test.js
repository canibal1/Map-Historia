'use strict';
/*
 * User Story kabul kriterleri testleri.
 * Çalıştırma: npm test   (veya: node --test tests/)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { MH, newGame } = require('./helpers');

// ---------------------------------------------------------------- 1. Ulus ve senaryo seçimi
test('AC 1.1 — farklı tarihsel dönemlere ait birden çok senaryo seçilebilir', () => {
  assert.ok(MH.SCENARIOS.length >= 3);
  const years = new Set(MH.SCENARIOS.map((s) => s.year));
  assert.equal(years.size, MH.SCENARIOS.length, 'her senaryo farklı bir döneme ait olmalı');
  for (const sc of MH.SCENARIOS) {
    assert.ok(sc.title && sc.description && sc.startDate, sc.id + ' menü bilgileri eksik');
    const game = MH.Game.create(sc.id);
    assert.equal(MH.util.formatDay(game.state.day).endsWith(String(sc.year)), true);
  }
  assert.throws(() => MH.Game.create('yok-boyle-senaryo'));
});

test('AC 1.2 — seçilen dönemin haritasında her ülke kontrol edilebilir', () => {
  for (const sc of MH.SCENARIOS) {
    const game = MH.Game.create(sc.id);
    // Eyaletler ya bir ulusa aittir ya da (kabile toprakları gibi) sahipsizdir
    assert.ok(game.state.owner.every((o) => o === null || game.nation(o)?.alive), sc.id + ': geçersiz eyalet sahibi');
    const owned = game.state.owner.filter(Boolean).length / game.state.owner.length;
    assert.ok(owned > 0.55, sc.id + ': haritanın çoğu ulusların elinde olmalı (' + owned.toFixed(2) + ')');
    assert.ok(game.aliveNations().length >= 70, sc.id + ': dünya ölçeğinde onlarca ulus');
    for (const def of sc.nations) {
      const nat = game.nation(def.id);
      assert.ok(game.provincesOf(def.id).length >= 1, def.id + ' en az bir eyalete sahip olmalı');
      assert.equal(game.state.owner[nat.capital], def.id, def.id + ' kendi başkentine sahip olmalı');
      assert.ok(nat.leader, def.id + ' bir lidere sahip olmalı');
    }
  }
  const game = MH.Game.create('great-war-1914');
  game.setPlayer('serbia');
  assert.equal(game.player.id, 'serbia');
  assert.throws(() => game.setPlayer('atlantis'));
});

test('AC 1.3 — başlangıç kaynakları, askeri güç ve diplomatik durum özetlenir', () => {
  const game = MH.Game.create('hundred-days-1815');
  const s = game.summary('france');
  for (const key of ['gold', 'budget', 'manpower', 'provinces', 'development', 'stability', 'tax', 'focus']) {
    assert.ok(key in s, 'kaynak alanı eksik: ' + key);
  }
  for (const key of ['army', 'strength', 'powerRank']) assert.ok(key in s, 'askeri alan eksik: ' + key);
  for (const key of ['allies', 'wars', 'trade', 'neighbors', 'friends', 'rivals']) assert.ok(Array.isArray(s[key]), 'diplomatik alan eksik: ' + key);
  assert.equal(s.army, 130);
  assert.ok(s.wars.includes('Birleşik Krallık'), "1815'te Fransa koalisyonla savaşta başlar");
  assert.ok(s.allies.includes('Napoli Krallığı'));
});

// ---------------------------------------------------------------- 2. Stratejik yönetim
test('AC 2.1 — vergi oranı bütçeyi ve istikrarı değiştirir', () => {
  const game = newGame();
  const p = game.player;
  const before = game.budget(p.id).tax;
  const stab = p.stability;
  const res = game.setTax(p.id, 35);
  assert.ok(res.ok);
  assert.equal(p.tax, 35);
  assert.ok(game.budget(p.id).tax > before, 'yüksek vergi daha fazla gelir getirir');
  assert.ok(p.stability < stab, 'vergi artışı istikrarı düşürür');
  assert.ok(game.stabilityTarget(p.id) < 60, 'yüksek vergi uzun vadeli istikrar hedefini düşürür');
  const s2 = p.stability;
  game.setTax(p.id, 10);
  assert.ok(p.stability > s2, 'vergi indirimi istikrarı artırır');
  game.setTax(p.id, 99);
  assert.equal(p.tax, 50, 'vergi %50 ile sınırlıdır');
});

test('AC 2.1 — üretim odağı değiştirilebilir, bekleme süresi uygulanır', () => {
  const game = newGame();
  const id = game.state.playerId;
  game.player.focus = 'agriculture';
  const taxBefore = game.budget(id).tax;
  const res = game.setFocus(id, 'industry');
  assert.ok(res.ok);
  assert.ok(game.budget(id).tax > taxBefore, 'sanayi odağı vergi gelirini artırır');
  assert.equal(game.setFocus(id, 'trade').ok, false, '180 gün dolmadan tekrar değiştirilemez');
  game.state.day += 181;
  assert.ok(game.setFocus(id, 'trade').ok);
  assert.equal(game.setFocus(id, 'nope').ok, false);
});

test('AC 2.1 — ticaret anlaşmaları gelir sağlar', () => {
  const game = newGame('fall-1453', 'venice');
  game.nation('papal').opinions.venice = -40;
  assert.equal(game.proposeTrade('venice', 'papal').ok, false, 'ilişkisi kötü ülke (−40) reddeder');
  const before = game.budget('venice').total;
  const res = game.proposeTrade('venice', 'hungary');
  assert.ok(res.ok, res.message);
  assert.ok(game.budget('venice').total > before);
  assert.ok(game.cancelTrade('venice', 'hungary').ok);
  assert.equal(game.hasTrade('venice', 'hungary'), false);
});

test('AC 2.2 — ittifak kurma: ilişkiye göre kabul veya ret', () => {
  const game = newGame('fall-1453', 'castile');
  game.nation('portugal').opinions.castile = 10;
  const rejected = game.proposeAlliance('castile', 'portugal');
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /reddetti/);
  game.nation('portugal').opinions.castile = 70;
  const accepted = game.proposeAlliance('castile', 'portugal');
  assert.ok(accepted.ok, accepted.message);
  assert.ok(game.isAllied('castile', 'portugal') && game.isAllied('portugal', 'castile'));
});

test('AC 2.2 — savaş ilanı müttefikleri savaşa çeker', () => {
  const game = newGame('great-war-1914', 'austria');
  const res = game.declareWar('austria', 'serbia');
  assert.ok(res.ok);
  assert.ok(game.warBetween('austria', 'serbia'));
  assert.ok(game.warBetween('russia', 'austria'), "Rusya Sırbistan'ın müttefiki olarak savaşa girer");
  assert.ok(game.warBetween('germany', 'serbia'), 'Almanya çağrıya uyar');
  assert.equal(game.declareWar('austria', 'germany').ok, false, 'müttefike savaş açılamaz');
});

test('AC 2.2 — barış antlaşması savaşı bitirir ve ateşkes başlatır', () => {
  const game = newGame('fall-1453', 'england');
  assert.ok(game.warBetween('england', 'france'));
  const res = game.offerPeace('england', 'france', 'white');
  assert.ok(res.ok, res.message);
  assert.equal(game.warBetween('england', 'france'), null);
  assert.ok(game.truceUntil('england', 'france') > game.state.day);
  // Ateşkesi bozmak ağır istikrar cezası getirir
  const stab = game.player.stability;
  game.declareWar('england', 'france');
  assert.ok(game.player.stability <= stab - 14);
});

test('AC 2.2 — tazminat ancak savaş kazanılıyorsa alınabilir', () => {
  const game = newGame('fall-1453', 'france');
  const war = game.warBetween('france', 'england');
  assert.equal(game.offerPeace('france', 'england', 'demand').ok, false);
  war.captured.france = 5;
  const gold = game.player.gold;
  const res = game.offerPeace('france', 'england', 'demand');
  assert.ok(res.ok, res.message);
  assert.ok(game.player.gold > gold);
});

test('AC 2.3 — savaş ilanı iç istikrarı ve komşuların tutumunu kötüleştirir', () => {
  const game = newGame('fall-1453', 'hungary');
  const neighbors = game.neighborsOf('hungary').filter((n) => n !== 'hre');
  const before = Object.fromEntries(neighbors.map((n) => [n, game.opinion(n, 'hungary')]));
  const stab = game.player.stability;
  const res = game.declareWar('hungary', 'hre');
  assert.ok(res.ok);
  assert.ok(game.player.stability < stab, 'istikrar düşer');
  for (const n of neighbors) assert.ok(game.opinion(n, 'hungary') < before[n], n + ' tutumu kötüleşmeli');
  assert.ok(res.effects.some(([label]) => /İstikrar/.test(label)), 'sonuçlar oyuncuya raporlanır');
});

test('AC 2.3 — olumlu kararlar ilişkileri iyileştirir, ittifak bozmak zarar verir', () => {
  const game = newGame('fall-1453', 'france');
  const op = game.opinion('castile', 'france');
  game.sendGift('france', 'castile', 60);
  assert.ok(game.opinion('castile', 'france') > op, 'hediye ilişkiyi iyileştirir');
  const opScot = game.opinion('scotland', 'france');
  const stab = game.player.stability;
  game.breakAlliance('france', 'scotland');
  assert.ok(game.opinion('scotland', 'france') < opScot - 40);
  assert.ok(game.player.stability < stab);
});

// ---------------------------------------------------------------- 3. Zaman akışı ve harita
test('AC 3.1 — oyun zamanı duraklatılabilir, hızlandırılabilir ve normal akabilir', () => {
  const game = newGame();
  game.state.eventQueue = [];
  assert.equal(game.state.speed, 0, 'oyun duraklatılmış başlar');
  assert.ok(game.setSpeed(1));
  const normal = game.msPerDay();
  game.setSpeed(3);
  assert.ok(game.msPerDay() < normal, 'yüksek hızda bir gün daha kısa sürer');
  game.setSpeed(0);
  assert.equal(game.msPerDay(), 0);
  const day = game.state.day;
  game.tick();
  assert.equal(game.state.day, day + 1);
  assert.throws(() => game.setSpeed(7));
});

test('AC 3.1 — bekleyen olay varken zaman akmaz', () => {
  const game = newGame();
  game.setSpeed(2);
  game.queueEvent('good_harvest', game.state.playerId, {});
  assert.equal(game.state.speed, 0);
  assert.equal(game.setSpeed(1), false);
  game.resolveEvent(0);
  assert.ok(game.setSpeed(1));
});

test('AC 3.2 — fetihler haritayı anında günceller', () => {
  const game = newGame('fall-1453', 'ottoman');
  const changes = [];
  game.on('province', (e) => changes.push(e));
  game.declareWar('ottoman', 'byzantium');
  const target = game.provincesOf('byzantium')[0];
  game.transferProvince(target, 'ottoman', game.warBetween('ottoman', 'byzantium'));
  assert.equal(game.state.owner[target], 'ottoman');
  assert.deepEqual(changes.at(-1), { id: target, from: 'byzantium', to: 'ottoman' });
  assert.ok(game.borderPairs().length > 0, 'sınırlar yeniden hesaplanır');
});

test('AC 3.2 — savaşlar zamanla toprak değiştirir; tüm topraklarını kaybeden ulus yok olur', () => {
  const game = newGame('fall-1453', 'castile');
  game.declareWar('castile', 'granada');
  const start = game.provincesOf('granada').length;
  game.player.army = 80;
  let moved = 0;
  game.on('province', () => moved++);
  for (let i = 0; i < 365 * 3 && game.nation('granada').alive; i++) {
    game.tick();
    game.state.eventQueue = [];
  }
  assert.ok(moved > 0, 'en az bir eyalet el değiştirmeli');
  assert.ok(game.provincesOf('granada').length < start || !game.nation('granada').alive);
});

// ---------------------------------------------------------------- 4. Alternatif tarih olayları
test('AC 4.1 — belirli aralıklarla rastgele olaylar oyuncuya gelir', () => {
  const game = newGame('fall-1453', 'france');
  const seen = [];
  for (let i = 0; i < 365 * 4; i++) {
    game.tick();
    while (game.currentEvent()) {
      seen.push(game.currentEvent());
      game.resolveEvent(0);
    }
  }
  const random = seen.filter((e) => {
    const ev = MH.events.BY_ID[e.eventId];
    return !ev.date && !ev.dynamic;
  });
  assert.ok(random.length >= 6, '4 yılda en az 6 rastgele olay beklenir, gelen: ' + random.length);
  for (const sc of MH.SCENARIOS) {
    const g = newGame(sc.id, sc.nations[0].id);
    let count = 0;
    for (let i = 0; i < 365 * 2 && !g.state.gameOver; i++) {
      g.tick();
      while (g.currentEvent()) {
        if (!MH.events.BY_ID[g.currentEvent().eventId].date) count++;
        g.resolveEvent(0);
      }
    }
    assert.ok(count >= 2, sc.id + ': 2 yılda en az 2 olay beklenir, gelen: ' + count);
  }
});

test('AC 4.1 — tarihî olaylar kendi tarihinde tetiklenir', () => {
  const game = newGame('great-war-1914', 'austria');
  MH.events.checkScheduled(game);
  assert.equal(game.currentEvent()?.eventId, 'sarajevo');
  // Yapay zekâ ulusları tarihî olaylara kendi karar verir
  const g2 = newGame('great-war-1914', 'spain');
  MH.events.checkScheduled(g2);
  assert.ok(g2.warBetween('austria', 'serbia'), 'yapay zekâ Avusturya ültimatom seçeneğini uygular');
  assert.equal(g2.currentEvent()?.eventId, 'sarajevo_news', 'diğer oyunculara haber olayı gelir');
});

test('AC 4.2 — her olayda en az iki seçenek vardır', () => {
  for (const ev of MH.events.EVENTS) {
    assert.ok(ev.options.length >= 2, ev.id + ' en az iki seçenek içermeli');
    for (const opt of ev.options) assert.ok(opt.text && (opt.effects || opt.run || opt.random), ev.id + ': her seçeneğin bir sonucu olmalı');
  }
});

test('AC 4.2 — farklı seçenekler farklı sonuçlar doğurur', () => {
  const outcome = (i) => {
    const game = newGame('fall-1453', 'france');
    game.queueEvent('noble_intrigue', 'france', {});
    const gold = game.player.gold;
    const stab = game.player.stability;
    const res = game.resolveEvent(i);
    return { gold: game.player.gold - gold, stab: game.player.stability - stab, res };
  };
  const a = outcome(0);
  const b = outcome(1);
  assert.ok(a.gold > 0 && a.stab < 0, 'tutuklama: altın artar, istikrar düşer');
  assert.ok(b.gold < 0 && b.stab > 0, 'taviz: altın azalır, istikrar artar');
  assert.ok(a.res.effects.length && b.res.effects.length, 'sonuçlar oyuncuya gösterilir');
});

test('AC 4.2 — tarihî olayda seçim alternatif tarih yaratır', () => {
  // Bizans haraç öderse Osmanlı kuşatması gerçekleşmez
  const game = newGame('fall-1453', 'byzantium');
  game.state.day = MH.util.parseDay('1453-03-01');
  MH.events.checkScheduled(game);
  assert.equal(game.currentEvent().eventId, 'byzantium_plea');
  game.resolveEvent(1);
  game.state.day = MH.util.parseDay('1453-04-06');
  MH.events.checkScheduled(game);
  assert.equal(game.nation('byzantium').alive, true);
  assert.equal(game.warBetween('ottoman', 'byzantium'), null, 'kuşatma ertelendi');
});

// ---------------------------------------------------------------- genel
test('Kayıt ve yükleme durumu eksiksiz korur', () => {
  const game = newGame('hundred-days-1815', 'prussia');
  game.advanceDays(40);
  game.state.eventQueue = [];
  const copy = MH.Game.load(game.serialize());
  assert.equal(copy.state.day, game.state.day);
  assert.deepEqual(copy.state.owner, game.state.owner);
  assert.equal(copy.player.id, 'prussia');
  copy.setFocus('prussia', 'trade'); // -Infinity → null dönüşümü sorun çıkarmamalı
  assert.throws(() => MH.Game.load('{"version":99}'));
});

test('Aynı senaryo her seferinde aynı haritayla başlar', () => {
  const a = MH.Game.create('fall-1453');
  const b = MH.Game.create('fall-1453');
  assert.deepEqual(a.state.owner, b.state.owner);
});
