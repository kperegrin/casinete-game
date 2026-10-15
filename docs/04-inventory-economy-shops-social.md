# 04 — Inventory, Economy, Shops, Social

## 11. Inventory

### 11.1 Item model (the anti-duplication backbone)

Two kinds of item records, one invariant:

- **Unique instances** (`ItemInstance`, 64-bit `ItemInstanceId`): rare+ items, collectibles (serial numbers), anything with custom state (storage furniture with contents, dyed items, signed items), and all equipped/placed objects.
- **Fungible stacks** (`StackEntry {DefId, Variant, Count}`): common furniture/decor variants, consumables, materials, event tokens. Placing one *mints* a `PlacedFurniture` instance id from the stack in the same transaction (stack −1); picking it up returns it to the stack if it has no custom state.

**Invariant:** *every item unit exists in exactly one `ItemLocation`:*

```csharp
public enum LocationKind : byte { Inventory, Equipped, Placed, Container, Escrow, Mailbox, ShopStock, Destroyed }
public readonly struct ItemLocation { public LocationKind Kind; public ulong OwnerOrHolderId; public ushort Slot; }
```

All movement goes through `ItemLedger.Apply(Transaction)`, a list of `Move/Mint/Destroy` ops. The ledger checks each op's `expectedFrom` location matches reality *at the moment of commit* (compare-and-swap), so replays, races and duplicate commands cannot clone items.

### 11.2 Inventory structure

- **Backpack (Inventory):** unlimited unique items and stacks, organized by tabs and virtualized lists (thousands of items stay smooth). No weight; a soft **slot-less** design to avoid frustration. Consumables stack to 99; fungible furniture stacks to 9,999.
- **Categories (tabs):** Furniture · Building (walls/floors/openings/stairs/materials) · Decor · Clothing & Cosmetics (sub-tabs by slot) · Consumables · Collectibles · Event · Special/Keys · **Favorites** (virtual tab).
- **Storage:** storage furniture (wardrobe, chest, fridge) has `Capacity` slots. **Move to storage** is a ledger move `Inventory → Container(containerId)`. Containers are owned by their placed furniture (visible to those with `OpenStorage`). **Property Shared Storage** is a special container.
- **Equipped:** cosmetics currently worn (`Equipped` location; swapping is a transactional move).
- **Mailbox/Delivery box:** overflow (rare), gifts, returned collaborator items, event rewards.
- **Place directly from inventory:** in Build Mode, click an inventory/catalog item to get a ghost; placing consumes one unit atomically with the placement. Right-click → "Place in current room".

### 11.3 UI features

| Feature | Behavior |
|---|---|
| **Search** | Instant text search over name/tags/set (debounced local index), plus tag chips (e.g., `#retro`, `#outdoor`). |
| **Sorting** | Newest, Name, Rarity, Value, Category, Set, Color (hue), Quantity, Favorites first. |
| **Filters** | Rarity, color family, style/set, "placeable here", tradable, owned-count. |
| **Favorites** | Star toggles (stored per player); a Favorites tab and a build-mode quick bar (10 hotbar slots, numeric hotkeys). |
| **Preview** | 3D turntable viewer with dimensions (tiles), interaction list, color variants preview, "Try on" for cosmetics (applies to your avatar preview), "Where to buy". |
| **Quantity/stacking** | Count badge; shift-click drag to split; `Ctrl+click` to multi-select; "Place N" for rows/series (e.g., line of 8 fence posts). |
| **Compare** | Select 2 items (cosmetics/furniture) to compare stats/tags. |
| **Collections** | Items belonging to sets show a set icon; "Collection album" links. |
| **Item info** | Rarity, tags, set, **serial #** (collectibles), original owner (for rare), acquired date, tradability, sell value. |

### 11.4 Rarity

`Common (white) · Uncommon (green) · Rare (blue) · Epic (purple) · Legendary (gold) · Collectible (rainbow-foil frame)`. Rarity controls price tier, supply (shop stock rules), and visuals. Colorblind-safe: each rarity has a shape/ornament in the frame, not just color.

### 11.5 Inventory save format

