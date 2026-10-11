#!/usr/bin/env node
/*
 * Map Historia — dünya haritası derleyicisi.
 *
 *   node tools/build-map.js [kaynak ...]      (varsayılan: hepsi)
 *   kaynaklar: hb1400 hb1815 hb1914 modern
 *
 * Gerçek sınırlardan oyun eyaletleri üretir ve data/map-<kaynak>.js dosyasını yazar:
 *   1. Kara (Natural Earth) ve ülke/devlet poligonları 0,1°'lik bir ızgaraya işlenir.
 *   2. Her devlet alanına göre eyaletlere bölünür (ızgara üzerinde Lloyd gevşetmeli bölgeler).
 *   3. Eyalet, ikili sınır ve kıyı çizgileri izlenir, yumuşatılır, sadeleştirilir ve
 *      Mercator izdüşümünde SVG yol dizgelerine çevrilir.
 *   4. Komşuluklar ızgaradan, dar boğaz bağlantıları deniz üzerinden kısa mesafeyle bulunur.
 *
 * Veri kaynakları:
 *   - Natural Earth (world-atlas paketi) — kamu malı: kıyılar ve günümüz ülkeleri.
 *   - aourednik/historical-basemaps — GPL-3.0: tarihî sınırlar (indirilip tools/.cache içine alınır).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const topojson = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const OUT = path.join(ROOT, 'data');

// ---------------------------------------------------------------- ızgara ve izdüşüm
const RES = 0.1;
const LON0 = -180;
const LAT1 = 80;
const LAT0 = -56;
const COLS = Math.round(360 / RES);
const ROWS = Math.round((LAT1 - LAT0) / RES);
const N = COLS * ROWS;
const W = 4096;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const Y_TOP = mercY(LAT1);
const H = Math.round((Y_TOP - mercY(LAT0)) * (W / (2 * Math.PI)));
const projX = (lon) => ((lon - LON0) / 360) * W;
const projY = (lat) => (Y_TOP - mercY(lat)) * (W / (2 * Math.PI));
const cellLon = (c) => LON0 + (c + 0.5) * RES;
const cellLat = (r) => LAT1 - (r + 0.5) * RES;
const cellKm2 = (r) => (RES * 111.32) ** 2 * Math.cos((cellLat(r) * Math.PI) / 180);

// ---------------------------------------------------------------- kaynak ayarları
const HB_URL = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/';

// Sömürgeler ve eş anlamlı adlar tek devlette birleşir
const SYNONYMS = {
  'United Kingdom': 'United Kingdom of Great Britain and Ireland',
  'British East India Company': 'United Kingdom of Great Britain and Ireland',
  Russia: 'Russian Empire',
  Italy: 'Kingdom of Italy',
  Netherlands: 'Netherlands',
  'United Kingdom of Netherlands': 'Netherlands',
  'Dutch East Indies': 'Netherlands',
  'Netherlands Indies': 'Netherlands',
  'Netherlands Antilles': 'Netherlands',
  Suriname: 'Netherlands',
  Guiana: 'Netherlands',
  Hungary: 'Kingdom of Hungary',
  'German South-West Africa': 'German Empire',
  Kamerun: 'German Empire',
  Togoland: 'German Empire',
  'Papua New Guinea': 'Australia',
  'Rio De Oro': 'Spain',
  'Spanish Morocco': 'Spain',
  'French Guiana': 'France',
  Martinique: 'France',
  Guadeloupe: 'France',
  'Hong Kong': 'United Kingdom of Great Britain and Ireland',
  Malta: 'United Kingdom of Great Britain and Ireland',
  Ceylon: 'United Kingdom of Great Britain and Ireland',
  'Portuguese Guinea': 'Portugal',
  'Portuguese East Africa': 'Portugal',
  Goa: 'Portugal',
  Angola: 'Portugal',
  'Cape Colony': 'United Kingdom of Great Britain and Ireland',
  'Sierra Leone': 'United Kingdom of Great Britain and Ireland',
};

// Günümüz: bağımlı topraklar bağlı oldukları devlete katılır
const MODERN_PARENT = {
  Greenland: 'Denmark', 'Faeroe Is.': 'Denmark',
  'Puerto Rico': 'United States of America', Guam: 'United States of America', 'N. Mariana Is.': 'United States of America',
  'U.S. Virgin Is.': 'United States of America', 'American Samoa': 'United States of America',
  'Falkland Is.': 'United Kingdom', 'S. Geo. and the Is.': 'United Kingdom', 'Saint Helena': 'United Kingdom',
  'Br. Indian Ocean Ter.': 'United Kingdom', 'Cayman Is.': 'United Kingdom', 'Turks and Caicos Is.': 'United Kingdom',
  Anguilla: 'United Kingdom', Jersey: 'United Kingdom', Guernsey: 'United Kingdom', 'Isle of Man': 'United Kingdom',
  Bermuda: 'United Kingdom', 'British Virgin Is.': 'United Kingdom', Montserrat: 'United Kingdom', 'Pitcairn Is.': 'United Kingdom',
  'New Caledonia': 'France', 'Fr. Polynesia': 'France', 'Wallis and Futuna Is.': 'France', 'St. Pierre and Miquelon': 'France',
  'Fr. S. Antarctic Lands': 'France', 'St-Martin': 'France', 'St-Barthélemy': 'France',
  Aruba: 'Netherlands', 'Curaçao': 'Netherlands', 'Sint Maarten': 'Netherlands',
  'Hong Kong': 'China', Macao: 'China', 'Åland': 'Finland', Niue: 'New Zealand', 'Cook Is.': 'New Zealand',
  'Norfolk Island': 'Australia', 'Ashmore and Cartier Is.': 'Australia', 'Indian Ocean Ter.': 'Australia',
  'Heard I. and McDonald Is.': 'Australia', 'Siachen Glacier': 'India',
};

const TRIBAL = /(hunter|gatherer|peoples|cultures?\b|farmers|city-states|chiefdoms|^minor |tribes|aboriginal|^none$|siberians|polynesians|sámi|ainus|dorset|thule|innu|athabaskan|beothuk|shuar|taino|kalinago|guanahatabey|maori|khoisan|guanches|papuans|bantu|^pampas|patagonian|pueblo)/i;

const SOURCES = {
  hb1400: { file: 'world_1400.geojson', year: 1400, mergeSubjects: true, noMergeInto: ['Mongol Empire'] },
  hb1815: { file: 'world_1815.geojson', year: 1815, mergeSubjects: true },
  hb1914: { file: 'world_1914.geojson', year: 1914, mergeSubjects: true },
  modern: { natural: true, year: 2026 },
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(url + ' → HTTP ' + res.statusCode));
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
    }).on('error', reject);
  });
}

async function loadFeatures(src) {
  if (src.natural) {
    const topo = require('world-atlas/countries-50m.json');
    return topojson.feature(topo, topo.objects.countries).features
      .filter((f) => f.properties.name !== 'Antarctica' && f.geometry)
      .map((f) => ({ name: f.properties.name, key: MODERN_PARENT[f.properties.name] || f.properties.name, geometry: f.geometry, unclaimed: false }));
  }
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, src.file);
  if (!fs.existsSync(file)) {
    console.log('  indiriliyor: ' + src.file);
    await download(HB_URL + src.file, file);
  }
  const gj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const canonical = (n) => SYNONYMS[n] || n;
  return gj.features.filter((f) => f.geometry).map((f) => {
    const name = String(f.properties.NAME || '').trim();
    const sub = String(f.properties.SUBJECTO || '').trim();
    let unclaimed = !name || TRIBAL.test(name);
    // 1815 Avustralya'sındaki yüzlerce yerli grup ve benzeri küçük topluluklar
    if (!unclaimed && src.year === 1815 && /Australian|^[A-Z][a-z]+(\s|-|$)/.test(name)) {
      const [lon, lat] = firstCoord(f.geometry);
      if (lon > 110 && lon < 156 && lat < -9 && lat > -45 && !/New South Wales/.test(name)) unclaimed = true;
    }
    let key = canonical(name);
    if (src.mergeSubjects && sub && sub !== name && !TRIBAL.test(sub) && !(src.noMergeInto || []).includes(sub)) key = canonical(sub);
    if (unclaimed) key = '~' + name;
    return { name, key, geometry: f.geometry, unclaimed };
  });
}

function firstCoord(g) {
  let c = g.coordinates;
  while (Array.isArray(c[0])) c = c[0];
  return c;
}

// ---------------------------------------------------------------- tarama ile ızgaraya işleme
function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** Çift-tek kuralıyla bir poligonun (dış halka + delikler) kapsadığı hücreleri işaretler */
function rasterize(geometry, mark) {
  for (const rings of polygonsOf(geometry)) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    const edges = [];
    const crossE = [];
    const crossW = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        const push = (ax, ay, bx, by) => {
          if (ay === by) return;
          edges.push(ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay]);
          minLat = Math.min(minLat, ay, by);
          maxLat = Math.max(maxLat, ay, by);
        };
        // 180. meridyeni aşan kenar iki kenarda bölünür; kesişimler sonra meridyen boyunca kapatılır
        if (Math.abs(x2 - x1) > 180) {
          const x2u = x2 + (x2 < x1 ? 360 : -360);
          const edge = x2u > x1 ? 180 : -180;
          const t = x2u === x1 ? 0 : Math.max(0, Math.min(1, (edge - x1) / (x2u - x1)));
          const ym = y1 + t * (y2 - y1);
          push(x1, y1, edge, ym);
          push(-edge, ym, x2, y2);
          crossE.push(ym);
          crossW.push(ym);
        } else push(x1, y1, x2, y2);
      }
    }
    for (const [list, x] of [[crossE, 180], [crossW, -180]]) {
      list.sort((p, q) => p - q);
      for (let k = 0; k + 1 < list.length; k += 2) {
        edges.push([x, list[k], x, list[k + 1]]);
        minLat = Math.min(minLat, list[k]);
        maxLat = Math.max(maxLat, list[k + 1]);
      }
    }
    if (!edges.length) continue;
    const r0 = Math.max(0, Math.floor((LAT1 - maxLat) / RES));
    const r1 = Math.min(ROWS - 1, Math.ceil((LAT1 - minLat) / RES));
    for (let r = r0; r <= r1; r++) {
      const lat = cellLat(r);
      const xs = [];
      for (const [ax, ay, bx, by] of edges) {
        if (lat < ay || lat >= by) continue;
        xs.push(ax + ((lat - ay) / (by - ay)) * (bx - ax));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - LON0) / RES - 0.5));
        const c1 = Math.min(COLS - 1, Math.floor((xs[k + 1] - LON0) / RES - 0.5));
        for (let c = c0; c <= c1; c++) mark(r * COLS + c);
      }
    }
  }
}

