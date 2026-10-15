# 06 — Progression, Saving, UI/UX, NPCs (+ Art & Audio)

## 16. Progression

### 16.1 Principles
- **Never gate tools or creativity.** All building tools, free placement, undo, multi-select, copy/paste are available from minute one. Progression unlocks *content, convenience, prestige and recognition*.
- **Multiple parallel tracks** so every play style advances. **No FOMO**: seasonal items return yearly; nothing essential is time-locked.
- **Anti-farm:** XP is paid for *novelty and quality* (first-time actions, unique visits, style score), with diminishing returns for repetition.

### 16.2 Tracks

| Track | XP from | Unlocks (examples) |
|---|---|---|
| **Player Level** (1–50) | everything (weighted: 30% builder/social/explore/casino/activities blend) | Property tiers (Villa Lv 15, Mansion Lv 25), shop lines, casino VIP (Lv 20), phone features, title slots, Stars at milestones |
| **Builder Level** (1–40) | First-time placing each furniture definition (small), completing rooms (Style Score thresholds), blueprint use/share, visitor likes, upgrades bought | More **Layout Slots**, **Blueprint library size**, wiring tool (**Contraptions Lite**), extra palette/dye colors, lighting budget perks, decor sets, special build tools (curved wall *later*) |
| **Social Level** (1–40) | Time spent *with others* (diminishing past 90 min/day), unique house visits, hosting visitors, parties, events, gifts, emote interactions | Emotes/dances, social furniture (hot tub, photo booth), party size, titles, house-directory boosts |
| **Explorer** (tiers 1–10) | Postcards, district discoveries, fishing log, photo spots, tram stops | Postcard frames, traveler outfits, fast-travel perks, cartographer title |
| **High Roller** (tiers 1–5) | *Playing* casino games (not winnings) with daily caps; attending Cup Day | VIP cosmetics/decor; **no gameplay advantage, no stake perks** |
| **Collector** | Collection albums completed | Album rewards (exclusive items, Stars), showcase furniture |

**XP curve (Player Level):** cumulative XP to reach level *L*: `XP(L) = round(80 · L^1.6)` → L10 ≈ 3,200, L20 ≈ 9,600, L30 ≈ 18,500, L50 ≈ 41,900. Typical earn rate ≈ 350–500 XP/hr → Lv 20 in ~25 hrs, Lv 50 in ~100+ hrs. Builder/Social use `70·L^1.55` etc.

### 16.3 Property Prestige
`Prestige Stars (0–5)` per property from: **Style Score** (variety of definitions, themed matching tags, room fill ratio, lighting, curated displays), size tier, upgrades, and unique visitor likes (log-scaled). Benefits: exterior ornaments (flags, hedges, statues), directory featuring, "House of the Week" eligibility, bragging badge on profile. Prestige can **decrease** if the home goes Dusty (never below 1).

### 16.4 Achievements, titles, badges
- **~120 launch achievements** across: *Home* (place 100 objects, own 2 properties, build a two-story house), *Style* (themed rooms), *Social* (visit 10 homes, host 10 guests, throw a party), *Explore* (find 25/50/100 postcards), *Collect* (complete sets), *Activities* (jobs), *Casino* (win a round at each game, watch 10 races — **never "lose X" or "bet Y" achievements; no spend-based casino goals**), *Secret* achievements.
- **Rewards:** Coins, Stars, cosmetics, titles (displayed under name), badges (3 pinned on profile), furniture.
- Stored as `AchievementProgress {id, progress, unlockedAt, claimed}` per player; evaluated Host-side on `GameEvent`s (event-driven: `FurniturePlaced`, `VisitCompleted`, `RaceWon`…) via a small rule engine (`AchievementRule { event, filter, counter, target }`).

### 16.5 Daily & weekly systems
- **Daily:** login reward (7-step gentle streak), 3 **Town Board tasks** (picked from ≥ 12; always at least one non-casino and one social/build option).
- **Weekly:** one weekly challenge (earns Stars), **Event** (Host-scheduled).
- **Collections:** albums (Retro Arcade, Beach Day, Cozy Cabin, Fish Log, Postcards, Horse Fan Club) with set bonuses.