- Stored per player in the world DB:
  - `item_instance(id, def_id, owner_player_id, loc_kind, loc_holder_id, loc_slot, state_blob, serial, acquired_at, flags)` — unique items.
  - `item_stack(owner_player_id, def_id, variant, count)` — fungible.
  - `favorite(player_id, def_id)`; `mailbox` rows use `loc_kind=Mailbox`.
- Placed items are rows in the **property layout** blob (they keep their `ItemInstanceId` or minted ids) and are mirrored by `loc_kind=Placed` index rows (so the invariant is checkable by SQL).
- Writes: aggregate-dirty; critical operations flush immediately (see Saving).
- The client UI model (`InventoryViewModel`) is a **read-only projection** of events: `ItemsGranted/Removed/Moved/Changed`, with periodic checksum (`inventoryHash`) to detect drift → request resync.

---

## 12. Economy

### 12.1 Currencies

| Currency | Name | How obtained | Uses | Transferable? |
|---|---|---|---|---|
| Main | **Coins** (🪙) | Activities, jobs, daily rewards, selling back, achievements, casino wins | All shop purchases, property, upkeep, services, casino bets | Yes (trade/gift, with daily soft cap and 5% tax above 10,000) |
| Rare | **Stars** (★) | Achievements, level milestones, weekly challenges, events, collection completion — **earned only, never sold** | Special cosmetics/furniture, cosmetic salon extras, rename tokens, rare dyes | **No** |
| Casino-only | **Fun Chips** | Free at home game tables | Social home games only (no economy link) | n/a |

Rules: no real-money purchase of anything, no cash-out, no randomized paid packs, **Stars can't be bet** (prevents laundering rare-currency into Coins), casino bets use Coins only.

### 12.2 Targets and pacing

Design target: **~1,000–1,500 Coins per active hour** (blended), with 25–30% of play time earning nothing deliberately (socializing, decorating) — the economy rewards *playing the game you enjoy*, not a grind route.

| Milestone | Time (approx.) |
|---|---|
| Starter package: 5,000 Coins + free Studio + starter outfit | minute 0 |
| First cozy furniture set (≈ 2,000 Coins) | ~1 hr |
| Upgrade from Studio to Cottage (25k) | ~10–15 hrs |
| Family House (90k) | ~50–70 hrs |
| Villa (450k) | ~200+ hrs (more with partners/co-owners; shared building speeds payoff) |
| Mansion (1.5M) | aspirational; long-term goal |

**Coin gifting & co-ownership** let friend groups pool toward big homes — creating cooperation as an economic loop.

### 12.3 Faucets (sources)

| Source | Amount | Safeguards |
|---|---|---|
| **Starter package** | 5,000 once | per `PlayerId` |
| **Daily reward** | 300 → 1,000 on a 7-day gentle streak (missing a day loses 1 streak step, not all) + 3 daily tasks (150–400 each, always includes non-casino options) | once per in-world day boundary (host-timezone setting), cannot be exploited by clock change on clients (Host time) |
| **Jobs/activities** (all optional minigames, 2–5 min each) | 150–600 per run | per-activity **diminishing returns:** 100% for first 8 runs/day, 40% next 8, 10% after |
| • Café barista (timing/order minigame) | ~200–350 | tips scale with accuracy |
| • Courier (deliver parcels around town; also delivers player mail) | ~250–450 | route variety, cooldown |
| • Gardener (park plots) | ~150–300 | |
| • Fisher (pier/beach) | ~100–600 + collectible fish | rarity table, host RNG |
| • DJ (nightclub rhythm set; others dance for tips) | ~300–600 | requires audience of ≥2 for max |
| • Photographer (complete photo requests) | ~300–500 | |
| **Exploration** | 25–150 per Postcard; district discovery 300–1,000 | one-time |
| **Achievements** | 100–5,000 Coins, plus Stars on tiers | one-time each |
| **House "tips"** | visitors lingering ≥ 2 min grant owner 10 Coins (max 200/day, unique visitors only) | prevents alt-farming; needs real playtime |
| **Casino** | negative EV on average (house edge) | see 15 — it's a sink *and* a fun lottery |
| **Selling back** | 40% of base shop price for common; collectibles 60% (fixed, stable) | prevents buy-sell arbitrage |
| **Events** | event tokens → exclusive shop | scheduled by Host |

