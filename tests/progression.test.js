'use strict';
/*
 * "…kendi imparatorluğumu ve hikâyemi yaratabileyim" — hedefler, kronik, senaryo sonu
 * ve savaşta oyuncuya söz hakkı veren mekanikler.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { MH, newGame } = require('./helpers');

test('Her ulusun hayatta kalma, büyüme ve (varsa) tarihî hedefleri vardır', () => {
  const game = newGame('fall-1453', 'ottoman');
  const goals = game.state.goals;
  assert.ok(goals.some((g) => g.type === 'survive'));
  assert.ok(goals.some((g) => g.type === 'grow' && g.count > game.provincesOf('ottoman').length));
  assert.ok(goals.some((g) => g.label.includes('Konstantinopolis')));
  for (const sc of MH.SCENARIOS) {
    const g = MH.Game.create(sc.id);
    for (const def of sc.nations) assert.ok(MH.goals.goalsFor(g, def.id).length >= 2, def.id);
  }
});

test('Hedef tamamlanınca işaretlenir ve kroniğe yazılır', () => {
  const game = newGame('fall-1453', 'ottoman');
  const goal = game.state.goals.find((g) => g.label.includes('Konstantinopolis'));
  const done = [];
  game.on('goal', (g) => done.push(g));
  game.transferProvince(game.nation('byzantium').capital, 'ottoman');
  MH.goals.check(game);
  assert.equal(goal.done, true);
  assert.equal(done[0], goal);
  assert.ok(game.state.chronicle.some((c) => c.text.includes(goal.label)));
});

test('Kazançlı barış ve yok etme "yenilen" listesine girer', () => {
  const game = newGame('hundred-days-1815', 'uk');
  const war = game.warBetween('uk', 'france');
  war.captured.uk = 4;
  assert.ok(game.offerPeace('uk', 'france', 'demand').ok);
  assert.ok(game.state.beaten.includes('france'));
  assert.ok(game.state.goals.find((g) => g.type === 'beat').done === false, 'aylık kontrolden önce işaretlenmez');
  MH.goals.check(game);
  assert.ok(game.state.goals.find((g) => g.type === 'beat').done);
});

test('Senaryo bitiş tarihinde sonuç değerlendirilir ve oyun durur', () => {
  const game = newGame('great-war-1914', 'sweden');
  let ended = null;
  game.on('scenarioEnd', (r) => { ended = r; });
  const play = (days) => {
    for (let i = 0; i < days; i++) {
      game.tick();
      while (game.currentEvent()) game.resolveEvent(0);
    }
  };
  game.state.endDay = game.state.day + 3;
  game.setSpeed(2);
  play(5);
  assert.ok(ended, 'scenarioEnd olayı yayınlanmalı');
  assert.equal(game.state.speed, 0);
  assert.ok(ended.score >= 0 && ended.score <= 100);
  assert.ok(ended.rank);
  assert.equal(ended.goalsTotal, game.state.goals.length);
  assert.ok(game.state.goals.find((g) => g.type === 'survive').done, 'İsveç ayakta kaldı');
  // Oyuncu isterse devam edebilir; bitiş tekrar tetiklenmez
  let again = false;
  game.on('scenarioEnd', () => { again = true; });
  play(3);
  assert.equal(again, false);
});

test('Yenilgide de kronik ve değerlendirme oluşur', () => {
  const game = newGame('fall-1453', 'albania');
  for (const pid of game.provincesOf('albania')) game.transferProvince(pid, 'ottoman', game.warBetween('albania', 'ottoman'));
  assert.equal(game.state.gameOver.type, 'defeat');
  assert.ok(game.state.ended);
  assert.equal(game.state.ended.alive, false);
  assert.ok(game.state.chronicle.length >= 2);
});

test('Cephe duruşu: taarruz daha fazla toprak, savunma daha az kayıp getirir', () => {
  const run = (playerStance) => {
    let taken = 0;
    let lost = 0;
    for (let seed = 0; seed < 6; seed++) {
      const game = newGame('great-war-1914', 'spain');
      game.state.rng = 1000 + seed;
      game.declareWar('spain', 'portugal');
      game.nation('portugal').army = 60;
      game.player.army = 60;
      game.setWarStance('spain', 'portugal', playerStance);
      const p0 = game.provincesOf('spain').length;
      for (let d = 0; d < 300 && game.warBetween('spain', 'portugal'); d++) {
        game._dailyCombat();
      }
      taken += Math.max(0, game.provincesOf('spain').length - p0);
      lost += 60 - game.player.army;
    }
    return { taken, lost };
  };
  const off = run('offensive');
  const def = run('defensive');
  assert.ok(off.taken > def.taken, `taarruz ${off.taken} > savunma ${def.taken}`);
  assert.ok(def.lost < off.lost, `savunma kaybı ${def.lost} < taarruz kaybı ${off.lost}`);
  assert.equal(newGame().setWarStance('ottoman', 'france', 'offensive').ok, false, 'savaş yoksa duruş seçilemez');
});

test('Paralı asker insan gücü harcamaz; şenlik yılda bir istikrar verir', () => {
  const game = newGame('fall-1453', 'venice');
  const p = game.player;
  p.gold = 500;
  const mp = p.manpower;
  const army = p.army;
  assert.ok(game.hireMercenaries('venice', 5).ok);
  assert.equal(p.manpower, mp);
  assert.equal(p.army, army + 5);
  assert.equal(p.gold, 425);
  const stab = p.stability;
  assert.ok(game.holdFestival('venice').ok);
  assert.ok(p.stability > stab);
  assert.equal(game.holdFestival('venice').ok, false, 'bekleme süresi');
  game.state.day += 366;
  assert.ok(game.holdFestival('venice').ok);
});

test('Kazanan yapay zekâ oyuncuya şartlarını dayatır', () => {
  const game = newGame('fall-1453', 'albania');
  const war = game.warBetween('albania', 'ottoman');
  war.captured.ottoman = 6;
  war.start -= 200;
  for (let i = 0; i < 40 && !game.currentEvent(); i++) MH.ai.monthly(game);
  const ev = game.currentEvent();
  assert.ok(ev, 'bir barış talebi gelmeli');
  assert.equal(ev.eventId, 'ai_peace_demand');
  const gold = game.player.gold;
  game.resolveEvent(0);
  assert.equal(game.warBetween('albania', 'ottoman'), null);
  assert.ok(game.player.gold < gold);
});

test('Eski kayıtlar yeni alanlarla yüklenebilir', () => {
  const game = newGame('fall-1453', 'france');
  const st = JSON.parse(game.serialize());
  delete st.goals; delete st.chronicle; delete st.beaten; delete st.endDay; delete st.ended;
  st.lastEventDay = 0;
  const copy = MH.Game.load(st);
  assert.ok(copy.state.endDay > copy.state.day);
  assert.ok(copy.state.lastEventDay < copy.state.day, 'eski 0 değeri düzeltilir');
  copy.advanceDays(40);
});
