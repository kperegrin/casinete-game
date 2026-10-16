// Entry point for the single-file executable (Node SEA). Static files are embedded as SEA assets.
import path from 'node:path';
import sea from 'node:sea';
import { runCli } from './index.js';

const assets = (key) => { try { return sea.getRawAsset(key); } catch { return null; } };
const exeDir = path.dirname(process.execPath);
process.title = 'Casinete Host';
console.log('Casinete — starting Host…');
runCli({ assets, defaultDir: path.join(exeDir, 'Casinete-saves'), openBrowser: !process.argv.includes('--no-browser'), pauseOnExit: true });