---

## 17. Saving & persistence

### 17.1 What is saved (and where)

| Data | Location | Notes |
|---|---|---|
| World meta & settings | `world.manifest.json` + `meta` table | seed, name, host, economy preset, content packs, versions |
| Players (name, look, wallet, inventory, progress, stats, friends, settings-in-world) | SQLite rows per `PlayerId` | Host-owned |
| Properties (owner, tier, permissions, upgrades, upkeep) | `property` table | |
| **House layouts** (walls, floors, openings, furniture transforms/rotation/colors, storage contents, wiring) | `property_layout` blob per property (+ item index rows) | Unit of load/unload and recovery |
| Casino persistent state (jackpot pool, horse form/history, pending features) | `casino_*` tables | |
| NPC/world state (clock, weather, shop stock rotations, events) | `world_state` | |
| Journal (economy/item transactions), audit logs, trade logs | `journal`, `audit` | pruned by policy |
| **Client profile** | `profile.json` (+ OS-keystore for key) | identity key, settings, keybinds, recent servers, friends cache, outfit templates |

### 17.2 Format decision

| Option | Pros | Cons |
|---|---|---|
| JSON files | Human-readable | Big, slow, non-atomic, brittle at scale |
| Binary file(s) (MessagePack) | Compact | Hand-rolled atomicity, no querying, harder recovery |
| **SQLite (single DB per world) + MessagePack/LZ4 blobs** | ACID transactions, WAL durability, partial writes (only dirty aggregates), SQL for audits/conservation checks, mature tooling, backup API | Native plugin per platform (e_sqlite3), blob schema versioning needed |
| LiteDB | Pure managed | Less ubiquitous tooling; perf/maturity concerns at scale |

**Chosen: SQLite (WAL mode) + versioned binary blobs for large aggregates (layouts).** Small relational rows for queryable stuff (items, wallets, stats); big opaque-but-versioned MessagePack+LZ4 blobs for layouts.

### 17.3 World folder structure

```
Saves/
  <WorldId>/                        (WorldId = GUID)
    world.manifest.json             human-readable: name, host, createdAt, lastPlayed, playtime, saveVersion, contentPacks, thumbnail path, "modified" flag
    world.db                        SQLite (WAL) — all authoritative state
    world.db-wal / -shm             SQLite sidecar files
    thumbnail.jpg
    backups/
      auto/   2026-10-15T14-00-00.cwb (rotating)
      hourly/ …
      daily/  …
      manual/ <name>.cwb
      premigration/ v7-to-v8.cwb
    exports/                        blueprints, passports, photos (optional)
    logs/                           host.log, audit.log (rotated)
```
Backups are SQLite online-backup/`VACUUM INTO` files, zipped as `.cwb` (also the **export/share format** for moving a world between machines).

### 17.4 IDs

| ID | Type | Generation | Scope |
|---|---|---|---|
| `PlayerId` | 128-bit (16 bytes) | first 16 bytes of SHA-256(Ed25519 public key) | global, stable across worlds |
| `WorldId` | GUID | at world creation | global |
| `ItemInstanceId` | 64-bit | per-world monotonic counter (`meta.next_item_id`, advanced inside the same transaction as the mint) | world |
| `PlacedFurnitureId` | 64-bit | same counter family (`next_object_id`) | world |
| `PropertyId` | 32-bit ordinal + 64-bit GUID `PropertyUid` | lots authored in world data have fixed ordinals; `Uid` assigned at first purchase (history/audit-safe) | world |
| `RoomId` | 16-bit per property | stable assignment (see 10.1) | property |
| `TxId` | 64-bit | counter + hash chain | world |
| Definition IDs | stable strings e.g. `core:furn.sofa.cozy_2seat` + 32-bit `DefHash` | authored; **never reused/renamed** (add redirect instead) | content |

