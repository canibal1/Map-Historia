/*
 * Map Historia — harita verisi.
 * tools/build-map.js'in ürettiği data/map-<kaynak>.js dosyalarını yükler ve oyunun kullandığı
 * eyalet grafını kurar: her eyaletin merkezi, alanı, kıyı bilgisi, komşuları ve boğaz bağlantıları.
 */
(function (MH) {
  'use strict';

  const LON_KM = 111.32;
  const cache = new Map();
  const loading = new Map();

  /** Tarayıcıda harita verisini <script> ile yükler (file:// üzerinde de çalışır) */
  function load(source) {
    if (MH.MAPDATA?.[source]) return Promise.resolve();
    if (loading.has(source)) return loading.get(source);
    const p = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('Harita verisi yüklenmemiş: ' + source));
      const s = document.createElement('script');
      s.src = 'data/map-' + source + '.js';
      s.onload = () => (MH.MAPDATA?.[source] ? resolve() : reject(new Error('Harita verisi okunamadı: ' + source)));
      s.onerror = () => reject(new Error('Harita verisi indirilemedi: ' + source));
      document.head.appendChild(s);
    });
    loading.set(source, p);
    p.catch(() => loading.delete(source));
    return p;
  }

  /** Eyalet grafı (kaynağa göre önbellekli) */
  function gridFor(source) {
    if (cache.has(source)) return cache.get(source);
    const d = MH.MAPDATA?.[source];
    if (!d) throw new Error('Harita verisi yüklenmemiş: ' + source);
    const provinces = d.provinces.map((p, id) => ({
      id,
      x: p[0],
      y: p[1],
      lon: p[2],
      lat: p[3],
      area: p[4],
      polity: p[5],
      coastal: !!p[6],
      neighbors: d.neighbors[id],
      straits: d.straits[id],
    }));
    const { lon0, lat1 } = d.projection;
    const yTop = Math.log(Math.tan(Math.PI / 4 + (lat1 * Math.PI) / 360));
    const project = (lon, lat) => ({
      x: ((lon - lon0) / 360) * d.width,
      y: (yTop - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) * (d.width / (2 * Math.PI)),
    });

    // Konum tablosu: noktanın içinde bulunduğu eyalet
    let table = null;
    const containing = (lon, lat) => {
      const L = d.lookup;
      if (!L) return -1;
      if (!table) {
        table = L.rle.map((row) => {
          const out = new Int32Array(L.cols).fill(-1);
          let c = 0;
          for (const part of row.split(',')) {
            const [v, n] = part.split('*');
            const len = n ? parseInt(n, 36) : 1;
            const id = v === '' ? -1 : parseInt(v, 36);
            out.fill(id, c, c + len);
            c += len;
          }
          return out;
        });
      }
      const r = Math.floor((lat1 - lat) / L.res);
      const c = Math.floor((lon - lon0) / L.res);
      if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) return -1;
      return table[r][c];
    };

    // Kıyı şehirleri tabloda denize düşebilir: en fazla 2 hücre çevresine bak
    const OFFSETS = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) OFFSETS.push([dr, dc, dr * dr + dc * dc]);
    OFFSETS.sort((a, b) => a[2] - b[2]);
    const containingNear = (lon, lat, filter) => {
      const res = d.lookup ? d.lookup.res : 0;
      for (const [dr, dc] of OFFSETS) {
        const id = containing(lon + dc * res, lat - dr * res);
        if (id >= 0 && (!filter || filter(provinces[id]))) return id;
      }
      return -1;
    };

    /** Bir noktayı içeren eyalet; yoksa (deniz ya da filtre dışı) en yakın eyalet */
    const nearest = (lon, lat, filter) => {
      const inside = containingNear(lon, lat, filter);
      if (inside >= 0) return inside;
      let best = -1;
      let bestD = Infinity;
      const k = Math.cos((lat * Math.PI) / 180);
      for (const p of provinces) {
        if (filter && !filter(p)) continue;
        const dl = Math.abs(p.lon - lon);
        const d2 = (Math.min(dl, 360 - dl) * k) ** 2 + (p.lat - lat) ** 2;
        if (d2 < bestD) { bestD = d2; best = p.id; }
      }
      return best;
    };

    /** İki eyalet arası yaklaşık uzaklık (km) */
    const distanceKm = (a, b) => {
      const p = provinces[a];
      const q = provinces[b];
      const k = Math.cos((((p.lat + q.lat) / 2) * Math.PI) / 180);
      const dl = Math.abs(p.lon - q.lon);
      return Math.hypot(Math.min(dl, 360 - dl) * k, p.lat - q.lat) * LON_KM;
    };

    const grid = {
      source,
      year: d.year,
      width: d.width,
      height: d.height,
      provinces,
      polities: d.polities,
      rings: d.rings,
      pairs: d.pairs,
      coast: d.coast,
      project,
      nearest,
      containing,
      containingNear,
      distanceKm,
    };
    cache.set(source, grid);
    return grid;
  }

  MH.geo = { load, gridFor };
})((globalThis.MH = globalThis.MH || {}));
