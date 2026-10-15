# 05 — Casino Systems

> **Hard rules.** All casino games use **fictional Coins only**. No real-money purchase of Coins or any item, no cash-out, no tradable-for-money economy, no randomized paid packs, **Stars can't be wagered**. The entire casino can be switched off per world (`WorldSettings.CasinoEnabled`) and compiled out (`CASINO_DISABLED`) for age-rating-sensitive builds. All outcomes are Host-authoritative.

## 15.0 Shared casino framework

### 15.1 Layout

**Grand Marigold Casino** (Lucky Mile): ground floor *Slots Hall* (24 machines, 4 themes), *Roulette Salon* (3 tables), *Blackjack Room* (4 tables), *Poker Room* (3 tables: Cozy/Regular/High), *VIP Mezzanine* (higher limits, cosmetics showcase, requires Player Lv 20 + 5,000 Coins buy-in "membership" fee — a sink, one-time), **Cashier** (responsible-play tools, session summary, casino cosmetics shop). **Marigold Downs** (horse track) is adjacent with grandstand seats, paddock viewing, betting windows (same UI as phone/stand terminals).

### 15.2 Common table architecture

All table games implement one interface so seats, timers, escrow, spectators, logging and networking are shared.

```csharp
public interface ITableGame {
    GameType Type { get; }
    int MaxSeats { get; }
    void OnSeatJoined(int seat, PlayerId p);
    void OnSeatLeft(int seat, LeaveReason why);           // handles auto-fold/stand rules
    CommandResult OnAction(int seat, in TableAction a);   // validated against state machine + whose turn
    void Tick(double serverTime);                         // timers, phase transitions
    TableSnapshot BuildSnapshot(PlayerId? viewer);        // viewer-specific (hole cards!)
    IEnumerable<Event> DrainEvents();
}
public sealed class CasinoTable {            // generic shell
    public TableId Id; public GameType Type; public TableLimits Limits;   // min/max bet, buy-in, blinds, rake
    public Seat[] Seats; public HashSet<PlayerId> Spectators;
    public ITableGame Game; public RoundHistory History;                  // ring buffer: last 100 rounds (seed hash, results)
    public ZoneId InterestZone;
}
```

- **Seats vs spectators:** anyone in the table's interest zone *spectates* (sees chips, cards face-up, results, animations); sitting requires `SeatClaim` (atomic) and, for escrow games (poker), a buy-in.
- **Wallet interaction:** Roulette/slots/blackjack/horses debit the wallet at bet time (`Ledger.Debit(player, Coins, stake, reason=Bet, roundId)`) and credit on settlement; poker moves chips to a **table stack in escrow** (`Escrow(tableId, seat)`); leaving returns the stack to the wallet in one transaction.
- **Round determinism:** each round gets `roundSeed = CSPRNG(32 bytes)`; all random draws come from `RoundRng = HMAC-SHA256(roundSeed, counter)` with unbiased rejection sampling. This (a) makes every round **replayable in tests**, (b) enables the optional **Fair Play Receipt** (publish `SHA256(roundSeed)` before, reveal after).
- **Timers:** transmitted as absolute `endsAtServerTime`.
- **Disconnect handling:** see per game; always conservative (no forced loss beyond what a normal timeout would cause, no exploit by disconnecting).
- **Audit:** every settlement writes a `CasinoSettle` journal entry `{roundId, tableId, playerId, staked, returned}`; daily conservation checks.
- **Responsible-play features (built in, default on):** per-player daily **net loss reminder** (at 20,000 Coins or 25% of wallet, whichever is higher), session timer on cashier screen, **Cool-off**: self-lock casino for 24 h/7 d (Host cannot override for the player), table limits scale with Player Level (min bet rises slowly), no "chase" mechanics, no near-miss manipulation (slot results are simply the Host's RNG outcome; reel stops aren't weighted to display near misses), no auto-rebuy.

---

## 15.A European Roulette

