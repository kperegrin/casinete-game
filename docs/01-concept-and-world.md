# 01 — Concept & World

## 1. Game title ideas

| Title | Why |
|---|---|
| **Casinete** *(working title, recommended)* | Portmanteau of *casinha/casita* (little house) and *casino*; short, memorable, signals both pillars. Tagline: *"Little homes. Big nights."* |
| Marigold Bay | Setting-first name; friendly, searchable, easy to brand. |
| Open Door | Emphasises visiting and hospitality. |
| Neighborly | Cozy, community-first. |
| Doorstep City | Housing + social city. |
| Home Stretch | Pun on horse racing + homes. |

All names should be trademark-searched before commitment.

## 2. Game pitch

*Casinete* is a cozy, stylized 3D social world for you and your friends: one player hosts a session and everyone else joins over LAN or a direct connection to live in **Marigold Bay**, a compact sunny seaside city of neighborhoods, boardwalks, a neon entertainment quarter and a glittering casino mile. You pick a home — from a tiny starter studio to a hilltop mansion — and make it entirely yours with a deep, friendly building system: draw walls, lay floors, hang doors and windows, build stairs, light every corner and fill each room with hundreds of collectible, interactive furniture pieces, then build it together with trusted friends in real time. Explore, shop, dress up a charming one-of-a-kind character, hang out in homes and plazas, and take your winnings (in purely fictional Coins) to the roulette wheel, card tables, slots and the horse track. Everything you own, build and become is saved in your world.

## 3. Core gameplay loop

```
            ┌───────────────────────── SOCIAL PULL ─────────────────────────┐
            │  visit friends' homes · parties · events · plaza · tables      │
            ▼                                                                │
  EARN  ─────────►  SPEND  ─────────►  EXPRESS  ─────────►  SHOW  ──────────┘
  jobs, daily       shops, upgrades,    build/decorate,      invite, house
  rewards, explore, property, casino    dress up, collect    directory, likes,
  minigames, casino (sink + fun)        sets                 prestige, photos
            ▲                                                   │
            └──────────── rewards, XP, unlocks, achievements ◄──┘
```

- **Minute-to-minute (1–5 min):** walk, chat, emote, enter shops/homes, do a mini-activity, place a few items.
- **Session loop (30–120 min):** earn Coins (activities/daily/casino) → buy a furniture set or outfit → redecorate a room → show friends → gain XP/prestige → unlock something new.
- **Long loop (weeks):** upgrade/own multiple properties, complete collections, climb Builder/Social/Explorer tracks, rare collectibles, seasonal events, a showcase mansion.

Design rule: **creative output is the "end game"**, not a number. Currency exists to give choices, not to gate creativity.

## 4. Design pillars

1. **Home is the heart.** Housing/building gets the deepest systems, best UX and the most production time. Any feature competes against "does this make homes better or more social?"
2. **Together by default.** Every system works with other people present: shared building, shared tables, shared seats, shared music, shared events.
3. **Easy to start, deep to master.** Place a sofa in 5 seconds; build a two-story villa with wired lights and modular kitchens in an evening. Progressive disclosure, never mandatory complexity.
4. **Fair and calm economy.** No pay-to-win, no real-money anything, no FOMO traps, soft failure states (nothing is ever repossessed or lost for being away).
5. **Charming and readable.** Chunky stylized visuals, strong silhouettes, clear interaction cues; runs well on modest PCs.
6. **Trust the Host, verify the Client.** Host validates all state changes; the architecture makes cheating impractical for clients and makes a dedicated server a later build target, not a rewrite.

## 5. Target player experience

- **Who:** friend groups (2–12 people on a LAN/party night), creative decorators, social hang-out players, casual card/roulette players, collectors. Ages: teen+ (simulated gambling content → age-rating implications; see risks).
- **First 10 minutes:** create a character (≤2 min, can skip with randomize) → spawn at Fountain Square → friendly agent NPC walks you to your free starter studio → place your first furniture → buy a lamp with starting Coins → friends appear by name above heads and you wave.
- **First hour:** visit a friend's place and sit on their sofa together, try on clothes, win/lose a few chips at a roulette table with friends watching, earn a daily reward, redecorate.
- **Feelings to evoke:** cozy, proud, curious, playful, "come see what I made".
- **Anti-feelings:** grinding, scarcity anxiety, being griefed, losing work, feeling pressured to gamble.
- **Session shape:** drop-in/drop-out friendly — a Host can leave and the world saves; players return later and everything is as left.
- **Accessibility:** remappable keys, controller support, color-blind-safe rarity/UI, text scaling, reduce-motion, subtitles/visual cues for audio, adjustable chat size, one-handed build shortcuts.

## 6. World design

### 6.1 Scale and structure

- **Walk-through target:** ~3 minutes end-to-end at walk speed (5 m/s), ~2 min sprinting (8 m/s); ≈ **900 m × 700 m** land area. Populated by NPC crowds so 4 players still feel like a city; dense enough that every 30–45 seconds you pass something to do.
- **Fast travel:** **Bay Tram** (5 stops: Sunny Row, Fountain Square, Market Street, Lucky Mile/Neon Quarter, Pearl Beach), taxi NPC (small Coin fare, money sink), phone "Go home" (free, cooldown), friend teleport (Party/Friends only, with consent).
- **Space types** (important for networking/streaming):
  1. **Open-world cells** — outdoor streets/parks streamed as 64 m × 64 m cells.
  2. **Public interiors** — shops, casino halls, club, arcade; loaded additively, shared by all players inside (one instance each).
  3. **Property interiors** — one **instance per property**, created on demand when someone enters.
  4. **Yards** — part of the open world, within lot bounds (limited object cap, rendered to ~60 m).

