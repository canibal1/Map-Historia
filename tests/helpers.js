'use strict';
// Tarayıcı betiklerini Node ortamına yükler (globalThis.MH)
for (const f of ['geo', 'scenarios', 'engine', 'ai', 'events', 'goals', 'armies']) require('../js/' + f + '.js');

const MH = globalThis.MH;

/** Belirli bir senaryoda, verilen ulusla yeni bir oyun başlatır */
function newGame(scenarioId = 'fall-1453', playerId = 'ottoman') {
  const game = MH.Game.create(scenarioId);
  game.setPlayer(playerId);
  return game;
}

module.exports = { MH, newGame };
