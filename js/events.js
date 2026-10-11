/*
 * Map Historia — tarihi ve kurgusal olaylar (AC 4.1, 4.2).
 * Her olayın en az iki seçeneği ve her seçeneğin farklı sonuçları vardır.
 *
 * Seçenek alanları:
 *   effects  – game.applyEffects ile uygulanan sabit etkiler
 *   random   – [{ weight, text, effects, run }] — sonuç zarla belirlenir
 *   run      – (game, id, ctx) => [[etiket, değer, birim]] özel mantık
 *   hint     – önizlemede gösterilecek ek açıklama
 */
(function (MH) {
  'use strict';

  const MIN_GAP_DAYS = 60; // iki rastgele olay arası en az süre
  const MONTHLY_CHANCE = 0.5;
  const REPEAT_COOLDOWN = 365 * 4;

  const name = (game, id) => game.nation(id)?.name ?? '?';
  const alive = (game, id) => !!game.nation(id)?.alive;

  function declare(game, from, to) {
    if (!alive(game, from) || !alive(game, to)) return [];
    const res = game.declareWar(from, to);
    return res.ok ? res.effects : [[res.message, null]];
  }

  function forcePeace(game, a, b) {
    if (!game.warBetween(a, b)) return [];
    return game.offerPeace(a, b, 'white', true).effects;
  }

  function captureFrom(game, winner, loser, count) {
    const war = game.warBetween(winner, loser);
    let taken = 0;
    for (let i = 0; i < count; i++) {
      const front = game._frontier(winner, loser);
      if (!front.length) break;
      game.transferProvince(game.pick(front), winner, war);
      taken++;
    }
    return taken ? [[name(game, loser) + ' topraklarından ele geçirilen eyalet', taken]] : [];
  }

  function randomNeighbor(game, id, filter) {
    const list = game.neighborsOf(id).filter((n) => !filter || filter(n));
    return list.length ? game.pick(list) : null;
  }

  const EVENTS = [
    // ============================================================ 1453 — tarihi
    {
      id: 'byzantium_plea',
      scenario: 'fall-1453',
      date: '1453-03-01',
      nation: 'byzantium',
      icon: '🏰',
      title: 'Surların Önünde Gölgeler',
      text: "Sultan Mehmed'in Rumeli Hisarı Boğaz'ı kesti ve Edirne'de devasa toplar dökülüyor. Şehrin savunması için zaman daralıyor.",
      aiChoice: 0,
      options: [
        { text: "Batı'dan yardım iste — Kiliselerin Birliği'ni ilan et", effects: { stability: -10, army: 4, opinionWith: { papal: 30, venice: 25, hungary: 20 } }, hint: 'Cenevizli Giustiniani 4.000 askerle gelir' },
        { text: 'Sultan ile haraç antlaşması imzala', effects: { goldPct: -0.5, stability: -5, opinionWith: { ottoman: 80 } }, hint: "Osmanlı'nın tutumu yumuşarsa kuşatma ertelenebilir" },
      ],
    },
    {
      id: 'constantinople_siege',
      scenario: 'fall-1453',
      date: '1453-04-06',
      nation: 'ottoman',
      icon: '💣',
      title: "Konstantinopolis Kuşatması",
      text: 'Orban\'ın dev topları hazır, donanma Haliç\'e kızaklarla indirilmeyi bekliyor. Ordunuz Theodosius Surları\'nın önünde. Karar sizin, Sultanım.',
      condition: (game) => alive(game, 'byzantium') && game.opinion('ottoman', 'byzantium') < 0,
      aiChoice: 0,
      options: [
        {
          text: 'Surlara büyük taarruz emri ver',
          hint: 'Başarı şansı yüksek, ama başarısızlık pahalıya patlar',
          run: (game, id) => (game.warBetween(id, 'byzantium') ? [] : declare(game, id, 'byzantium')),
          random: [
            {
              weight: 70,
              text: 'Şehir düştü! Konstantinopolis artık sizin başkentiniz.',
              effects: { stability: 12, armyPct: -0.1, opinionAll: -5 },
              run: (game, id) => {
                const byz = game.nation('byzantium');
                if (!byz.alive) return [];
                game.transferProvince(byz.capital, id, game.warBetween(id, 'byzantium'));
                return [['Konstantinopolis fethedildi', null]];
              },
            },
            { weight: 30, text: 'Taarruz surlarda kırıldı. Ordu ağır kayıp verdi.', effects: { armyPct: -0.25, stability: -10, warExhaustion: 10 } },
          ],
        },
        { text: 'Kuşatmayı ertele, donanmayı güçlendir', effects: { gold: -60, stability: -6, capitalDev: 1 } },
      ],
    },
    {
      id: 'castillon',
      scenario: 'fall-1453',
      date: '1453-07-17',
      nation: 'england',
      icon: '⚔️',
      title: 'Castillon Muharebesi',
      text: "Yaşlı Talbot, Gaskonya'yı kurtarmak için Fransız topçu kampına saldırmak istiyor. Yüz Yıl Savaşları'nın kaderi bu sabah belirlenebilir.",
      condition: (game) => !!game.warBetween('england', 'france'),
      aiChoice: 0,
      options: [
        {
          text: "Talbot'a saldırı izni ver",
          random: [
            { weight: 35, text: 'Fransız topçusu susturuldu! Gaskonya nefes aldı.', effects: { stability: 8 }, run: (game, id) => captureFrom(game, id, 'france', 2) },
            { weight: 65, text: 'Talbot düştü, ordu bozguna uğradı.', effects: { armyPct: -0.2, stability: -8, warExhaustion: 10 } },
          ],
        },
        { text: "Gaskonya'dan çekil ve barış ara", effects: { stability: -5 }, run: (game, id) => forcePeace(game, id, 'france'), hint: 'Fransa ile beyaz barış' },
      ],
    },
    // ============================================================ 1815 — tarihi
    {
      id: 'eagle_returns',
      scenario: 'hundred-days-1815',
      date: '1815-03-21',
      nation: 'france',
      icon: '🦅',
      title: 'Kartal Yeniden Uçuyor',
      text: "Tuileries Sarayı'na döndünüz. Halk coşkulu, ama tüm Avrupa size karşı birleşiyor. Fransa'yı nasıl yöneteceksiniz?",
      aiChoice: 1,
      options: [
        { text: 'Liberal bir anayasa ilan et (Acte additionnel)', effects: { stability: 12, tax: -5, opinionAll: 5 } },
        { text: 'Ulusal Muhafızları seferber et', effects: { army: 30, manpower: -20, stability: -5, gold: -40 } },
      ],
    },
    {
      id: 'serbian_uprising',
      scenario: 'hundred-days-1815',
      date: '1815-04-23',
      nation: 'ottoman',
      icon: '🔥',
      title: 'Takovo Ayaklanması',
      text: "Miloš Obrenović Takovo'da Sırpları yeniden ayaklandırdı. Belgrad Paşalığı tehlikede.",
      condition: (game) => !!game.warBetween('ottoman', 'serbia'),
      aiChoice: 0,
      options: [
        { text: 'İsyanı kılıçla bastır', effects: { armyPct: -0.05, stability: 3, opinionWith: { russia: -10 } }, run: (game, id) => captureFrom(game, id, 'serbia', 1) },
        { text: 'Sırplara özerklik tanı', effects: { stability: -5, opinionWith: { serbia: 40, russia: 15 } }, run: (game, id) => forcePeace(game, id, 'serbia') },
      ],
    },
    {
      id: 'waterloo',
      scenario: 'hundred-days-1815',
      date: '1815-06-18',
      nation: 'france',
      icon: '🎖️',
      title: 'Waterloo Ovası',
      text: 'Wellington Mont-Saint-Jean sırtında mevzilendi, Blücher\'in Prusyalıları yolda. Gece yağan yağmur zemini çamura çevirdi.',
      condition: (game) => game.enemiesOf('france').length > 0,
      aiChoice: 0,
      options: [
        {
          text: "Öğleden önce Wellington'a saldır",
          random: [
            {
              weight: 45,
              text: 'Zafer! Koalisyon orduları dağıldı.',
              effects: { stability: 10, armyPct: -0.08, opinionAll: -5 },
              run: (game, id) => {
                let out = [];
                for (const e of game.enemiesOf(id).slice(0, 2)) out = out.concat(captureFrom(game, id, e, 2));
                return out;
              },
            },
            { weight: 55, text: 'Muhafız geri çekiliyor! Waterloo bozgunu.', effects: { armyPct: -0.4, stability: -15, warExhaustion: 20 } },
          ],
        },
        { text: "Paris'e çekil ve savunma hattı kur", effects: { armyPct: -0.05, stability: -5, warExhaustion: 5 } },
      ],
    },
    {
      id: 'year_without_summer',
      scenario: 'hundred-days-1815',
      date: '1816-06-01',
      nation: '*player',
      icon: '🌋',
      title: 'Yazsız Yıl',
      text: "Tambora Yanardağı'nın küllerinin gölgesinde Haziran'da kar yağıyor. Hasatlar çürüyor.",
      options: [
        { text: 'Yurtdışından tahıl ithal et', effects: { gold: -60, stability: 2 } },
        { text: 'Karne uygula ve halkı sabra çağır', effects: { stability: -10, manpowerPct: -0.2 } },
      ],
    },
    // ============================================================ 1914 — tarihi
    {
      id: 'sarajevo',
      scenario: 'great-war-1914',
      date: '1914-06-28',
      nation: 'austria',
      icon: '🔫',
      title: 'Saraybosna Suikastı',
      text: 'Veliaht Arşidük Franz Ferdinand ve eşi Sophie, Saraybosna\'da Gavrilo Princip\'in kurşunlarıyla öldürüldü. Viyana intikam istiyor.',
      aiChoice: 0,
      options: [
        { text: "Sırbistan'a ültimatom ver ve savaş ilan et", effects: { stability: 5 }, run: (game, id) => declare(game, id, 'serbia'), hint: "Rusya Sırbistan'ın müttefiki!" },
        { text: 'Uluslararası soruşturmayla yetin', effects: { stability: -10, opinionWith: { serbia: 30, russia: 20, germany: -20 } } },
      ],
    },
    {
      id: 'sarajevo_news',
      scenario: 'great-war-1914',
      date: '1914-06-28',
      nation: '*player',
      icon: '📰',
      title: "Saraybosna'dan Haberler",
      text: "Avusturya veliahtı Saraybosna'da suikaste kurban gitti. Avrupa başkentlerinde telgraf hatları kızışıyor. Hükümetiniz bir tavır belirlemeli.",
      condition: (game) => game.state.playerId !== 'austria',
      options: [
        { text: "Viyana'ya taziyelerimizi ilet", effects: { opinionWith: { austria: 15, germany: 10, serbia: -10 } } },
        { text: "Sırbistan'ın egemenliğini savun", effects: { opinionWith: { serbia: 20, russia: 15, austria: -20 } } },
      ],
    },
    {
      id: 'germany_mobilize',
      scenario: 'great-war-1914',
      date: '1914-08-01',
      nation: 'germany',
      icon: '🚂',
      title: 'Seferberlik Treni',
      text: 'Rusya genel seferberlik ilan etti ve Avusturya-Macaristan ile savaşta. Genelkurmay Schlieffen Planı\'nın hemen uygulanmasını istiyor.',
      condition: (game) => !!game.warBetween('russia', 'austria') && !game.warBetween('germany', 'russia'),
      aiChoice: 0,
      options: [
        { text: "Rusya'ya savaş ilan et — müttefikimizi koru", run: (game, id) => declare(game, id, 'russia'), hint: 'Fransa ve Birleşik Krallık Rusya\'nın müttefiki' },
        { text: "Avusturya'yı yalnız bırak", effects: { stability: -5, opinionWith: { austria: -40, russia: 20 } } },
      ],
    },
    {
      id: 'schlieffen',
      scenario: 'great-war-1914',
      date: '1914-08-04',
      nation: 'germany',
      icon: '🗺️',
      title: 'Belçika Tarafsızlığı',
      text: "Fransız sınır kaleleri güçlü. Belçika üzerinden kuşatma harekâtı Paris'e en kısa yol — ama 1839 Londra Antlaşması'nı çiğnemek demek.",
      condition: (game) => !!game.warBetween('germany', 'france') && alive(game, 'belgium') && !game.warBetween('germany', 'belgium'),
      aiChoice: 0,
      options: [
        { text: "Belçika'ya gir (Schlieffen Planı)", effects: { opinionWith: { uk: -30 } }, run: (game, id) => declare(game, id, 'belgium') },
        { text: 'Tarafsızlığa saygı göster', effects: { opinionWith: { uk: 20, belgium: 20, netherlands: 10 } } },
      ],
    },
    {
      id: 'ottoman_entry',
      scenario: 'great-war-1914',
      date: '1914-10-29',
      nation: 'ottoman',
      icon: '⚓',
      title: 'Goeben ve Breslau',
      text: "Alman zırhlıları Yavuz ve Midilli adlarıyla donanmamıza katıldı. Enver Paşa Karadeniz'de Rus limanlarını bombalamak istiyor.",
      condition: (game) => game.warsOf('russia').length > 0 && !game.warBetween('ottoman', 'russia'),
      aiChoice: 0,
      options: [
        {
          text: "İttifak Devletleri'ne katıl",
          run: (game, id) => {
            const out = [];
            if (alive(game, 'germany') && !game.isAllied(id, 'germany')) {
              game._link(id, 'germany', 'allies');
              out.push(['Almanya ile ittifak', null]);
            }
            return out.concat(declare(game, id, 'russia'));
          },
        },
        { text: 'Silahlı tarafsızlığı koru', effects: { gold: 80, stability: 5, opinionWith: { germany: -20, russia: 10 } } },
      ],
    },
    {
      id: 'treaty_of_london',
      scenario: 'great-war-1914',
      date: '1915-04-26',
      nation: 'italy',
      icon: '✒️',
      title: 'Londra Antlaşması',
      text: "İtilaf Devletleri Trentino, Güney Tirol ve Dalmaçya'yı vaat ediyor. Üçlü İttifak'a sadakat mi, yeni topraklar mı?",
      condition: (game) => game.warsOf('austria').length > 0 && !game.warBetween('italy', 'austria'),
      aiChoice: 0,
      options: [
        {
          text: "İtilaf'a katıl ve Avusturya'ya savaş aç",
          run: (game, id) => {
            const out = [];
            for (const x of ['austria', 'germany']) if (game.isAllied(id, x)) out.push(...game.breakAlliance(id, x).effects);
            return out.concat(declare(game, id, 'austria'));
          },
        },
        { text: 'Tarafsız kal', effects: { stability: 5, opinionWith: { austria: 10, france: -10 } } },
      ],
    },
    // ============================================================ yapay zekâ kaynaklı
    {
      id: 'war_declared',
      dynamic: true,
      icon: '⚔️',
      title: 'Savaş İlanı!',
      text: (game, ctx) => name(game, ctx.target) + ' ülkemize savaş ilan etti! Orduları sınırda toplanıyor.',
      options: [
        {
          text: 'Genel seferberlik ilan et',
          hint: 'İnsan gücünün bir kısmı orduya katılır',
          effects: { stability: -3 },
          run: (game, id) => {
            const nat = game.nation(id);
            const n = Math.floor(Math.min(nat.manpower, 20));
            nat.manpower -= n;
            nat.army += n;
            return [['Ordu', n, 'k'], ['İnsan gücü', -n, 'k']];
          },
        },
        {
          text: 'Müttefiklerden yardım iste',
          hint: 'İlişkisi iyi (30+) müttefikler savaşa katılır',
          run: (game, id, ctx) => {
            const joined = [];
            for (const al of game.nation(id).allies) {
              if (game.warBetween(al, ctx.target) || game.isAllied(al, ctx.target)) continue;
              if (game.opinion(al, id) >= 30) {
                game._startWar(al, ctx.target, true);
                joined.push(name(game, al));
              } else game._changeOpinion(id, al, -10);
            }
            return [[joined.length ? 'Yardıma gelenler: ' + joined.join(', ') : 'Hiçbir müttefik yardıma gelmedi', null]];
          },
        },
        {
          text: 'Haraç ödeyerek barış iste',
          run: (game, id, ctx) => {
            const res = game.offerPeace(id, ctx.target, 'offer');
            return res.ok ? res.effects : [[res.message, null]];
          },
        },
      ],
    },
    {
      id: 'ai_peace_offer',
      dynamic: true,
      icon: '🕊️',
      title: 'Barış Teklifi',
      text: (game, ctx) =>
        name(game, ctx.target) + ' elçileri barış istiyor.' + (ctx.pay ? ' Savaşı kaybettiklerini kabul ediyor ve tazminat önerüyorlar.' : ' Savaş her iki tarafı da yıprattı.'),
      options: [
        {
          text: 'Teklifi kabul et',
          run: (game, id, ctx) => {
            if (!game.warBetween(id, ctx.target)) return [];
            return game.offerPeace(id, ctx.target, ctx.pay ? 'demand' : 'white', true).effects;
          },
        },
        { text: 'Savaşa devam et', effects: { stability: -2, warExhaustion: 3 }, hint: 'Daha fazla toprak kazanabilirsiniz' },
      ],
    },
    {
      id: 'ai_alliance_offer',
      dynamic: true,
      icon: '🤝',
      title: 'İttifak Teklifi',
      text: (game, ctx) => name(game, ctx.target) + ' hükümdarı ' + game.nation(ctx.target).leader + ', ülkelerimiz arasında bir savunma ittifakı öneriyor.',
      options: [
        {
          text: 'Kabul et',
          run: (game, id, ctx) => {
            if (!alive(game, ctx.target) || game.warBetween(id, ctx.target)) return [['Teklif geçersiz', null]];
            game._link(id, ctx.target, 'allies');
            game._changeOpinion(ctx.target, id, 15);
            return [[name(game, ctx.target) + ' artık müttefikiniz', null], [name(game, ctx.target) + ' ilişkisi', 15]];
          },
        },
        { text: 'Kibarca reddet', effects: { opinionTarget: -15 } },
      ],
    },
    // ============================================================ rastgele — genel
    {
      id: 'plague',
      icon: '☠️',
      title: 'Salgın Hastalık',
      text: 'Liman şehirlerinde ölümcül bir salgın baş gösterdi. Hekimler karantina öneriyor, tüccarlar ise limanların açık kalmasını istiyor.',
      weight: 8,
      options: [
        { text: 'Sıkı karantina uygula', effects: { gold: -40, stability: 2 } },
        { text: 'Limanları açık tut', effects: { manpowerPct: -0.25, stability: -8, gold: 15 } },
      ],
    },
    {
      id: 'good_harvest',
      icon: '🌾',
      title: 'Bereketli Hasat',
      text: 'Ambarlar taşıyor; bu yıl hasat son on yılın en iyisi oldu.',
      weight: 10,
      options: [
        { text: 'Fazla ürünü sat, hazineyi doldur', effects: { gold: 60 } },
        { text: 'Halka dağıt', effects: { stability: 7 } },
        { text: 'Orduya erzak depola', effects: { manpower: 8 } },
      ],
    },
    {
      id: 'famine',
      icon: '🥀',
      title: 'Kıtlık',
      text: 'Kuraklık hasadı mahvetti. Köylüler şehirlere akın ediyor.',
      weight: 7,
      options: [
        { text: 'Komşulardan tahıl satın al', effects: { gold: -50, stability: 2, opinionNeighbors: 5 } },
        { text: 'Vergileri geçici olarak düşür', effects: { tax: -5, stability: 4 } },
        { text: 'Hiçbir şey yapma', effects: { stability: -10, manpowerPct: -0.15 } },
      ],
    },
    {
      id: 'noble_intrigue',
      icon: '🗡️',
      title: 'Soylu Entrikası',
      text: 'Güçlü bir soylu ailesinin taht aleyhine komplo kurduğu ortaya çıktı.',
      weight: 6,
      condition: (game, id) => game.nation(id).stability < 60,
      options: [
        { text: 'Tutukla ve mülklerine el koy', effects: { gold: 70, stability: -6 } },
        { text: 'Ayrıcalıklar vererek yatıştır', effects: { gold: -40, stability: 8 } },
      ],
    },
    {
      id: 'foreign_envoy',
      icon: '📜',
      title: 'Yabancı Elçi',
      text: (game, ctx) => name(game, ctx.target) + ' sarayımıza bir elçi gönderdi. Elçi hediyeler ve dostluk mesajları getiriyor.',
      weight: 9,
      prepare: (game, id) => {
        const t = randomNeighbor(game, id, (n) => !game.warBetween(id, n));
        return t ? { target: t } : null;
      },
      options: [
        { text: 'Görkemli bir ziyafet ver', effects: { gold: -25, opinionTarget: 25 } },
        { text: 'Elçiyi soğuk karşıla', effects: { opinionTarget: -15, stability: 2 } },
      ],
    },
    {
      id: 'border_clash',
      icon: '🏹',
      title: 'Sınır Çatışması',
      text: (game, ctx) => name(game, ctx.target) + ' sınırında askerlerimiz ile karşı taraf arasında kanlı bir çatışma çıktı.',
      weight: 7,
      prepare: (game, id) => {
        const t = randomNeighbor(game, id, (n) => !game.warBetween(id, n) && !game.isAllied(id, n));
        return t ? { target: t } : null;
      },
      options: [
        { text: 'Misilleme yap', effects: { opinionTarget: -30, army: -1, stability: 3 } },
        { text: 'Tazminat öde ve yatıştır', effects: { gold: -30, opinionTarget: 15 } },
        {
          text: 'Bunu savaş sebebi say',
          hint: 'Savaş ilan edersiniz',
          run: (game, id, ctx) => declare(game, id, ctx.target),
        },
      ],
    },
    {
      id: 'gifted_general',
      icon: '🎖️',
      title: 'Yetenekli Bir Komutan',
      text: 'Genç bir subay son tatbikatlarda olağanüstü bir dehâ sergiledi. Ordunun başına geçmek istiyor.',
      weight: 6,
      options: [
        { text: 'Ordunun komutasını ver', effects: { army: 6, stability: -2 } },
        { text: 'Saraydan uzak tut', effects: { stability: 3 } },
      ],
    },
    {
      id: 'comet',
      icon: '☄️',
      title: 'Kuyruklu Yıldız',
      text: 'Gökyüzünde parlak bir kuyruklu yıldız belirdi. Kâhinler kıyametten, âlimler ise doğa yasalarından bahsediyor.',
      weight: 5,
      options: [
        {
          text: 'Âlimleri gözlem için görevlendir',
          effects: { gold: -20 },
          random: [
            { weight: 60, text: 'Gözlemler büyük ilgi gördü; başkentte bir akademi kuruldu.', effects: { capitalDev: 1, stability: 2 } },
            { weight: 40, text: 'Halk âlimleri kötü alametten sorumlu tuttu.', effects: { stability: -4 } },
          ],
        },
        { text: 'Kehanet ve dua ile yatıştır', effects: { gold: -10, stability: 4 } },
      ],
    },
    {
      id: 'merchant_guild',
      icon: '💰',
      title: 'Tüccar Loncası',
      text: 'Zengin tüccarlar, belirli mallar üzerinde tekel hakkı karşılığında hazineye büyük bir borç teklif ediyor.',
      weight: 8,
      options: [
        { text: 'Tekel hakkını ver', effects: { gold: 90, stability: -4, opinionNeighbors: -3 } },
        { text: 'Serbest ticareti koru', effects: { stability: 2, opinionNeighbors: 6 } },
      ],
    },
    {
      id: 'refugees',
      icon: '🧳',
      title: 'Mülteci Akını',
      text: (game, ctx) => name(game, ctx.target) + ' topraklarından kaçan binlerce mülteci sınırımıza dayandı.',
      weight: 6,
      prepare: (game, id) => {
        const t = randomNeighbor(game, id);
        return t ? { target: t } : null;
      },
      options: [
        { text: 'Kabul et ve toprak ver', effects: { manpower: 10, stability: -3, opinionTarget: -5 } },
        { text: 'Sınırı kapat', effects: { opinionNeighbors: -4, stability: 2 } },
      ],
    },
    {
      id: 'gold_mine',
      icon: '⛏️',
      title: 'Değerli Maden',
      text: 'Dağlık bir eyalette zengin bir maden damarı bulundu. (Kurgusal olay)',
      weight: 4,
      options: [
        { text: 'Devlet işletmesi kur', effects: { gold: 120, stability: -3 } },
        { text: 'Yerel halka bırak', effects: { gold: 30, stability: 6 } },
      ],
    },
    {
      id: 'peasant_revolt',
      icon: '🔥',
      title: 'Halk Ayaklanması',
      text: 'Ağır vergiler ve huzursuzluk taşrada silahlı bir isyana dönüştü!',
      weight: 14,
      condition: (game, id) => game.nation(id).stability < 30,
      options: [
        { text: 'Orduyla bastır', effects: { armyPct: -0.08, stability: 8, manpower: -5 } },
        { text: 'Reform sözü ver ve vergileri düşür', effects: { tax: -10, stability: 14 } },
      ],
    },
    {
      id: 'war_weariness',
      icon: '🏳️',
      title: 'Savaş Karşıtı Gösteriler',
      text: 'Cepheden gelen kayıp haberleri başkentte büyük gösterilere yol açtı.',
      weight: 12,
      condition: (game, id) => game.nation(id).warExhaustion >= 25,
      options: [
        { text: 'Gösterileri dağıt', effects: { stability: -6 } },
        { text: 'Gazilere maaş bağla', effects: { gold: -50, warExhaustion: -15, stability: 3 } },
      ],
    },
    {
      id: 'royal_wedding',
      icon: '💍',
      title: 'Hanedan Evliliği',
      text: (game, ctx) => name(game, ctx.target) + ' sarayı, hanedanlarımız arasında bir evlilik teklif ediyor.',
      weight: 6,
      prepare: (game, id) => {
        const list = game.aliveNations().filter((n) => n.id !== id && !game.warBetween(id, n.id) && game.opinion(n.id, id) > -20);
        return list.length ? { target: game.pick(list).id } : null;
      },
      options: [
        { text: 'Evliliği onayla', effects: { gold: -30, opinionTarget: 35, stability: 3 } },
        { text: 'Reddet', effects: { opinionTarget: -10 } },
      ],
    },
    // ============================================================ rastgele — döneme özgü
    {
      id: 'printing_press',
      scenario: 'fall-1453',
      icon: '📖',
      title: 'Matbaa',
      text: "Mainz'li bir kuyumcunun icadı, hareketli harflerle kitap basıyor. Din adamları endişeli.",
      weight: 8,
      once: true,
      options: [
        { text: 'Matbaaları destekle', effects: { gold: -40, capitalDev: 2, stability: -3 } },
        { text: 'Yeni icadı yasakla', effects: { stability: 4 } },
      ],
    },
    {
      id: 'explorers',
      scenario: 'fall-1453',
      icon: '⛵',
      title: 'Okyanus Ötesi Sefer',
      text: 'Cesur bir denizci, batıya doğru yelken açıp Hindistan\'a yeni bir yol bulmak için fon istiyor.',
      weight: 5,
      once: true,
      options: [
        {
          text: 'Seferi finanse et',
          effects: { gold: -80 },
          random: [
            { weight: 40, text: 'Gemiler baharat ve altınla döndü!', effects: { gold: 250, stability: 5 } },
            { weight: 60, text: 'Filo okyanusta kayboldu.', effects: { stability: -3 } },
          ],
        },
        { text: 'Bu bir delilik', effects: { stability: 1 } },
      ],
    },
    {
      id: 'steam_engine',
      scenario: 'hundred-days-1815',
      icon: '🏭',
      title: 'Buhar Makinesi',
      text: 'Mühendisler, dokuma tezgâhlarını buhar gücüyle çalıştıran fabrikalar kurmak için izin istiyor.',
      weight: 8,
      once: true,
      options: [
        { text: 'Sanayileşmeyi teşvik et', effects: { gold: -70, devAll: 1, stability: -4 } },
        { text: 'Lonca düzenini koru', effects: { stability: 4 } },
      ],
    },
    {
      id: 'railway',
      scenario: 'hundred-days-1815',
      icon: '🚂',
      title: 'Demiryolu Projesi',
      text: 'Bir girişimci başkenti limana bağlayacak bir demiryolu inşa etmek istiyor.',
      weight: 5,
      once: true,
      condition: (game) => game.state.day > MH.util.parseDay('1825-01-01'),
      options: [
        { text: 'Devlet garantisi ver', effects: { gold: -100, capitalDev: 3 } },
        { text: 'Özel sektöre bırak', effects: { gold: 20 } },
      ],
    },
    {
      id: 'strikes',
      scenario: 'great-war-1914',
      icon: '🪧',
      title: 'Grev Dalgası',
      text: 'Silah fabrikalarında işçiler daha yüksek ücret ve ekmek talebiyle iş bıraktı.',
      weight: 8,
      condition: (game, id) => game.warsOf(id).length > 0,
      options: [
        { text: 'Ücretleri artır', effects: { gold: -60, stability: 6 } },
        { text: 'Grevcileri cepheye gönder', effects: { army: 5, stability: -8 } },
      ],
    },
    {
      id: 'propaganda',
      scenario: 'great-war-1914',
      icon: '📣',
      title: 'Propaganda Bakanlığı',
      text: 'Gazeteler ve afişlerle halkın moralini yükseltmek için yeni bir bakanlık önerildi.',
      weight: 6,
      once: true,
      options: [
        { text: 'Bakanlığı kur', effects: { gold: -40, warExhaustion: -10, stability: 4 } },
        { text: 'Basın özgürlüğünü koru', effects: { stability: -2, opinionAll: 3 } },
      ],
    },
    {
      id: 'zeppelin',
      scenario: 'great-war-1914',
      icon: '🎈',
      title: 'Hava Gemisi Programı',
      text: 'Bir mucit, düşman şehirlerini havadan gözetleyebilecek dev hava gemileri tasarladı. (Kurgusal olay)',
      weight: 4,
      once: true,
      options: [
        {
          text: 'Programı finanse et',
          effects: { gold: -90 },
          random: [
            { weight: 55, text: 'Hava keşfi orduya büyük üstünlük sağladı.', effects: { army: 12, stability: 3 } },
            { weight: 45, text: 'Prototip test uçuşunda alev aldı.', effects: { stability: -4 } },
          ],
        },
        { text: 'Kaynakları siperlere aktar', effects: { army: 4 } },
      ],
    },
  ];

  const BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

  function textOf(game, ev, ctx) {
    return typeof ev.text === 'function' ? ev.text(game, ctx) : ev.text;
  }

  /** Belirli tarihli olayları kontrol eder (her gün) */
  function checkScheduled(game) {
    const st = game.state;
    if (!st.playerId) return;
    for (const ev of EVENTS) {
      if (!ev.date || ev.scenario !== st.scenarioId || st.firedEvents[ev.id]) continue;
      const due = MH.util.parseDay(ev.date);
      if (st.day < due || st.day > due + 60) continue;
      const target = ev.nation === '*player' ? st.playerId : ev.nation;
      if (!alive(game, target)) { st.firedEvents[ev.id] = st.day; continue; }
      if (ev.condition && !ev.condition(game, target, {})) continue;
      st.firedEvents[ev.id] = st.day;
      if (target === st.playerId) {
        game.queueEvent(ev.id, target, {});
      } else {
        const res = apply(game, { eventId: ev.id, nationId: target, ctx: {} }, ev.aiChoice ?? 0);
        game.addLog(ev.icon + ' ' + ev.title + ' — ' + name(game, target) + ': ' + res.message, 'world', [target]);
        game.emit('world', { event: ev, nationId: target, result: res });
      }
    }
  }

  /** Rastgele olaylar (aylık, yalnızca oyuncu için) */
  function checkRandom(game) {
    const st = game.state;
    const id = st.playerId;
    if (!id || !alive(game, id) || st.eventQueue.length) return;
    if (st.day - st.lastEventDay < MIN_GAP_DAYS) return;
    if (game.random() > MONTHLY_CHANCE) return;
    const pool = [];
    for (const ev of EVENTS) {
      if (ev.date || ev.dynamic) continue;
      if (ev.scenario && ev.scenario !== st.scenarioId) continue;
      const last = st.firedEvents[ev.id];
      if (last !== undefined && (ev.once || st.day - last < REPEAT_COOLDOWN)) continue;
      if (ev.condition && !ev.condition(game, id, {})) continue;
      pool.push(ev);
    }
    let total = pool.reduce((s, e) => s + (e.weight || 5), 0);
    let r = game.random() * total;
    for (const ev of pool) {
      r -= ev.weight || 5;
      if (r > 0) continue;
      const ctx = ev.prepare ? ev.prepare(game, id) : {};
      if (!ctx) return;
      st.firedEvents[ev.id] = st.day;
      st.lastEventDay = st.day;
      game.queueEvent(ev.id, id, ctx);
      return;
    }
  }

  function pickWeighted(game, list) {
    const total = list.reduce((s, o) => s + o.weight, 0);
    let r = game.random() * total;
    for (const o of list) {
      r -= o.weight;
      if (r <= 0) return o;
    }
    return list[list.length - 1];
  }

  /** Seçilen seçeneği uygular; { ok, message, effects } döndürür */
  function apply(game, pending, index) {
    const ev = BY_ID[pending.eventId];
    const opt = ev?.options[index];
    if (!opt) return { ok: false, message: 'Geçersiz seçenek', effects: [] };
    const id = pending.nationId;
    const ctx = pending.ctx || {};
    let effects = game.applyEffects(id, opt.effects, ctx);
    if (opt.run) effects = effects.concat(opt.run(game, id, ctx) || []);
    let message = opt.text;
    if (opt.random) {
      const outcome = pickWeighted(game, opt.random);
      message = outcome.text;
      effects = effects.concat(game.applyEffects(id, outcome.effects, ctx));
      if (outcome.run) effects = effects.concat(outcome.run(game, id, ctx) || []);
    }
    if (id === game.state.playerId) game.addLog(ev.icon + ' ' + ev.title + ': ' + message, 'event', [id]);
    return { ok: true, message, effects };
  }

  const FX_LABELS = {
    gold: ['Altın'], goldPct: ['Altın', '%'], manpower: ['İnsan gücü', 'k'], manpowerPct: ['İnsan gücü', '%'],
    army: ['Ordu', 'k'], armyPct: ['Ordu', '%'], stability: ['İstikrar'], warExhaustion: ['Savaş yorgunluğu'],
    tax: ['Vergi oranı', 'pp'], capitalDev: ['Başkent gelişimi'], devAll: ['Tüm eyaletlerin gelişimi'],
    opinionTarget: ['Hedef ülke ilişkisi'], opinionNeighbors: ['Komşu ilişkileri'], opinionAll: ['Tüm ülkelerle ilişki'],
  };

  /** Bir seçeneğin etkilerini önizleme için listeler: [[etiket, değer, birim]] */
  function preview(game, pending, opt) {
    const out = [];
    const fx = opt.effects || {};
    for (const [k, v] of Object.entries(fx)) {
      if (k === 'opinionWith') {
        for (const [other, val] of Object.entries(v)) if (alive(game, other)) out.push([name(game, other) + ' ilişkisi', val]);
        continue;
      }
      const [label, unit] = FX_LABELS[k] || [k];
      const lbl = k === 'opinionTarget' && pending.ctx?.target ? name(game, pending.ctx.target) + ' ilişkisi' : label;
      out.push([lbl, unit === '%' ? Math.round(v * 100) : v, unit === '%' ? '%' : unit]);
    }
    if (opt.hint) out.push([opt.hint, null]);
    if (opt.random) out.push(['Sonuç belirsiz (' + opt.random.map((r) => '%' + r.weight).join(' / ') + ')', null]);
    return out;
  }

  MH.events = { EVENTS, BY_ID, checkScheduled, checkRandom, apply, preview, textOf };
})((globalThis.MH = globalThis.MH || {}));