Money created by minigames comes from the **system** (faucet). Player-to-player trades only move money.

### 12.4 Sinks (inflation control)

| Sink | Notes |
|---|---|
| **Shop purchases** | Furniture, clothing, decor, vehicles: primary sink; rotating "Daily Deals" (15–25% off a featured set) shift spend, **limited-stock "Collectible" items** with fixed supply per season |
| **Property purchase & upgrades** | Big one-time sinks |
| **Upkeep** | Per 5 online hours; scales with property tier (see 9.2) |
| **Casino house edge** | Roulette 2.70%, blackjack ~0.5–0.8%, slots 5–6%, horses 15% takeout, poker rake (≈2–3%, capped) |
| **Services** | Salon (50–500), cosmetic dye (premium), rename (500 + escalating), name tags, taxi fares (10–50), vehicle fuel/parking/colors, photo prints |
| **Transaction taxes** | Trade tax 5% on Coin portion above 10,000; property transfer 2%; blueprint "architect fee" 5% of bill of materials when buying via shortcut |
| **Consumables** | Food/drink buffs (cosmetic), fireworks, confetti cannons, party poppers, dyes |
| **Catalog delivery fee** | Ordering from the phone Catalog: +10% (visiting shops is free) |
| **Item "polish" cosmetics** | Furniture materials/finishes (gold plating etc.) as optional Coin sinks |
| **Moving fee** | Relocating to another property: small fee (500 × tier) — optional |

**Telemetry-driven balancing (host-world):** every world tracks a rolling **Faucet/Sink ratio** (7-day), average wealth per active player and median property tier. If wealth outpaces sinks (e.g. median wallet > 60 hrs of income), the Host's *Economy preset* and dynamic knobs adjust: **Daily Deals** shift toward high-priced items, extra **limited collectible drops** appear, and a **"Grand Opening" sink event** (e.g., Gala night with expensive limited cosmetics) is suggested to the Host. The *Economy Preset* (Relaxed ×1.5 income / Standard / Hardcore ×0.6) is a Host setting at world creation, shown in the world list.

### 12.5 Pricing model

`BasePrice = TierBase(rarity) × SizeFactor × ComplexityFactor`, then artists adjust. Typical:

| Item type | Common | Uncommon | Rare | Epic | Legendary | Collectible |
|---|---|---|---|---|---|---|
| Small decor | 20–80 | 150–400 | 800–2k | 4k–10k | 25k+ | Stars or special |
| Chair/table | 60–250 | 400–1.2k | 2k–6k | 10k–25k | 50k+ | |
| Sofa/bed | 200–600 | 1k–3k | 5k–12k | 20k–60k | 100k+ | |
| Walls/floor material (per tile) | 2–8 | 10–25 | 40–80 | 150+ | — | |
| Clothing | 50–200 | 250–800 | 1.5k–4k | 6k–15k | 30k+ | |

Shop price = base × shop multiplier (cheap shops ×1.0, boutique ×1.2, luxury ×1.5); **sell-back 40%**.

### 12.6 Anti-exploit economy rules

- XP/Coins from *placing/removing furniture* is **never** granted for repeated actions (first-time-definition placement and style score only).
- Buy-sell loops lose 60% by design; limited-stock items sell back at 60% to avoid discouraging collecting.
- Trading: soft daily Coin transfer cap (50k, scaled by player level) and logging; flagged anomalies surface in the Host admin panel.
- Casino: table limits scale with player level; **daily casino loss limit prompt** (opt-in "Cool-off" that locks casino for 24h — see 15.9).

---

## 13. Shops

### 13.1 Shop model

Shops are **data-driven** (`ShopDefinition`): inventory lists, price multipliers, rotation rules, stock, requirements, and locations (NPC + counter). The Host owns pricing and stock; the UI is a client of `ShopQuery/Purchase` commands.

```
ShopDefinition { id, name, npcId, interiorId, currency, priceMultiplier, categories[],
  stockRules[ {itemDefId|tag, stock: Infinite|Limited(n)|Rotating(rule), minLevel, requiresAchievement?, priceOverride?, availableFrom/To} ],
  buyBackRate, openHours?, services[] }
```

