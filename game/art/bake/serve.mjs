// Tiny static server for the bake pages: /art (this folder's parent), /three (node_modules/three), /shared (game rules data).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const game = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const roots = { '/art/': path.join(game, 'art'), '/three/': path.join(game, 'node_modules', 'three'), '/shared/': path.join(game, 'shared'), '/js/': path.join(game, 'public', 'js') };
export function serve() {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]); const pre = Object.keys(roots).find(p => url.startsWith(p));
    if (!pre) { res.statusCode = 404; return res.end(); } const base = roots[pre]; const file = path.normalize(path.join(base, url.slice(pre.length)));
    if (!file.startsWith(base)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (e, d) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream'); res.end(d); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, close: () => srv.close() })));
}