### 17.5 Core schema (SQLite)

```sql
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA user_version=<SAVE_SCHEMA_VERSION>;

CREATE TABLE meta(key TEXT PRIMARY KEY, value BLOB);                -- world_id, save_version, content_version, next_item_id, next_object_id, next_tx_id, clock, rng salt
CREATE TABLE player(
  player_id BLOB PRIMARY KEY,                                        -- 16 bytes
  display_name TEXT, name_tag TEXT, pronouns TEXT, bio TEXT,
  appearance BLOB, appearance_hash INTEGER,                          -- CharacterAppearance (MessagePack)
  coins INTEGER NOT NULL CHECK(coins>=0), stars INTEGER NOT NULL CHECK(stars>=0),
  level INTEGER, xp INTEGER, builder_xp INTEGER, social_xp INTEGER, explorer_xp INTEGER,
  stats BLOB, settings BLOB, titles BLOB, badges BLOB, tutorial_state BLOB,
  last_zone INTEGER, last_pos BLOB, first_seen INTEGER, last_seen INTEGER, playtime_s INTEGER,
  daily_state BLOB, pending_feature BLOB, rev INTEGER NOT NULL);
CREATE TABLE item_instance(
  item_id INTEGER PRIMARY KEY, def_hash INTEGER NOT NULL, def_id TEXT NOT NULL,
  owner_player BLOB NOT NULL, loc_kind INTEGER NOT NULL, loc_holder INTEGER NOT NULL, loc_slot INTEGER,
  serial INTEGER, state BLOB, flags INTEGER, acquired_at INTEGER);
CREATE INDEX ix_item_owner_loc ON item_instance(owner_player, loc_kind, loc_holder);
CREATE TABLE item_stack(owner_player BLOB, def_id TEXT, variant INTEGER, count INTEGER CHECK(count>=0), PRIMARY KEY(owner_player, def_id, variant));
CREATE TABLE property(
  property_id INTEGER PRIMARY KEY, uid BLOB, def_id TEXT, owner_player BLOB, name TEXT,
  tier INTEGER, upgrades BLOB, access_mode INTEGER, permissions BLOB, ban_list BLOB, house_rules TEXT,
  upkeep_state BLOB, prestige INTEGER, purchased_at INTEGER, rev INTEGER);
CREATE TABLE property_layout(
  property_id INTEGER, space INTEGER,               -- 0=interior, 1=yard
  format INTEGER NOT NULL, layout_rev INTEGER NOT NULL, hash INTEGER NOT NULL, blob BLOB NOT NULL,
  PRIMARY KEY(property_id, space));
CREATE TABLE property_snapshot(property_id INTEGER, taken_at INTEGER, kind INTEGER, blob BLOB);  -- auto + manual layout snapshots
CREATE TABLE container(container_id INTEGER PRIMARY KEY, property_id INTEGER, placed_id INTEGER, capacity INTEGER);
CREATE TABLE friend_edge(a BLOB, b BLOB, since INTEGER, PRIMARY KEY(a,b));
CREATE TABLE achievement(player_id BLOB, id TEXT, progress INTEGER, unlocked_at INTEGER, claimed INTEGER, PRIMARY KEY(player_id,id));
CREATE TABLE collection_progress(player_id BLOB, collection_id TEXT, owned_mask BLOB, PRIMARY KEY(player_id, collection_id));
CREATE TABLE casino_state(key TEXT PRIMARY KEY, value BLOB);       -- jackpot pool, horse form, daily limits
CREATE TABLE shop_state(shop_id TEXT, entry_id TEXT, stock INTEGER, rotation_seed INTEGER, PRIMARY KEY(shop_id, entry_id));
CREATE TABLE photo(hash INTEGER PRIMARY KEY, jpeg BLOB, taken_by BLOB, taken_at INTEGER);
CREATE TABLE journal(tx_id INTEGER PRIMARY KEY, at INTEGER, player BLOB, kind INTEGER, delta_coins INTEGER, delta_stars INTEGER, detail BLOB, prev_hash INTEGER);
CREATE TABLE audit(at INTEGER, property_id INTEGER, actor BLOB, op INTEGER, detail BLOB);   -- edit audit log (last 500 ops/property kept)
```
Wallet CHECK constraints guarantee non-negative balances even if code regresses.

