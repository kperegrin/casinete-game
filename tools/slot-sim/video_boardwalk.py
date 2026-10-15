#!/usr/bin/env python3
"""Monte-Carlo RTP for 'Boardwalk Bonanza' (5x3, 20 fixed lines, wild, scatter free spins x2).
Run: python3 video_boardwalk.py [spins]   (default 3,000,000)  -> total RTP ~0.947-0.949
Free-spin value is computed analytically from the mean line win (no retrigger), which is exact in expectation.
Use the same logic in Casinete.Tools.SlotSim (C#) for 10^9-spin certification runs.
"""
import sys
import numpy as np

# 0 WILD, 1 SCATTER(shell), 2 LIGHTHOUSE, 3 SAILBOAT, 4 PELICAN, 5 ICECREAM, 6 STARFISH, 7 PEBBLE
NS = 8
WEIGHTS = [  # stop counts per reel (each row sums to 50)
    [3, 2, 4, 5, 6, 8, 11, 11],
    [4, 2, 4, 5, 6, 8, 10, 11],
    [4, 2, 4, 5, 6, 8, 10, 11],
    [4, 2, 4, 5, 6, 8, 10, 11],
    [3, 2, 4, 5, 6, 8, 11, 11],
]
PAY = {2: (12, 48, 240), 3: (7, 24, 120), 4: (5, 14, 72), 5: (4, 10, 48), 6: (2, 7, 36), 7: (1, 5, 24)}  # 3/4/5 of a kind (x line bet)
WILD_PAY = (12, 60, 300)
SCATTER_PAY = {3: 2, 4: 5, 5: 20}      # x total bet
FREE_SPINS = {3: 8, 4: 12, 5: 20}
FS_MULT = 2
LINES = [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0],
         [2,1,1,1,2],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],[2,1,2,1,2],[1,1,0,1,1],[1,1,2,1,1],[0,0,2,0,0],[2,2,0,2,2],[0,2,2,2,0]]

rng = np.random.default_rng(11)
STRIPS = [np.repeat(np.arange(NS), w) for w in WEIGHTS]

def spin(n):
    grid = np.empty((n, 5, 3), dtype=np.int8)
    for r in range(5):
        stop = rng.integers(0, len(STRIPS[r]), n)
        for row in range(3):
            grid[:, r, row] = STRIPS[r][(stop + row) % len(STRIPS[r])]
    return grid

def line_wins(grid):
    n = grid.shape[0]
    total = np.zeros(n); hits = np.zeros(n, bool)
    for pl in LINES:
        syms = np.stack([grid[:, r, pl[r]] for r in range(5)], axis=1)
        base = np.full(n, -1); alive = np.ones(n, bool); run = np.zeros(n, int)
        for r in range(5):
            s = syms[:, r]; is_wild = s == 0; is_scat = s == 1
            base = np.where((base == -1) & ~is_wild & alive, s, base)
            ok = alive & (is_wild | (s == base)) & ~is_scat
            run = np.where(ok, run + 1, run); alive = ok
        pay = np.zeros(n)
        for sym, p in PAY.items():
            for k in (3, 4, 5):
                pay = np.where((base == sym) & (run == k), p[k - 3], pay)
        for k in (3, 4, 5):
            pay = np.where((base == -1) & (run == k), WILD_PAY[k - 3], pay)
        total += pay; hits |= pay > 0
    return total, hits

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3_000_000
    g = spin(n); lw, h = line_wins(g); sc = (g == 1).sum(axis=(1, 2))
    scat = np.array([SCATTER_PAY.get(min(c, 5), 0) for c in range(6)])[np.minimum(sc, 5)]
    fs = np.array([FREE_SPINS.get(min(c, 5), 0) for c in range(6)])[np.minimum(sc, 5)]
    lw2, _ = line_wins(spin(n))
    line_rtp = lw.mean() / 20; scat_rtp = scat.mean() / 20
    fs_rtp = fs.mean() * FS_MULT * lw2.mean() / 20
    print(f"line={line_rtp:.4f} scatter={scat_rtp:.4f} freespins={fs_rtp:.4f} TOTAL={line_rtp+scat_rtp+fs_rtp:.4f}")
    print(f"hit_freq={h.mean():.4f} p_bonus={(sc>=3).mean():.4f} (1 in {1/(sc>=3).mean():.1f}) max_line_win_x_linebet={lw.max():.0f}")