### Rules
Single zero wheel (37 pockets, **0–36**). House edge **2.7027%** on all bets (1/37). Optional Host toggle **La Partage** (half back on even-money bets when 0 hits; edge 1.35%).

**Wheel order (clockwise):** `0 32 15 19 4 21 2 25 17 34 6 27 13 36 11 30 8 23 10 5 24 16 33 1 20 14 31 9 22 18 29 7 28 12 35 3 26`
**Reds:** `1 3 5 7 9 12 14 16 18 19 21 23 25 27 30 32 34 36` — black = other 1–36; 0 green.

### Bets and payouts (profit : 1)
| Bet | Covers | Pays |
|---|---|---|
| Straight | 1 number | 35:1 |
| Split | 2 adjacent (incl. 0 with 1/2/3) | 17:1 |
| Street | row of 3 | 11:1 |
| Trio | 0-1-2 or 0-2-3 | 11:1 |
| Corner | 4 numbers square | 8:1 |
| First Four | 0-1-2-3 | 8:1 |
| Six Line | 2 rows | 5:1 |
| Column | 12 | 2:1 |
| Dozen | 1–12/13–24/25–36 | 2:1 |
| Red/Black, Odd/Even, Low (1–18)/High (19–36) | 18 | 1:1 |
| (Later) Voisins/Orphelins/Tiers | racetrack called bets = bundles of the above | |

**Universal formula:** a bet covering `n` pockets returns `stake × 36 / n` total (including the stake) — exact integer math since `n ∈ {1,2,3,4,6,12,18}` divides 36.

### Bet validation (anti-cheat)
Clients never send a number list. They send a **`BetSpotId`** (index into a precomputed table of legal bets at startup). The Host holds `legalMasks[spotId] → 37-bit mask`. Limits (Cozy tier defaults): min bet 10 per spot; straight-up max 2,500 per number; outside bets max 20,000 per spot; 50,000 total per player per round (limits scale by table tier). Max payout per round per player capped at 1,000,000 Coins.

```csharp
static readonly BetSpot[] Spots = BuildSpots();           // straight, split, street, trio, corner, firstFour, sixLine, column, dozen, even-money
long Payout(in PlacedBet b, int result) => ((b.Mask >> result) & 1UL) != 0 ? b.Stake * 36 / b.Count : 0;  // returned incl. stake
int  Spin(RoundRng rng) => rng.NextInt(0, 37);            // unbiased
```

### Round flow (state machine)
`Idle → Betting (25 s) → NoMoreBets (2 s) → Spin (≈ 8 s) → Settle (4 s) → ResultDisplay (4 s) → Betting…`
- If **no one has bet**, the table idles until the first bet (no empty spinning) — or runs "attract mode" spins at low frequency to keep the casino lively (cosmetic only, no settlement).
- `Betting`: players place/remove chips, **Rebet / Double / Undo last / Clear**. Debited immediately; removing returns to wallet (until `NoMoreBets`).
- `Spin`: at the start of `Spin`, Host draws the result **before** animation. The `SpinStarted` event includes `{result, wheelStartAngle, ballStartAngle, durationMs, animSeed}`. Clients animate a deterministic ball path that **lands exactly on the result pocket** (animation is cosmetic and *pre-decided*; late joiners see the remaining animation or skip to results). 
- `Settle`: Host computes payouts for all bets, credits wallets in one transaction per player, emits `RoundSettled{result, perPlayerDelta}`.
- **History board:** last 20 numbers, hot/cold stats (cosmetic, purely informational), color tags.

### UI
- Top-down table view (or seated first-person) with a **layout grid**: click spots; **chip tray** (10, 50, 100, 500, 1k, 5k) — chip color/denomination art; **drag chips** or click-to-add (right-click removes); **called-bet buttons**; bet total/balance panel; round timer ring; spin animation with camera ease to wheel; winning number highlighted and **winning chips pulse**; **everyone's chips visible, colored by player**; spectators see the same; keyboard: `1–6` chip select, `Space` confirm/rebet, `Z` undo.
- Controller: cursor snaps between layout cells; shoulder buttons cycle chips.
- Sounds: chip clacks, wheel spin loop, ball clatter, win fanfare scaled by payout.