### 17.6 Layout blob (property_layout)

MessagePack (array-form for compactness) + LZ4. Header `{format, propertyUid, bounds, floors, layoutRev}`. Body: `walls[]`, `floors[]` (run-length encoded by material), `openings[]`, `stairs[]`, `rooms[]` settings, `lights/wires[]`, `objects[]` where each placed object is a **packed struct** (~16–24 bytes):

```
objectId u64 | defHash u32 | x,y,z i16 | yaw u8 | flags u8 (tilt/scale/surface/wall) | colors u8×3 | variant u8 | state u8×2 | ownerIdx u16 | parentIdx u16 (surface) | [tilt/scale/wallAnchor extras]
```
`ownerIdx` indexes a per-layout owner table (PlayerId list) to avoid repeating 16-byte IDs. 3,000 objects ≈ 55 KB raw → **~20 KB** compressed. Hash = xxHash64 of the compressed bytes.

### 17.7 Autosave, manual save, backups

- **Dirty tracking:** each aggregate (`PlayerRecord`, `Property`, `PropertyLayout`, `WorldState`, `CasinoState`) has a `rev` and dirty flag set by the Sim on mutation.
- **Autosave scheduler:** every **60 s** (configurable 30–300 s) a snapshot of dirty aggregates is serialized **on a worker thread** (copy-on-write snapshots; no frame hitch) and written in **one SQLite transaction**. A "Saving…" icon shows (small, bottom-right).
- **Immediate flush** (≤ 100 ms) after *critical* operations: property purchase/sale/transfer, trade completion, shop purchase ≥ 10,000, casino big win (≥ 50,000), player leave, host shutdown, schema-affecting changes. These commit synchronously from the Host's perspective: the success event is emitted after commit.
- **Journal:** every ledger transaction appends a `journal` row in the same SQLite transaction as the state mutation. Journal rows form a **hash chain** (`prev_hash`) for tamper evidence and for replay-based recovery.
- **Manual save:** menu/`F5`: flush all dirty aggregates + create a named **checkpoint backup**. Quit-to-menu always does a full flush.
- **Rotating backups** (taken via SQLite online backup on a worker thread; zipped `.cwb`):
  - *Auto:* every 10 min of activity, keep last **6**.
  - *Hourly:* keep last **6**.
  - *Daily:* keep last **7**.
  - *Pre-migration:* kept until next successful 3 launches.
  - *Manual:* user-managed.
- **Crash safety:** SQLite WAL guarantees atomic commit; `world.manifest.json` written via temp-file + atomic rename; never overwrite in place.

### 17.8 Corruption recovery

1. On load: `PRAGMA quick_check` (full `integrity_check` if quick_check fails or after an unclean shutdown flag).
2. Verify each loaded `property_layout.hash`; verify the journal hash chain tail.
3. **Granular recovery:** if a *single* layout/player blob fails validation → restore just that aggregate from the newest backup that validates + replay journal entries after that backup for that player (where possible); log what was lost; notify Host with a plain-language dialog ("Maple Hills #12 restored from 12 min ago").
4. If the DB itself is unreadable → offer **Restore from backup** (list with timestamps, thumbnails, playtime); the damaged DB is moved to `corrupt/`, never deleted.
5. **Safe-mode load:** loads with unknown/invalid entities quarantined (items in `quarantine` location, visible in an admin panel) so one bad row can't prevent the world from opening.
6. Conservation audit (22.3) runs after any recovery.

### 17.9 Versioning & migrations

