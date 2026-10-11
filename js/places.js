/*
 * Map Historia — eyalet adları.
 * Tarihî şehirler en yakın altıgene yerleştirilir; adı olmayan eyaletler en yakın şehrin
 * "yöresi" olarak anılır. Bazı şehirlerin adı döneme göre değişir ya da henüz kurulmamıştır.
 *
 *   [ad, boylam, enlem, { alt: { yıl: eskiAd }, from: kuruluşYılı }]
 *   alt: { 1700: 'Konstantinopolis' } → 1700'den önceki senaryolarda bu ad kullanılır
 */
(function (MH) {
  'use strict';

  // Önem sırasına göre: aynı altıgene düşen iki şehirden ilk yazılan kazanır
  const CITIES = [
    ['İstanbul', 28.97, 41.01, { alt: { 1700: 'Konstantinopolis' } }],
    ['Paris', 2.35, 48.85], ['Londra', -0.12, 51.5], ['Roma', 12.5, 41.9], ['Viyana', 16.37, 48.21],
    ['Moskova', 37.62, 55.76], ['Madrid', -3.7, 40.42], ['Lizbon', -9.14, 38.72], ['Berlin', 13.4, 52.52],
    ['Kahire', 31.24, 30.04], ['Venedik', 12.33, 45.44], ['Napoli', 14.25, 40.85], ['Milano', 9.19, 45.46],
    ['Buda', 19.04, 47.5, { rename: { 1873: 'Budapeşte' } }], ['Prag', 14.42, 50.08], ['Krakov', 19.94, 50.06],
    ['Stokholm', 18.07, 59.33], ['Kopenhag', 12.57, 55.68], ['Edirne', 26.56, 41.68], ['Belgrad', 20.46, 44.8],
    ['Atina', 23.73, 37.98], ['Selanik', 22.94, 40.64], ['Bükreş', 26.1, 44.43], ['Sofya', 23.32, 42.7],
    ['Sankt Peterburg', 30.31, 59.94, { from: 1703 }], ['Varşova', 21.01, 52.23], ['Kiev', 30.52, 50.45],
    ['Amsterdam', 4.9, 52.37], ['Brüksel', 4.35, 50.85], ['Floransa', 11.25, 43.77], ['Edinburg', -3.19, 55.95],
    ['Dublin', -6.26, 53.35], ['Bern', 7.45, 46.95], ['Münih', 11.58, 48.14], ['Dresden', 13.74, 51.05],
    ['Tunus', 10.18, 36.8], ['Cezayir', 3.06, 36.75], ['Fas', -5.0, 34.03], ['Trablusgarp', 13.19, 32.89],
    ['Şam', 36.29, 33.51], ['Halep', 37.16, 36.2], ['Tiflis', 44.79, 41.72], ['Tebriz', 46.29, 38.08],
    ['Bursa', 29.06, 40.18], ['İzmir', 27.14, 38.42], ['Ankara', 32.85, 39.93], ['Konya', 32.49, 37.87],
    ['Trabzon', 39.72, 41.0], ['Sivas', 37.02, 39.75], ['Kayseri', 35.48, 38.72], ['Erzurum', 41.27, 39.9],
    ['Diyarbakır', 40.23, 37.91], ['Van', 43.38, 38.5], ['Karaman', 33.22, 37.18], ['Antalya', 30.71, 36.89],
    ['Adana', 35.32, 37.0], ['Samsun', 36.33, 41.29], ['Sinop', 35.15, 42.03], ['Kars', 43.1, 40.6],
    ['Kudüs', 35.22, 31.77], ['Beyrut', 35.5, 33.89], ['Musul', 43.13, 36.34], ['İskenderiye', 29.92, 31.2],
    ['Bingazi', 20.07, 32.12], ['Oran', -0.63, 35.7], ['Tilimsan', -1.32, 34.88], ['Rabat', -6.84, 34.02],
    ['Merakeş', -8.0, 31.63], ['Tanca', -5.8, 35.77], ['Kayrevan', 10.1, 35.68], ['Konstantin', 6.61, 36.36],
    ['Sevilla', -5.98, 37.39], ['Gırnata', -3.6, 37.18], ['Toledo', -4.03, 39.86], ['Valensiya', -0.38, 39.47],
    ['Barselona', 2.17, 41.39], ['Saragosa', -0.88, 41.65], ['Valladolid', -4.72, 41.65], ['Santiago', -8.54, 42.88],
    ['Bilbao', -2.93, 43.26], ['Kadiz', -6.29, 36.53], ['Mursiya', -1.13, 37.98], ['Porto', -8.61, 41.15],
    ['Lyon', 4.85, 45.76], ['Marsilya', 5.37, 43.3], ['Bordeaux', -0.57, 44.84], ['Toulouse', 1.44, 43.6],
    ['Nantes', -1.55, 47.22], ['Rouen', 1.1, 49.44], ['Reims', 4.03, 49.26], ['Dijon', 5.04, 47.32],
    ['Strazburg', 7.75, 48.58], ['Orléans', 1.9, 47.9], ['Calais', 1.86, 50.95], ['Brest', -4.49, 48.39],
    ['Bourges', 2.4, 47.08], ['Lille', 3.06, 50.63], ['Anvers', 4.4, 51.22], ['Liège', 5.57, 50.63],
    ['Groningen', 6.57, 53.22], ['York', -1.08, 53.96], ['Bristol', -2.59, 51.45], ['Glasgow', -4.25, 55.86],
    ['Manchester', -2.24, 53.48], ['Cork', -8.47, 51.9], ['Norwich', 1.3, 52.63], ['Aberdeen', -2.1, 57.15],
    ['Galway', -9.05, 53.27], ['Hamburg', 9.99, 53.55], ['Lübeck', 10.68, 53.87], ['Köln', 6.96, 50.94],
    ['Frankfurt', 8.68, 50.11], ['Leipzig', 12.37, 51.34], ['Nürnberg', 11.08, 49.45], ['Stuttgart', 9.18, 48.78],
    ['Hannover', 9.73, 52.37], ['Bremen', 8.8, 53.08], ['Königsberg', 20.51, 54.71], ['Breslau', 17.03, 51.11],
    ['Danzig', 18.65, 54.35], ['Stettin', 14.55, 53.43], ['Magdeburg', 11.63, 52.13], ['Marienburg', 19.03, 54.04],
    ['Zürih', 8.54, 47.37], ['Cenevre', 6.14, 46.2], ['Graz', 15.44, 47.07], ['İnnsbruck', 11.4, 47.27],
    ['Brünn', 16.61, 49.2], ['Pressburg', 17.11, 48.15], ['Kaşa', 21.26, 48.72], ['Debrecen', 21.63, 47.53],
    ['Temeşvar', 21.23, 45.75], ['Kaloşvar', 23.6, 46.77], ['Segedin', 20.15, 46.25], ['Torino', 7.69, 45.07],
    ['Cenova', 8.93, 44.41], ['Bologna', 11.34, 44.49], ['Palermo', 13.36, 38.12], ['Bari', 16.87, 41.12],
    ['Trieste', 13.77, 45.65], ['Trento', 11.12, 46.07], ['Cagliari', 9.11, 39.22], ['Ajaccio', 8.74, 41.92],
    ['Reggio', 15.65, 38.11], ['Ankona', 13.51, 43.62], ['Semendire', 20.93, 44.66], ['Saraybosna', 18.41, 43.86],
    ['Zagreb', 15.98, 45.81], ['Split', 16.44, 43.51], ['Ragusa', 18.09, 42.65], ['Çetine', 18.92, 42.39],
    ['Akçahisar', 19.79, 41.51], ['Üsküp', 21.43, 42.0], ['Filibe', 24.75, 42.15], ['Mistra', 22.37, 37.07],
    ['Yanya', 20.85, 39.67], ['Tırgovişte', 25.46, 44.93], ['Yaş', 27.6, 47.16], ['Suçava', 26.25, 47.65],
    ['Varna', 27.91, 43.21], ['Niş', 21.9, 43.32], ['Vidin', 22.88, 43.99], ['Kandiye', 25.13, 35.34],
    ['Lefkoşa', 33.36, 35.17], ['Antakya', 36.16, 36.2], ['Batum', 41.64, 41.64], ['Vilnius', 25.28, 54.69],
    ['Minsk', 27.56, 53.9], ['Lviv', 24.03, 49.84], ['Novgorod', 31.27, 58.52], ['Riga', 24.1, 56.95],
    ['Reval', 24.75, 59.44], ['Smolensk', 32.05, 54.78], ['Tver', 35.91, 56.86], ['Ryazan', 39.74, 54.63],
    ['Tula', 37.62, 54.19], ['Çaritsin', 44.5, 48.7, { alt: { 1589: 'Saray' } }], ['Bahçesaray', 33.88, 44.75],
    ['Kefe', 35.38, 45.03], ['Azak', 39.42, 47.1], ['Odessa', 30.73, 46.48, { from: 1794 }], ['Harkov', 36.23, 49.99],
    ['Voronej', 39.2, 51.66], ['Oslo', 10.75, 59.91], ['Bergen', 5.32, 60.39], ['Göteborg', 11.97, 57.71],
    ['Turku', 22.27, 60.45], ['Helsinki', 24.94, 60.17, { from: 1550 }], ['Malmö', 13.0, 55.6], ['Aarhus', 10.2, 56.15],
    ['Stavanger', 5.73, 58.97], ['Kalmar', 16.36, 56.66], ['Pskov', 28.33, 57.82], ['Vologda', 39.89, 59.22],
    ['Kursk', 36.19, 51.73], ['Dnipro', 35.04, 48.46, { from: 1776 }], ['Astrahan', 46.0, 46.35],
  ];

  const cache = new Map();

  function nameFor(entry, year) {
    const [name, , , opt = {}] = entry;
    if (opt.from && year < opt.from) return null;
    for (const [before, old] of Object.entries(opt.alt || {})) if (year < Number(before)) return old;
    let current = name;
    for (const [since, renamed] of Object.entries(opt.rename || {})) if (year >= Number(since)) current = renamed;
    return current;
  }

  /** Bir senaryo yılı için eyalet → { name, city } tablosu */
  function table(year) {
    if (cache.has(year)) return cache.get(year);
    const grid = MH.geo.buildGrid();
    const { provinces } = grid;
    const lonScale = Math.cos((46 * Math.PI) / 180);
    const city = new Array(provinces.length).fill(null);
    const placed = [];
    for (const entry of CITIES) {
      const name = nameFor(entry, year);
      if (!name) continue;
      const dist = (q) => Math.hypot((q.lon - entry[1]) * lonScale, q.lat - entry[2]);
      let pid = grid.nearest(entry[1], entry[2]);
      // Altıgen başka bir şehre aitse en yakın boş komşuya kaydır
      if (city[pid]) {
        const free = provinces[pid].neighbors.filter((n) => !city[n]).sort((a, b) => dist(provinces[a]) - dist(provinces[b]));
        if (!free.length) continue;
        pid = free[0];
      }
      if (dist(provinces[pid]) > 1.1) continue;
      city[pid] = name;
      placed.push(pid);
    }
    const names = provinces.map((p) => {
      if (city[p.id]) return city[p.id];
      let best = null;
      let bestD = Infinity;
      for (const c of placed) {
        const q = provinces[c];
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      return best !== null && Math.sqrt(bestD) < 90 ? city[best] + ' yöresi' : null;
    });
    const t = { names, city };
    cache.set(year, t);
    return t;
  }

  /** Eyaletin adı ("Belgrad", "Belgrad yöresi" ya da "<Ulus> taşrası") */
  function nameOf(game, pid) {
    const t = table(game.scenario.year);
    if (t.names[pid]) return t.names[pid];
    const owner = game.state.owner[pid];
    return owner ? game.nation(owner).name + ' taşrası' : 'Issız topraklar';
  }

  function isCity(game, pid) {
    return !!table(game.scenario.year).city[pid];
  }

  MH.places = { CITIES, nameOf, isCity, table };
})((globalThis.MH = globalThis.MH || {}));