### 13.2 Shop types

| Shop | Sells |
|---|---|
| *Home & Hearth* (furniture) | Core furniture lines by room type; sets; seasonal rotation |
| *Plumb & Plank* (hardware) | Walls, floors, trims, doors, windows, stairs, railings, light fixtures |
| *Greenleaf Nursery* | Plants, outdoor, garden |
| *Threadworks / Glow & Gleam / Sole Mates / Hat & Spectacle* | Clothing, formal, shoes, accessories |
| *Salon & Studio* | Hair/face/makeup/tattoo services |
| *Curio Cabinet* | Collectibles, display cases, special/limited items |
| *Wheelhouse* | Vehicles (later): bikes, scooters, golf carts, cars |
| *Town Hall Property Office* | Properties (browse lots map), upgrades, upkeep payment, transfer |
| *Casino Cashier / Pro Shop* | Casino cosmetics, home game tables, VIP decor |
| *Event Kiosks* | Seasonal items for event tokens |
| *Phone Catalog* | Remote ordering (+10% fee) of any "catalog-eligible" items |

### 13.3 Shop UI

```
┌ HOME & HEARTH ───────────────────────────────────── 🪙 12,480  ★ 36 ┐
│ [Search…        ] [Sort ▼ Newest] [Filters ▼]  ☐ Owned  ☐ Affordable │
├───────────────┬────────────────────────────────────────┬──────────────┤
│ Categories    │ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │ PREVIEW      │
│ ▸ Living Room │ │ img│ │ img│ │ img│ │ img│ │ img│       │  (3D turn-   │
│ ▸ Bedroom     │ │Sofa│ │Chai│ │Lamp│ │Rug │ │Shlf│       │   table,     │
│ ▸ Kitchen     │ │🪙340││🪙90 ││🪙60 ││🪙120││🪙210│       │   room view) │
│ ▸ Bathroom    │ │●Com│ │●Unc│ │●Com│ │●Rar│ │●Com│       │ Name · Rarity│
│ ▸ Outdoor     │ └────┘ └────┘ └────┘ └────┘ └────┘       │ Size 2×1 t.  │
│ ▸ Sets        │  ✓ OWNED ×3 badges, "NEW", "−20%"          │ Colors ○○○○  │
│ ▸ Seasonal    │                                            │ Qty [−][1][+]│
│ ▸ Rare        │                                            │ [Try in home]│
│               │                                            │ [  BUY 🪙340]│
└───────────────┴────────────────────────────────────────┴──────────────┘
```

- **Features:** categories, search with tag chips, filters (rarity, color, style, price range, "fits my room size", affordable), **owned indicator** (count), "NEW" and "Daily Deal" tags, **Try in home** (opens a preview ghost in your current property — remote preview of placement with no purchase) and **Try on** for clothing (avatar preview), **set bundles** with total/discount, **purchase confirmation** for ≥ 2,000 Coins or Rare+ ("Buy Velvet Sofa ×1 for 340 Coins? Balance after: 12,140"), **quantity** selector, **undo purchase within 10 s** (refund 100% if not yet moved/placed/equipped).
- **Host-side purchase command:** `Purchase{shopId, entryId, qty, expectedPrice}` — Host re-looks price, stock, level, funds, proximity; transaction: `Debit(Coins)`, `Mint(item)`, `StockDecrement`; `expectedPrice` mismatch → `StalePrice` (UI refreshes) to avoid "price changed under me" surprise.
- **Limited stock** is per-world (Host) and per-player limits (e.g., 1 collectible per player).
- **Property shopping:** map view of lots with price, size, tier, neighbors; a **virtual tour** (visit a model unit or preview empty shell) before buying.
- **Controller-friendly:** grid navigation with shoulder buttons for categories.

---

## 14. Social systems

### 14.1 Presence, names, chat

