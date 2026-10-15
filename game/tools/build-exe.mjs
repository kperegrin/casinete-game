// Builds a single-file executable (Node SEA): node tools/build-exe.mjs [--target win|linux] [--out dist/Casinete.exe]
// Bundles the Host + game client (public/, shared/) into one file. Windows target downloads the matching official node.exe.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { build } from 'esbuild'; import { inject } from 'postject';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const target = arg('target', 'win'); const out = path.resolve(root, arg('out', target === 'win' ? 'dist/Casinete.exe' : 'dist/casinete-linux'));
const work = path.join(root, 'build'); fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(path.dirname(out), { recursive: true });
console.log('1/5 bundling server…');
await build({ entryPoints: [path.join(root, 'server/standalone.js')], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: path.join(work, 'standalone.cjs'), external: ['bufferutil', 'utf-8-validate', 'node:sea'], logLevel: 'warning', legalComments: 'none' });
console.log('2/5 collecting game assets…');
const assets = {}; const walk = (dir, prefix) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p, prefix + f.name + '/'); else assets[prefix + f.name] = p; } };
walk(path.join(root, 'public'), 'public/'); walk(path.join(root, 'shared'), 'shared/');
fs.writeFileSync(path.join(work, 'sea-config.json'), JSON.stringify({ main: path.join(work, 'standalone.cjs'), output: path.join(work, 'sea-prep.blob'), disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 1));
console.log(`   ${Object.keys(assets).length} files embedded`);
console.log('3/5 generating SEA blob…'); execFileSync(process.execPath, ['--experimental-sea-config', path.join(work, 'sea-config.json')], { stdio: 'inherit' });
console.log('4/5 preparing base node binary (' + target + ')…');
let base = process.execPath;
if (target === 'win') {
  base = path.join(work, `node-${process.version}-win-x64.exe`);
  if (!fs.existsSync(base)) { const url = `https://nodejs.org/dist/${process.version}/win-x64/node.exe`; console.log('   downloading ' + url); const res = await fetch(url); if (!res.ok) throw new Error('download failed ' + res.status); fs.writeFileSync(base, Buffer.from(await res.arrayBuffer())); }
}
fs.copyFileSync(base, out); fs.chmodSync(out, 0o755);
console.log('5/5 injecting…');
await inject(out, 'NODE_SEA_BLOB', fs.readFileSync(path.join(work, 'sea-prep.blob')), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' });
if (target === 'win') {   // the official node.exe's Authenticode signature is invalid after injection: drop it (an unsigned exe is normal; a broken signature is not)
  const buf = fs.readFileSync(out); const pe = buf.readUInt32LE(0x3c); const opt = pe + 24; const dd = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96) + 4 * 8;
  if (buf.readUInt32LE(dd) || buf.readUInt32LE(dd + 4)) { buf.writeUInt32LE(0, dd); buf.writeUInt32LE(0, dd + 4); buf.writeUInt32LE(0, opt + 64); fs.writeFileSync(out, buf); console.log('   removed invalid code signature'); }
}
console.log(`✔ ${out}  (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
