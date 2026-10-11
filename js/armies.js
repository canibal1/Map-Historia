/*
 * Map Historia — haritada hareket eden ordular ve kuşatmalar.
 *
 * Oyuncunun dahil olduğu savaşlar somut ordularla yürür: oyuncunun ve düşmanlarının
 * orduları eyaletten eyalete hareket eder, aynı eyalette karşılaşınca muharebe olur,
 * düşman eyaletinde duran ordu kuşatma başlatır ve kuşatma bitince eyalet el değiştirir.
 * Yapay zekâ ile yapay zekâ arasındaki savaşlar engine.js'deki soyut cephe modeliyle sürer.
 *
 * Bir ulusun ordularının toplamı her zaman nation.army ile eşitlenir; böylece asker toplama,
 * olaylar ve bakım gibi tüm mevcut kurallar ordulara da yansır.
 */
(function (MH) {
  'use strict';

  const STEP_DAYS = 4; // kendi/müttefik toprağında bir eyalet
  const ENEMY_STEP_DAYS = 5;
  const STRAIT_EXTRA_DAYS = 4;
  const THINK_EVERY = 4; // otomatik komutanların karar aralığı (gün)
  const SHATTER_DAYS = 12; // yenilen ordu bu süre savaşamaz

  const round1 = (v) => Math.round(v * 10) / 10;

  // ------------------------------------------------------------------ yardımcılar
  function stacksOf(game, id) {
    return game.state.stacks.filter((s) => s.owner === id);
  }

  function stackById(game, sid) {
    return game.state.stacks.find((s) => s.id === sid) || null;
  }

  /** Oyuncuyu içeren savaşlarda bir ulusun karşısındakiler */
  function theaterEnemies(game, id) {
    const pid = game.state.playerId;
    if (!pid) return [];
    if (id === pid) return game.enemiesOf(pid);
    return game.warBetween(id, pid) ? [pid] : [];
  }

  function hostile(game, a, b) {
    return a !== b && !!game.warBetween(a, b);
  }

  function canEnter(game, owner, prov, returning) {
    const o = game.state.owner[prov];
    if (returning || o === owner) return true;
    return game.isAllied(owner, o) || hostile(game, owner, o);
  }

  function stepDays(game, owner, from, to) {
    const p = game.grid.provinces[from];
    let d = hostile(game, owner, game.state.owner[to]) ? ENEMY_STEP_DAYS : STEP_DAYS;
    if (!p.neighbors.includes(to)) d += STRAIT_EXTRA_DAYS;
    return d;
  }

  /** Dijkstra: geçilebilir eyaletler üzerinden gün cinsinden mesafeler */
  function distancesFrom(game, start, owner, returning = false) {
    const { provinces } = game.grid;
    const n = provinces.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    dist[start] = 0;
    const heap = [[0, start]];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, cur] = pop();
      if (d > dist[cur]) continue;
      const p = provinces[cur];
      for (const nb of p.neighbors.concat(p.straits)) {
        if (!canEnter(game, owner, nb, returning)) continue;
        const nd = d + stepDays(game, owner, cur, nb);
        if (nd < dist[nb]) {
          dist[nb] = nd;
          prev[nb] = cur;
          push([nd, nb]);
        }
      }
    }
    return { dist, prev };
  }

  function buildPath(prev, start, target) {
    const path = [];
    for (let cur = target; cur !== start; cur = prev[cur]) {
      if (cur < 0) return null;
      path.unshift(cur);
    }
    return path;
  }

  function quality(game, id) {
    return game.quality(id);
  }

  function strength(game, stack) {
    return stack.size * quality(game, stack.owner);
  }

  function homeProvince(game, id) {
    const nat = game.nation(id);
    if (game.state.owner[nat.capital] === id) return nat.capital;
    return game.provincesOf(id)[0] ?? -1;
  }

  function newStack(game, owner, prov, size, name) {
    const st = game.state;
    const stack = {
      id: st.nextStackId++,
      owner,
      prov,
      size: round1(size),
      path: [],
      progress: 0,
      auto: true,
      shattered: 0,
      returning: false,
      think: 0,
      name,
    };
    st.stacks.push(stack);
    return stack;
  }

  function nextName(game, owner) {
    const used = new Set(stacksOf(game, owner).map((s) => s.name));
    for (let i = 1; ; i++) {
      const name = i + '. Ordu';
      if (!used.has(name)) return name;
    }
  }

  function removeStack(game, stack) {
    game.state.stacks = game.state.stacks.filter((s) => s !== stack);
  }

  // ------------------------------------------------------------------ yaşam döngüsü
  function init(game) {
    const st = game.state;
    st.stacks = st.stacks || [];
    st.sieges = st.sieges || {};
    st.nextStackId = st.nextStackId || 1;
    ensureStacks(game);
  }

  /** Oyuncu ve oyuncuyla savaştaki uluslar için orduları oluşturur/temizler */
  function ensureStacks(game) {
    const st = game.state;
    const pid = st.playerId;
    if (!pid) return;
    const inTheater = new Set([pid, ...game.enemiesOf(pid)]);
    // Artık oyuncuyla savaşmayan yapay zekâ orduları dağılır (askerler nation.army'de kalır)
    st.stacks = st.stacks.filter((s) => inTheater.has(s.owner) && game.nation(s.owner).alive);
    for (const id of inTheater) {
      const nat = game.nation(id);
      if (!nat.alive) continue;
      const mine = stacksOf(game, id);
      if (!mine.length && nat.army >= 1) {
        const home = homeProvince(game, id);
        if (home < 0) continue;
        if (id === pid) {
          newStack(game, id, home, nat.army, '1. Ordu');
        } else {
          // Yapay zekâ: bir ordu oyuncuya en yakın sınırda, varsa ikincisi başkentte
          const k = nat.army >= 150 ? 3 : nat.army >= 50 ? 2 : 1;
          const front = frontierToward(game, id, pid);
          const spots = [front ?? home, home, home];
          const size = nat.army * theaterShare(game, id);
          for (let i = 0; i < k; i++) newStack(game, id, spots[i], size / k, nat.name + (k > 1 ? ' ' + (i + 1) + '. Ordusu' : ' Ordusu'));
        }
      }
      sync(game, id);
    }
  }

  /** `id` ulusunun `toward` ulusuna en yakın eyaleti */
  function frontierToward(game, id, toward) {
    const { provinces } = game.grid;
    const owner = game.state.owner;
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] !== id) continue;
      const p = provinces[i];
      if (p.neighbors.some((nb) => owner[nb] === toward) || p.straits.some((nb) => owner[nb] === toward)) return i;
    }
    return null;
  }

  /**
   * Yapay zekâ ulusunun ordusunun oyuncuya karşı cepheye düşen payı.
   * Aynı anda başka yapay zekâ uluslarıyla da savaşıyorsa ordusu cephelere duruş ağırlığıyla bölünür
   * (engine.js'deki soyut model de aynı bölüşümü kullanır), böylece asker iki kez sayılmaz.
   */
  function theaterShare(game, id) {
    const pid = game.state.playerId;
    if (id === pid) return 1;
    let total = 0;
    let mine = 0;
    for (const w of game.warsOf(id)) {
      const vsPlayer = w.a === pid || w.b === pid;
      if (!vsPlayer && !game._frontier(w.a, w.b).length && !game._frontier(w.b, w.a).length) continue;
      const wt = MH.STANCES[game.stanceOf(w, id)].weight;
      total += wt;
      if (vsPlayer) mine += wt;
    }
    return total && mine ? mine / total : 1;
  }

  /** Ordu toplamını hedefle eşitler: yeni askerler başkentteki orduya katılır, kayıplar orantılı dağılır */
  function sync(game, id) {
    const nat = game.nation(id);
    const mine = stacksOf(game, id);
    if (!mine.length) return;
    const goal = Math.max(0, nat.army) * theaterShare(game, id);
    const total = mine.reduce((s, x) => s + x.size, 0);
    const diff = goal - total;
    if (Math.abs(diff) < 0.05) return;
    if (diff > 0) {
      const home = homeProvince(game, id);
      const target = mine.find((s) => s.prov === home && !s.shattered) || mine.reduce((a, b) => (b.size > a.size ? b : a));
      target.size = round1(target.size + diff);
    } else if (total > 0) {
      const f = goal / total;
      for (const s of mine) s.size = round1(s.size * f);
    }
    for (const s of mine) if (s.size < 0.5) removeStack(game, s);
    // Yuvarlama artığını en büyük orduya yaz
    const left = stacksOf(game, id);
    if (left.length) {
      const sum = left.reduce((s, x) => s + x.size, 0);
      const big = left.reduce((a, b) => (b.size > a.size ? b : a));
      big.size = round1(Math.max(0, big.size + goal - sum));
    }
  }

  // ------------------------------------------------------------------ oyuncu emirleri
  function moveStack(game, sid, target) {
    const stack = stackById(game, sid);
    if (!stack) return game._result(false, 'Ordu bulunamadı.');
    if (stack.owner !== game.state.playerId) return game._result(false, 'Bu ordu sizin değil.');
    if (stack.prov === target) {
      stack.path = [];
      stack.auto = false;
      return game._result(true, stack.name + ' yerinde bekliyor.');
    }
    const ownerOfTarget = game.state.owner[target];
    if (!canEnter(game, stack.owner, target, stack.returning)) {
      return game._result(false, game.nation(ownerOfTarget).name + ' topraklarına giriş izniniz yok (savaş ya da ittifak gerekli).');
    }
    const { dist, prev } = distancesFrom(game, stack.prov, stack.owner, stack.returning);
    if (!isFinite(dist[target])) return game._result(false, 'Oraya giden bir yol yok.');
    stack.path = buildPath(prev, stack.prov, target);
    stack.progress = 0;
    stack.auto = false;
    const days = Math.round(dist[target]);
    const siege = hostile(game, stack.owner, ownerOfTarget) ? ' Varınca kuşatma başlayacak.' : '';
    return game._result(true, stack.name + ' yola çıktı: ~' + days + ' gün.' + siege, [[stack.path.length + ' eyalet', null]]);
  }

  function setAuto(game, sid, auto) {
    const stack = stackById(game, sid);
    if (!stack || stack.owner !== game.state.playerId) return game._result(false, 'Ordu bulunamadı.');
    stack.auto = !!auto;
    stack.think = 0;
    return game._result(true, stack.name + (auto ? ' otomatik komutaya geçti.' : ' artık sizin emirlerinizi bekliyor.'));
  }

  function splitStack(game, sid) {
    const stack = stackById(game, sid);
    if (!stack || stack.owner !== game.state.playerId) return game._result(false, 'Ordu bulunamadı.');
    if (stack.size < 4) return game._result(false, 'Bölünemeyecek kadar küçük.');
    const half = round1(stack.size / 2);
    stack.size = round1(stack.size - half);
    const other = newStack(game, stack.owner, stack.prov, half, nextName(game, stack.owner));
    other.auto = stack.auto;
    other.shattered = stack.shattered;
    return game._result(true, stack.name + ' ikiye bölündü: ' + other.name + ' kuruldu.');
  }

  function mergeStacks(game, sid) {
    const stack = stackById(game, sid);
    if (!stack || stack.owner !== game.state.playerId) return game._result(false, 'Ordu bulunamadı.');
    const others = stacksOf(game, stack.owner).filter((s) => s !== stack && s.prov === stack.prov);
    if (!others.length) return game._result(false, 'Aynı eyalette birleşecek başka ordu yok.');
    for (const o of others) {
      stack.size = round1(stack.size + o.size);
      removeStack(game, o);
    }
    return game._result(true, others.length + ' ordu ' + stack.name + ' altında birleşti.');
  }

  // ------------------------------------------------------------------ günlük işleyiş
  function daily(game) {
    const st = game.state;
    if (!st.playerId || st.gameOver) return;
    st.stacks = st.stacks || [];
    st.sieges = st.sieges || {};
    ensureStacks(game);
    relocateStranded(game);
    for (const stack of [...st.stacks]) {
      if (stack.shattered > 0) stack.shattered--;
      if (stack.auto && !stack.shattered && --stack.think <= 0) {
        stack.think = THINK_EVERY;
        autoCommand(game, stack);
      }
      advance(game, stack);
    }
    resolveBattles(game);
    progressSieges(game);
  }

  /** Barıştan sonra düşman ya da tarafsız topraklarda kalan oyuncu orduları sınırın gerisine çekilir */
  function relocateStranded(game) {
    for (const stack of game.state.stacks) {
      const o = game.state.owner[stack.prov];
      if (o === stack.owner || game.isAllied(stack.owner, o) || hostile(game, stack.owner, o)) {
        stack.returning = false;
        continue;
      }
      if (stack.returning) continue;
      stack.returning = true;
      const { dist, prev } = distancesFrom(game, stack.prov, stack.owner, true);
      let best = -1;
      game.state.owner.forEach((ow, i) => {
        if (ow === stack.owner && (best < 0 || dist[i] < dist[best])) best = i;
      });
      if (best >= 0) {
        stack.path = buildPath(prev, stack.prov, best) || [];
        stack.progress = 0;
      }
    }
  }

  /** Yeni rota; ilk adım aynıysa yoldaki ilerleme korunur (yoksa hareketli hedefi kovalayan ordu hiç varamaz) */
  function setPath(stack, path) {
    if (stack.path[0] !== path[0]) stack.progress = 0;
    stack.path = path;
  }

  function advance(game, stack) {
    if (!stack.path.length) return;
    const next = stack.path[0];
    if (!canEnter(game, stack.owner, next, stack.returning)) {
      stack.path = [];
      return;
    }
    stack.progress++;
    if (stack.progress < stepDays(game, stack.owner, stack.prov, next)) return;
    stack.progress = 0;
    stack.prov = next;
    stack.path.shift();
    if (!stack.path.length && stack.returning && game.state.owner[stack.prov] === stack.owner) stack.returning = false;
  }

  /** Yapay zekâ orduları ve otomatik komutadaki oyuncu orduları için karar */
  function autoCommand(game, stack) {
    const st = game.state;
    const owner = stack.owner;
    const enemies = theaterEnemies(game, owner);
    if (!enemies.length || stack.returning) return;
    const enemySet = new Set(enemies);
    const { dist, prev } = distancesFrom(game, stack.prov, owner);
    const go = (target) => {
      if (target === stack.prov) {
        stack.path = [];
        return;
      }
      const path = buildPath(prev, stack.prov, target);
      if (path && (stack.path.length === 0 || stack.path[stack.path.length - 1] !== target)) setPath(stack, path);
    };
    const mine = strength(game, stack);
    const foes = st.stacks.filter((s) => enemySet.has(s.owner) && !s.shattered && isFinite(dist[s.prov]));
    // Duruş: oyuncu için en büyük düşmana karşı seçilen duruş; yapay zekâ için oyuncuya karşı duruşu
    const mainEnemy = enemies.reduce((a, b) => (game.nation(b).army > game.nation(a).army ? b : a));
    const war = game.warBetween(owner, mainEnemy);
    const stance = war ? game.stanceOf(war, owner) : 'balanced';

    // 1) Yakındaki çok güçlü düşmandan kaç
    const danger = foes.find((f) => dist[f.prov] <= 2 * ENEMY_STEP_DAYS && strength(game, f) > mine * 1.6);
    if (danger && stance !== 'offensive') {
      const home = homeProvince(game, owner);
      if (home >= 0 && home !== stack.prov) {
        const path = buildPath(prev, stack.prov, home);
        if (path) setPath(stack, path);
      }
      return;
    }
    // 2) Yenebileceği yakın bir düşman ordusuna saldır (kendi topraklarındakiler öncelikli)
    let target = null;
    let bestScore = -Infinity;
    const reach = stance === 'defensive' ? 3 * STEP_DAYS : 8 * ENEMY_STEP_DAYS;
    for (const f of foes) {
      if (dist[f.prov] > reach) continue;
      const ratio = mine / Math.max(0.1, strength(game, f));
      if (ratio < (stance === 'offensive' ? 0.95 : 1.15)) continue;
      const score = ratio * 10 - dist[f.prov] + (st.owner[f.prov] === owner ? 25 : 0);
      if (score > bestScore) { bestScore = score; target = f.prov; }
    }
    if (target !== null) return go(target);
    // 3) Kuşatma: taarruz/dengeli duruşta en yakın düşman eyaleti
    if (stance !== 'defensive') {
      const strongestFoe = foes.reduce((m, f) => Math.max(m, strength(game, f)), 0);
      if (stance === 'offensive' || mine >= strongestFoe * 0.8) {
        let best = -1;
        let bestCost = Infinity;
        st.owner.forEach((o, i) => {
          if (!enemySet.has(o) || !isFinite(dist[i])) return;
          // Başka bir ordumuzun hedeflediği eyalet yerine yenisini seç; başkentler cazip hedeflerdir
          const taken = st.stacks.some((s) => s !== stack && s.owner === owner && (s.prov === i || s.path[s.path.length - 1] === i));
          const cost = dist[i] + (taken ? 30 : 0) - (game.nation(o).capital === i ? 6 : 0);
          if (cost < bestCost) { bestCost = cost; best = i; }
        });
        if (best >= 0) return go(best);
      }
    }
    // 4) Savunma: kuşatılan kendi eyaletine ya da düşmana en yakın sınıra git
    const besieged = Object.keys(st.sieges).map(Number).filter((p) => st.owner[p] === owner && isFinite(dist[p]));
    if (besieged.length) return go(besieged.reduce((a, b) => (dist[b] < dist[a] ? b : a)));
    const front = frontierToward(game, owner, mainEnemy);
    if (front !== null && isFinite(dist[front])) go(front);
  }

  function resolveBattles(game) {
    const st = game.state;
    const byProv = new Map();
    for (const s of st.stacks) {
      if (s.shattered) continue;
      if (!byProv.has(s.prov)) byProv.set(s.prov, []);
      byProv.get(s.prov).push(s);
    }
    const pid = st.playerId;
    for (const [prov, here] of byProv) {
      const ours = here.filter((s) => s.owner === pid);
      const theirs = here.filter((s) => s.owner !== pid && hostile(game, s.owner, pid));
      if (!ours.length || !theirs.length) continue;
      battle(game, prov, ours, theirs);
    }
  }

  function battle(game, prov, ours, theirs) {
    const st = game.state;
    const pid = st.playerId;
    const provOwner = st.owner[prov];
    const terrain = (side) => (side.some((s) => s.owner === provOwner) ? 1.25 : 1);
    const sP = ours.reduce((a, s) => a + strength(game, s), 0) * terrain(ours);
    const sE = theirs.reduce((a, s) => a + strength(game, s), 0) * terrain(theirs);
    const pWin = (sP ** 1.5 + 0.1) / (sP ** 1.5 + sE ** 1.5 + 0.2);
    const playerWon = game.random() < pWin;
    const [winners, losers, sW, sL] = playerWon ? [ours, theirs, sP, sE] : [theirs, ours, sE, sP];
    const lossShare = sL / Math.max(1, sW + sL);
    let lossW = 0;
    let lossL = 0;
    for (const s of losers) {
      const l = round1(Math.min(s.size, s.size * (0.25 + game.random() * 0.15) + 0.5));
      s.size = round1(s.size - l);
      game.nation(s.owner).army = round1(game.nation(s.owner).army - l);
      lossL += l;
    }
    for (const s of winners) {
      const l = round1(Math.min(s.size, s.size * (0.06 + game.random() * 0.08) * lossShare * 2));
      s.size = round1(s.size - l);
      game.nation(s.owner).army = round1(game.nation(s.owner).army - l);
      lossW += l;
    }
    const mainLoser = losers.reduce((a, b) => (b.size > a.size ? b : a)).owner;
    const mainWinner = winners.reduce((a, b) => (b.size > a.size ? b : a)).owner;
    const war = game.warBetween(mainWinner, mainLoser);
    if (war) war.battles[mainWinner] = (war.battles[mainWinner] || 0) + 2;
    game.nation(mainLoser).warExhaustion = Math.min(100, game.nation(mainLoser).warExhaustion + 2);
    // Yenilen ordular dağılır ya da geri çekilir
    for (const s of losers) {
      if (s.size < 0.5) {
        removeStack(game, s);
        continue;
      }
      s.shattered = SHATTER_DAYS;
      retreat(game, s);
    }
    for (const s of winners) if (s.size < 0.5) removeStack(game, s);
    // Kuşatmayı yalnızca kuşatanın yenilgisi bozar
    if (st.sieges[prov] && losers.some((s) => s.owner === st.sieges[prov].by)) delete st.sieges[prov];
    game.emit('battle', { war, winner: mainWinner, loser: mainLoser, lossW: round1(lossW), lossL: round1(lossL), province: prov, field: true });
    if (playerWon || losers.some((s) => s.owner === pid)) {
      game.addLog(
        (playerWon ? '🏆 Meydan muharebesi kazanıldı: ' : '💥 Meydan muharebesi kaybedildi: ') +
          game.nation(playerWon ? mainLoser : mainWinner).name + ' (kayıplar ' + Math.round((playerWon ? lossW : lossL) * 1000).toLocaleString('tr-TR') + ')',
        playerWon ? 'good' : 'bad',
        [pid],
      );
    }
  }

  function retreat(game, stack) {
    const { dist, prev } = distancesFrom(game, stack.prov, stack.owner);
    const enemyAt = new Set(game.state.stacks.filter((s) => hostile(game, s.owner, stack.owner)).map((s) => s.prov));
    let best = -1;
    game.state.owner.forEach((o, i) => {
      if (o !== stack.owner || enemyAt.has(i) || !isFinite(dist[i]) || i === stack.prov) return;
      if (best < 0 || dist[i] < dist[best]) best = i;
    });
    if (best < 0) {
      // Kaçacak yer yok: ordu teslim olur
      game.nation(stack.owner).army = round1(game.nation(stack.owner).army - stack.size);
      removeStack(game, stack);
      return;
    }
    stack.path = buildPath(prev, stack.prov, best) || [];
    stack.progress = 0;
  }

  function siegeNeeded(game, prov) {
    const owner = game.state.owner[prov];
    const nat = game.nation(owner);
    let days = 12 + game.state.dev[prov] * 2;
    if (nat.capital === prov) days += 25;
    if (game.provincesOf(owner).length === 1) days += 20;
    return Math.round(days);
  }

  function progressSieges(game) {
    const st = game.state;
    const active = new Map();
    for (const s of st.stacks) {
      if (s.shattered || s.path.length) continue;
      const o = st.owner[s.prov];
      if (!hostile(game, s.owner, o)) continue;
      const enemyHere = st.stacks.some((x) => x.prov === s.prov && x.owner === o && !x.shattered);
      if (enemyHere) continue;
      // Büyük ordu daha hızlı kuşatır, ama surlar bir sınırın altına indirilemez
      const rate = Math.max(0.25, Math.min(1.2, s.size / (8 + st.dev[s.prov] * 2)));
      const cur = active.get(s.prov) || { by: s.owner, rate: 0 };
      cur.rate += rate;
      active.set(s.prov, cur);
    }
    for (const prov of Object.keys(st.sieges)) if (!active.has(Number(prov))) delete st.sieges[prov];
    for (const [prov, { by, rate }] of active) {
      const isNew = !(st.sieges[prov] && st.sieges[prov].by === by);
      const sg = isNew ? { by, progress: 0 } : st.sieges[prov];
      if (isNew && st.owner[prov] === st.playerId) {
        game.addLog('🏰 ' + game.nation(by).name + ' bir eyaletinizi kuşatmaya başladı!', 'bad', [st.playerId]);
        game.emit('siege', { province: prov, by });
      }
      sg.progress = round1(sg.progress + rate);
      sg.needed = siegeNeeded(game, prov);
      st.sieges[prov] = sg;
      if (sg.progress >= sg.needed) {
        const loser = st.owner[prov];
        delete st.sieges[prov];
        const war = game.warBetween(by, loser);
        game.transferProvince(prov, by, war);
        if (war) war.battles[by] = (war.battles[by] || 0) + 1;
      }
    }
  }

  function cleanup(game, id) {
    game.state.stacks = (game.state.stacks || []).filter((s) => s.owner !== id);
  }

  /** Ordunun durumu (arayüz için) */
  function status(game, stack) {
    const st = game.state;
    if (stack.returning) return { kind: 'return', text: 'Sınırın gerisine çekiliyor' };
    if (stack.shattered) return { kind: 'shattered', text: 'Dağınık (' + stack.shattered + ' gün)' };
    const sg = st.sieges[stack.prov];
    if (sg && sg.by === stack.owner && !stack.path.length) {
      return { kind: 'siege', text: 'Kuşatma: ' + game.nation(st.owner[stack.prov]).name + ' %' + Math.min(99, Math.round((sg.progress / sg.needed) * 100)) };
    }
    if (stack.path.length) return { kind: 'move', text: 'Yürüyüşte (' + stack.path.length + ' eyalet)' };
    return { kind: 'idle', text: 'Beklemede' };
  }

  MH.armies = {
    init, daily, ensureStacks, sync, theaterShare, stacksOf, stackById, moveStack, setAuto, splitStack, mergeStacks,
    status, cleanup, distancesFrom, siegeNeeded, strength,
  };
})((globalThis.MH = globalThis.MH || {}));