- Versions: `SaveSchemaVersion` (SQLite `user_version`), `LayoutFormatVersion` (per blob), `ProtocolVersion` (network), `ContentVersion`/pack hashes (definitions).
- **Migrations:** ordered classes `Migration_0007_To_0008 : IMigration { void Up(IDbTransaction, MigrationContext) }`, each idempotent and unit-tested against **golden save files** from every shipped version (`tests/golden-saves/vN/`). Flow: detect version → **pre-migration backup** → run migrations in one transaction (blob migrations lazily at first load per aggregate with `format` bump) → bump version → run audit.
- **Forward compatibility:** a save newer than the game opens **read-only** with a clear message; the world list shows the minimum game version.
- **Content evolution:** definitions are append-only; deprecated items keep their `DefId` with `redirectTo` or `retired: true` (convert to compensation Coins/placeholder). Unknown `DefId` on load → **placeholder "?" item** that preserves the instance and its location (nothing deleted); fixed automatically when the content pack returns.
- **Content packs:** `core` + optional packs referenced by id@version in the manifest; join handshake compares the pack hash set.

### 17.10 Multiplayer saves: what happens when you join someone else's world

1. The Host loads `world.db`. You connect and authenticate with your key → `PlayerId`.
2. **Known player:** your `player` row (and items, properties, achievements) load → you are exactly where you left off *in that world*.
3. **New player:** the Host creates your record with a starter package; your **local profile's appearance template** is proposed and validated (free items only).
4. Your **progress belongs to that world.** Wallet, inventory, properties and levels are *not* shared between worlds (prevents transferring wealth; keeps economies coherent). Your **identity, settings, keybinds, friend list and outfit templates** are global (client-side).
5. Saving: your aggregate is written on leave and on autosave. If the Host crashes, you lose at most one autosave interval of non-critical changes (critical ones were flushed).
6. If you want to keep a backup of your character from that world, use **Passport export** (v1.1) — a Host-signed `.cpass` you hold.
7. If the Host's world is deleted or corrupted beyond recovery, the world's data is gone for everyone; the Passport is the safety net, and Host UI nudges regular backups (e.g., "export backup to cloud folder" button).

### 17.11 Settings and client-side data

`profile.json` (versioned, atomic write): identity (encrypted key blob), display defaults, graphics/audio/accessibility settings, keybinds + controller bindings, UI layout, chat filter prefs, recent hosts, friends cache, **local blueprint library** and outfit templates. A corrupted profile resets to defaults but never regenerates the key silently (prompt to restore).

---

## 18. UI / UX

