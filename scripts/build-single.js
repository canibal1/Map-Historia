#!/usr/bin/env node
/*
 * Oyunu tek bir HTML dosyasına paketler (stiller ve betikler satır içine alınır).
 *
 *   node scripts/build-single.js              → dist/map-historia.html (çift tıklayıp açılabilir)
 *   node scripts/build-single.js --fragment   → dist/map-historia.fragment.html
 *                                               (doctype/html/head/body etiketleri olmadan; claude.ai yayını için)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fragment = process.argv.includes('--fragment');
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

const out = path.join(root, 'dist', fragment ? 'map-historia.fragment.html' : 'map-historia.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB)');
