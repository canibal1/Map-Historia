'use strict';
/*
 * AC 2.1'in derinleştirilmesi: eyalet yapıları ve eyalet adları.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { MH, newGame } = require('./helpers');

function finishConstruction(game) {
  game.state.day += 200;
  game._progressConstruction();
}

test('Yapı inşaatı altın harcar, süre sonunda tamamlanır', () => {
  const game = newGame('fall-1453', 'venice');
  const pid = game.player.capital;
  game.player.gold = 500;
  const cost = game.buildingCost(pid, 'market');
  const res = game.build('venice', pid, 'market');
  assert.ok(res.ok, res.message);
  assert.equal(game.player.gold, 500 - cost);
  assert.equal(game.hasBuilding(pid, 'market'), false, 'henüz inşa ediliyor');
  assert.equal(game.build('venice', pid, 'market').ok, false, 'aynı yapı iki kez başlatılamaz');
  finishConstruction(game);
  assert.ok(game.hasBuilding(pid, 'market'));
  assert.equal(game.build('venice', pid, 'market').ok, false, 'bir eyalette her yapıdan bir tane');
});

test('Yapılar yalnızca kendi eyaletine ve yeterli altınla inşa edilir', () => {
  const game = newGame('fall-1453', 'venice');
  game.player.gold = 10;
  assert.equal(game.build('venice', game.player.capital, 'fort').ok, false);
  game.player.gold = 999;
  assert.equal(game.build('venice', game.nation('papal').capital, 'market').ok, false);
  assert.equal(game.build('venice', game.player.capital, 'palace').ok, false);
});

test('Pazar geliri, kışla insan gücünü, mabet istikrar hedefini artırır', () => {
  const game = newGame('fall-1453', 'hungary');
  const id = 'hungary';
  const pid = game.player.capital;
  const before = { income: game.budget(id).total, mp: game.manpowerGrowth(id), max: game.maxManpower(id), stab: game.stabilityTarget(id) };
  game.player.gold = 999;
  for (const t of ['market', 'barracks', 'temple']) game.build(id, pid, t);
  finishConstruction(game);
  assert.ok(game.budget(id).buildings > 0);
  assert.ok(game.budget(id).total > before.income);
  assert.ok(game.manpowerGrowth(id) > before.mp);
  assert.equal(game.maxManpower(id), before.max + 5);
  assert.ok(game.stabilityTarget(id) > before.stab);
});

test('Kale kuşatmayı uzatır, bakım gideri getirir', () => {
  const game = newGame('fall-1453', 'hungary');
  const pid = game.player.capital;
  const siege = MH.armies.siegeNeeded(game, pid);
  const upkeep = game.budget('hungary').upkeep;
  game.player.gold = 999;
  game.build('hungary', pid, 'fort');
  finishConstruction(game);
  assert.equal(MH.armies.siegeNeeded(game, pid), siege + 25);
  assert.ok(game.budget('hungary').upkeep > upkeep);
});

test('Fethedilen eyaletin yapıları yeni sahibine geçer, yarım inşaat iptal olur', () => {
  const game = newGame('fall-1453', 'hungary');
  const provs = game.provincesOf('hungary').filter((p) => p !== game.player.capital);
  game.player.gold = 999;
  game.build('hungary', provs[0], 'market');
  finishConstruction(game);
  game.build('hungary', provs[1], 'temple');
  game.transferProvince(provs[0], 'hre');
  game.transferProvince(provs[1], 'hre');
  assert.ok(game.buildingsOf('hre', 'market').includes(provs[0]));
  assert.equal(game.underConstruction(provs[1]).length, 0);
  finishConstruction(game);
  assert.equal(game.hasBuilding(provs[1], 'temple'), false);
});

test('Kuşatma altındaki eyalette inşaat yapılamaz', () => {
  const game = newGame('fall-1453', 'hungary');
  game.player.gold = 999;
  game.state.sieges[game.player.capital] = { by: 'hre', progress: 1, needed: 40 };
  assert.equal(game.build('hungary', game.player.capital, 'fort').ok, false);
});

test('Yapay zekâ barışta artan altınını yapılara yatırır', () => {
  const game = newGame('fall-1453', 'trebizond');
  for (const n of game.aliveNations()) if (n.id !== 'trebizond') n.gold += 600;
  for (let i = 0; i < 12; i++) MH.ai.monthly(game);
  assert.ok(game.state.construction.some((c) => c.owner !== 'trebizond'), 'en az bir yapay zekâ inşaata başlamalı');
});

test('Eyaletlerin dönemine uygun adları vardır', () => {
  const g1453 = MH.Game.create('fall-1453');
  const g1914 = MH.Game.create('great-war-1914');
  const ist = g1453.nation('byzantium').capital;
  assert.equal(MH.places.nameOf(g1453, ist), 'Konstantinopolis');
  assert.equal(MH.places.nameOf(g1914, g1914.nation('ottoman').capital), 'İstanbul');
  const names1453 = MH.places.table(g1453.grid, 1453).city.filter(Boolean);
  assert.ok(!names1453.includes('Sankt Peterburg'), "1453'te Sankt Peterburg yok");
  assert.ok(MH.places.table(g1914.grid, 1914).city.includes('Budapeşte'));
  for (const g of [g1453, g1914]) {
    for (let pid = 0; pid < g.state.owner.length; pid++) assert.ok(MH.places.nameOf(g, pid).length > 0);
    const curated = g.aliveNations().filter((n) => !n.generic);
    const capitals = curated.filter((n) => MH.places.isCity(g, n.capital)).length;
    assert.ok(capitals / curated.length > 0.85, 'senaryo uluslarının başkentleri bir şehir adı taşımalı');
  }
});

test('Kayıt dosyasında yapılar korunur', () => {
  const game = newGame('fall-1453', 'venice');
  game.player.gold = 999;
  game.build('venice', game.player.capital, 'market');
  const copy = MH.Game.load(game.serialize());
  assert.equal(copy.state.construction.length, game.state.construction.length);
  finishConstruction(copy);
  assert.ok(copy.hasBuilding(copy.player.capital, 'market'));
});