### 18.1 Principles & tech
- **Legible, spatial, consistent:** one design system (tokens for color, spacing, radii, type), big hit areas, clear focus states, rarity colors + shapes.
- **Tech:** Unity **UI Toolkit** (runtime) for screens/panels (USS theming, data-binding to ViewModels), uGUI/TextMeshPro for **world-space** nameplates/bubbles (pooled). ViewModels (pure C#) project Sim events → UI; UI emits **Commands**.
- **Input:** Unity **Input System** with action maps `Gameplay`, `Build`, `UI`, `Casino`, `Photo`. Every action rebindable; mouse+keyboard first, **full controller parity** (virtual cursor in Build mode, radial menus, shoulder-button tabs, on-screen hints that swap by device).
- **Accessibility:** text scale 80–150%, high-contrast mode, colorblind palettes, reduce motion/camera shake, subtitle/visual cues, toggle vs hold options, remappable everything.
- **Localization:** all strings via string tables from day one (English first); no baked text in art.

### 18.2 Screen flow

```
Boot → Splash → MAIN MENU
  ├─ Play ─┬─ Create Host Game ─► World list / New World ─► Host lobby ─► Character Creator (if new) ─► In-world
  │        └─ Join Game ─► LAN list / Direct IP / Join code ─► Character Creator (if new) ─► In-world
  ├─ Characters/Wardrobe (offline preview)
  ├─ Settings (Gameplay · Controls · Graphics · Audio · Accessibility · Account)
  ├─ Saves/Backups (host worlds, backups, import/export)
  └─ Quit
In-world HUD ─► Pause menu: Resume · Settings · Save (host) · Invite · Leave/Quit
```

**Main menu:** 3D diorama of Marigold Bay at sunset with animated characters; large buttons; recent worlds; news.

**Create Host Game:** *World name · Slot (New/Load) · Max players (2–32) · Visibility (LAN / Direct / Invite) · Password (optional) · Economy preset · Casino on/off · Chat filter · Autosave interval · PvP-free social rules*; shows **Join code + LAN address** after creation; loading bar with tips.

**Join Game:** tabs *LAN (live beacon list: name, host, players/max, ping, version-compat icon)* · *Direct (IP:port or code, last servers)* · *Friends (later)*; clear errors (version mismatch, content mismatch, banned, full, wrong password).

**Save/Load interface (host worlds):** cards with thumbnail, name, playtime, last played, player count, version/"modified" badge; actions: *Play, Rename, Duplicate, Export `.cwb`, Open backups (restore point list with preview), Delete (type name to confirm)*.

### 18.3 HUD

```
┌──────────────────────────────────────────────────────────────────────┐
│ [District: Market Street]  ☀ 14:20        🪙 12,480  ★ 36   [Lv 12 ▓▓▓░] │
│                                                                    ┌───┐│
│                                                                    │MAP││  (minimap, N-up/rotate, pins)
│                                                                    └───┘│
│ [Quest/Town Board tracker]                                              │
│                                                                         │
│                      (3D world, nameplates, chat bubbles)               │
│                                                                         │
│ ┌ CHAT ─────────────┐                                  [Emote wheel G]  │
│ │ Alex: wanna see...│                                  [Phone 📱 Tab]   │
│ │ [Local ▼] ______ │  [1][2][3][4][5] quick bar     [Build B] [Inv I]  │
│ └───────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────┘
```
Context prompts appear near interactables (`[E] Sit`, `[E] Open`, hold-to-confirm for risky actions). Notifications stack at the top-right (invites, friend joins, achievements) with an action button.

### 18.4 Phone (social/menu hub)
Opens with `Tab`/`P`; app grid: **Map · Friends · Messages · Party · Inventory · Home (my properties, teleport, invites) · Photos · Catalog (remote shop, +10% fee) · Achievements/Collections · Events · Profile · Settings**. Works with mouse and controller; chat/DM threads live here too.

### 18.5 Map
Full-screen map: districts, shops, property lots (colored by owner/free/yours), friends' locations (consented), tram stops, postcards found, event markers; **place pins**; click lot → price/owner/tour/ring; fast-travel buttons at tram stops; filter chips.

### 18.6 Build UI

```
┌────────────────────────────────────────────────────────────────────┐
│ [Floor: ▲ 2 / 1 / B]  [View: Cutaway ▼]  Snap [Grid ▾]  Objects 412/900   Undo ↶ ↷ │
│ ┌ INVENTORY / CATALOG DRAWER ┐                                      ┌ INSPECTOR ┐│
│ │[Search…]  ★ Fav            │       (dollhouse view, grid,          │ Velvet Sofa││
│ │ Living ▸ Sofas             │        green/red ghost, gizmos,       │ Rot 90°  Y 0││
│ │ [sofa][chair][lamp]…       │        colored ghosts of other        │ Color ● ● ○ ││
│ │ qty badges, "Buy" for      │        builders with name tags)       │ Owner: You  ││
│ │ unowned                    │                                       │ [Dup][Del]  ││
│ └────────────────────────────┘                                       └────────────┘│
│ [Select][Walls][Rooms][Floors][Paint][Openings][Stairs][Light][Furn][Decor][Yard][BP]   │
└────────────────────────────────────────────────────────────────────┘
```
- **Placement feedback:** green/red ghost, reason text under cursor ("Needs wall", "Blocked by Armchair", "Object cap reached"), snapping indicators, measuring guides, selection outline.
- **Collaboration UI:** collaborator list with colored dots, "Alex is editing: Kitchen", ghost of their held item, ping tool, **History/Revert** panel, role badges.
- **Hotkeys:** `B` toggle, `Q/E` rotate, `R` 90°, `Shift` fine snap, `Alt` free, `Ctrl+Z/Y`, `Ctrl+C/V/D`, `Del`, `1-0` hotbar, `Tab` cycle tools, `F` frame selection.
- **Controller:** virtual cursor (left stick), right stick camera, triggers rotate/zoom, A place, B cancel, Y inventory, X eraser, LB/RB tools, radial for modes.

### 18.7 Property management
Phone → Home, or at Town Hall: list/detail views described in 9.5 with big visual thumbnails, upgrade previews (before/after shell), safe destructive confirmations, role editor with search by player & **capability matrix** (checkboxes + presets).

### 18.8 Casino interfaces
Common frame: **balance, bet total, round timer ring, history, rules button, leave seat**. Per-game UIs described in file 05. Consistent chip visuals and sound language; **responsible-play** button always visible at the cashier and in table menus.

### 18.9 Shop UI, Inventory UI, Character Creator, Settings
See sections 13.3, 11.3, 8.4. **Settings:** Gameplay (camera, auto-run, interaction hold times, chat filter, nameplate style), Controls (rebind, sensitivity, controller layouts), Graphics (preset Low/Med/High/Ultra, resolution, render scale, shadows, view distance, crowd density, furniture draw distance, FPS cap, VSync, FOV), Audio (see 19.3), Accessibility, Network (Host: port, autosave, max players, ban list).

### 18.10 Onboarding / tutorial
Guided by **Pip** (agent NPC) in Sunny Row: 1) move & camera; 2) enter your studio; 3) place a sofa; 4) buy a lamp; 5) open phone; 6) invite a friend; 7) emote. Each step skippable; achievements for completion; tutorial state saved; contextual hints can be re-enabled.

