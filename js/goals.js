/*
 * Map Historia — ulus hedefleri, kronik ve senaryo sonu.
 * User Story'nin "kendi imparatorluğumu ve hikâyemi yaratabileyim" kısmı:
 * oyuncuya yön veren tarihî hedefler, önemli anları kaydeden bir kronik
 * ve senaryo bitiminde kişisel tarihini özetleyen bir sonuç.
 *
 * Hedef türleri:
 *   own       – noktadaki eyaleti bir kez ele geçir
 *   hold      – noktadaki eyalet senaryo sonunda sizin olsun
 *   eliminate – ulusu tarih sahnesinden sil
 *   beat      – ulusla kazançlı bir barış yap (savaş skoru ≥ 20) ya da onu yok et
 *   survive   – senaryo sonuna kadar ayakta kal
 *   grow      – eyalet sayısını belirli bir düzeye çıkar
 */
(function (MH) {
  'use strict';

  const CONSTANTINOPLE = [28.97, 41.01];

  const HISTORICAL = {
    'fall-1453': {
      ottoman: [
        { type: 'own', point: CONSTANTINOPLE, label: "Konstantinopolis'i fethet" },
        { type: 'own', point: [20.46, 44.8], label: "Belgrad'ı ele geçir" },
        { type: 'eliminate', nation: 'karaman', label: "Karamanoğulları'nı ilhak et" },
      ],
      byzantium: [
        { type: 'hold', point: CONSTANTINOPLE, label: "Konstantinopolis'i elinde tut" },
        { type: 'own', point: [22.94, 40.64], label: "Selanik'i geri al" },
      ],
      castile: [{ type: 'eliminate', nation: 'granada', label: "Reconquista'yı tamamla: Gırnata'yı al" }],
      aragon: [{ type: 'own', point: [14.25, 40.85], label: "Napoli'yi Aragon tacına bağla" }],
      france: [
        { type: 'own', point: [-0.57, 44.84], label: "Gaskonya'yı İngilizlerden al" },
        { type: 'own', point: [5.04, 47.32], label: "Burgonya'yı taca bağla" },
      ],
      england: [
        { type: 'hold', point: [-0.57, 44.84], label: "Bordeaux'yu elinde tut" },
        { type: 'own', point: [2.35, 48.85], label: 'Fransız tacını kazan: Paris' },
      ],
      hungary: [
        { type: 'hold', point: [19.04, 47.5], label: "Buda'yı Osmanlı'ya karşı koru" },
        { type: 'own', point: [16.37, 48.2], label: "Viyana'yı ele geçir" },
      ],
      muscovy: [
        { type: 'own', point: [31.27, 58.52], label: "Novgorod'u Moskova'ya bağla" },
        { type: 'eliminate', nation: 'goldenhorde', label: 'Tatar boyunduruğunu kır' },
      ],
      poland: [{ type: 'own', point: [19.03, 54.04], label: "Töton Şövalyeleri'nden Marienburg'u al" }],
      venice: [{ type: 'hold', point: [24.9, 35.25], label: "Girit'i elinde tut" }],
      mamluk: [{ type: 'own', point: [33.22, 37.18], label: "Anadolu'ya nüfuz et: Karaman" }],
      portugal: [{ type: 'own', point: [-5.8, 35.77], label: "Afrika'da üs: Tanca'yı al" }],
      albania: [{ type: 'beat', nation: 'ottoman', label: 'Osmanlı ordularını geri püskürt' }],
    },
    'hundred-days-1815': {
      france: [
        { type: 'beat', nation: 'uk', label: 'Birleşik Krallık ile kazançlı barış yap' },
        { type: 'own', point: [4.35, 50.85], label: "Brüksel'i al" },
        { type: 'own', point: [6.96, 50.94], label: 'Ren sınırına ulaş: Köln' },
      ],
      uk: [{ type: 'beat', nation: 'france', label: "Napolyon'u yenilgiye uğrat" }],
      prussia: [
        { type: 'beat', nation: 'france', label: "Napolyon'u yenilgiye uğrat" },
        { type: 'own', point: [13.74, 51.05], label: "Saksonya'yı ilhak et: Dresden" },
      ],
      austria: [
        { type: 'beat', nation: 'france', label: "Napolyon'u yenilgiye uğrat" },
        { type: 'eliminate', nation: 'naples', label: "Murat'ı Napoli tahtından indir" },
      ],
      russia: [
        { type: 'own', point: CONSTANTINOPLE, label: 'Boğazları ele geçir' },
        { type: 'own', point: [26.1, 44.43], label: "Eflak'ı al: Bükreş" },
      ],
      ottoman: [
        { type: 'eliminate', nation: 'serbia', label: 'Sırp isyanını bastır' },
        { type: 'own', point: [31.24, 30.04], label: "Mısır'ı merkeze bağla" },
      ],
      egypt: [{ type: 'own', point: [36.3, 33.5], label: "Şam'ı al" }],
      naples: [{ type: 'own', point: [12.5, 41.9], label: "İtalya'yı birleştir: Roma" }],
      sardinia: [
        { type: 'own', point: [9.19, 45.46], label: "Milano'yu Avusturya'dan al" },
        { type: 'own', point: [12.5, 41.9], label: "İtalya'yı birleştir: Roma" },
      ],
      serbia: [{ type: 'beat', nation: 'ottoman', label: "Osmanlı'dan özerkliği kopar" }],
    },
    'great-war-1914': {
      germany: [
        { type: 'own', point: [2.35, 48.85], label: "Paris'e gir" },
        { type: 'beat', nation: 'russia', label: 'Doğu Cephesi: Rusya ile kazançlı barış' },
      ],
      france: [
        { type: 'own', point: [7.75, 48.58], label: 'Alsas-Loren: Strazburg' },
        { type: 'beat', nation: 'germany', label: 'Almanya ile kazançlı barış' },
      ],
      uk: [{ type: 'beat', nation: 'germany', label: 'Almanya ile kazançlı barış' }],
      russia: [
        { type: 'own', point: CONSTANTINOPLE, label: "Çargrad: İstanbul'u al" },
        { type: 'own', point: [24.03, 49.84], label: "Galiçya'yı al: Lviv" },
      ],
      austria: [{ type: 'eliminate', nation: 'serbia', label: "Sırbistan'ı cezalandır" }],
      italy: [
        { type: 'own', point: [11.12, 46.07], label: "Trentino'yu al" },
        { type: 'own', point: [13.77, 45.65], label: "Trieste'yi al" },
      ],
      ottoman: [{ type: 'own', point: [31.24, 30.04], label: "Mısır'ı geri al" }],
      serbia: [{ type: 'own', point: [18.41, 43.86], label: "Bosna'yı birleştir: Saraybosna" }],
      bulgaria: [{ type: 'own', point: [21.43, 42.0], label: "Makedonya'yı al: Üsküp" }],
      greece: [{ type: 'own', point: [27.14, 38.42], label: "Megali İdea: İzmir'i al" }],
      romania: [{ type: 'own', point: [23.6, 46.77], label: "Transilvanya'yı al: Kaloşvar" }],
    },
  };

  /** Bir ulus için hedef listesi (oyuncu seçilmeden önce de önizlenebilir) */
  function goalsFor(game, id) {
    const start = game.provincesOf(id).length;
    const list = [
      { type: 'survive', label: MH.util.formatDay(game.state.endDay) + ' tarihine kadar ayakta kal' },
      { type: 'grow', count: Math.max(start + 3, Math.ceil(start * 1.3)), label: '' },
    ];
    list[1].label = 'Sınırlarını genişlet: ' + list[1].count + ' eyalet';
    for (const g of HISTORICAL[game.state.scenarioId]?.[id] || []) {
      const goal = { ...g };
      if (goal.point) {
        goal.province = game.grid.nearest(goal.point[0], goal.point[1]);
        delete goal.point;
        // Başta zaten elde olan bir "ele geçir" hedefi "elinde tut" hedefine dönüşür
        if (goal.type === 'own' && game.state.owner[goal.province] === id) goal.type = 'hold';
      }
      if (goal.nation && !game.nation(goal.nation)?.alive) continue;
      list.push(goal);
    }
    return list.map((g, i) => ({ ...g, id: i, done: false, doneDay: null }));
  }

  function init(game) {
    const st = game.state;
    st.goals = goalsFor(game, st.playerId);
    st.startProvinces = game.provincesOf(st.playerId).length;
  }

  function isMet(game, goal, final) {
    const st = game.state;
    const id = st.playerId;
    switch (goal.type) {
      case 'own': return st.owner[goal.province] === id;
      case 'hold': return final && st.owner[goal.province] === id;
      case 'eliminate': return !game.nation(goal.nation).alive;
      case 'beat': return st.beaten.includes(goal.nation);
      case 'survive': return final && game.nation(id).alive;
      case 'grow': return game.provincesOf(id).length >= goal.count;
      default: return false;
    }
  }

  /** Aylık kontrol: tamamlanan kilometre taşlarını işaretler */
  function check(game) {
    const st = game.state;
    if (!st.playerId || !st.goals) return;
    for (const goal of st.goals) {
      if (goal.done || !isMet(game, goal, false)) continue;
      goal.done = true;
      goal.doneDay = st.day;
      game.addLog('🎯 Hedef tamamlandı: ' + goal.label, 'goal', [st.playerId]);
      game.emit('goal', goal);
    }
  }

  const RANKS = [
    [85, 'Efsanevi İmparatorluk', 'Adınız yüzyıllar boyunca anılacak.'],
    [65, 'Büyük Güç', 'Kıtanın kaderini siz belirlediniz.'],
    [45, 'Saygın Devlet', 'Çağdaşlarınız sizi hesaba katmak zorunda kaldı.'],
    [25, 'Ayakta Kalan', 'Fırtınalara rağmen bayrağınız dalgalanıyor.'],
    [0, 'Unutulan Hanedan', 'Tarih kitaplarında bir dipnot olarak kaldınız.'],
  ];

  /** Senaryo sonu (veya yenilgi) değerlendirmesi */
  function evaluate(game) {
    const st = game.state;
    const id = st.playerId;
    const nat = game.nation(id);
    for (const goal of st.goals) {
      if (goal.type === 'hold' || goal.type === 'survive') goal.done = isMet(game, goal, true);
      else if (!goal.done && isMet(game, goal, true)) { goal.done = true; goal.doneDay = st.day; }
    }
    if (!nat.alive) for (const goal of st.goals) if (goal.type === 'survive' || goal.type === 'hold') goal.done = false;
    const done = st.goals.filter((g) => g.done).length;
    const provinces = game.provincesOf(id).length;
    const growth = st.startProvinces ? (provinces - st.startProvinces) / st.startProvinces : 0;
    let score = (done / st.goals.length) * 60;
    score += Math.max(-15, Math.min(25, growth * 25));
    score += nat.alive ? (nat.stability / 100) * 10 + 5 : 0;
    score += Math.min(10, st.beaten.length * 3);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const [, rank, verdict] = RANKS.find(([min]) => score >= min);
    return {
      day: st.day,
      score,
      rank,
      verdict,
      goalsDone: done,
      goalsTotal: st.goals.length,
      provinces,
      startProvinces: st.startProvinces,
      peakProvinces: nat.peakProvinces,
      beaten: [...st.beaten],
      years: Math.floor((st.day - st.startDay) / 365),
      alive: nat.alive,
    };
  }

  MH.goals = { HISTORICAL, goalsFor, init, check, evaluate, isMet };
})((globalThis.MH = globalThis.MH || {}));