### 6.2 Districts (graph)

```
                      Greenway Park ─── Lakeside Terraces (premium homes)
                           │
 Sunny Row ──── Fountain Square (spawn, Town Hall, tram hub) ──── Downtown (towers, cafés)
 (starter)             │                                              │
                  Market Street ───────────────────────────── Bistro Lane
        (furniture, clothes, hardware, dealership)                    │
                       │                                              │
 Maple Hills ──────────┤                                     Neon Quarter
 (family houses)       │                                 (club, arcade, cinema, karaoke)
                       │                                              │
                 Pearl Beach & Harbor Walk ───── Lucky Mile (Grand Casino, Marigold Downs track)
                       │
              Gilded Crest (luxury hill, villas & mansions; gated, reached by Crest Road)
```

| # | District | Purpose | Key locations / activities | Approx. size |
|---|---|---|---|---|
| 1 | **Sunny Row** *(starter neighborhood)* | Safe onboarding; first home | 24 starter apartments (2 low-rise blocks), 12 small cottages, tutorial agent, community garden, "first outfit" shop | 150×150 m |
| 2 | **Fountain Square** *(public plaza)* | Social hub, spawn | Fountain, event stage, notice board, "House of the Week" screen, Town Hall (property agency + registry), tram hub, street performers | 120×120 m |
| 3 | **Downtown / City Center** | Dense urban living and services | 2 apartment towers × 40 units (lobby + receptionist NPC, elevator to floors), bank/ATM, post office (mail/deliveries), cafés | 160×160 m |
| 4 | **Market Street** *(shopping)* | Shopping & sinks | *Home & Hearth* (furniture), *Threadworks* (casual clothes), *Glow & Gleam* (formal), *Sole Mates* (shoes), *Hat & Spectacle* (hats/glasses), *Greenleaf Nursery* (plants/outdoor), *Plumb & Plank* (walls/floors/doors hardware), *Curio Cabinet* (collectibles), *Wheelhouse* (vehicle dealership, edge) | 220×100 m |
| 5 | **Bistro Lane** *(restaurants/cafés)* | Social seating, buffs | Cafés, diner, rooftop bar; food = temporary emote/animation buffs & mini jobs | 120×80 m |
| 6 | **Neon Quarter** *(entertainment)* | Night social | *The Velvet Lantern* nightclub (DJ stage, dance floor), *Pixel Palace* arcade (2-player cabinets), cinema (curated shared shorts), karaoke, bowling | 160×140 m |
| 7 | **Lucky Mile** *(casino district)* | Fictional-currency gaming | *Grand Marigold Casino* (slots hall, roulette, blackjack, poker room, VIP mezzanine, cashier), **Marigold Downs** horse track (grandstand, paddock, betting windows) | 200×160 m |
| 8 | **Greenway Park** | Calm hangout | Lake, picnic, pavilion for concerts, gardening plots, outdoor chess, fishing dock | 160×120 m |
| 9 | **Pearl Beach & Harbor Walk** | Waterfront | Boardwalk, beach volleyball, pier, fishing, beach bar, 12 beach cottages (premium properties) | 200×80 m |
| 10 | **Maple Hills** *(residential)* | Mid-tier family homes | 30 house lots (cottage → family house) | 180×160 m |
| 11 | **Lakeside Terraces** | Premium homes with views | 16 terrace houses/lofts | 120×100 m |
| 12 | **Gilded Crest** *(luxury)* | Aspirational showcase | 10 large lots: villas and mansions, private gate, vista point | 150×150 m |

**Property supply:** ~170 properties for a typical world (8–16 players): 24 + 12 starter · 80 tower units · 30 Maple · 16 Lakeside · 12 beach · 10 Crest. Plenty of choice, few enough to keep neighborhoods lively. A world setting can enable "city expansion" later (extra lots).

### 6.3 Making the world feel alive but not huge

- **Landmarks & sightlines:** lighthouse (visible from everywhere on the coast), Ferris wheel in Neon Quarter, casino marquee at night, mansion hill on the skyline. Color-coded signage per district; a single main loop road plus short shortcuts.
- **Density tools:** crowd NPCs (deterministic ambient pedestrians that scale *down* as player count rises), street performers, vendors, birds/boats, day-night cycle (1 game day = 40 real minutes), weather (sun/overcast/rain, cosmetic + audio), district events.
- **Reasons to roam:** 100 hidden **Postcards** (collectible), photo spots, fishing, courier jobs, cafés with seasonal menus, daily "Town Board" tasks, district-specific cosmetics.
- **Sit-everywhere:** benches, café chairs, beach loungers, bar stools, park picnic tables are all multi-slot seats → players naturally cluster and talk.
- **Public vs private spaces:** public spaces have lots of seats/activities; homes are the "second world" players want to show off.

### 6.4 Level-design workflow

1. Greybox district in ProBuilder with real scale (1 tile = 1 m, door = 1 m × 2.2 m).
2. Drop tram stops, spawn points, nav (walkable) volumes, interaction anchors (seats, shops, doors), zone volumes (audio, music, AoI cell IDs).
3. Mark **property lots** with a `PropertyLotAuthoring` component (lot ID, tier, shell prefab, yard bounds, door anchor).
4. Bake: nav data (`.navdata` for host-side movement validation), cell manifests (for streaming), occlusion data per cell.
5. Dress and light; art pass uses district palettes (see art direction in file 06).
