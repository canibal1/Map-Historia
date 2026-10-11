/*
 * Map Historia — yapay zekâ ulusları.
 * Her ay çalışır: asker toplar, barış arar, zayıf ve sevmediği komşulara savaş açar,
 * dostlarıyla ittifak ve ticaret kurar. Oyuncuyu ilgilendiren kararlar olay olarak gelir.
 */
(function (MH) {
  'use strict';

  function monthly(game) {
    const st = game.state;
    const pid = st.playerId;
    for (const nat of game.aliveNations()) {
      if (nat.id === pid) continue;
      recruit(game, nat);
      seekPeace(game, nat);
      if (game.random() < 0.04) considerWar(game, nat);
      if (game.random() < 0.04) seekFriends(game, nat);
      if (nat.tax > 30 && nat.stability < 35) nat.tax -= 5;
      if (nat.tax < 30 && nat.gold < 30) nat.tax += 5;
    }
  }

  function recruit(game, nat) {
    const cap = game.totalDev(nat.id) * (game.warsOf(nat.id).length ? 0.9 : 0.6);
    const cost = game.recruitCost(nat.id) * 5;
    let n = 0;
    while (n < 4 && nat.army < cap && nat.manpower >= 5 && nat.gold > cost + 40 && game.budget(nat.id).total > 1) {
      game.recruit(nat.id, 5);
      n++;
    }
    // İnsan gücü tükenmiş zengin bir ülke savaşta paralı asker kiralar
    if (game.warsOf(nat.id).length && nat.manpower < 5 && nat.gold > 250 && nat.army < cap) game.hireMercenaries(nat.id, 5);
    if (nat.stability < 40 && nat.gold > game.festivalCost(nat.id) + 100) game.holdFestival(nat.id);
    if (game.budget(nat.id).total < 0 && nat.gold < 50 && nat.army > 10) game.disband(nat.id, 5);
  }

  function seekPeace(game, nat) {
    const pid = game.state.playerId;
    for (const war of game.warsOf(nat.id)) {
      const enemy = war.a === nat.id ? war.b : war.a;
      const score = game.warScore(war, nat.id);
      const months = (game.state.day - war.start) / 30;
      // Cephe duruşu: güçlüyken taarruz, kaybederken savunma
      const ratio = game.militaryStrength(nat.id) / Math.max(1, game.militaryStrength(enemy));
      war.stance = war.stance || {};
      war.stance[nat.id] = score <= -25 || ratio < 0.7 ? 'defensive' : ratio > 1.4 ? 'offensive' : 'balanced';
      if (enemy === pid) {
        // Kaybeden yapay zekâ oyuncuya barış teklif eder (olay olarak)
        const already = game.state.eventQueue.some((e) => (e.eventId === 'ai_peace_offer' || e.eventId === 'ai_peace_demand') && e.ctx.target === nat.id);
        const cooldown = war.lastOffer && game.state.day - war.lastOffer < 120;
        if (!already && !cooldown && months >= 2 && (score <= -35 || nat.warExhaustion >= 60) && game.random() < 0.35) {
          war.lastOffer = game.state.day;
          game.queueEvent('ai_peace_offer', pid, { target: nat.id, pay: score <= -35 });
        } else if (!already && !cooldown && months >= 4 && score >= 35 && game.random() < 0.35) {
          // Kazanan yapay zekâ şartlarını dayatır
          war.lastOffer = game.state.day;
          game.queueEvent('ai_peace_demand', pid, { target: nat.id });
        }
        continue;
      }
      // İki yapay zekâ arasındaki savaş
      let chance = 0;
      if (months >= 6 && (Math.abs(score) >= 40 || nat.warExhaustion >= 45)) chance = 0.25;
      if (months >= 24) chance = 0.5;
      if (chance && game.random() < chance) {
        game.offerPeace(nat.id, enemy, score <= -30 ? 'offer' : 'white', true);
      }
    }
  }

  function considerWar(game, nat) {
    if (game.warsOf(nat.id).length) return;
    if (nat.stability < 35 || nat.gold < 30) return;
    const pid = game.state.playerId;
    const myStr = game.militaryStrength(nat.id);
    const candidates = game
      .neighborsOf(nat.id)
      .filter((t) => !game.isAllied(nat.id, t) && !game.truceUntil(nat.id, t) && game.opinion(nat.id, t) <= -15)
      .filter((t) => {
        const target = game.nation(t);
        const defense = game.militaryStrength(t) + target.allies.reduce((s, a) => s + game.militaryStrength(a) * 0.5, 0);
        return myStr > defense * 1.4;
      });
    if (!candidates.length) return;
    const target = game.pick(candidates);
    const res = game.declareWar(nat.id, target);
    if (res.ok && target === pid) game.queueEvent('war_declared', pid, { target: nat.id });
    else if (res.ok && pid && game.warBetween(pid, nat.id)) {
      game.addLog(nat.name + ' sizinle savaşa girdi.', 'bad', [nat.id, pid]);
    }
  }

  function seekFriends(game, nat) {
    const pid = game.state.playerId;
    const others = game.aliveNations().filter((o) => o.id !== nat.id && !game.warBetween(o.id, nat.id));
    if (!others.length) return;
    const o = game.pick(others);
    const mine = game.opinion(nat.id, o.id);
    if (o.id === pid) {
      const pending = game.state.eventQueue.some((e) => e.eventId === 'ai_alliance_offer');
      if (!pending && mine >= 60 && !game.isAllied(nat.id, pid) && nat.allies.length < 4 && o.allies.length < 4 && !game.enemiesOf(nat.id).some((e) => game.isAllied(e, pid))) {
        game.queueEvent('ai_alliance_offer', pid, { target: nat.id });
      }
      return;
    }
    if (mine >= 0 && game.opinion(o.id, nat.id) >= 0 && !game.hasTrade(nat.id, o.id) && nat.trade.length < 4) {
      game.proposeTrade(nat.id, o.id);
    } else if (mine >= 55 && game.opinion(o.id, nat.id) >= 55 && !game.isAllied(nat.id, o.id)) {
      game.proposeAlliance(nat.id, o.id);
    }
  }

  MH.ai = { monthly };
})((globalThis.MH = globalThis.MH || {}));
