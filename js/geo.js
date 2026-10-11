/*
 * Map Historia — harita geometrisi.
 * Avrupa, Kuzey Afrika ve Yakın Doğu'yu kaba kıyı poligonlarıyla tanımlar,
 * bölgeyi altıgen (hex) bir ızgaraya böler ve her kara altıgenini bir eyalet yapar.
 */
(function (MH) {
  'use strict';

  const BOUNDS = { lonMin: -11, lonMax: 46, latMin: 30, latMax: 62 };
  const LON_SCALE = Math.cos((46 * Math.PI) / 180); // eşdikdörtgen izdüşüm düzeltmesi
  const HEX_SIZE = 0.6; // derece cinsinden altıgen yarıçapı
  const PX = 22; // 1 derece kaç piksel

  // [boylam, enlem] çiftleri
  const WATER = [
    // Atlas Okyanusu + Kuzey Denizi
    [[-11, 62], [5, 62], [5, 59.5], [5.5, 58.6], [7, 58], [8.2, 58.2], [10.5, 59.3], [11.2, 58.8],
      [10.6, 57.8], [10.3, 57.6], [8.4, 57.1], [8.1, 56.2], [8.1, 55.5], [8.6, 54.9], [8.9, 54],
      [7, 53.6], [5, 53.4], [4.2, 52.4], [3.3, 51.4], [1.6, 50.9], [0, 49.7], [-1.3, 49.7], [-1.9, 48.7],
      [-4.7, 48.6], [-4.3, 47.8], [-2.2, 47.2], [-1.2, 46.2], [-1.5, 43.4], [-4, 43.5], [-8, 43.7],
      [-9.3, 43], [-8.8, 41], [-9.5, 38.8], [-8.9, 37], [-6.4, 36.9], [-5.6, 36], [-6, 35.6],
      [-6.9, 34], [-8.5, 33.2], [-9.7, 32], [-9.8, 30], [-11, 30]],
    // Baltık Denizi
    [[11.2, 58.8], [11.8, 57.6], [12.4, 56.6], [12.8, 55.5], [14.2, 55.4], [15.9, 56.1], [16.6, 57.5],
      [16.8, 58.5], [18.6, 59.4], [17.7, 60.5], [17.3, 61.5], [17.6, 62], [21.3, 62], [21.4, 60.8],
      [22.6, 60.3], [25.5, 60.3], [30, 60], [28.2, 59.4], [23.6, 59.2], [23.6, 58.3], [24.3, 57.4],
      [23.2, 57], [21.2, 57.4], [21, 56.1], [21.2, 55.2], [20, 54.6], [18.6, 54.6], [16.5, 54.4],
      [14.2, 53.9], [12, 54.2], [10.9, 54.2], [10.5, 55], [10.6, 56.3], [10.9, 57.5]],
    // Akdeniz
    [[-5.6, 36], [-5.3, 36.2], [-4.4, 36.7], [-2, 36.8], [-0.5, 38.3], [0.2, 38.8], [-0.3, 39.5],
      [0.9, 41], [3.2, 41.9], [3.1, 43], [4.8, 43.4], [6, 43.1], [7.5, 43.8], [8.8, 44.4], [10.2, 43.9],
      [10.5, 43], [11.1, 42.4], [12.5, 41.5], [14, 40.8], [15.6, 40], [15.8, 38.8], [15.7, 38],
      [16.2, 38.1], [16.6, 38.5], [17.2, 39.1], [16.6, 40.1], [17.5, 40.3], [18.5, 40.1], [18, 40.6],
      [16.2, 41.4], [14.2, 42.4], [13.6, 43.5], [12.3, 44.5], [12.4, 45.4], [13.7, 45.7], [13.6, 45],
      [14.3, 45.2], [15.9, 43.6], [17.5, 43], [19.4, 42], [19.5, 41], [19.4, 40.3], [20.2, 39.6],
      [20.8, 38.6], [21.2, 37.8], [21.7, 36.8], [22.5, 36.4], [23.1, 36.5], [22.8, 37.6], [23.3, 38],
      [24, 37.7], [24, 38.5], [22.8, 39.5], [22.9, 40.5], [24, 40.7], [26, 40.8], [26.3, 40.1],
      [26.1, 39.5], [26.8, 38.5], [27.3, 37.4], [28, 36.8], [29.6, 36.2], [30.6, 36.8], [32, 36.5],
      [34.6, 36.8], [36.1, 36.6], [35.9, 35.4], [35.9, 34.5], [35, 33], [34.4, 31.4], [32.3, 31.2],
      [30, 31.4], [28, 31], [25.2, 31.6], [23, 32.5], [20.1, 32.2], [19.9, 30.9], [19, 30.3],
      [15.6, 31.3], [15.2, 32.3], [13, 32.9], [11.1, 33.3], [10.3, 33.7], [10.5, 35.5], [11.1, 36.9],
      [10, 37.3], [8.6, 36.9], [5, 36.8], [3, 36.8], [0, 35.8], [-2, 35.1], [-5.3, 35.9]],
    // Karadeniz
    [[28, 41.6], [27.6, 42.4], [28, 43.5], [28.7, 44.4], [29.7, 45.3], [30.7, 46.5], [31.9, 46.6],
      [33, 46], [32.5, 45.4], [33.5, 44.5], [34.5, 44.6], [35.5, 45], [36.5, 45.2], [37.5, 44.7],
      [38.5, 44.3], [40, 43.4], [41.6, 41.6], [41.5, 41.3], [39.7, 41], [37, 41.1], [35.2, 42],
      [33, 41.9], [31.2, 41.1], [29.1, 41.2]],
  ];

  // Su poligonlarının üzerine yazılan adalar
  const ISLANDS = [
    // Büyük Britanya
    [[-5.7, 50], [-3, 50.6], [1.4, 51.2], [1.7, 52.6], [0.2, 53.5], [-0.2, 54.2], [-1.6, 55.6], [-2, 57],
      [-1.8, 57.6], [-3.3, 58.6], [-5, 58.6], [-6.2, 57.5], [-5.6, 56], [-5, 55], [-3, 54.9],
      [-3.4, 54.3], [-3, 53.3], [-4.6, 53.3], [-4, 52], [-5.2, 51.7], [-3, 51.3], [-4.5, 51.1]],
    // İrlanda
    [[-6, 52.2], [-6.2, 53.9], [-5.5, 54.5], [-6.2, 55.3], [-8.2, 55.2], [-10, 54.2], [-10, 53.4],
      [-9.4, 52.6], [-10.3, 51.8], [-8.2, 51.6]],
    // Korsika
    [[8.5, 41.3], [9.5, 41.3], [9.6, 43.1], [8.5, 42.6]],
    // Sardinya
    [[8.3, 38.8], [9.7, 39], [9.9, 40.7], [9.2, 41.3], [8.1, 40.9]],
    // Sicilya
    [[12.3, 37.6], [15.1, 36.6], [15.7, 38.3], [13.3, 38.3]],
    // Girit
    [[23.4, 35.1], [26.4, 34.9], [26.4, 35.5], [23.5, 35.8]],
    // Kıbrıs
    [[32.2, 34.5], [34.1, 34.9], [34.7, 35.8], [32.4, 35.3]],
    // Zelanda (Danimarka)
    [[10.9, 55.1], [12.6, 55.0], [12.6, 56.1], [11.0, 55.9]],
  ];

  function pointInPolygon(lon, lat, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function isLand(lon, lat) {
    if (ISLANDS.some((p) => pointInPolygon(lon, lat, p))) return true;
    return !WATER.some((p) => pointInPolygon(lon, lat, p));
  }

  function project(lon, lat) {
    return {
      x: (lon - BOUNDS.lonMin) * LON_SCALE * PX,
      y: (BOUNDS.latMax - lat) * PX,
    };
  }

  // Sivri tepeli altıgenler, "odd-r" ofset koordinatları
  const COL_STEP = Math.sqrt(3) * HEX_SIZE;
  const ROW_STEP = 1.5 * HEX_SIZE;
  const COLS = Math.ceil(((BOUNDS.lonMax - BOUNDS.lonMin) * LON_SCALE) / COL_STEP) + 1;
  const ROWS = Math.ceil((BOUNDS.latMax - BOUNDS.latMin) / ROW_STEP) + 1;

  function hexCenter(col, row) {
    // izdüşüm uzayında (derece) merkez
    const px = col * COL_STEP + (row & 1 ? COL_STEP / 2 : 0);
    const py = row * ROW_STEP;
    return { lon: BOUNDS.lonMin + px / LON_SCALE, lat: BOUNDS.latMax - py };
  }

  function neighborOffsets(row) {
    return row & 1
      ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
      : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  }

  function hexCorners(cx, cy, sizePx) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push([cx + sizePx * Math.cos(a), cy + sizePx * Math.sin(a)]);
    }
    return pts;
  }

  let cached = null;

  /**
   * Kara altıgenlerinden oluşan eyalet listesini ve komşuluk grafını döndürür.
   * provinces[i] = { id, col, row, lon, lat, x, y, neighbors: [id], straits: [id], coastal }
   */
  function buildGrid() {
    if (cached) return cached;
    const index = new Map();
    const provinces = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const c = hexCenter(col, row);
        if (c.lon > BOUNDS.lonMax || c.lat < BOUNDS.latMin) continue;
        if (!isLand(c.lon, c.lat)) continue;
        const p = project(c.lon, c.lat);
        const id = provinces.length;
        provinces.push({ id, col, row, lon: c.lon, lat: c.lat, x: p.x, y: p.y, neighbors: [], straits: [], coastal: false });
        index.set(col + ',' + row, id);
      }
    }
    const at = (col, row) => index.get(col + ',' + row);
    const inGrid = (col, row) => col >= 0 && row >= 0 && col < COLS && row < ROWS;
    for (const prov of provinces) {
      for (const [dc, dr] of neighborOffsets(prov.row)) {
        const nid = at(prov.col + dc, prov.row + dr);
        if (nid !== undefined) prov.neighbors.push(nid);
        else {
          const c = hexCenter(prov.col + dc, prov.row + dr);
          if (inGrid(prov.col + dc, prov.row + dr) && c.lon <= BOUNDS.lonMax && c.lat >= BOUNDS.latMin) prov.coastal = true;
        }
      }
    }
    // Boğaz bağlantıları: tek bir deniz altıgeni ile ayrılan kıyı eyaletleri
    for (const prov of provinces) {
      if (!prov.coastal) continue;
      for (const [dc, dr] of neighborOffsets(prov.row)) {
        const wc = prov.col + dc;
        const wr = prov.row + dr;
        if (at(wc, wr) !== undefined || !inGrid(wc, wr)) continue;
        const wcen = hexCenter(wc, wr);
        if (wcen.lon > BOUNDS.lonMax || wcen.lat < BOUNDS.latMin) continue;
        for (const [dc2, dr2] of neighborOffsets(wr)) {
          const nid = at(wc + dc2, wr + dr2);
          if (nid === undefined || nid === prov.id) continue;
          if (prov.neighbors.includes(nid) || prov.straits.includes(nid)) continue;
          prov.straits.push(nid);
        }
      }
    }
    const nearest = (lon, lat) => {
      let best = -1;
      let bestD = Infinity;
      for (const prov of provinces) {
        const d = ((prov.lon - lon) * LON_SCALE) ** 2 + (prov.lat - lat) ** 2;
        if (d < bestD) {
          bestD = d;
          best = prov.id;
        }
      }
      return best;
    };
    const size = project(BOUNDS.lonMax, BOUNDS.latMin);
    cached = {
      provinces,
      nearest,
      width: Math.ceil(size.x + COL_STEP * PX),
      height: Math.ceil(size.y + HEX_SIZE * PX * 2),
      hexRadiusPx: HEX_SIZE * PX,
      hexCorners,
      project,
    };
    return cached;
  }

  MH.geo = { BOUNDS, isLand, project, buildGrid, pointInPolygon };
})((globalThis.MH = globalThis.MH || {}));
