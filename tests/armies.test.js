'use strict';
/*
 * Haritada hareket eden ordular ve kuşatmalar (AC 3.2'nin somutlaştırılması).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { MH, newGame } = require('./helpers');

const A = () => MH.armies;

/** Olayları otomatik geçerek gün ilerletir (yapay zekânın barış tekliflerini reddeder) */
function play(game, days, until) {
  for (let i = 0; i < days && !game.state.gameOver; i++) {
    game.tick();
    while (game.currentEvent()) game.resolveEvent(game.currentEvent().eventId === 'ai_peace_offer' ? 1 : 0);
    if (until && until()) return i + 1;
  }
  return days;
}

test('Oyuncunun ordusu başkentte, toplam asker sayısıyla başlar', () => {
  const game = newGame('fall-1453', 'hungary');
  const stacks = A().stacksOf(game, 'hungary');
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0].prov, game.player.capital);
  assert.equal(stacks[0].size, game.player.army);
});

test('Ordu toplamı her zaman ulusun asker sayısına eşitlenir', () => {
  const game = newGame('fall-1453', 'hungary');
  A().splitStack(game, A().stacksOf(game, 'hungary')[0].id);
  game.player.gold = 999;
  game.recruit('hungary', 10);
  game.applyEffects('hungary', { armyPct: -0.2 });
  A().sync(game, 'hungary');
  const sum = A().stacksOf(game, 'hungary').reduce((s, x) => s + x.size, 0);
  assert.ok(Math.abs(sum - game.player.army) < 0.2, sum + ' ≈ ' + game.player.army);
});

test('Düşman orduları yalnızca oyuncuyla savaşta olan uluslar için haritaya çıkar', () => {
  const game = newGame('fall-1453', 'hungary');
  assert.equal(A().stacksOf(game, 'austria').length, 0);
  game.declareWar('hungary', 'austria');
  A().ensureStacks(game);
  assert.ok(A().stacksOf(game, 'austria').length >= 1);
  assert.ok(game.offerPeace('hungary', 'austria', 'white', true).ok);
  A().ensureStacks(game);
  assert.equal(A().stacksOf(game, 'austria').length, 0, 'barıştan sonra dağılır');
});

test('Tarafsız topraklara girilemez; düşman toprağına yürüyüş yolu bulunur', () => {
  const game = newGame('fall-1453', 'hungary');
  const stack = A().stacksOf(game, 'hungary')[0];
  const austrian = game.nation('austria').capital;
  assert.equal(A().moveStack(game, stack.id, austrian).ok, false);
  game.declareWar('hungary', 'austria');
  const res = A().moveStack(game, stack.id, austrian);
  assert.ok(res.ok, res.message);
  assert.ok(stack.path.length >= 1);
  assert.equal(stack.path[stack.path.length - 1], austrian);
  assert.equal(stack.auto, false, 'emir verilen ordu manuel kontrole geçer');
});

test('Düşman eyaletinde duran ordu kuşatma yapar ve eyaleti alır', () => {
  const game = newGame('fall-1453', 'hungary');
  game.declareWar('hungary', 'austria');
  A().ensureStacks(game);
  // Avusturya orduları oyun dışı kalsın: yalnızca kuşatmayı sınıyoruz
  game.state.stacks = game.state.stacks.filter((s) => s.owner === 'hungary');
  game.nation('austria').army = 0;
  const stack = A().stacksOf(game, 'hungary')[0];
  const target = game._frontier('hungary', 'austria').find((p) => p !== game.nation('austria').capital);
  assert.ok(A().moveStack(game, stack.id, target).ok);
  const days = play(game, 120, () => game.state.owner[target] === 'hungary');
  assert.equal(game.state.owner[target], 'hungary', 'kuşatma sonunda eyalet ele geçer');
  assert.ok(days > A().siegeNeeded(game, target) / 3, 'kuşatma zaman alır');
});

