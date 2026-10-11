/*
 * Map Historia — diplomatik sohbetler.
 *
 * Oyuncu herhangi bir ülkenin lideriyle serbest metinle yazışır. Yapay zekâ açıksa lider, ülkenin
 * durumu, ilişkiler ve oyun kuralları bağlamında karakterine uygun yanıt verir; kapalıysa anahtar
 * kelimelere dayalı kural tabanlı bir yedek yanıt üretilir.
 *
 * Anlaşmaların tek yetkilisi oyun kurallarıdır: model bir anlaşmayı "kabul" etse bile motor
 * (allianceCheck, tradeCheck, peaceCheck…) izin vermiyorsa uygulanmaz.
 */
(function (MH) {
  'use strict';

  const MAX_THREAD = 60;
  const MONTHLY_GAIN_CAP = 20; // sohbetle bir ayda kazanılabilecek en fazla ilişki
  const GENERIC_LEADER = /^(Hükümdar|Hükümet)$/;

  // ---------------------------------------------------------------- ad çözümleme (eylemlerle ortak)
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFC');
  const SUFFIX = /('?(nin|nın|nun|nün|in|ın|un|ün|na|ne|ya|ye|a|e|da|de|ta|te|dan|den|tan|ten|la|le|ile|yla|yle|ı|i|u|ü|yı|yi|yu|yü))$/;

  /** Metinde geçen ülkeyi bulur (Türkçe ekleri tolere eder) */
  function findNation(game, text, exclude = []) {
    const t = ' ' + norm(text).replace(/[^\p{L}\p{N}' -]/gu, ' ') + ' ';
    let best = null;
    let bestLen = 0;
    for (const n of game.aliveNations()) {
      if (exclude.includes(n.id)) continue;
      const names = [n.name, n.name.split(' ')[0], n.id];
      for (const raw of names) {
        const name = norm(raw);
        if (name.length < 3) continue;
        const re = new RegExp('[\\s]' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "('?[\\p{L}]*)?[\\s]", 'u');
        if (re.test(t) && name.length > bestLen) { best = n.id; bestLen = name.length; }
      }
    }
    return best;
  }

  /** Metinde geçen eyaleti (şehir adı) bulur; filtre: (pid) => bool */
  function findProvince(game, text, filter) {
    const t = norm(text);
    let best = -1;
    let bestLen = 0;
    game.grid.provinces.forEach((p) => {
      if (filter && !filter(p.id)) return;
      const name = norm(MH.places.nameOf(game, p.id)).replace(/ yöresi$| taşrası$/, '');
      if (name.length < 3) return;
      if (t.includes(name) && name.length > bestLen) { best = p.id; bestLen = name.length; }
    });
    return best;
  }

  /** Sohbette gösterilecek lider adı (adı bilinmeyen liderler için "X hükümeti") */
  function leaderName(nat) {
    if (!GENERIC_LEADER.test(nat.leader)) return nat.leader;
    return nat.name + (nat.leader === 'Hükümet' ? ' hükümeti' : ' hükümdarı');
  }

  // ---------------------------------------------------------------- konuşma kayıtları
  function threads(game) {
    game.state.chats = game.state.chats || {};
    return game.state.chats;
  }

  function thread(game, id) {
    const all = threads(game);
    return (all[id] = all[id] || []);
  }

  function post(game, id, from, text, extra = {}) {
    const list = thread(game, id);
    list.push({ from, text, day: game.state.day, ...extra });
    if (list.length > MAX_THREAD) list.splice(0, list.length - MAX_THREAD);
    if (from === 'nation') {
      game.state.chatUnread = game.state.chatUnread || {};
      game.state.chatUnread[id] = true;
    }
    game.emit('chat', { id, from });
  }

  /** Son mesaj tarihine göre sohbet listesi */
  function threadList(game) {
    return Object.entries(threads(game))
      .filter(([id, list]) => list.length && game.nation(id))
      .map(([id, list]) => ({ id, last: list[list.length - 1], unread: !!game.state.chatUnread?.[id] }))
      .sort((a, b) => b.last.day - a.last.day);
  }

  function markRead(game, id) {
    if (game.state.chatUnread) delete game.state.chatUnread[id];
  }

  // ---------------------------------------------------------------- kurallar: neye izin var?
  /** Karşı tarafın (them) oyuncuya (me) şu an kurallara göre verebileceği kararlar */
  function options(game, me, them) {
    const war = game.warBetween(me, them);
    const nat = game.nation(them);
    const opinion = game.opinion(them, me);
    const joinTargets = game.enemiesOf(me)
      .filter((x) => x !== them && !game.warBetween(them, x) && !game.isAllied(them, x))
      .map((x) => ({ id: x, name: game.nation(x).name, ok: opinion >= 40 || game.isAllied(them, me) }));
    return {
      alliance: war ? 'Savaştasınız.' : game.allianceCheck(me, them),
      trade: game.tradeCheck(me, them),
      peace_white: war ? game.peaceCheck(me, them, 'white') : 'Savaşta değilsiniz.',
      peace_player_pays: war ? game.peaceCheck(me, them, 'offer') : 'Savaşta değilsiniz.',
      peace_we_pay: war ? game.peaceCheck(me, them, 'demand') : 'Savaşta değilsiniz.',
      join_war: joinTargets,
      send_aid: opinion >= 50 && nat.gold > 60 ? null : 'İlişki en az 50 ve hazine yeterli olmalı.',
      declare_war: !war && !game.isAllied(me, them) && opinion <= -60 && game.militaryStrength(them) >= game.militaryStrength(me) * 0.8
        ? null : 'Savaş ilanı için ilişki −60 altında ve ordu yeterince güçlü olmalı.',
      break_alliance: game.isAllied(me, them) && opinion <= -30 ? null : 'Yalnızca müttefikken ve ilişki çok kötüyse.',
    };
  }

  /** Sohbetle ilişki değişimi (aylık kazanç tavanıyla) */
  function applyOpinion(game, me, them, delta) {
    const nat = game.nation(them);
    const d = Math.max(-10, Math.min(10, Math.round(delta || 0)));
    if (!d) return 0;
    let applied = d;
    if (d > 0) {
      const meta = nat.chatGain && game.state.day - nat.chatGain.day < 30 ? nat.chatGain : { day: game.state.day, sum: 0 };
      applied = Math.max(0, Math.min(d, MONTHLY_GAIN_CAP - meta.sum));
      meta.sum += applied;
      nat.chatGain = meta;
    }
    if (applied) game._changeOpinion(them, me, applied);
    return applied;
  }

  /** Karşı tarafın kabul ettiği anlaşmaları kurallardan geçirip uygular */
  function applyAgreements(game, me, them, agreements) {
    const results = [];
    const nat = game.nation(them);
    const opts = options(game, me, them);
    for (const a of (agreements || []).slice(0, 3)) {
      if (!a || a.accept === false) continue;
      const type = a.type;
      let res = null;
      if (type === 'alliance') res = opts.alliance ? fail(opts.alliance) : game.proposeAlliance(me, them);
      else if (type === 'trade') res = opts.trade ? fail(opts.trade) : game.proposeTrade(me, them);
      else if (type === 'peace_white') res = opts.peace_white ? fail(opts.peace_white) : game.offerPeace(me, them, 'white');
      else if (type === 'peace_player_pays') res = opts.peace_player_pays ? fail(opts.peace_player_pays) : game.offerPeace(me, them, 'offer');
      else if (type === 'peace_we_pay') res = opts.peace_we_pay ? fail(opts.peace_we_pay) : game.offerPeace(me, them, 'demand');
      else if (type === 'join_war') {
        const target = resolveTarget(game, a.target, opts.join_war);
        if (!target) res = fail('Katılınacak savaş bulunamadı.');
        else if (!target.ok) res = fail(nat.name + ' bu savaşa katılacak kadar yakın değil.');
        else {
          game._startWar(them, target.id, true);
          game._changeOpinion(target.id, them, -40);
          game.addLog(nat.name + ', ' + game.nation(me).name + ' yanında ' + target.name + ' ile savaşa girdi.', 'war', [me, them]);
          res = { ok: true, message: nat.name + ', ' + target.name + ' ile savaşa girdi!', effects: [[nat.name + ' yanınızda savaşıyor', null]] };
        }
      } else if (type === 'send_aid') {
        if (opts.send_aid) res = fail(opts.send_aid);
        else {
          const amount = Math.round(Math.max(10, Math.min(Number(a.amount) || 50, nat.gold * 0.2, 150)));
          nat.gold -= amount;
          game.nation(me).gold += amount;
          game.addLog(nat.name + ' ülkemize ' + amount + ' altın yardım gönderdi.', 'good', [me, them]);
          res = { ok: true, message: nat.name + ' ' + amount + ' altın yardım gönderdi.', effects: [['Altın', amount]] };
        }
      } else if (type === 'declare_war') {
        if (opts.declare_war) continue; // kurallar izin vermiyorsa sessizce yok sayılır
        res = game.declareWar(them, me);
        if (res.ok) game.queueEvent('war_declared', me, { target: them });
      } else if (type === 'break_alliance') {
        if (opts.break_alliance) continue;
        res = game.breakAlliance(them, me);
      } else continue;
      results.push({ type, ...res });
    }
    return results;
  }

  function fail(message) {
    return { ok: false, message, effects: [] };
  }

  function resolveTarget(game, raw, list) {
    if (!list.length) return null;
    if (!raw) return list[0];
    const id = findNation(game, ' ' + raw + ' ') || raw;
    return list.find((x) => x.id === id || norm(x.name) === norm(raw)) || null;
  }

  // ---------------------------------------------------------------- yapay zekâ ile
  function contextFor(game, me, them) {
    const P = game.nation(me);
    const T = game.nation(them);
    const war = game.warBetween(me, them);
    const name = (id) => game.nation(id)?.name;
    const brief = (n) => ({
      ulke: n.name,
      lider: n.leader,
      eyalet: game.provincesOf(n.id).length,
      ordu_bin_asker: Math.round(n.army),
      hazine: Math.round(n.gold),
      istikrar: Math.round(n.stability),
      muttefikler: n.allies.map(name).slice(0, 10),
      savastigi: game.enemiesOf(n.id).map(name),
      ticaret: n.trade.map(name).slice(0, 8),
    });
    const opts = options(game, me, them);
    const rule = (v) => (v ? 'HAYIR: ' + v : 'evet');
    const recent = game.state.log
      .filter((l) => l.nations?.includes(me) || l.nations?.includes(them))
      .slice(0, 6)
      .map((l) => MH.util.formatDay(l.day) + ': ' + l.text);
    return {
      tarih: MH.util.formatDay(game.state.day),
      senaryo: game.scenario.title,
      sen: brief(T),
      oyuncu: brief(P),
      iliski: {
        senin_ona_bakisin: game.opinion(them, me),
        onun_sana_bakisi: game.opinion(me, them),
        muttefik: game.isAllied(me, them),
        savasta: !!war,
        savas_skoru_senin_icin: war ? game.warScore(war, them) : null,
        ticaret: game.hasTrade(me, them),
        komsu: game.neighborsOf(me).includes(them),
        askeri_guc_orani_sen_bolu_oyuncu: +(game.militaryStrength(them) / Math.max(1, game.militaryStrength(me))).toFixed(2),
      },
      kurallara_gore_verebilecegin_kararlar: {
        alliance: rule(opts.alliance),
        trade: rule(opts.trade),
        peace_white: rule(opts.peace_white),
        peace_player_pays: rule(opts.peace_player_pays),
        peace_we_pay: rule(opts.peace_we_pay),
        join_war: opts.join_war.length ? opts.join_war.map((x) => x.name + ': ' + (x.ok ? 'evet' : 'HAYIR (ilişki yetersiz)')) : 'oyuncunun savaşı yok',
        send_aid: rule(opts.send_aid),
        declare_war: rule(opts.declare_war),
        break_alliance: rule(opts.break_alliance),
      },
      son_olaylar: recent,
    };
  }

  function systemPrompt(game, them) {
    const T = game.nation(them);
    return [
      GENERIC_LEADER.test(T.leader)
        ? `Sen "Map Historia" adlı tarihî/alternatif tarih strateji oyununda ${T.name} ülkesinin yöneticisisin (dönemine uygun bir hükümdar ya da hükümet başkanı olarak konuş).`
        : `Sen "Map Historia" adlı tarihî/alternatif tarih strateji oyununda ${T.name} ülkesinin lideri ${T.leader} olarak konuşuyorsun.`,
      'Oyuncu başka bir ülkenin lideri olarak seninle yazışıyor. Ülkenin çıkarlarını, dönemin üslubunu ve karakterini koru.',
      'Kurallar:',
      '- Türkçe yaz. Yanıtın kısa olsun: en fazla 3-4 cümle. Gerektiğinde pazarlık et, karşı teklif ver ya da reddet.',
      '- Gerçek kişileri canlandırırken saygılı ve oyun bağlamında kal; nefret söylemi, aşağılayıcı ifade ya da gerçek dünyaya yönelik şiddet çağrısı yapma.',
      '- Resmî kararları yalnızca "agreements" listesiyle ver. Bağlam içindeki "kurallara_gore_verebilecegin_kararlar" alanında HAYIR olanları kabul edemezsin.',
      '- Bir anlaşmayı yalnızca oyuncu bunu açıkça istediyse ya da sen önerdiysen ve uygunsa ekle. Emin değilsen ekleme.',
      '- "opinion_change": oyuncunun bu mesajı ilişkinizi nasıl etkiledi (-10 ile +10). Nazik ve ikna edici sözler artırır, tehdit ve hakaret düşürür.',
      'Yalnızca şu JSON biçiminde yanıt ver:',
      '{"reply":"lider olarak yanıtın","opinion_change":0,"mood":"dostça|nötr|soğuk|öfkeli","agreements":[{"type":"alliance|trade|peace_white|peace_player_pays|peace_we_pay|join_war|send_aid|declare_war|break_alliance","accept":true,"target":"(join_war için ülke adı)","amount":0}]}',
      'Anlamlar: peace_player_pays = oyuncu sana tazminat öder ve barış olur; peace_we_pay = sen oyuncuya tazminat ödersin ve barış olur; join_war = oyuncunun yanında bir düşmanına karşı savaşa girersin; send_aid = oyuncuya altın yardımı gönderirsin; declare_war = oyuncuya savaş açarsın (yalnızca çok öfkeliysen ve kural izin veriyorsa).',
    ].join('\n');
  }

  async function replyWithLLM(game, me, them, text) {
    const history = thread(game, them).slice(-12, -1).map((m) => ({
      role: m.from === 'player' ? 'user' : 'assistant',
      text: m.from === 'system' ? '[Oyun bilgisi] ' + m.text : m.text,
    }));
    // Model geçmişi user ile başlamalı
    while (history.length && history[0].role !== 'user') history.shift();
    const ctx = contextFor(game, me, them);
    const messages = [
      ...history,
      { role: 'user', text: 'DURUM (JSON):\n' + JSON.stringify(ctx) + '\n\nOYUNCUNUN MESAJI:\n' + text },
    ];
    const out = await MH.llm.completeJSON({ system: systemPrompt(game, them), messages, temperature: 0.85, maxTokens: 700 });
    return {
      reply: String(out.reply || '').slice(0, 900) || '…',
      opinion: Number(out.opinion_change) || 0,
      mood: out.mood,
      agreements: Array.isArray(out.agreements) ? out.agreements : [],
    };
  }

  // ---------------------------------------------------------------- yapay zekâ olmadan (yedek)
  const KW = {
    alliance: /ittifak|müttefik|birlik kur|savunma pakt/,
    trade: /ticaret|ticari|serbest ticaret|gümrük/,
    peace_player_pays: /(tazminat|haraç|altın)[^.]*(öde(r|yeyim|yeceğiz|riz)|vere(yim|ceğiz|rim)|teklif)/,
    peace_we_pay: /(tazminat|haraç)[^.]*(isti|öde(yin|men|sin)|ver(in|men|sin))/,
    peace_white: /barış|ateşkes|savaşı bitir/,
    join_war: /(savaşa katıl|yanımızda savaş|birlikte savaş|karşı (savaş|ittifak)|bize katıl)/,
    send_aid: /(yardım|destek|kredi|altın|para)[^.]*(gönder|ver|lazım|ihtiyaç)/,
  };
  const FRIENDLY = /(selam|merhaba|dost|kardeş|saygı|teşekkür|işbirliği|barış içinde|iyi niyet|komşu)/;
  const THREAT = /(tehdit|işgal|yok ede|ezece|pişman|savaş ilan ede|haddini|boyun eğ)/;
  const INSULT = /(aptal|korkak|hain|zavallı|beceriksiz|ahmak)/;

  function replyOffline(game, me, them, text) {
    const t = norm(text);
    const agreements = [];
    let opinion = 0;
    if (FRIENDLY.test(t)) opinion += 3;
    if (THREAT.test(t)) opinion -= 8;
    if (INSULT.test(t)) opinion -= 10;
    const opts = options(game, me, them);
    const asked = [];
    if (KW.alliance.test(t)) asked.push('alliance');
    if (KW.trade.test(t)) asked.push('trade');
    if (game.warBetween(me, them)) {
      if (KW.peace_player_pays.test(t)) asked.push('peace_player_pays');
      else if (KW.peace_we_pay.test(t)) asked.push('peace_we_pay');
      else if (KW.peace_white.test(t)) asked.push('peace_white');
    }
    if (KW.join_war.test(t)) asked.push('join_war');
    if (KW.send_aid.test(t)) asked.push('send_aid');
    for (const type of asked) {
      if (type === 'join_war' && !opts.join_war.length && game.enemiesOf(me).some((x) => game.warBetween(them, x))) {
        agreements.push({ type: 'already_fighting', accept: true });
        continue;
      }
      const ok = type === 'join_war' ? opts.join_war.some((x) => x.ok) : !opts[type];
      agreements.push({ type, accept: ok, target: type === 'join_war' ? findNation(game, text, [me, them]) : undefined });
    }
    if (THREAT.test(t) && !opts.declare_war) agreements.push({ type: 'declare_war', accept: true });
    const op = game.opinion(them, me) + opinion;
    const T = game.nation(them);
    const tone = op >= 50 ? 'dost' : op >= 0 ? 'nötr' : op >= -40 ? 'soğuk' : 'öfkeli';
    const open = {
      dost: ['Sevgili dostum, mektubunuz bizi memnun etti.', 'Değerli müttefikimiz, sözleriniz yüreğimizi ısıttı.'],
      nötr: ['Mesajınızı aldık ve dikkatle değerlendirdik.', 'Elçinizi kabul ettik; sözlerinizi tarttık.'],
      soğuk: ['Sözleriniz sarayımızda pek hoş karşılanmadı.', 'Niyetinizden emin değiliz.'],
      öfkeli: ['Küstahlığınızı unutmadık.', 'Bu sözlerin bedelini düşünmeden mi yazdınız?'],
    }[tone];
    const parts = [game.pick(open)];
    const label = {
      alliance: ['İttifak teklifinizi kabul ediyoruz; bundan böyle omuz omuzayız.', 'Şimdilik bir ittifaka hazır değiliz.'],
      trade: ['Tüccarlarımız limanlarınıza açılmaya hazır; anlaşma tamamdır.', 'Ticaret için henüz güven oluşmadı.'],
      peace_white: ['Kan dökülmesi yeter; beyaz barışı kabul ediyoruz.', 'Savaş meydanı henüz son sözünü söylemedi; barış yok.'],
      peace_player_pays: ['Tazminat karşılığında barışa razıyız.', 'Teklif ettiğiniz bedel yetersiz.'],
      peace_we_pay: ['Yenilgimizi kabul ediyor, istediğiniz tazminatı ödüyoruz.', 'Size tek bir altın ödemeyeceğiz!'],
      join_war: ['Düşmanınız düşmanımızdır; ordularımız yola çıkıyor.', 'Bu savaşa girmek halkımızın çıkarına değil.'],
      send_aid: ['Hazinemizden size yardım gönderiyoruz.', 'Hazinemiz yardıma uygun değil.'],
      declare_war: ['Tehditlerinize ancak kılıçla cevap verilir. Savaş!', ''],
      already_fighting: ['Ordularımız zaten sizinle aynı safta savaşıyor.', ''],
    };
    for (const a of agreements) {
      const pair = label[a.type];
      if (pair) parts.push(a.accept ? pair[0] : pair[1]);
    }
    if (!agreements.length) {
      parts.push(tone === 'dost' ? 'İlişkilerimizin daha da gelişmesini dileriz.' : tone === 'öfkeli' ? 'Sınırlarımızı korumaya hazırız.' : 'Somut bir teklifiniz varsa dinlemeye hazırız.');
    }
    parts.push('— ' + leaderName(T));
    return { reply: parts.filter(Boolean).join(' '), opinion, mood: tone, agreements };
  }

  // ---------------------------------------------------------------- dış arayüz
  /** Oyuncunun mesajını gönderir; yanıtı ve uygulanan sonuçları döndürür */
  async function send(game, them, text, { useLLM = MH.llm?.enabled() } = {}) {
    const me = game.state.playerId;
    const clean = String(text || '').trim().slice(0, 1200);
    if (!clean) throw new Error('Boş mesaj gönderilemez.');
    if (!game.nation(them)?.alive) throw new Error('Bu ülke artık yok.');
    post(game, them, 'player', clean);
    let r;
    let usedLLM = false;
    if (useLLM) {
      try {
        r = await replyWithLLM(game, me, them, clean);
        usedLLM = true;
      } catch (err) {
        r = replyOffline(game, me, them, clean);
        r.warning = 'Yapay zekâ yanıt veremedi (' + err.message + '); kural tabanlı yanıt kullanıldı.';
      }
    } else r = replyOffline(game, me, them, clean);
    const applied = applyOpinion(game, me, them, r.opinion);
    const results = applyAgreements(game, me, them, r.agreements);
    const effects = [];
    if (applied) effects.push([game.nation(them).name + ' ilişkisi', applied]);
    for (const res of results) {
      effects.push([(res.ok ? '✓ ' : '✗ ') + res.message, null]);
      for (const e of res.effects || []) if (e[1] !== null && e[1] !== undefined) effects.push(e);
    }
    post(game, them, 'nation', r.reply, { fx: effects, mood: r.mood, ai: usedLLM });
    markRead(game, them);
    return { reply: r.reply, effects, results, usedLLM, warning: r.warning };
  }

  /** Yapay zekâ kaynaklı olayları ilgili ülkenin sohbetine de yazar */
  const EVENT_TEXT = {
    ai_alliance_offer: (n) => leaderName(n) + ': Ülkelerimiz arasında bir savunma ittifakı öneriyoruz. Cevabınızı bekliyoruz.',
    ai_peace_offer: (n, ctx) => leaderName(n) + ': Bu savaş iki halkımıza da acı veriyor. ' + (ctx.pay ? 'Tazminat ödemeye hazırız; barış yapalım.' : 'Barış masasına oturalım.'),
    ai_peace_demand: (n) => leaderName(n) + ': Ordularımız üstün geldi. Tazminat öderseniz savaş biter; aksi hâlde ilerlemeye devam edeceğiz.',
    war_declared: (n) => leaderName(n) + ': Sabrımız tükendi. Bugünden itibaren ülkelerimiz savaştadır!',
  };

  function attach(game) {
    game.on('event', ({ pending }) => {
      const make = EVENT_TEXT[pending?.eventId];
      const id = pending?.ctx?.target;
      if (!make || !id || !game.nation(id)) return;
      post(game, id, 'nation', make(game.nation(id), pending.ctx), { event: pending.eventId });
    });
  }

  /** Hızlı teklif düğmeleri için hazır metinler */
  function quickProposals(game, them) {
    const me = game.state.playerId;
    const war = game.warBetween(me, them);
    const list = [];
    if (war) {
      list.push(['🕊️ Beyaz barış', 'Bu savaş ikimize de zarar veriyor. Beyaz barış öneriyorum.']);
      list.push(['💰 Tazminat iste', 'Savaşı kaybettiğinizi kabul edin; tazminat ödeyin ve barış yapalım.']);
      list.push(['🤲 Tazminat öde', 'Barış karşılığında size tazminat ödemeye hazırız.']);
    } else {
      if (!game.isAllied(me, them)) list.push(['🤝 İttifak', 'Ülkelerimiz arasında bir savunma ittifakı öneriyorum.']);
      if (!game.hasTrade(me, them)) list.push(['📦 Ticaret', 'Karşılıklı yarar için bir ticaret anlaşması imzalayalım.']);
      const enemy = game.enemiesOf(me)[0];
      if (enemy) list.push(['⚔️ Savaşa katıl', game.nation(enemy).name + ' ile savaşımızda yanımızda yer almanızı istiyoruz.']);
      list.push(['💬 Selam', 'Halkımız adına size dostluk ve iyi niyet mesajı gönderiyorum.']);
    }
    return list;
  }

  MH.diplomacy = { leaderName, applyOpinion, send, thread, threadList, post, markRead, attach, options, quickProposals, contextFor, findNation, findProvince, replyOffline, applyAgreements, norm };
})((globalThis.MH = globalThis.MH || {}));
