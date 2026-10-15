#!/usr/bin/env python3
"""Exact RTP enumeration for 'Lucky Clover Classic' (3 reels x 32 stops, 1 centre line).
Run: python3 classic_clover.py   -> RTP 0.93878 (base game), hit frequency 0.3341
The progressive 'Town Jackpot' (1% of every wager across all machines) is added on top => ~94.9% total.
"""
SYMS = ["C7", "STAR", "BELL", "HORSESHOE", "LEMON", "CHERRY", "BLANK"]
# stop counts per symbol, per reel (each row sums to 32)
REELS = [
    [1, 2, 3, 5, 5, 8, 8],
    [1, 2, 3, 5, 5, 7, 9],
    [1, 2, 3, 5, 5, 6, 10],
]
PAY3 = [250, 100, 40, 20, 10, 7]   # 3 of a kind, per symbol index 0..5 (x bet)
MIXED_FRUIT = 3                    # any 3 of HORSESHOE/LEMON/CHERRY (not all equal)
CHERRY_2 = 5                       # CHERRY on reels 1+2
CHERRY_1 = 1                       # CHERRY on reel 1 (money back)

def strip(counts):
    s = [i for i, c in enumerate(counts) for _ in range(c)]
    assert len(s) == 32
    return s

def payout(a, b, c):
    if a == b == c and a < 6:
        return PAY3[a]
    if a in (3, 4, 5) and b in (3, 4, 5) and c in (3, 4, 5):
        return MIXED_FRUIT
    if a == 5 and b == 5:
        return CHERRY_2
    if a == 5:
        return CHERRY_1
    return 0

if __name__ == "__main__":
    S = [strip(r) for r in REELS]
    tot = hits = 0
    for a in S[0]:
        for b in S[1]:
            for c in S[2]:
                w = payout(a, b, c)
                tot += w
                hits += w > 0
    n = 32 ** 3
    print(f"RTP={tot / n:.5f} hit_freq={hits / n:.4f}")