---

## 19. NPC systems

### 19.1 Tiers (see 7.9 for networking)
| Tier | Examples | Sim | Network |
|---|---|---|---|
| **Ambient crowd** | pedestrians, joggers, tourists, dog walkers, beachgoers | client-side deterministic path-followers from `(seed, serverTime)`; billboard LOD at distance | none |
| **Service NPCs** | shopkeepers, clothing workers, furniture seller, property agents, casino dealers/pit boss, receptionists, race staff, bartender | stationary state machines + dialogue/interaction | state byte; actions are commands |
| **Interactive/roaming** | Pip (tutorial guide), taxi driver, couriers, race announcer (voice-lines), event hosts | Host-simulated behavior trees + nav | transform snapshots |

### 19.2 Behavior and content
- **Dialogue:** data-driven `DialogueGraph` (nodes: line, choices, condition, action) with localization keys; speaker barks; **optional voiced lines** later. Dialogue is client UI; outcomes are commands (e.g., open shop, start tour).
- **Dealer NPCs:** pure *presentation* of Host events (`CardDealt`, `BetsClosed`, `Payout`) — animation hooks and voice lines; **no logic** (the Sim runs the game).
- **Property agent:** opens the Town Hall UI; offers **guided tours** (NPC walks you to a lot, shows interior preview).
- **Shopkeepers:** greet by proximity, comment on your outfit (data-driven reactions), highlight daily deals.
- **Schedules:** ambient NPCs have time-of-day schedules (commuters at morning, beach crowd afternoon, club queue at night). Density scales inversely with players (see 7.9).
- **Variety:** ~40 NPC base models reuse the character modular system (same cosmetics) to reduce art cost; names/lines from content tables.
- **Performance:** ≤ 60 ambient NPCs rendered in view, GPU-skinned crowd shader/anim instancing at distance; interactive NPC cap ≈ 30 per zone; AI ticks at 5–10 Hz with LOD (frozen when out of AoI).

---

## Art direction (Section 15 of the brief)

**Name of the look: "Gumdrop Diorama."** Chunky, rounded, hand-painted-feeling low-poly 3D with soft gradients and warm light — like a lovingly built toy city seen in golden hour. Original shapes, palette and UI; no Habbo-derived assets, rooms, avatars or branding.