test('Karşılaşan ordular savaşır; güçlü taraf genellikle kazanır, yenilen geri çekilir', () => {
  let wins = 0;
  for (let seed = 0; seed < 10; seed++) {
    const game = newGame('fall-1453', 'hungary');
    game.state.rng = 77 + seed;
    game.declareWar('hungary', 'austria');
    A().ensureStacks(game);
    game.player.army = 80;
    game.nation('austria').army = 25;
    A().sync(game, 'hungary');
    A().sync(game, 'austria');
    const ours = A().stacksOf(game, 'hungary')[0];
    const theirs = A().stacksOf(game, 'austria')[0];
    theirs.prov = ours.prov;
    theirs.auto = false;
    let battle = null;
    game.on('battle', (b) => { if (b.field) battle = b; });
    A().daily(game);
    assert.ok(battle, 'aynı eyaletteki ordular savaşmalı');
    if (battle.winner === 'hungary') wins++;
    const loser = A().stacksOf(game, battle.loser);
    for (const s of loser) assert.ok(s.shattered > 0 || s.size === 0);
  }
  assert.ok(wins >= 8, `3 kat güçlü ordu 10 savaşın en az 8'ini kazanmalı: ${wins}`);
});

test('Otomatik komutadaki ordular oyuncu hiçbir şey yapmadan da savaşı yürütür', () => {
  const game = newGame('fall-1453', 'castile');
  game.declareWar('castile', 'granada');
  game.player.army = 80;
  const start = game.provincesOf('granada').length;
  play(game, 365 * 2, () => !game.nation('granada').alive);
  assert.ok(game.provincesOf('granada').length < start || !game.nation('granada').alive);
});

test('Barıştan sonra yabancı topraktaki ordular sınırın gerisine çekilir', () => {
  const game = newGame('fall-1453', 'hungary');
  game.declareWar('hungary', 'austria');
  const stack = A().stacksOf(game, 'hungary')[0];
  stack.prov = game.nation('austria').capital;
  game.offerPeace('hungary', 'austria', 'white', true);
  play(game, 90, () => game.state.owner[stack.prov] === 'hungary');
  assert.equal(game.state.owner[stack.prov], 'hungary');
  assert.equal(stack.returning, false);
});

test('Ordular kayıt dosyasında korunur', () => {
  const game = newGame('fall-1453', 'hungary');
  A().splitStack(game, A().stacksOf(game, 'hungary')[0].id);
  const copy = MH.Game.load(game.serialize());
  assert.equal(A().stacksOf(copy, 'hungary').length, 2);
});

test('Birden çok cephede savaşan yapay zekâ ordusunu oyuncuya karşı cepheyle sınırlar', () => {
  const game = newGame('great-war-1914', 'serbia');
  game.declareWar('austria', 'serbia'); // Rusya Sırbistan'ın yanında savaşa girer
  assert.ok(game.warBetween('russia', 'austria'));
  A().ensureStacks(game);
  const share = A().theaterShare(game, 'austria');
  assert.ok(share < 1, 'Avusturya ordusunun bir kısmı Rusya cephesinde: ' + share);
  const onMap = A().stacksOf(game, 'austria').reduce((s, x) => s + x.size, 0);
  assert.ok(Math.abs(onMap - game.nation('austria').army * share) < 0.5);
  assert.equal(A().theaterShare(game, 'serbia'), 1, 'oyuncu tüm ordusunu yönetir');
});

test('Kuşatan taraf muharebeyi kazanırsa kuşatma sürer', () => {
  const game = newGame('fall-1453', 'hungary');
  game.declareWar('hungary', 'austria');
  A().ensureStacks(game);
  const ours = A().stacksOf(game, 'hungary')[0];
  const theirs = A().stacksOf(game, 'austria')[0];
  const prov = game._frontier('hungary', 'austria')[0];
  ours.prov = prov;
  ours.auto = false;
  theirs.auto = false;
  theirs.prov = game.nation('austria').capital;
  game.state.sieges[prov] = { by: 'hungary', progress: 10, needed: 40 };
  ours.size = game.player.army = 200;
  theirs.prov = prov;
  A().daily(game);
  assert.ok(game.state.sieges[prov], 'ezici zaferden sonra kuşatma devam etmeli');
  assert.ok(game.state.sieges[prov].progress > 10);
});
