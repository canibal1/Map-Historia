#!/usr/bin/env node
/*
 * Oyunu tek bir HTML dosyasına paketler (stiller ve betikler satır içine alınır).
 *
 *   node scripts/build-single.js              → dist/map-historia.html (çift tıklayıp açılabilir)
 *   node scripts/build-single.js --fragment   → dist/map-historia.fragment.html
 *                                               (doctype/html/head/body etiketleri olmadan; claude.ai yayını için)
 *   node scripts/build-single.js --site       → dist/site/ (index.html + data/ harita verileri; GitHub Pages için)
 *
 * Harita verileri (data/map-*.js) büyük olduğu için satır içine alınmaz; senaryo seçilince
 * sayfanın yanındaki data/ klasöründen yüklenir.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fragment = process.argv.includes('--fragment');
const site = process.argv.includes('--site');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+\.css)">/g, (_, href) =>
  '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>');
html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  if (code.includes('</script')) throw new Error(src + ' satır içine alınamaz: "</script" içeriyor');
  return '<script>\n' + code + '\n</script>';
});

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*$/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<body[^>]*>\s*/i, '')
    .replace(/<\/body>\s*/i, '');
}

const out = site
  ? path.join(root, 'dist', 'site', 'index.html')
  : path.join(root, 'dist', fragment ? 'map-historia.fragment.html' : 'map-historia.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB)');

// Harita verileri sayfanın yanına kopyalanır
const dataOut = path.join(path.dirname(out), 'data');
fs.mkdirSync(dataOut, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'data')).filter((f) => /^map-.+\.js$/.test(f))) {
  fs.copyFileSync(path.join(root, 'data', f), path.join(dataOut, f));
}
if (site) fs.writeFileSync(path.join(path.dirname(out), '.nojekyll'), '');