- **Palette:** Marigold `#F2A93B`, Lagoon `#2BB3A3`, Coral `#F26B5B`, Plum `#6B3FA0`, Cream `#FFF4E0`, Harbor Navy `#1F2A44`, Mint `#9FE3C8`. Each district has a dominant accent (Sunny Row = marigold/cream; Neon Quarter = plum/coral glow; Lucky Mile = navy/gold; Pearl Beach = lagoon/sand).
- **Shading:** URP + custom Shader Graph: 3-band soft toon ramp, rim light, gradient-mapped palette textures (shared **1024² palette atlas** per category), subtle ambient occlusion baked into vertex color, no normal maps on furniture (cheap, stylized). Outline only for selection/interactable highlights (screen-space pulse).
- **Characters:** 4.5-heads tall, big readable hands and heads, simple decal faces, strong silhouette hair/hat shapes.
- **Furniture style guide:** consistent 1 m = 1 tile scale, beveled edges, **max tris** small ≤ 800 / medium ≤ 2k / large ≤ 5k, 3 color slots, ≤ 1 material per item (atlas), pivot at floor center, authored `Footprint`, `Surfaces`, `Sockets`, `InteractionSlots` in a standard prefab template (validated by an editor tool).
- **Lighting:** baked world lighting for exteriors with realtime sun; interior uses light-probe grids + budgeted realtime lights; golden-hour default; day/night grading.
- **Visual hierarchy:** warm saturated focal points (shop signs, interactive items glow gently), desaturated backgrounds; UI uses cream cards with rounded corners, Navy text, accent chips; **Nunito** (OFL) typography; large icons with 2-px strokes.
- **Rarity visuals:** frame ornaments + shine intensity, plus shapes for colorblind safety.
- **Performance art budget:** see file 07 §23.

## Audio design (Section 16 of the brief)

### 19.3 Audio architecture
- `IAudioService` abstraction (v1 implementation on **Unity AudioMixer**; FMOD adapter possible later). Buses & user sliders (0–100%, independently saved): **Master · Music · Ambience · SFX · UI · Casino · Voice/Chat (future)**; plus *Mute when unfocused*, *Dynamic range (Night mode)*.
- `SoundCue` ScriptableObjects (clips, random pitch/volume, cooldowns, attenuation curve, bus) → no clips referenced in code; pooled `AudioSource`s (max ~48 voices; priority-based stealing).
- **Spatial:** 3D falloff; interiors apply **low-pass + reverb zone** + outside attenuation via mixer **snapshots** (house interior vs street vs casino hall).
- **Music:** district playlists with **crossfade on zone change** (4 s), time-of-day variants; nightclub DJ tracks synced to `serverTime`; **jukebox/record player** furniture local-spatial and synced; casino music ducks under table action cues; "calm mode" in homes.
- **Ambience:** layered loops per zone (streets/traffic/distant gulls; beach waves; park birds; casino crowd murmur + machine chimes; house room-tone (fridge hum, clock, wind through windows); rain layers).
- **SFX list:** UI (click, hover, open/close, error, success, purchase "cha-ching", notification), footsteps by surface (tile, wood, grass, sand, carpet, stairs — authored via animation events + surface tags), furniture (place thunk, rotate tick, delete poof, lamp click, TV on/off, drawer open, door open/close, chair scoot, bed rustle), shopping (bag rustle, till), roulette (chip clack, wheel spin loop, ball rattle/drop, win/lose stings), slots (lever, reel spin loop with per-reel stop thunks, win ladder scaled to payout, jackpot siren), cards (shuffle, deal, flip, chip stack), poker (check knock, all-in push), horse racing (paddock ambience, gate bell, hooves layered by distance, crowd swell, announcer lines, photo-finish hush), emotes (clap, laugh).
- **Mixing rules:** loudness target −16 LUFS, ducking priority (UI/important events > music), accessibility visual indicators for key audio cues (turn timers, doorbell).
