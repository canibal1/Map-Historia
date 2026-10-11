'use strict';
// Tarayıcı betiklerini Node ortamına yükler (globalThis.MH)
for (const f of ['geo', 'names', 'places', 'scenarios', 'engine', 'ai', 'events', 'goals', 'armies', 'llm', 'diplomacy', 'actions']) require('../js/' + f + '.js');
// Harita verileri (tarayıcıda senaryo seçilince yüklenir)
for (const m of ['hb1400', 'hb1815', 'hb1914', 'modern']) require('../data/map-' + m + '.js');

const MH = globalThis.MH;

/** Belirli bir senaryoda, verilen ulusla yeni bir oyun başlatır */
function newGame(scenarioId = 'fall-1453', playerId = 'ottoman') {
  const game = MH.Game.create(scenarioId);
  game.setPlayer(playerId);
  return game;
}

module.exports = { MH, newGame };