function neighbors4(i) {
  const r = (i / COLS) | 0;
  const c = i - r * COLS;
  const out = [];
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

// ---------------------------------------------------------------- deterministik rastgelelik
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- ana akış
async function build(name) {
  const src = SOURCES[name];
  const t0 = Date.now();
  console.log('▶ ' + name);

  // 1) kara maskesi
  const land = new Uint8Array(N);
  const landTopo = require('world-atlas/land-50m.json');
  for (const f of topojson.feature(landTopo, landTopo.objects.land).features) rasterize(f.geometry, (i) => { land[i] = 1; });

  // 2) devlet/özellik ızgarası (büyükten küçüğe: küçük özellikler büyüklerin üstüne yazılır)
  const features = await loadFeatures(src);
  const feat = new Int32Array(N).fill(-1);
  const order = features.map((f, i) => ({ i, a: approxArea(f.geometry) })).sort((a, b) => b.a - a.a);
  for (const { i } of order) rasterize(features[i].geometry, (cell) => { if (land[cell]) feat[cell] = i; });

  // Hiçbir özelliğe düşmeyen kara hücreleri en yakın özelliğe (en fazla 2°) ya da "sahipsiz"e
  let frontier = [];
  for (let i = 0; i < N; i++) if (feat[i] >= 0) frontier.push(i);
  for (let step = 0; step < 20 && frontier.length; step++) {
    const next = [];
    for (const i of frontier) for (const j of neighbors4(i)) if (land[j] && feat[j] < 0) { feat[j] = feat[i]; next.push(j); }
    frontier = next;
  }
  let leftover = 0;
  for (let i = 0; i < N; i++) if (land[i] && feat[i] < 0) leftover++;
  if (leftover) {
    features.push({ name: 'Unclaimed', key: '~Unclaimed', geometry: null, unclaimed: true });
    const u = features.length - 1;
    for (let i = 0; i < N; i++) if (land[i] && feat[i] < 0) feat[i] = u;
  }

  // 3) devletler
  const polityIndex = new Map();
  const polities = [];
  const featPolity = features.map((f) => {
    if (!polityIndex.has(f.key)) {
      polityIndex.set(f.key, polities.length);
      polities.push({ key: f.key, name: f.unclaimed ? f.key.slice(1) : f.key, unclaimed: f.unclaimed, names: new Set() });
    }
    const p = polityIndex.get(f.key);
    polities[p].names.add(f.name);
    return p;
  });

  // 4) eyaletler: her özellik alanına göre tohum alır, devlet içinde BFS ile bölünür
  const cellsByFeat = new Map();
  for (let i = 0; i < N; i++) if (feat[i] >= 0) {
    if (!cellsByFeat.has(feat[i])) cellsByFeat.set(feat[i], []);
    cellsByFeat.get(feat[i]).push(i);
  }
  const polityCells = polities.map(() => []);
  for (const [f, cells] of cellsByFeat) for (const c of cells) polityCells[featPolity[f]].push(c);

  const prov = new Int32Array(N).fill(-1);
  const provPolity = [];
  const random = rng(SOURCES[name].year * 7919);

  for (let p = 0; p < polities.length; p++) {
    const cells = polityCells[p];
    if (!cells.length) continue;
    const isUnclaimed = polities[p].unclaimed;
    // tohumlar
    let seeds = [];
    for (const [f, fcells] of cellsByFeat) {
      if (featPolity[f] !== p) continue;
      const area = fcells.reduce((s, c) => s + cellKm2((c / COLS) | 0), 0);
      const target = isUnclaimed ? 90 : 42;
      const n = Math.max(1, Math.min(isUnclaimed ? 40 : 90, Math.round(Math.sqrt(area) / target)));
      seeds.push(...farthestPoints(fcells, n, random));
    }
    // Lloyd gevşetmesi
    let assign = null;
    for (let iter = 0; iter < 3; iter++) {
      assign = bfsAssign(cells, seeds);
      seeds = relax(cells, assign, seeds.length);
    }
    assign = bfsAssign(cells, seeds);
    // Tohuma ulaşamayan parçalar (adalar): büyükse yeni eyalet, değilse en yakın eyalete
    const base = provPolity.length;
    const targetCells = cells.length / Math.max(1, seeds.length);
    let extra = seeds.length;
    const local = new Map();
    cells.forEach((c, k) => local.set(c, assign[k]));
    const seen = new Set();
    for (const c of cells) {
      if (local.get(c) >= 0 || seen.has(c)) continue;
      const comp = [];
      const stack = [c];
      seen.add(c);
      while (stack.length) {
        const x = stack.pop();
        comp.push(x);
        for (const y of neighbors4(x)) if (!seen.has(y) && local.has(y) && local.get(y) < 0) { seen.add(y); stack.push(y); }
      }
      let id;
      if (comp.length >= targetCells * 0.3 || comp.length >= 25) id = extra++;
      else id = nearestSeed(comp, seeds);
      for (const x of comp) local.set(x, id);
    }
    for (let k = 0; k < extra; k++) provPolity.push(p);
    for (const [c, id] of local) prov[c] = base + id;
  }
  // Boş kalan (hücresiz) eyalet numaralarını sıkıştır
  const used = new Int32Array(provPolity.length).fill(-1);
  let nextId = 0;
  for (let i = 0; i < N; i++) if (prov[i] >= 0 && used[prov[i]] < 0) used[prov[i]] = nextId++;
  for (let i = 0; i < N; i++) if (prov[i] >= 0) prov[i] = used[prov[i]];
  const provPolityC = new Int32Array(nextId);
  for (let k = 0; k < used.length; k++) if (used[k] >= 0) provPolityC[used[k]] = provPolity[k];
  const P = nextId;

  // 5) eyalet istatistikleri
  const cellsOf = Array.from({ length: P }, () => []);
  for (let i = 0; i < N; i++) if (prov[i] >= 0) cellsOf[prov[i]].push(i);
  const provinces = cellsOf.map((cells, id) => {
    let sx = 0;
    let sy = 0;
    let area = 0;
    for (const c of cells) {
      const r = (c / COLS) | 0;
      sx += c - r * COLS;
      sy += r;
      area += cellKm2(r);
    }
    const mc = sx / cells.length;
    const mr = sy / cells.length;
    // Ağırlık merkezine en yakın eyalet hücresi (hilal biçimli eyaletlerde merkez denize düşmesin)
    let best = cells[0];
    let bestD = Infinity;
    for (const c of cells) {
      const r = (c / COLS) | 0;
      const d = (c - r * COLS - mc) ** 2 + (r - mr) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    const r = (best / COLS) | 0;
    const c = best - r * COLS;
    return { id, polity: provPolityC[id], lon: cellLon(c), lat: cellLat(r), x: projX(cellLon(c)), y: projY(cellLat(r)), area: Math.round(area), cells: cells.length };
  });

  // 6) komşuluklar ve kıyılar
  const nb = Array.from({ length: P }, () => new Map());
  const coastal = new Uint8Array(P);
  for (let i = 0; i < N; i++) {
    const a = prov[i];
    if (a < 0) continue;
    for (const j of neighbors4(i)) {
      const b = prov[j];
      if (b < 0) coastal[a] = 1;
      else if (b !== a) nb[a].set(b, (nb[a].get(b) || 0) + 1);
    }
  }
  // Dar boğazlar: deniz üzerinden en fazla ~5 hücre
  const straits = Array.from({ length: P }, () => new Set());
  const seaLabel = new Int32Array(N).fill(-1);
  const seaDist = new Uint8Array(N);
  let q = [];
  for (let i = 0; i < N; i++) {
    if (prov[i] < 0) continue;
    for (const j of neighbors4(i)) if (prov[j] < 0 && seaLabel[j] < 0) { seaLabel[j] = prov[i]; seaDist[j] = 1; q.push(j); }
  }
  const MAXD = 5;
  for (let d = 1; d < MAXD && q.length; d++) {
    const next = [];
    for (const i of q) {
      for (const j of neighbors4(i)) {
        if (prov[j] >= 0) continue;
        if (seaLabel[j] < 0) { seaLabel[j] = seaLabel[i]; seaDist[j] = d + 1; next.push(j); }
      }
    }
    q = next;
  }
  for (let i = 0; i < N; i++) {
    const a = seaLabel[i];
    if (a < 0) continue;
    for (const j of neighbors4(i)) {
      const b = seaLabel[j];
      if (b < 0 || b === a) continue;
      if (seaDist[i] + seaDist[j] > MAXD + 1) continue;
      if (nb[a].has(b)) continue;
      straits[a].add(b);
      straits[b].add(a);
    }
  }

  // 7) vektörleştirme
  const V = (r, c) => r * (COLS + 1) + c;

  // Izgara basamakları önce ızgara biriminde sadeleştirilir, sonra izdüşülüp yumuşatılır
  const gx = (v) => v % (COLS + 1);
  const gy = (v) => (v / (COLS + 1)) | 0;
  const toPx = ([c, r]) => [projX(LON0 + c * RES), projY(LAT1 - r * RES)];
  const preClosed = (vs) => simplifyClosed(vs.map((v) => [gx(v), gy(v)]), 0.6).map(toPx);
  const preOpen = (vs) => rdp(vs.map((v) => [gx(v), gy(v)]), 0.6).map(toPx);
  const rings = cellsOf.map((cells, id) => traceRings(cells, id, prov, V).map((ring) => smoothClosed(preClosed(ring))));
  const ringPaths = rings.map((rs) => rs.map(pathClosed).join(''));

  // ikili sınırlar ve kıyı çizgileri
  const pairEdges = new Map();
  const coastEdges = new Map();
  const addEdge = (map, key, v1, v2) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v1, v2);
  };
  for (let i = 0; i < N; i++) {
    const a = prov[i];
    const r = (i / COLS) | 0;
    const c = i - r * COLS;
    const sides = [
      [c < COLS - 1 ? i + 1 : -2, V(r, c + 1), V(r + 1, c + 1)],
      [r < ROWS - 1 ? i + COLS : -2, V(r + 1, c), V(r + 1, c + 1)],
    ];
    if (c === 0) sides.push([-2, V(r, 0), V(r + 1, 0)]);
    if (r === 0) sides.push([-2, V(0, c), V(0, c + 1)]);
    for (const [j, v1, v2] of sides) {
      if (j === -2) continue; // harita kenarı: çizgi yok
      const b = prov[j];
      if (a === b) continue;
      if (a >= 0 && b >= 0) addEdge(pairEdges, Math.min(a, b) * 1e5 + Math.max(a, b), v1, v2);
      else if (a >= 0) addEdge(coastEdges, a, v1, v2);
      else if (b >= 0) addEdge(coastEdges, b, v1, v2);
    }
  }
  const polylinePath = (edges) => chainEdges(edges).map((line) => (line.closed
    ? pathClosed(smoothClosed(preClosed(line.slice(0, -1))))
    : pathOpen(smoothOpen(preOpen(line))))).join('');
  const pairs = [];
  for (const [key, edges] of pairEdges) pairs.push([Math.floor(key / 1e5), key % 1e5, polylinePath(edges)]);
  const coast = new Array(P).fill('');
  for (const [a, edges] of coastEdges) coast[a] = polylinePath(edges);

  // 8) konum tablosu: 0,2°'lik hücrelerde eyalet numarası (satır başına çalışma uzunluğu kodlaması, 36 tabanında)
  const LF = 2;
  const lookup = [];
  for (let r = 0; r < ROWS; r += LF) {
    let row = '';
    let prev = null;
    let run = 0;
    for (let c = 0; c < COLS; c += LF) {
      // 2×2 bloktaki ilk kara hücresi
      let v = -1;
      for (let dr = 0; dr < LF && v < 0; dr++) for (let dc = 0; dc < LF && v < 0; dc++) v = prov[(r + dr) * COLS + c + dc];
      if (v === prev) run++;
      else {
        if (prev !== null) row += (prev < 0 ? '' : prev.toString(36)) + (run > 1 ? '*' + run.toString(36) : '') + ',';
        prev = v;
        run = 1;
      }
    }
    row += (prev < 0 ? '' : prev.toString(36)) + (run > 1 ? '*' + run.toString(36) : '');
    lookup.push(row);
  }

  // 9) çıktı
  const polOut = polities.map((p, idx) => {
    const ps = provinces.filter((x) => x.polity === idx);
    const big = ps.reduce((m, x) => (x.area > (m?.area || 0) ? x : m), null);
    return { key: p.key, name: p.name, names: [...p.names], unclaimed: p.unclaimed, provinces: ps.length, lon: big ? +big.lon.toFixed(2) : 0, lat: big ? +big.lat.toFixed(2) : 0 };
  });
  const keep = polOut.map((p) => p.provinces > 0);
  const remap = [];
  let k = 0;
  keep.forEach((ok, i) => { remap[i] = ok ? k++ : -1; });
  const data = {
    source: name,
    year: src.year,
    width: W,
    height: H,
    projection: { type: 'mercator', lon0: LON0, lat1: LAT1, lat0: LAT0 },
    polities: polOut.filter((_, i) => keep[i]),
    provinces: provinces.map((p) => [round1(p.x), round1(p.y), +p.lon.toFixed(2), +p.lat.toFixed(2), p.area, remap[p.polity], coastal[p.id]]),
    rings: ringPaths,
    neighbors: nb.map((m) => [...m.keys()]),
    straits: straits.map((s) => [...s]),
    pairs,
    coast,
    lookup: { res: RES * LF, cols: COLS / LF, rows: lookup.length, rle: lookup },
  };
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'map-' + name + '.js');
  const banner = name === 'modern'
    ? '// Natural Earth (world-atlas) verisinden üretildi — kamu malı. tools/build-map.js ile yeniden üretin.\n'
    : '// aourednik/historical-basemaps (GPL-3.0) ve Natural Earth verisinden üretildi. tools/build-map.js ile yeniden üretin.\n';
  fs.writeFileSync(file, banner + '(globalThis.MH = globalThis.MH || {}).MAPDATA = Object.assign(globalThis.MH.MAPDATA || {}, { ' + JSON.stringify(name) + ': ' + JSON.stringify(data) + ' });\n');
  const size = fs.statSync(file).size;
  console.log(`  ${data.polities.length} devlet, ${P} eyalet, ${pairs.length} sınır, ${(size / 1024 / 1024).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
}

function approxArea(geometry) {
  let a = 0;
  for (const rings of polygonsOf(geometry)) {
    const ring = rings[0];
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

function farthestPoints(cells, n, random) {
  if (n >= cells.length) return cells.slice(0, n);
  const sample = [];
  const step = Math.max(1, Math.floor(cells.length / 4000));
  for (let i = Math.floor(random() * step); i < cells.length; i += step) sample.push(cells[i]);
  const rc = (c) => { const r = (c / COLS) | 0; return [c - r * COLS, r]; };
  const pts = sample.map(rc);
  const seeds = [sample[Math.floor(random() * sample.length)]];
  const dist = pts.map(([x, y]) => { const [sx, sy] = rc(seeds[0]); return (x - sx) ** 2 + (y - sy) ** 2; });
  while (seeds.length < n) {
    let bi = 0;
    for (let i = 1; i < dist.length; i++) if (dist[i] > dist[bi]) bi = i;
    seeds.push(sample[bi]);
    const [sx, sy] = pts[bi];
    for (let i = 0; i < dist.length; i++) dist[i] = Math.min(dist[i], (pts[i][0] - sx) ** 2 + (pts[i][1] - sy) ** 2);
  }
  return seeds;
}

/**
 * Devletin hücrelerinde çok kaynaklı Dijkstra (8 yön, enlem düzeltmeli mesafe): eyaletler bitişik
 * ve doğal biçimli olur. Dönüş: hücre sırasına göre tohum numarası (-1: ulaşılamadı).
 */
const COSLAT = Float64Array.from({ length: ROWS }, (_, r) => Math.cos((cellLat(r) * Math.PI) / 180));
function bfsAssign(cells, seeds) {
  const idx = new Map();
  cells.forEach((c, k) => idx.set(c, k));
  const out = new Int32Array(cells.length).fill(-1);
  const dist = new Float64Array(cells.length).fill(Infinity);
  const heap = new MinHeap();
  seeds.forEach((s, k) => {
    const i = idx.get(s);
    if (i !== undefined && dist[i] > 0) { dist[i] = 0; out[i] = k; heap.push(0, i); }
  });
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const c = cells[i];
    const r = (c / COLS) | 0;
    const col = c - r * COLS;
    const cx = COSLAT[r];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = col + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        const k = idx.get(rr * COLS + cc);
        if (k === undefined) continue;
        const nd = d + Math.sqrt((dc * cx) ** 2 + dr * dr);
        if (nd < dist[k]) { dist[k] = nd; out[k] = out[i]; heap.push(nd, k); }
      }
    }
  }
  return out;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k;
    const v = this.v;
    const top = [k[0], v[0]];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let m = 2 * i + 1;
        if (m >= n) break;
        if (m + 1 < n && k[m + 1] < k[m]) m++;
        if (k[m] >= lk) break;
        k[i] = k[m]; v[i] = v[m];
        i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

function relax(cells, assign, n) {
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const cnt = new Float64Array(n);
  cells.forEach((c, k) => {
    const s = assign[k];
    if (s < 0) return;
    const r = (c / COLS) | 0;
    sx[s] += c - r * COLS;
    sy[s] += r;
    cnt[s]++;
  });
  const best = new Array(n).fill(-1);
  const bestD = new Float64Array(n).fill(Infinity);
  cells.forEach((c, k) => {
    const s = assign[k];
    if (s < 0 || !cnt[s]) return;
    const r = (c / COLS) | 0;
    const d = (c - r * COLS - sx[s] / cnt[s]) ** 2 + (r - sy[s] / cnt[s]) ** 2;
    if (d < bestD[s]) { bestD[s] = d; best[s] = c; }
  });
  return best.map((b, s) => (b >= 0 ? b : cells[0])).filter((b, s) => cnt[s] > 0 || s === 0);
}

function nearestSeed(comp, seeds) {
  let sx = 0;
  let sy = 0;
  for (const c of comp) { const r = (c / COLS) | 0; sx += c - r * COLS; sy += r; }
  sx /= comp.length;
  sy /= comp.length;
  let best = 0;
  let bestD = Infinity;
  seeds.forEach((s, k) => {
    const r = (s / COLS) | 0;
    const d = (s - r * COLS - sx) ** 2 + (r - sy) ** 2;
    if (d < bestD) { bestD = d; best = k; }
  });
  return best;
}

/** Eyalet hücrelerinin sınırını kapalı halkalar olarak izler (köşe numaraları) */
function traceRings(cells, id, prov, V) {
  const out = new Map(); // başlangıç köşesi → [bitiş köşeleri]
  const add = (a, b) => { if (!out.has(a)) out.set(a, []); out.get(a).push(b); };
  const isMine = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && prov[r * COLS + c] === id;
  for (const i of cells) {
    const r = (i / COLS) | 0;
    const c = i - r * COLS;
    // saat yönünde (y aşağı): üst, sağ, alt, sol
    if (!isMine(r - 1, c)) add(V(r, c), V(r, c + 1));
    if (!isMine(r, c + 1)) add(V(r, c + 1), V(r + 1, c + 1));
    if (!isMine(r + 1, c)) add(V(r + 1, c + 1), V(r + 1, c));
    if (!isMine(r, c - 1)) add(V(r + 1, c), V(r, c));
  }
  const rings = [];
  const dir = (a, b) => {
    const da = b - a;
    if (da === 1) return 0; // doğu
    if (da === COLS + 1) return 1; // güney
    if (da === -1) return 2; // batı
    return 3; // kuzey
  };
  for (const start of [...out.keys()]) {
    while (out.get(start)?.length) {
      const ring = [start];
      let prev = start;
      let cur = out.get(start).pop();
      let guard = 0;
      while (cur !== start && guard++ < 1e7) {
        ring.push(cur);
        const opts = out.get(cur);
        if (!opts || !opts.length) break;
        let pick = 0;
        if (opts.length > 1) {
          // Sıkışık köşede sağa dönüşü tercih et
          const din = dir(prev, cur);
          let bestRank = 9;
          opts.forEach((o, k) => {
            const turn = (dir(cur, o) - din + 4) % 4; // 1: sağ, 0: düz, 3: sol
            const rank = turn === 1 ? 0 : turn === 0 ? 1 : 2;
            if (rank < bestRank) { bestRank = rank; pick = k; }
          });
        }
        prev = cur;
        cur = opts.splice(pick, 1)[0];
      }
      if (ring.length >= 4) rings.push(collinear(ring, true));
    }
  }
  return rings;
}

/** Kenar listesini (düz dizi: v1,v2,v1,v2…) çizgilere zincirler */
function chainEdges(flat) {
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (let i = 0; i < flat.length; i += 2) { link(flat[i], flat[i + 1]); link(flat[i + 1], flat[i]); }
  const usedEdge = new Set();
  const ek = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const lines = [];
  const walk = (start) => {
    const line = [start];
    let cur = start;
    for (;;) {
      const next = (adj.get(cur) || []).find((n) => !usedEdge.has(ek(cur, n)));
      if (next === undefined) break;
      usedEdge.add(ek(cur, next));
      line.push(next);
      cur = next;
      if (cur === start) { line.closed = true; break; }
    }
    return line;
  };
  // Önce uç noktalardan (derecesi 1 ya da 3+) başla
  for (const [v, ns] of adj) {
    if (ns.length === 2) continue;
    for (let k = 0; k < ns.length; k++) {
      const line = walk(v);
      if (line.length > 1) lines.push(collinear(line, false, line.closed));
    }
  }
  for (const v of adj.keys()) {
    const line = walk(v);
    if (line.length > 1) lines.push(collinear(line, false, line.closed));
  }
  return lines;
}

/** Aynı doğru üzerindeki ara köşeleri atar */
function collinear(vs, closed, isClosed) {
  const out = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { out.push(vs[i]); continue; }
    const a = vs[(i - 1 + n) % n];
    const b = vs[i];
    const c = vs[(i + 1) % n];
    if (b - a !== c - b) out.push(b);
  }
  if (isClosed) out.closed = true;
  return out;
}

function chaikin(pts, closed, iterations) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out = [];
    const n = p.length;
    const lim = closed ? n : n - 1;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < lim; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const EPS = 0.22;
/** Kapalı halkayı iki yarıya bölerek sadeleştirir */
function simplifyClosed(pts, eps) {
  if (pts.length < 6) return pts;
  const mid = pts.length >> 1;
  return rdp(pts.slice(0, mid + 1), eps).slice(0, -1).concat(rdp(pts.slice(mid).concat([pts[0]]), eps).slice(0, -1));
}
const smoothClosed = (pts) => simplifyClosed(chaikin(pts, true, 2), EPS);
const smoothOpen = (pts) => rdp(chaikin(pts, false, 2), EPS);

const round1 = (v) => Math.round(v * 10) / 10;
function pathOpen(pts) {
  if (pts.length < 2) return '';
  let d = 'M' + round1(pts[0][0]) + ' ' + round1(pts[0][1]);
  let px = round1(pts[0][0]);
  let py = round1(pts[0][1]);
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const x = round1(pts[i][0]);
    const y = round1(pts[i][1]);
    const dx = round1(x - px);
    const dy = round1(y - py);
    if (!dx && !dy) continue;
    d += (first ? 'l' : ' ') + dx + ' ' + dy;
    first = false;
    px = x;
    py = y;
  }
  return d.replace(/ -/g, '-');
}
const pathClosed = (pts) => (pts.length >= 3 ? pathOpen(pts) + 'z' : '');

(async () => {
  const which = process.argv.slice(2);
  for (const name of which.length ? which : Object.keys(SOURCES)) await build(name);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