### Multiplayer
- Up to **8 seated** (sit-by-wheel) + **24 standing bettors** within range. Table broadcasts `BetPlaced{player, spot, amount}` (so others see chips), `BetRemoved`, `PhaseChanged`, `SpinStarted`, `RoundSettled`.
- Fully server-authoritative; clients send `PlaceBet{tableId, spotId, amount, chipsetHint}`, `ClearBets`, `Rebet`, `Double`.

---

## 15.B Slot machines

### Architecture
Data-driven `SlotMachineDefinition` → `SlotEngine` (pure C#, Sim) → views. A spin is **one Host transaction**: debit → RNG → evaluate → credit → events. Clients animate pre-decided results; no outcome logic on clients.

```csharp
public sealed class SlotMachineDefinition {
  public string Id; public string Theme;
  public int Reels, Rows; public ReelStrip[] Strips;            // weighted or explicit sequence
  public WinModel Model;                                        // PayLines | Ways243 | Cluster
  public PayLine[] Lines; public Paytable Pays;                 // symbol → pays by count
  public SymbolDef[] Symbols;                                   // Wild, Scatter, Bonus, High/Low
  public int[] BetLevels; public FeatureDef[] Features;         // FreeSpins, PickBonus, HoldAndSpin ...
  public JackpotDef Jackpot;                                    // contribution %, seed, eligibility
  public double TargetRtp;                                      // certified by Casinete.Tools.SlotSim
}
```

**Spin protocol:** `Spin{machineId, betLevel}` → Host verifies seated/at machine, funds, **no spin in progress**, level allowed → `SpinResult{stops[], winLines[], symbolsGrid, totalWin, featureTriggered, jackpotHit, newBalance}`. Reel animation: staggered stop (reel 1…N, 0.25–0.4 s between), "Quick Stop" cosmetic only; win line highlights; rollup counter.

**Persistent features:** a triggered bonus (e.g., 12 free spins) is stored in `PlayerRecord.PendingFeature` so disconnects can't void it; resumes automatically on return (cannot be abandoned for advantage — spins are pre-bought).

**Jackpot:** *Town Jackpot* — 1% of every wager across all machines feeds a world-wide progressive pool (seeded at 50,000; displayed on a marquee in the casino and at Fountain Square). Eligible at max bet only; paid in Coins. Because the pool is funded from wagers, its RTP contribution equals the contribution rate.

**Certification rule:** every machine definition must be run through `SlotSim` (≥ 10⁹ spins) in CI; build fails if total RTP is outside **[93%, 96%]** or hit rate/volatility fall outside the declared band.

### Machine lineup (launch)

| # | Machine | Type | Verified math |
|---|---|---|---|
| 1 | **Lucky Clover Classic** | 3 reels × 1 line, low volatility | Exact enumeration: **base RTP 93.88%**, hit rate 33.4%; +1% jackpot ≈ **94.9%** |
| 2 | **Boardwalk Bonanza** | 5×3, 20 fixed lines, wilds, scatter free spins ×2 | Monte-Carlo on the *actual shipped reel strips* (`game/tools/slotsim.js`, 6M spins): **total RTP ≈ 95.2%**, any-win rate ≈ 67%, bonus 1 in ~23 spins; high volatility. (Strip *order* matters for scatter statistics, so certification must use the real strips.) |
| 3 | **Neon Nights** *(post-launch)* | 5×3, 243 ways, "Hold & Spin" neon-orb bonus linked to Town Jackpot | to be tuned with `SlotSim` (design: orbs 1×–50× bet, 3 respins reset, grand fill = jackpot) |
| 4 | **Treasure of the Deep** *(post-launch)* | 6×5 cluster pays with cascades and growing multiplier | tune with `SlotSim` |

*(Reproduce: `cd game && npm run slotsim`. The early Python scripts in `tools/slot-sim/` used clumped reel strips and are kept only as the first exploration; `classic_clover.py` is still exact for the classic machine.)*

#### Lucky Clover Classic — reels and pay table
Each reel is a 32-stop strip. Stops per symbol `[Clover, Star, Bell, Horseshoe, Lemon, Cherry, Blank]`:

| Reel | C | ★ | 🔔 | 🧲 | 🍋 | 🍒 | ⬜ |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 2 | 3 | 5 | 5 | 8 | 8 |
| 2 | 1 | 2 | 3 | 5 | 5 | 7 | 9 |
| 3 | 1 | 2 | 3 | 5 | 5 | 6 | 10 |

| Combination (centre line) | Pays (× bet) |
|---|---|
| ☘☘☘ | 250 *(at max bet also triggers Town Jackpot)* |
| ★★★ | 100 |
| 🔔🔔🔔 | 40 |
| 🧲🧲🧲 | 20 |
| 🍋🍋🍋 | 10 |
| 🍒🍒🍒 | 7 |
| Any mix of 🧲/🍋/🍒 (3 symbols) | 3 |
| 🍒🍒 on reels 1–2 | 5 |
| 🍒 on reel 1 | 1 (money back) |

Bets: 10 / 25 / 50 / 100 / 250 Coins. Jackpot eligibility: 250.

#### Boardwalk Bonanza — structure
- Symbols: **Wild** (substitutes all but Scatter), **Scatter shell** (pays anywhere, triggers feature), Lighthouse, Sailboat, Pelican, Ice cream, Starfish, Pebble.
- 5 reels × 50 stops, symbols spread evenly around each strip (weights per reel in `game/server/casino/slots.js`; 3 scatters per reel), 20 fixed lines (left-to-right), line bet 1–25 (total bet = 20 × line bet).
- Pays (× line bet for 3/4/5): Lighthouse 12/48/240, Sailboat 7/24/120, Pelican 5/14/72, Ice cream 4/10/48, Starfish 2/7/36, Pebble 1/5/24, Wild 12/60/300.
- Scatter: 3/4/5 pay 2/5/20 × **total** bet; award **8/12/20 free spins** with **×2** line wins (no retrigger in v1).
- Reel stop animation with anticipation only when *the result is actually decided that way* (no fake near-miss manipulation).

#### Neon Nights bonus (design)
Orbs land on a 5×3 grid with values 1–50× total bet (weights decay); ≥6 orbs trigger **Hold & Spin**: orbs lock, 3 respins reset on each new orb; filling all 15 positions awards the Town Jackpot; sum of orb values paid at end. Weights set by SlotSim to hit target RTP.

---

## 15.C Blackjack

### Rules (house rules, Host-configurable defaults)
6 decks; dealer **stands on all 17s**; **blackjack pays 3:2**; dealer **peeks** for blackjack (with 10/Ace up); **double on any two cards**, **double after split (DAS)**; **split any pairs** (resplit up to 4 hands; **split aces get one card each, no resplit aces, 21 after split is not blackjack**); **insurance** 2:1 (when dealer shows Ace); **no surrender**; 1–5 seats (**up to 5** per table). House edge with basic strategy ≈ **0.5%**. Shoe reshuffle when the **cut card** (≈ 75% penetration) is reached, at the end of the round.

### Card handling
- Cards are ints 0–311 (`deck = id / 52`, `card = id % 52`); shoe is a `List<int>` shuffled by **Fisher–Yates** using unbiased `RoundRng` (new `shoeSeed` per shuffle; hash receipt available). `cutIndex = 234 ± 12` (random).
- **Dealer hole card** is never sent to clients until the reveal; clients get a "card back" token. Seats' own hand values are computed on the Host; clients display values but never decide anything.

### State machine
`WaitingForBets → Betting (15 s) → InitialDeal → [InsuranceOffer (8 s)] → [DealerPeek] → PlayerTurns (seat order; 15 s per decision) → DealerTurn → Settlement → Cleanup`

- **Actions:** `Hit`, `Stand`, `Double`, `Split`, `Insurance(yes/no)`; legality computed from hand state (`CanDouble: 2 cards`, `CanSplit: pair of equal rank-value & hands < 4 & funds`, etc.).
- **Timeout:** auto-**Stand** (and auto-decline insurance). Disconnected players are auto-stood; their bet stands and settles normally (so leaving mid-hand can't dodge a loss, and can't win a double with a client that cannot respond).
- **Betting:** wallet debit at bet; Double/Split debit an extra equal stake at action time (rejected if funds insufficient).
- **Settlement (per hand, stake S):** blackjack (non-split, 2 cards, dealer no BJ) → return **2.5S**; win → 2S; push → S; lose → 0; insurance wins → 3× insurance stake (returns stake + 2:1) if dealer has BJ. Dealer BJ vs player BJ → push.
- **Dealer rules:** reveal hole card, draw until ≥ 17 (stand on soft 17).
- **Multiplayer:** shared table state; others' hands visible; "Hit/Stand" turn indicator; chat/emote reactions (thumbs-up/groan). **Pace:** a hand takes ≈ 25–50 s with 3+ players; rounds start 5 s after the last bet or when timer ends.

### UI
Felt table, dealer NPC, chip stack per seat, action bar `[Hit][Stand][Double][Split]` with **hotkeys** (H/S/D/P), **hand totals** pop-ups (soft/hard), shoe & discard animation, **optional basic-strategy hint** toggle (accessibility/learning; no effect on odds), history of last hands.

---

## 15.D Texas Hold'em Poker

### Format
**No-limit Texas Hold'em cash tables**, **2–6 seats** (6-max; cozy and fits social play; configurable up to 9 later). Fixed blinds per table tier. Dealer NPC deals; physical dealer button; seats hold **table stacks** in escrow.

| Tier | Blinds | Buy-in (min–max) |
|---|---|---|
| Cozy | 10 / 20 | 400 – 2,000 |
| Regular | 50 / 100 | 2,000 – 10,000 |
| High | 250 / 500 | 10,000 – 50,000 |

Rake (sink): **3% of the pot, capped at 3 big blinds, taken only if a flop is dealt** ("no flop, no drop"). Host option: friendly tables with 0% rake (Home game tables use Fun Chips).

### Hand flow
1. Determine dealer button (random for first hand; then clockwise skipping empty). **Heads-up:** button posts the small blind and acts first preflop.
2. Post SB/BB (short stacks post what they have; all-in blinds allowed).
3. Deal 2 hole cards each (**sent only to each owner**; spectators see backs).
4. Betting rounds: **Preflop → Flop (3) → Turn (1) → River (1)** with burn cards.
5. **Showdown:** remaining players reveal in order (last aggressor first); winners can **muck** if uncontested.
6. Pot(s) awarded; button moves; seats with 0 chips stand up or **rebuy** (between hands, within 30 s).

### Actions and legality
`Fold`, `Check`, `Call`, `Bet(x)`, `Raise(to x)`, `All-in`. Min-raise = size of the previous raise (or BB); an **all-in raise smaller than a full raise does not reopen betting** for players who already acted. Bets are validated as `amount ∈ [minRaiseTo, stack]` or all-in. Slider + presets (½ pot, ¾ pot, pot, all-in) in UI.

### Timers & disconnects
- **Action timer 25 s** + **time bank** of 30 s per hand (consumed automatically after 25 s; displayed as a ring + sound cue).
- **Timeout:** `Check` if free, else `Fold`. Two consecutive timeouts → player is **sat out** (cards folded each hand; stack retained).
- **Disconnect:** ghost session (90 s) — auto-fold as above; after sit-out for 10 minutes the stack is returned to the wallet. Reconnecting players resume.

### Side pots (algorithm)
```csharp
public static List<Pot> BuildPots(List<Contribution> c /* seat, amount, folded */) {
    // 1. Return uncalled bet: largest contributor's excess over the second largest goes back to them.
    ReturnUncalled(c);
    // 2. Layer by distinct contribution levels of non-folded players.
    var levels = c.Where(x => !x.Folded && x.Amount > 0).Select(x => x.Amount).Distinct().OrderBy(a => a).ToList();
    var pots = new List<Pot>(); int prev = 0;
    foreach (var L in levels) {
        int amount = c.Sum(x => Math.Min(x.Amount, L) - Math.Min(x.Amount, prev));   // includes folded players' dead money
        var eligible = c.Where(x => !x.Folded && x.Amount >= L).Select(x => x.Seat).ToList();
        pots.Add(new Pot(amount, eligible)); prev = L;
    }
    return pots;      // pots[0] = main, rest = side pots
}
// Award each pot to the best hand(s) among its eligible seats; split evenly; odd chips go to the first winner left of the button.
```
Rake is taken from the **main pot first** (and side pots proportionally if needed), before awarding.

### Hand evaluation
7-card evaluator returns a single comparable integer: `score = category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5`.

```csharp
// card: 0..51, rank = card % 13 (0=2 … 12=A), suit = card / 13
public static int Rank7(ReadOnlySpan<int> cards) {
    Span<int> rc = stackalloc int[13]; Span<int> sc = stackalloc int[4]; Span<int> sr = stackalloc int[4];  // sr: rank bitmask per suit
    int all = 0;
    foreach (var c in cards) { int r = c % 13, s = c / 13; rc[r]++; sc[s]++; sr[s] |= 1 << r; all |= 1 << r; }
    for (int s = 0; s < 4; s++) if (sc[s] >= 5) {                          // flush
        int sf = Straight(sr[s]); if (sf >= 0) return (8 << 20) | (sf << 16);   // straight flush (royal = ace-high)
    }
    // quads, full house, trips, pairs via rank counts (highest first) …
    // category: 8 SF, 7 quads, 6 full house, 5 flush, 4 straight, 3 trips, 2 two pair, 1 pair, 0 high card
    // flush: top 5 ranks from flush suit; straight: Straight(all) (wheel A-2-3-4-5 → high card 3); kickers fill remaining.
}
static int Straight(int mask) { // top rank index of the best straight in a rank bitmask, or -1
    for (int hi = 12; hi >= 4; hi--) if (((mask >> (hi - 4)) & 0x1F) == 0x1F) return hi;
    if ((mask & 0x100F) == 0x100F) return 3;         // wheel: A-2-3-4-5 plays as a 5-high straight
    return -1;
}
```
Evaluator is tested against known hand tables and a brute-force enumerator (all 133,784,560 7-card combos distribution must match published counts).

### UI & multiplayer
- Oval felt table, 6 seats, avatars seated; **hole cards** shown to owner (hover to peek/flip), community cards animated, pot display with side pots, stack counts, dealer button, SB/BB chips, current bet markers, action bar `[Fold][Check/Call X][Bet/Raise ▢──●──▢]` + presets + **auto-actions (check/fold, call any)**, hand-ranking cheat sheet, "show/muck" buttons, **table chat limited to emotes/quick phrases during hands** (anti-ghosting; configurable).
- **Spectators** watch (cards face-down until showdown). **Hand history** panel (last 20 hands per player). **Waiting list**.

---

## 15.E Horse racing — Marigold Downs

### Format
A race **every 3 minutes**, continuously (host world time): `Betting (90 s) → Parade (15 s) → Race (35–45 s) → Results & Payouts (20 s) → next card`. **8 horses** per race from a pool of 24 persistent fictional horses with names, colors, form guides, career record. Horses never die/suffer (pure fiction, playful tone).

### Horse stats & race model
Each horse: `Speed, Stamina, Acceleration, Consistency (0–100)`, `Form` (rolling last 5 results, 0–100), `PreferredDistance` (short/mid/long), `TrackPref` (dry/wet), `Temperament` (cosmetic quirks). Per race: `Distance` (800/1200/1600 m), `Condition` (Fast/Good/Soft).

**Outcome-first, choreography-second** (so displayed odds are honest and the show is tunable):
1. **Strength:** `s_i = exp(k · Rating_i)` where `Rating_i = 0.35·Speed + 0.25·Stamina·f(distance) + 0.15·Accel + 0.15·Form + 0.10·TrackFit − Consistency noise`; `k` sets favorites' strength (target favorite win probability ≈ 20–35%).
2. **Finish order:** Plackett–Luce sampling on `s_i` (repeatedly draw the next-placed horse with probability ∝ `s_i` among the remaining) using `RoundRng`. This gives exact, computable event probabilities.
3. **Probabilities:** `P(win_i)=s_i/Σs`; Place (top-2), Show (top-3), Exacta, Trifecta by exact enumeration of ≤ 336 permutations (cheap).
4. **Odds:** decimal odds `o = max(1.2, round((1 − takeout) / P, 1))`, **takeout 15%** (win/place/show) and 20% (exacta/trifecta), **locked at bet time** (fixed-odds). Displayed as e.g. `4.6×`. Expected return ≈ 85% of stake — a sink.
5. **Choreography:** the Host generates, from `animSeed` and the pre-decided order, a finishing-time table (gaps from 0.02 s photo-finish to 0.6 s clear wins) plus mid-race lead changes via seeded smooth noise constrained so final ranks match; clients render horses along the track spline by evaluating `position_i(t)` from these seeds (identical on all clients, low bandwidth).
6. **Form update:** after each race horse `Form` moves ±(5–12) with regression toward the mean (stops "unbeatable" horses; evolves meta).

### Bets
| Bet | Win condition | Typical odds range |
|---|---|---|
| Win | finishes 1st | 1.3× – 25× |
| Place | top 2 | 1.2× – 8× |
| Show | top 3 | 1.1× – 5× |
| Exacta | 1st & 2nd exactly in order | 8× – 400× |
| Trifecta (later) | top 3 in order | 60× – 3,000× |

Stake 10 – 5,000 per bet; up to 6 bets per race per player. Payout = `floor(stake × lockedOdds)` credited on settlement (stake included in multiplier). Maximum payout per bet 1,000,000.

### UX
- **Betting booth / grandstand terminals / phone app:** race card with horse portraits, silks, stats chips (speed/stamina/form), form guide (last 5 finishes), odds board updating (Host recomputes **odds only before betting opens**; locked thereafter), tip sheet ("Local Expert" NPC suggestions, not guarantees), bet slip with potential return.
- **Parade:** horses walk in paddock (camera tour). **Race:** broadcast camera (side track, helicopter, finish line, chase), live **position tracker bar**, announcer NPC voice lines (data-driven), crowd reactions, photo-finish slow-mo. **Results:** podium, replay, payouts popups, **“Cup Day”** special events (bigger fields, trophies).
- **Social:** grandstand seats (cheer/boo emotes), group **betting pools** (friends combine stakes — Host splits proportionally), horse **fan clubs** (cosmetic badge by horse), "Horse of the Week" trophy decor.
- **Late join:** during Race the client gets `{raceId, animSeed, order revealed? no — the animation parameters}`; it starts at the current `t` (server time) — outcome revealed by the animation itself; skip-to-results button.

---

## 15.F Home game tables (social only)
Casino-themed furniture can be placed in homes: roulette, blackjack, poker, slot cabinet. They use **Fun Chips** (free, unlimited, no leaderboard value) — same engines, `StakeCurrency=FunChips`; no wallet link, no XP beyond minor Social XP. Great for house parties without touching the economy.

## 15.G Data summary (casino)
`CasinoTable`, `RouletteGame`, `BlackjackGame`, `PokerGame`, `HorseRace`, `SlotMachineDefinition` schemas are in file 07 (section 21).

## 15.H Casino testing checklist (summary)
Statistical tests (chi-square on RNG; RTP convergence), rules-edge tests (soft 17, split aces, side pots with 3 all-ins of different sizes, heads-up blinds), property tests (wallet conservation across thousands of random rounds), disconnect/timeout fuzz, latency fuzz on turn timers, exploit attempts (bet after NoMoreBets, double submit, wrong seat actions). Details in file 08.
