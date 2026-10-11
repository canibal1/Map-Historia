/*
 * Map Historia — serbest metinle eylemler.
 *
 * Oyuncu ne yapmak istediğini kendi cümleleriyle yazar ("Fransa ile ittifak kur, vergileri %20'ye indir,
 * Viyana'ya saldır"). Yapay zekâ açıksa bir "oyun yöneticisi" modeli metni izin verilen işlemlere
 * (ops) çevirir ve kısa bir anlatı yazar; kapalıysa anahtar kelimelere dayalı bir ayrıştırıcı çalışır.
 *
 * Her işlem motorun kendi fonksiyonlarından geçer: kurallar izin vermiyorsa uygulanmaz ve gerekçesi
 * oyuncuya bildirilir. Modelin uydurduğu serbest "politika" etkileri sınırlandırılır ve bedeli
 * motor tarafından hesaplanır.
 */
(function (MH) {
  'use strict';

  const MAX_OPS = 8;
  const MAX_HISTORY = 30;
  const POLICY_COOLDOWN = 60; // iki özel politika arası en az gün

  const OPS = [
    'set_tax', 'set_focus', 'recruit', 'mercenaries', 'disband', 'build', 'festival',
    'propose_trade', 'cancel_trade', 'propose_alliance', 'break_alliance', 'gift',
    'declare_war', 'offer_peace', 'stance', 'attack', 'colonize', 'policy',
  ];

  const BUILD_WORDS = {
    market: /pazar|çarşı|liman|ticaret merkezi|borsa|fabrika|sanayi tesisi/,
    barracks: /kışla|askerî? ?üs|eğitim kampı/,
    fort: /kale|tahkimat|sur|istihkam|hava savunma/,
    temple: /mabet|cami|kilise|tapınak|katedral|manastır|külliye|okul|üniversite|hastane/,
  };
  const FOCUS_WORDS = { agriculture: /tarım/, industry: /sanayi|endüstri/, trade: /ticaret/, military: /asker|militar|savunma/ };

  // Özel politika fiyat listesi (birim başına altın) ve tavanları
  const POLICY = {
    stability: { price: 12, max: 6, min: -10, label: 'İstikrar' },
    capitalDev: { price: 60, max: 2, min: 0, label: 'Başkent gelişimi' },
    manpower: { price: 5, max: 10, min: -10, label: 'İnsan gücü', unit: 'k' },
    warExhaustion: { price: 5, max: 0, min: -10, label: 'Savaş yorgunluğu' },
    opinionAll: { price: 25, max: 4, min: -10, label: 'Tüm ülkelerle ilişki' },
  };

  const D = () => MH.diplomacy;
  const norm = (s) => D().norm(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toLocaleString('tr-TR');

  // ---------------------------------------------------------------- ad çözümleme
  function nationOf(game, raw) {
    if (!raw) return null;
    if (game.nation(raw)?.alive) return raw;
    const id = D().findNation(game, ' ' + raw + ' ');
    return id && game.nation(id)?.alive ? id : null;
  }

  function provinceOf(game, raw, filter) {
    if (raw === undefined || raw === null || raw === '') return -1;
    if (Number.isInteger(raw) && game.grid.provinces[raw]) return filter && !filter(raw) ? -1 : raw;
    return D().findProvince(game, String(raw), filter);
  }

  const fail = (message) => ({ ok: false, message, effects: [] });

  // ---------------------------------------------------------------- işlemleri uygula
  function execute(game, op) {
    const me = game.state.playerId;
    const nat = game.nation(me);
    const t = op?.type;
    const need = (key) => {
      const id = nationOf(game, op[key] ?? op.nation ?? op.target);
      return id && id !== me ? id : null;
    };
    switch (t) {
      case 'set_tax': {
        let v = Number(op.value);
        if (!Number.isFinite(v)) v = nat.tax + (Number(op.delta) || 0);
        return game.setTax(me, clamp(v, 0, 50));
      }
      case 'set_focus':
        return game.setFocus(me, op.focus);
      case 'recruit':
        return game.recruit(me, clamp(Math.round(Number(op.amount) || 5), 1, Math.max(1, Math.floor(nat.manpower))));
      case 'mercenaries':
        return game.hireMercenaries(me, clamp(Math.round(Number(op.amount) || 5), 1, 50));
      case 'disband':
        return game.disband(me, clamp(Math.round(Number(op.amount) || 5), 1, 500));
      case 'festival':
        return game.holdFestival(me);
      case 'build': {
        if (!MH.BUILDINGS[op.building]) return fail('Bilinmeyen yapı türü.');
        let pid = provinceOf(game, op.province, (p) => game.state.owner[p] === me);
        if (pid < 0) pid = bestBuildSpot(game, me, op.building);
        if (pid < 0) return fail('Uygun bir eyalet bulunamadı.');
        return game.build(me, pid, op.building);
      }
      case 'colonize': {
        const pid = provinceOf(game, op.province, (p) => game.state.owner[p] === null);
        if (pid < 0) {
          const near = nearestUnclaimed(game, me);
          if (near < 0) return fail('Kolonileştirilecek sahipsiz toprak bulunamadı.');
          return game.colonize(me, near);
        }
        return game.colonize(me, pid);
      }
      case 'propose_trade': { const id = need('nation'); return id ? game.proposeTrade(me, id) : fail('Ülke bulunamadı.'); }
      case 'cancel_trade': { const id = need('nation'); return id ? game.cancelTrade(me, id) : fail('Ülke bulunamadı.'); }
      case 'propose_alliance': { const id = need('nation'); return id ? game.proposeAlliance(me, id) : fail('Ülke bulunamadı.'); }
      case 'break_alliance': { const id = need('nation'); return id ? game.breakAlliance(me, id) : fail('Ülke bulunamadı.'); }
      case 'gift': {
        const id = need('nation');
        if (!id) return fail('Ülke bulunamadı.');
        const amount = Math.round(clamp(Number(op.amount) || 50, 10, Math.max(10, nat.gold)));
        return game.sendGift(me, id, amount);
      }
      case 'declare_war': {
        const id = need('nation');
        if (!id) return fail('Ülke bulunamadı.');
        const res = game.declareWar(me, id);
        if (res.ok && MH.armies) MH.armies.ensureStacks(game);
        return res;
      }
      case 'offer_peace': {
        const id = need('nation');
        if (!id) return fail('Ülke bulunamadı.');
        const type = { white: 'white', demand: 'demand', offer: 'offer' }[op.kind || op.peace] || 'white';
        return game.offerPeace(me, id, type);
      }
      case 'stance': {
        const id = need('nation');
        if (!id) return fail('Ülke bulunamadı.');
        return game.setWarStance(me, id, op.stance);
      }
      case 'attack':
        return attack(game, me, op);
      case 'policy':
        return policy(game, me, op);
      default:
        return fail('Bu eylem oyunda karşılık bulmuyor.');
    }
  }

  function bestBuildSpot(game, me, type) {
    let best = -1;
    let bestDev = -1;
    for (const pid of game.provincesOf(me)) {
      if (game.hasBuilding(pid, type) || game.underConstruction(pid).some((c) => c.type === type) || game.state.sieges?.[pid]) continue;
      const dev = game.state.dev[pid];
      if (dev > bestDev) { bestDev = dev; best = pid; }
    }
    return best;
  }

  function nearestUnclaimed(game, me) {
    const own = new Set(game.provincesOf(me));
    let best = -1;
    let bestD = Infinity;
    const cap = game.nation(me).capital;
    game.grid.provinces.forEach((p) => {
      if (game.state.owner[p.id] !== null || game.canColonize(me, p.id)) return;
      const adj = p.neighbors.some((n) => own.has(n));
      const d = (adj ? 0 : 1e6) + (cap >= 0 ? game.grid.distanceKm(cap, p.id) : 0);
      if (d < bestD) { bestD = d; best = p.id; }
    });
    return best;
  }

  /** Bir düşman eyaletine (ya da düşman ülkenin başkentine) en büyük orduyu yollar */
  function attack(game, me, op) {
    if (!MH.armies) return fail('Ordular bu oyunda kullanılamıyor.');
    const enemies = game.enemiesOf(me);
    if (!enemies.length) return fail('Savaşta olmadığınız için saldırı emri verilemez; önce savaş ilan edin.');
    MH.armies.ensureStacks(game);
    let target = provinceOf(game, op.province, (p) => enemies.includes(game.state.owner[p]));
    if (target < 0) {
      const id = nationOf(game, op.nation ?? op.target);
      const foe = id && enemies.includes(id) ? id : enemies[0];
      target = game.nation(foe).capital;
      if (target < 0 || game.state.owner[target] !== foe) target = game.provincesOf(foe)[0] ?? -1;
    }
    if (target < 0) return fail('Saldırılacak düşman toprağı bulunamadı.');
    const stacks = MH.armies.stacksOf(game, me).slice().sort((a, b) => b.size - a.size);
    if (!stacks.length) return fail('Sahada ordunuz yok; önce asker toplayın.');
    let last = null;
    for (const s of stacks) {
      last = MH.armies.moveStack(game, s.id, target);
      if (last.ok) return last;
    }
    return last;
  }

  /** Model tarafından önerilen özel politika: etkiler sınırlanır, bedel motorca hesaplanır */
  function policy(game, me, op) {
    const nat = game.nation(me);
    const st = game.state;
    if (st.lastPolicyDay !== undefined && st.day - st.lastPolicyDay < POLICY_COOLDOWN) {
      return fail('Yeni bir reform için ' + (POLICY_COOLDOWN - (st.day - st.lastPolicyDay)) + ' gün beklenmeli.');
    }
    const fx = {};
    let cost = 0;
    for (const [key, rule] of Object.entries(POLICY)) {
      let v = Math.round(Number(op.effects?.[key]) || 0);
      v = clamp(v, rule.min, rule.max);
      if (!v) continue;
      fx[key] = v;
      // Olumlu etkiler bedellidir (savaş yorgunluğunda azalma olumludur)
      const gain = key === 'warExhaustion' ? -v : v;
      if (gain > 0) cost += gain * rule.price;
    }
    if (!Object.keys(fx).length) return fail('Bu politikanın oyunda ölçülebilir bir etkisi yok.');
    cost = Math.round(Math.max(cost, Number(op.cost) || 0));
    if (cost > nat.gold) return fail((op.title || 'Politika') + ' için ' + fmt(cost) + ' altın gerekli.');
    nat.gold = Math.round((nat.gold - cost) * 10) / 10;
    st.lastPolicyDay = st.day;
    const effects = cost ? [['Altın', -cost]] : [];
    const engineFx = { stability: fx.stability, manpower: fx.manpower, warExhaustion: fx.warExhaustion, capitalDev: fx.capitalDev ? fx.capitalDev * 3 : 0, opinionAll: fx.opinionAll };
    if (engineFx.manpower > 0) engineFx.manpower = Math.min(engineFx.manpower, Math.max(0, game.maxManpower(me) - nat.manpower));
    effects.push(...game.applyEffects(me, engineFx));
    const title = String(op.title || 'Reform').slice(0, 80);
    game.addLog('📜 ' + title + ' yürürlüğe girdi.', 'player', [me]);
    return { ok: true, message: title + ' yürürlüğe girdi.', effects };
  }

  /** Model ya da yedek ayrıştırıcının ürettiği tepkiler (ilişki değişimi, sınırlı) */
  function applyReactions(game, me, reactions) {
    const out = [];
    for (const r of (reactions || []).slice(0, 4)) {
      const id = nationOf(game, r.nation);
      if (!id || id === me) continue;
      const delta = clamp(Math.round(Number(r.opinion) || 0), -15, 8);
      const applied = delta > 0 ? D().applyOpinion(game, me, id, delta) : delta;
      if (delta < 0) game._changeOpinion(id, me, delta);
      out.push({ nation: id, name: game.nation(id).name, opinion: applied, text: String(r.text || '').slice(0, 240) });
    }
    return out;
  }

  // ---------------------------------------------------------------- yapay zekâ: oyun yöneticisi
  function contextFor(game) {
    const me = game.state.playerId;
    const P = game.nation(me);
    const name = (id) => game.nation(id)?.name;
    const budget = game.budget(me);
    const own = game.provincesOf(me);
    const topProv = own.slice().sort((a, b) => game.state.dev[b] - game.state.dev[a]).slice(0, 12)
      .map((pid) => MH.places.nameOf(game, pid) + (game.state.buildings?.[pid]?.length ? ' [' + game.state.buildings[pid].join(',') + ']' : ''));
    const enemies = game.enemiesOf(me);
    const enemyProv = enemies.flatMap((e) => game._frontier(me, e).slice(0, 5).map((pid) => MH.places.nameOf(game, pid) + ' (' + name(e) + ')'));
    const unclaimed = [];
    game.grid.provinces.forEach((p) => {
      if (unclaimed.length < 6 && game.state.owner[p.id] === null && game.adjacentToOwn(me, p.id)) unclaimed.push(MH.places.nameOf(game, p.id));
    });
    const relations = game.aliveNations()
      .filter((n) => n.id !== me)
      .map((n) => ({ n, op: game.opinion(n.id, me), nb: game.neighborsOf(me).includes(n.id) }))
      .sort((a, b) => (b.nb - a.nb) || Math.abs(b.op) - Math.abs(a.op) || game.militaryStrength(b.n.id) - game.militaryStrength(a.n.id))
      .slice(0, 18)
      .map(({ n, op, nb }) => n.name + ': ilişki ' + op + (nb ? ', komşu' : '') + (game.isAllied(me, n.id) ? ', müttefik' : '') + (game.hasTrade(me, n.id) ? ', ticaret' : '') + (game.warBetween(me, n.id) ? ', SAVAŞTA' : ''));
    return {
      tarih: MH.util.formatDay(game.state.day),
      senaryo: game.scenario.title,
      ulke: P.name,
      lider: P.leader,
      hazine: Math.round(P.gold),
      aylik_gelir: Math.round(budget.total),
      vergi_orani: P.tax,
      uretim_odagi: P.focus,
      istikrar: Math.round(P.stability),
      ordu_bin: Math.round(P.army),
      insan_gucu_bin: Math.round(P.manpower),
      asker_maliyeti_bin_basina: game.recruitCost(me),
      senlik_maliyeti: game.festivalCost(me),
      savas_yorgunlugu: Math.round(P.warExhaustion),
      muttefikler: P.allies.map(name),
      savastigi: enemies.map(name),
      eyalet_sayisi: own.length,
      onemli_eyaletler: topProv,
      cephe_eyaletleri: enemyProv.slice(0, 12),
      yakin_sahipsiz_topraklar: unclaimed,
      iliskiler: relations,
    };
  }

  function systemPrompt() {
    return [
      'Sen "Map Historia" adlı tarihî/alternatif tarih strateji oyununun oyun yöneticisisin (game master).',
      'Oyuncu ülkesi için bu tur ne yapmak istediğini serbest metinle yazar. Görevin metni oyunun izin verdiği işlemlere çevirmek ve sonucu kısa, sürükleyici bir dille anlatmaktır.',
      'İzin verilen işlemler (ops):',
      '- {"type":"set_tax","value":0-50}',
      '- {"type":"set_focus","focus":"agriculture|industry|trade|military"}',
      '- {"type":"recruit","amount":bin_asker} (insan gücü ve altın harcar)',
      '- {"type":"mercenaries","amount":bin_asker} (3 kat pahalı)',
      '- {"type":"disband","amount":bin_asker}',
      '- {"type":"build","building":"market|barracks|fort|temple","province":"şehir adı ya da boş"}',
      '- {"type":"festival"}',
      '- {"type":"propose_trade|cancel_trade|propose_alliance|break_alliance|declare_war","nation":"ülke adı"}',
      '- {"type":"gift","nation":"ülke adı","amount":altın}',
      '- {"type":"offer_peace","nation":"ülke adı","kind":"white|demand|offer"} (demand: tazminat iste, offer: tazminat öde)',
      '- {"type":"stance","nation":"düşman ülke","stance":"offensive|balanced|defensive"}',
      '- {"type":"attack","province":"düşman şehir adı","nation":"düşman ülke"} (orduyu yollar; önce savaşta olmak gerekir)',
      '- {"type":"colonize","province":"sahipsiz toprak adı"}',
      '- {"type":"policy","title":"kısa ad","effects":{"stability":-10..6,"capitalDev":0..2,"manpower":-10..10,"warExhaustion":-10..0,"opinionAll":-10..4}} (yukarıdakilere uymayan reformlar, yasalar, propaganda vb. için; bedeli oyun hesaplar, 60 günde bir)',
      'Kurallar:',
      '- Türkçe yaz. Oyuncunun istemediği bir işlemi ekleme. En fazla 8 işlem.',
      '- Oyunda karşılığı olmayan ya da imkânsız/aşırı istekleri (ör. "tüm dünyayı fethet", "1 milyon altın kazan") "refused" listesinde kısa gerekçeyle belirt.',
      '- Anlatı ("narrative") 2-4 cümle olsun; işlemlerin sonucu oyunca belirlenir, bu yüzden kesin başarı vaadetme ("…emri verildi", "…teklif edildi" gibi yaz).',
      '- "reactions": bu eylemlerden en çok etkilenen en fazla 4 ülkenin tepkisi (opinion −15..+8, kısa bir cümle). Gerekmiyorsa boş bırak.',
      '- Gerçek kişileri canlandırırken saygılı ve oyun bağlamında kal.',
      'Yalnızca şu JSON biçiminde yanıt ver:',
      '{"headline":"gazete manşeti gibi kısa başlık","narrative":"…","ops":[…],"refused":[{"text":"…","reason":"…"}],"reactions":[{"nation":"ülke","opinion":0,"text":"…"}]}',
    ].join('\n');
  }

  async function planWithLLM(game, text) {
    const out = await MH.llm.completeJSON({
      system: systemPrompt(),
      messages: [{ role: 'user', text: 'DURUM (JSON):\n' + JSON.stringify(contextFor(game)) + '\n\nOYUNCUNUN EYLEMLERİ:\n' + text }],
      temperature: 0.7,
      maxTokens: 1200,
    });
    return {
      headline: String(out.headline || '').slice(0, 140),
      narrative: String(out.narrative || '').slice(0, 1200),
      ops: (Array.isArray(out.ops) ? out.ops : []).filter((o) => o && OPS.includes(o.type)),
      refused: (Array.isArray(out.refused) ? out.refused : []).slice(0, 6).map((r) => ({ text: String(r.text || '').slice(0, 200), reason: String(r.reason || '').slice(0, 200) })),
      reactions: Array.isArray(out.reactions) ? out.reactions : [],
    };
  }

  // ---------------------------------------------------------------- yapay zekâ olmadan: anahtar kelimeler
  function amountIn(t) {
    const m = t.match(/(\d[\d.,]*)\s*(bin|k\b|milyon)?/);
    if (!m) return null;
    let v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (m[2] === 'milyon') v *= 1000;
    else if (!m[2] && v >= 1000) v /= 1000; // "20000 asker" → 20 bin
    return v;
  }

  function parseClause(game, clause) {
    const t = norm(clause);
    const me = game.state.playerId;
    const nation = D().findNation(game, clause, [me]);
    const pct = t.match(/%\s*(\d+)|(\d+)\s*%|yüzde\s*(\d+)/);
    const pctVal = pct ? Number(pct[1] || pct[2] || pct[3]) : null;
    if (/dünya|tüm (kıta|ülkeler)|her yeri|bütün ülkeler|ölümsüz|sınırsız/.test(t)) return null;

    if (/vergi/.test(t)) {
      if (pctVal !== null) return { type: 'set_tax', value: pctVal };
      if (/artır|yükselt|arttır/.test(t)) return { type: 'set_tax', delta: 5 };
      if (/düşür|azalt|indir|kaldır/.test(t)) return { type: 'set_tax', delta: -5 };
    }
    if (/odak|odaklan|ağırlık ver|öncelik/.test(t)) {
      for (const [focus, re] of Object.entries(FOCUS_WORDS)) if (re.test(t)) return { type: 'set_focus', focus };
    }
    if (/paralı/.test(t)) return { type: 'mercenaries', amount: amountIn(t) || 5 };
    if (/terhis|orduyu küçült|asker azalt/.test(t)) return { type: 'disband', amount: amountIn(t) || 5 };
    if (/şenlik|festival|kutlama|bayram/.test(t)) return { type: 'festival' };
    if (/(inşa|kur|yap|aç|dik|yükselt)/.test(t)) {
      for (const [building, re] of Object.entries(BUILD_WORDS)) {
        if (re.test(t) && !/ittifak|ticaret anlaş/.test(t)) return { type: 'build', building, province: clause };
      }
    }
    if (/kolon|sömürge|yerleşim|yerleş|iskân/.test(t)) return { type: 'colonize', province: clause };
    if (/barış|ateşkes/.test(t) && nation) {
      const kind = /tazminat|haraç/.test(t) ? (/öde(r|yeceğiz|yelim)|ver(elim|eceğiz)|teklif/.test(t) ? 'offer' : 'demand') : 'white';
      return { type: 'offer_peace', nation, kind };
    }
    if (/taarruz|saldırıya geç|savunmaya geç|savunma hattı|dengeli/.test(t) && nation && game.warBetween(me, nation)) {
      const stance = /savunma/.test(t) ? 'defensive' : /dengeli/.test(t) ? 'balanced' : 'offensive';
      return { type: 'stance', nation, stance };
    }
    if (/savaş ilan|savaş aç|savaşa gir|istila|işgal et/.test(t) && nation) return { type: 'declare_war', nation };
    if (/saldır|kuşat|yürü|ordu(yu|larımızı)? (gönder|yolla)|fethet|ele geçir/.test(t)) {
      if (nation && !game.warBetween(me, nation)) return [{ type: 'declare_war', nation }, { type: 'attack', nation, province: clause }];
      return { type: 'attack', nation, province: clause };
    }
    if (/ittifak|müttefik/.test(t) && nation) return { type: /boz|sonlandır|çık|feshet|iptal/.test(t) ? 'break_alliance' : 'propose_alliance', nation };
    if (/ticaret/.test(t) && nation) return { type: /iptal|kes|bitir|sonlandır|ambargo/.test(t) ? 'cancel_trade' : 'propose_trade', nation };
    if (/ambargo|yaptırım/.test(t) && nation) return { type: 'cancel_trade', nation };
    if (/hediye|bağış|yardım gönder|altın gönder|para gönder/.test(t) && nation) return { type: 'gift', nation, amount: amountIn(t) || 50 };
    if (/(asker|ordu|seferberlik|tümen|alay)/.test(t) && /(topla|al|büyüt|güçlendir|seferber|kur|eğit|artır|ilan)/.test(t)) {
      return { type: 'recruit', amount: amountIn(t) || 5 };
    }
    if (/reform|yasa|kanun|propaganda|eğitim|altyapı|kalkınma|sağlık|vergi affı|af ilan/.test(t)) {
      const fx = {};
      if (/altyapı|kalkınma|eğitim|sağlık|yatırım/.test(t)) fx.capitalDev = 1;
      if (/propaganda|af|reform|yasa|kanun/.test(t)) fx.stability = 3;
      if (/barış|dostluk|diplomasi/.test(t)) fx.opinionAll = 2;
      const title = clause.trim().replace(/\s+(başlat|yap|ilan et|çıkar|uygula|yürürlüğe koy|et)$/i, '').slice(0, 60);
      return { type: 'policy', title: title.charAt(0).toLocaleUpperCase('tr') + title.slice(1), effects: fx };
    }
    return null;
  }

  function planOffline(game, text) {
    const clauses = String(text)
      .split(/[\n.;!?]+|,\s*(?=\S)|\s+ve\s+(?=[^,]*?(?:kur|yap|ilan|topla|saldır|indir|artır|düşür|gönder|inşa|aç|iptal|boz|öner|teklif))/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    const ops = [];
    const refused = [];
    for (const c of clauses) {
      const r = parseClause(game, c);
      if (!r) refused.push({ text: c, reason: 'Kural tabanlı modda anlaşılamadı. Daha doğal anlatımlar için ⚙️ ayarlardan yapay zekâyı bağlayın.' });
      else ops.push(...(Array.isArray(r) ? r : [r]));
    }
    return { headline: '', narrative: '', ops, refused, reactions: [] };
  }

  // ---------------------------------------------------------------- etiketler
  const OP_LABEL = {
    set_tax: '💰 Vergi', set_focus: '🏭 Üretim odağı', recruit: '🪖 Asker toplama', mercenaries: '🗡️ Paralı asker',
    disband: '🏳️ Terhis', build: '🏗️ İnşaat', festival: '🎉 Şenlik', propose_trade: '📦 Ticaret', cancel_trade: '🚫 Ticaret iptali',
    propose_alliance: '🤝 İttifak', break_alliance: '💔 İttifak bozma', gift: '🎁 Hediye', declare_war: '⚔️ Savaş ilanı',
    offer_peace: '🕊️ Barış', stance: '🛡️ Cephe duruşu', attack: '🏹 Saldırı', colonize: '🏕️ Koloni', policy: '📜 Politika',
  };

  function headlineFor(game, results) {
    const P = game.nation(game.state.playerId);
    const ok = results.filter((r) => r.ok);
    if (!ok.length) return P.name + ' sarayında kararsız bir gün';
    const war = ok.find((r) => r.type === 'declare_war');
    if (war) return P.name + ' savaş ilan etti!';
    const al = ok.find((r) => r.type === 'propose_alliance');
    if (al) return 'Yeni ittifak: ' + al.message.replace(/ ittifakı kabul etti!?/, '') + ' ile omuz omuza';
    return P.name + ' yönetimi ' + ok.length + ' karar aldı';
  }

  // ---------------------------------------------------------------- dış arayüz
  /**
   * Oyuncunun yazdığı eylemleri işler.
   * Dönüş: { headline, narrative, results:[{type,label,ok,message,effects}], refused, reactions, usedLLM, warning }
   */
  async function submit(game, text, { useLLM = MH.llm?.enabled() } = {}) {
    const clean = String(text || '').trim().slice(0, 2000);
    if (!clean) throw new Error('Önce bir eylem yazın.');
    const me = game.state.playerId;
    if (!me || !game.nation(me)?.alive) throw new Error('Yönettiğiniz bir ülke yok.');
    let plan;
    let usedLLM = false;
    let warning;
    if (useLLM) {
      try {
        plan = await planWithLLM(game, clean);
        usedLLM = true;
      } catch (err) {
        warning = 'Yapay zekâ yanıt veremedi (' + err.message + '); kural tabanlı ayrıştırıcı kullanıldı.';
        plan = planOffline(game, clean);
      }
    } else plan = planOffline(game, clean);

    const results = [];
    for (const op of plan.ops.slice(0, MAX_OPS)) {
      let res;
      try {
        res = execute(game, op);
      } catch (err) {
        res = fail('Uygulanamadı: ' + err.message);
      }
      results.push({ type: op.type, label: OP_LABEL[op.type] || op.type, ok: !!res.ok, message: res.message, effects: res.effects || [] });
    }
    const reactions = applyReactions(game, me, plan.reactions);
    const entry = {
      day: game.state.day,
      text: clean,
      headline: plan.headline || headlineFor(game, results),
      narrative: plan.narrative,
      results,
      refused: plan.refused,
      reactions,
      ai: usedLLM,
    };
    game.state.actions = game.state.actions || [];
    game.state.actions.unshift(entry);
    if (game.state.actions.length > MAX_HISTORY) game.state.actions.length = MAX_HISTORY;
    if (results.some((r) => r.ok)) game.addLog('⚡ ' + entry.headline, 'player', [me]);
    game.emit('actions', entry);
    return { ...entry, usedLLM, warning };
  }

  /** Duruma göre kural tabanlı eylem fikirleri */
  function ideasOffline(game) {
    const me = game.state.playerId;
    const P = game.nation(me);
    const out = [];
    const enemies = game.enemiesOf(me);
    const budget = game.budget(me);
    if (P.stability < 40) out.push('Halkı yatıştırmak için başkentte büyük bir şenlik düzenle.');
    if (budget.total < 0) out.push('Bütçe açığını kapatmak için vergileri %' + Math.min(50, P.tax + 5) + "'e çıkar.");
    else if (P.gold > 200) out.push('Hazinedeki altınla en gelişmiş eyalette bir pazar inşa et.');
    if (enemies.length) {
      const foe = game.nation(enemies[0]);
      const war = game.warBetween(me, foe.id);
      if (game.warScore(war, me) > 25) out.push(foe.name + ' ile tazminat karşılığında barış yap.');
      else out.push(foe.name + ' cephesinde taarruza geç; ordunu ' + MH.places.nameOf(game, foe.capital) + ' üzerine yürüt.');
      if (P.manpower > 10 && P.gold > 80) out.push(Math.min(20, Math.floor(P.manpower)) + ' bin asker topla.');
    }
    const friends = game.aliveNations()
      .filter((n) => n.id !== me && !game.isAllied(me, n.id) && !game.warBetween(me, n.id))
      .sort((a, b) => game.opinion(b.id, me) - game.opinion(a.id, me));
    const ally = friends.find((n) => !game.allianceCheck(me, n.id));
    if (ally) out.push(ally.name + ' ile ittifak kur.');
    const trade = friends.find((n) => !game.tradeCheck(me, n.id));
    if (trade) out.push(trade.name + ' ile ticaret anlaşması imzala.');
    const cold = friends.filter((n) => game.neighborsOf(me).includes(n.id)).sort((a, b) => game.opinion(a.id, me) - game.opinion(b.id, me))[0];
    if (cold && game.opinion(cold.id, me) < 0) out.push(cold.name + ' ile ilişkileri düzeltmek için 50 altın hediye gönder.');
    const near = nearestUnclaimed(game, me);
    if (near >= 0) out.push(MH.places.nameOf(game, near) + ' topraklarında koloni kur.');
    if (!enemies.length && P.army < game.totalDev(me) * 0.3) out.push('Sınırları korumak için 10 bin asker topla ve bir kale inşa et.');
    out.push('Eğitim ve altyapı reformu başlat.');
    return out.slice(0, 6);
  }

  async function ideas(game, { useLLM = MH.llm?.enabled() } = {}) {
    if (!useLLM) return { ideas: ideasOffline(game), usedLLM: false };
    try {
      const out = await MH.llm.completeJSON({
        system: 'Sen "Map Historia" strateji oyununda oyuncuya danışmanlık yapan bir devlet adamısın. Türkçe yaz. Yalnızca {"ideas":["…"]} biçiminde JSON döndür.',
        messages: [{
          role: 'user',
          text: 'DURUM (JSON):\n' + JSON.stringify(contextFor(game)) +
            '\n\nOyuncunun bu tur yazabileceği 5 farklı, somut ve dönemine uygun eylem öner. Her biri tek cümle, emir kipinde olsun (ör. "Fransa ile ittifak kur"). Oyunun yapabildikleri: vergi, üretim odağı, asker toplama, inşaat (pazar, kışla, kale, mabet), şenlik, ticaret, ittifak, hediye, savaş ilanı, barış, cephe duruşu, saldırı, koloni, reform.',
        }],
        temperature: 0.9,
        maxTokens: 500,
      });
      const list = (Array.isArray(out.ideas) ? out.ideas : []).map((s) => String(s).slice(0, 160)).filter(Boolean).slice(0, 6);
      if (!list.length) throw new Error('boş liste');
      return { ideas: list, usedLLM: true };
    } catch (err) {
      return { ideas: ideasOffline(game), usedLLM: false, warning: 'Yapay zekâ fikir üretemedi (' + err.message + ').' };
    }
  }

  MH.actions = { submit, ideas, ideasOffline, planOffline, parseClause, execute, contextFor, OPS, OP_LABEL };
})((globalThis.MH = globalThis.MH || {}));