- **Nameplates:** name tag + optional title; color-coded by relation (friend, party), fade by distance; configurable.
- **Chat channels:** *Local* (25 m, default), *Room/Property* (everyone inside), *Party*, *Whisper* (`/w name`), *World shout* (1 per 30 s, Host can disable), *System*. Message limit 140 chars (character-limited to keep bubble readable), rate limited (5 messages / 10 s).
- **Chat bubbles:** world-space bubbles above heads (fade after 5 s, stack 3, tail color by channel, **emoji/sticker** support), plus a chat log window (resizable, filter tabs, scrollback 500).
- **Quick Chat:** preset phrases wheel (controller-friendly), emoji wheel.
- **Safety:** profanity/hate filter (client display filter + Host block list; **filter on by default**), mute/block, report (stored in Host log), Host kick/ban, "Do not disturb" (no whispers/invites), friends-only chat mode.
- **Voice (future):** proximity voice via platform VOIP; off by default; mute/block integrated.

### 14.2 Emotes and animations

- **Emote wheel** (hold `G`): 8 favorite slots from the library: wave, point, clap, laugh, cry, cheer, shrug, bow, thumbs up, heart, blow kiss, facepalm, think, flex, yawn, sleep, plus **dances (6)** and **sit variants (4)**.
- **Social emotes (two-person):** high five, handshake, hug, group photo pose, dance together — request/accept popup with **explicit consent** (never forced).
- **Sitting/lying:** seats/beds claim slots; **context interaction** key (`E`) prompts. **Dancing:** works anywhere, sync "dance floor" mode on nightclub/home dance floors (beat sync to `serverTime` music).
- Emote state is `emoteId + startTime` in character snapshot so late joiners see the correct loop phase. Unlocks via shops/levels (Social level).

### 14.3 Profiles, friends, parties

- **Player profile card:** name, tag, title, level (Player/Builder/Social), badges (3 pinned), bio (140 chars), pronouns (optional), join date, playtime (optional visibility), favorite item, **house list** (public ones) with tour/ring buttons, collection completion %. Privacy toggles.
- **Inspect:** right-click/long-press any player → *Profile · Add friend · Invite to house/party · Trade · Gift · Emote with · Whisper · Mute · Report*; **outfit inspection** shows the worn items with "Where to buy" and **"Try this look"** (applies preview to your own avatar; no purchase until you click).
- **Friends:** request/accept (per world, stored by `PlayerId` in `FriendEdge`), **cross-world friend list** stored client-side (`PlayerId`, last name, last seen address from LAN beacon) for "friends online on this LAN" notifications. Presence shows location (district / "in Alex's house" only if the house is open to the viewer).
- **Party/group:** up to 6; leader controls; shared quick-travel ("Follow party"), **party chat**, party invites to houses/tables/events, **+10% Social XP** and shared daily-task progress; leaving a party never loses anything.
- **House invitations:** from phone/profile: `InviteToHouse` generates an entry token (see 9.3). Invitee gets a pop-up with *Accept & teleport* / *Later*.
- **Guestbook & likes:** visitors can sign a guestbook (once per day), like a property; likes feed **Prestige** and the **House Directory**.

### 14.4 Trading and gifting

- **Trade window:** both players offer items + Coins; each side presses **Lock**; 3 s countdown; both **Confirm**; any change resets locks. Host moves items via **escrow** (`Escrow` location) and settles atomically; either party's disconnect → items return from escrow.
- **Untradable flags:** starter items, Stars, achievement-reward cosmetics (configurable), event-limited ones.
- **Gifting:** wrap an item (Coin wrap fee 0; item gets `Gift` flag with message) → delivered to recipient's mailbox or placed under their "gift tree"; recipient can open anytime. Optional anonymity.
- **Trade safety:** warnings for unbalanced trades (value estimates based on shop price), trade history 30 days, report button.

### 14.5 Public social activities (reasons to meet)

- **Event system (Host-scheduled):** weekly events (Beach Bonfire, Neon Night, Marigold Cup race), world-wide **notice board** shows time and rewards; participants earn Social XP and event tokens.
- **Shared activities:** karaoke, arcade 2-player, pool/darts, bowling, fishing contests, picnic, DJ performances, photo challenges, plaza sing-along.
- **House of the Week** at Fountain Square screen; **Open House** tours; "Furniture Show-and-Tell" evenings.
- **Seats everywhere** (see 6.3) and **ambient NPCs** that react to crowds make gatherings feel full.
