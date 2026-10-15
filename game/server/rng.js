// Casino-grade RNG: CSPRNG seed per round + HMAC-SHA256 DRBG with unbiased integer sampling.
import { randomBytes, createHmac, createHash } from 'node:crypto';

export class RoundRng {
  constructor(seed = randomBytes(32)) { this.seed = Buffer.from(seed); this.counter = 0; this.buf = Buffer.alloc(0); this.pos = 0; }
  seedHash() { return createHash('sha256').update(this.seed).digest('hex'); }
  seedHex() { return this.seed.toString('hex'); }
  _u32() {
    if (this.pos + 4 > this.buf.length) { this.buf = createHmac('sha256', this.seed).update(String(this.counter++)).digest(); this.pos = 0; }
    const v = this.buf.readUInt32BE(this.pos); this.pos += 4; return v;
  }
  int(max) {                      // uniform in [0,max) with rejection sampling (no modulo bias)
    if (!Number.isInteger(max) || max <= 0) throw new Error('bad max');
    const lim = Math.floor(0x100000000 / max) * max;
    let v; do { v = this._u32(); } while (v >= lim);
    return v % max;
  }
  float() { return this._u32() / 0x100000000; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}
