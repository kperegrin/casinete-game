# 03 — Character, Housing, Building & Decorating

## 8. Character system

### 8.1 Style and construction

- **Look:** chunky, friendly "toy-diorama" proportions (≈ 4.5 heads tall, large readable heads/hands), simple faces built from layered decals, clear silhouettes from 40 m away. Not realistic; no uncanny detail.
- **Rig:** one shared humanoid skeleton (≈ 45 bones incl. fingers simplified to 3 bones/hand) used by every body type so **all animations/emotes are shared**.
- **Body types:** three base meshes — *Slim*, *Standard*, *Broad* — plus **height** (0.9–1.1) and **build** (±10%) sliders implemented as blendshapes. Names are deliberately neutral and **not tied to gender**; every cosmetic is wearable by every body type.
- **Clothing fitting:** each wearable is authored once on *Standard* and **auto-fit** to Slim/Broad via blendshape deltas generated in the DCC pipeline (artist reviews exceptions). Per-body-type override meshes allowed when auto-fit fails.
- **Runtime cost:** a `CharacterBaker` merges body + equipped meshes into **one SkinnedMeshRenderer** and atlases textures at spawn; result cached by `appearanceHash`. Target: ≤ 8k tris/character incl. clothing, 1–2 draw calls, ≤ 3 materials.

### 8.2 Customization catalog (launch targets)

| Group | Details | Launch count |
|---|---|---|
| Body type / height / build | 3 bases + 2 sliders | 3 |
| Face shape | blendshape sliders: head width, jaw, cheek, chin, ear size | 5 sliders |
| Skin tone | 24 curated swatches + 1 fine-tune slider (undertone) | 24 |
| Eyes | shape (24), iris color (palette of 24), pupil size slider | 24 |
| Eyebrows | style (16), color | 16 |
| Nose / Mouth | 8 / 12 styles | 20 |
| Hair | 60 styles (short, long, curls, braids, buns, shaved patterns, bald); 2-tone color: base + highlight (each palette 32 + custom via dye) | 60 |
| Facial hair | 12 (stubble, mustaches, beards) + color | 12 |
| Makeup (optional) | layers: lips (12), eyeshadow (12), blush (8), liner (8), face paint (16); each with palette color + opacity | 56 |
| Tattoos (optional) | 40 designs, **3 layer slots**, body regions: arms, legs, torso, neck, face; color + opacity | 40 |
| Tops | T-shirts, shirts, sweaters, tanks, hoodies | 80 |
| Outerwear/jackets | | 30 |
| Bottoms | pants, shorts, skirts | 60 |
| Full body | dresses, jumpsuits, costumes (conflict with top+bottom) | 30 |
| Shoes | sneakers, boots, sandals, formal | 40 |
| Socks/gloves | | 20 |
| Hats | | 40 |
| Glasses/face accessories | glasses, masks, ear/nose accessories | 40 |
| Jewelry | necklaces, earrings, bracelets, rings (visible) | 40 |
| Back/waist | backpacks, wings, capes, belts, tails (opt-in) | 30 |
| Emotes/dances | see 14 | 30 |

Clothing has **2 color channels** (primary/secondary via mask texture R/G) and an optional **pattern** id; some pieces are fixed-color "designer" items. Counts are launch targets, scaled by production capacity; the content pipeline (file 07) generates variants (recolors, patterns) cheaply.

### 8.3 Slots, layering and conflicts

```csharp
public enum CosmeticSlot : byte {
  Hair, FacialHair, Hat, Glasses, FaceAcc, Earrings, Necklace, Top, Outer, Bottom,
  FullBody, Shoes, Socks, Gloves, Back, Waist, WristL, WristR, Ring, Makeup, Tattoo
}
```

- **Rules (data-driven per cosmetic):** `conflictsWith` slots (FullBody ⟷ Top/Bottom), `hidesBodyRegions` bitmask (prevents clipping — e.g., long sleeves hide arm tattoos), `hairVariant` (hat-friendly hair shape swaps when a hat is worn), `layerOrder` (Top < Outer).
- The Host validates the entire `EquippedSet` (ownership of each `ItemInstanceId` or free-to-use starter ID, no conflicts) before accepting an appearance change.

### 8.4 Creator UX

- **Screens:** Presets row (12 starting looks + "Randomize") → tabs: Body, Face, Hair, Skin, Makeup & Tattoos, Clothing, Accessories. Orbit camera with zoom presets (face, upper body, full body), turntable button, pose/emote preview, lighting presets (day/night/club) to check readability.
- **Always optional depth:** presets and randomize allow ≤ 30 s creation; "Advanced" toggles reveal sliders.
- **Compare/undo:** per-tab revert, global undo, "Save outfit" to **Wardrobe** (up to 20 outfit slots, 1 free at start).
- **In-world re-styling:** *Salon* (hair/face/skin/makeup/tattoo, small Coin fee after the first free change), *Dressing room* in any clothing shop and in your **home wardrobe furniture** (free, uses owned items only).
- **Name:** 3–16 chars, filtered, unique *display tag* disambiguation (`Kim#4F2A`). Free first set; later rename costs Coins. Optional pronouns field in profile (preset list + custom text), displayed only if the player chooses.

### 8.5 Cosmetic inventory & acquisition

- Cosmetics are `ItemInstance`s of definition type `Cosmetic` (see inventory). Starter clothes are free and unlimited ("starter" tag; never traded).
- Acquisition: **shops** (Coins), **achievements/collections** (non-purchasable rewards), **level milestones**, **events/seasonal**, **jobs**, **gifts/trades** (if tradable), **casino VIP cosmetics** (purchasable with Coins, never random loot boxes).
- **No randomized paid packs.** Rarity exists for display and price tiers; "Rare" and above can be limited-stock in shops or earned-only.
- **Dye system:** base palette colors are free; **Premium dyes** (consumable, Coins) unlock extra custom RGB for one item.

### 8.6 Saving and network

```csharp
public struct CharacterAppearance {          // ~100 bytes serialized
  public byte BodyType; public sbyte Height, Build;          // build/height sliders -100..100
  public byte SkinTone; public sbyte SkinUndertone;
  public byte EyeShape, EyeColor, Brows, BrowColor, Nose, Mouth;
  public sbyte FaceHeadWidth, FaceJaw, FaceCheek, FaceChin, FaceEar;
  public ushort HairStyle; public byte HairColorA, HairColorB;
  public ushort FacialHair; public byte FacialHairColor;
  public MakeupLayer[] Makeup;                // ≤ 5
  public TattooLayer[] Tattoos;               // ≤ 3
  public EquippedCosmetic[] Equipped;         // slot → ItemInstanceId (or free defId) + colorA/B + pattern
  public ushort Version;                      // schema version
}
```
Saved in `PlayerRecord`; hash (`xxHash64`) used for network caching; changes trigger `AppearanceChanged` event to the interest zone.

---

## 9. Housing system (main feature)

### 9.1 The shape of a home: **Shell + Interior + Yard**

Decision (options: (a) physically built-from-scratch open-world buildings, (b) instanced interiors only, (c) shell + instanced interior):

| Option | Pros | Cons |
|---|---|---|
| Fully open-world buildable buildings | Maximum freedom, walkable-through exteriors | Exterior consistency, massive streaming/network load, griefing, terrain/collision complexity |
| Interiors only, no exterior identity | Cheapest | Street feels dead; no pride in curb appeal |
| **Shell + instanced interior + yard (chosen)** | Exterior stays attractive and cheap; interiors can be *completely* freeform inside a bounded volume; instancing isolates load and network | Interior can't change the silhouette (mitigated by shell variants/expansions and yard) |

- **Shell:** a pre-authored exterior (mesh + roof + facade) per *property type & expansion level*. Owners choose **facade style presets** (wall material, roof color, trim, door style, window shutters, mailbox, house number) from unlocked options. Visible in the open world from all angles; cheap to render.
- **Interior:** a **grid-based build volume** (tiles of 1 m × 1 m; floors 3 m high) *inside* the shell footprint. The shell defines the maximum footprint, floors, window anchor points and door anchor. Windows placed inside map to shell window anchors when possible; otherwise a window shows a painted exterior panorama (no render cost).
- **Yard:** an outdoor build zone within lot bounds visible in the open world: furniture (outdoor category), fences, paths, pools, garden beds, parking pad. Own object cap (150–400 by tier), same placement rules (free or grid).

### 9.2 Property tiers (starting design values)

| Tier | Where | Footprint (interior, tiles) | Floors | Object cap | Price (Coins) | Upkeep / 5 online hrs | Notes |
|---|---|---|---|---|---|---|---|
| **Studio Apt** | Sunny Row, Downtown | 6×6 | 1 | 150 | **free** (first one) / 3,000 | 0 / 30 | Starter; no yard (shared balcony 2×6) |
| **1-Bed Apt** | Downtown towers | 8×8 | 1 | 300 | 12,000 | 60 | Unit with tower view; elevator access |
| **Cottage** | Sunny Row, Beach | 10×10 | 1 + attic | 500 | 25,000 | 125 | Small yard (8×8) |
| **Family House** | Maple Hills, Lakeside | 14×14 | 2 | 900 | 90,000 | 450 | Medium yard (16×16) |
| **Terrace House / Loft** | Lakeside Terraces | 12×16 | 2 + terrace | 1,100 | 160,000 | 800 | View-based yard (terrace) |
| **Villa** | Gilded Crest | 20×20 | 3 | 1,800 | 450,000 | 2,200 | Large yard + pool pad; requires Player Lv 15 |
| **Mansion** | Gilded Crest | 28×28 | 3 + basement | 3,000 (hard cap) | 1,500,000 | 7,500 | Gate, driveway, ballroom shell; requires Player Lv 25 |

Prices are tunable data (`PropertyDefinition`). Level requirements are intentionally *light*: they only gate the largest properties, never tools.

**Upgrades (Property Upgrade Catalog):** every upgrade is a one-time purchase that permanently improves the property:
- **Expansion steps:** +2 tiles per side (up to shell max, swaps in a bigger shell variant).
- **Extra floor / basement / attic conversion** (if shell allows).
- **Object cap packs:** +100/+250 objects (cheap early, escalating cost).
- **Yard upgrades:** size, pool pad, garage pad (vehicle display), greenhouse slot.
- **Utilities:** advanced lighting budget (+4 shadow lights), larger storage-furniture capacities, "Smart Home" wiring slots.
- **Exterior style packs.**

**Selling:** refund **70%** of base price + **50%** of upgrade spend; contents go to the owner's inventory (overflow to the Mailbox); collaborator items return to their owners; players inside are teleported out; the property returns to the market in a clean state (new instance, `PropertyId` retired but kept in history for audit). Sale is irreversible → confirmation with typed name.

**Multiple properties:** unlimited owned properties (limit 5 in v1 for UI sanity). Each has its own permissions, layout and upkeep. "Primary Home" setting (spawn, "Go home").

**Upkeep (money sink with no loss state):** charged per **5 hours of owner online playtime** (never wall-clock; hosts taking breaks aren't punished). Up to **4 periods of arrears** can accrue; beyond that the home goes **"Dusty"** (decorative cobwebs, loses Prestige and house-directory listing, **owner can still enter and build; visitors can't**). Paying clears it; nothing is ever repossessed or deleted.

**Transfer/gift:** property can be transferred to a friend (confirm both sides), with fee 2%.

### 9.3 Access control

**Visibility/entry modes** (per property, plus **per-room overrides**):
- **Open** — anyone can enter and use public-interact furniture.
- **Friends only** — only friends/roles; others get "Ring doorbell".
- **Invite only** — doorbell required; owner or anyone with `InviteGuests` accepts.
- **Locked** — only owner/co-owners/builders/decorators/friends listed.
- **Private (do not disturb)** — owner/co-owners only.

Additional: capacity limit (default 12, max 24), ban list, "kick guest", "require knock for private rooms", **House Rules** text (shown on entry, 200 chars), visitor *chat radius*, jukebox control (anyone/friends/owner), "allow photos".

**Doorbell flow:** visitor presses "Ring" → host sends `DoorbellRung` to all with `InviteGuests` → one accepts/declines → visitor gets a 5-minute entry token. **House invitations** (from phone) generate `InviteToken{propertyId, from, to, expiresAt}`: entry is allowed once while valid even if the house is Locked.

### 9.4 Roles & capabilities

```csharp
[Flags] public enum PropertyCap : uint {
  None = 0,
  Enter = 1<<0, EnterWhenLocked = 1<<1, UseFurniture = 1<<2, OpenStorage = 1<<3,
  PlaceFurniture = 1<<4, MoveOthersFurniture = 1<<5, RemoveOthersFurniture = 1<<6, RecolorFurniture = 1<<7,
  EditWalls = 1<<8, EditFloors = 1<<9, EditOpenings = 1<<10, EditStairs = 1<<11, EditLighting = 1<<12,
  EditRoomSettings = 1<<13, UseSharedStorage = 1<<14, WithdrawSharedStorage = 1<<15,
  InviteGuests = 1<<16, KickGuests = 1<<17, ManageRoles = 1<<18, UpgradeProperty = 1<<19,
  ApplyBlueprint = 1<<20, EditYard = 1<<21, ChangeExterior = 1<<22, UseWiring = 1<<23,
  // Owner-only, never delegable: SellProperty, TransferProperty, DeleteProperty, ChangeOwner
}
```

| Role | Default capabilities |
|---|---|
| **Visitor** | Enter (if mode allows), UseFurniture (sit, TV, lamps *if house allows*, music if allowed) |
| **Friend** | Visitor + EnterWhenLocked, OpenStorage (public storage only), UseSharedStorage (deposit only) |
| **Decorator** | Friend + PlaceFurniture (own items, in allowed rooms), RecolorFurniture, *Move/Remove only items they placed* (owner can toggle MoveOthers/RemoveOthers), EditLighting (toggle only) |
| **Builder** | Decorator + MoveOthers/RemoveOthers, EditWalls/Floors/Openings/Stairs/Lighting/RoomSettings, ApplyBlueprint, EditYard, UseWiring |
| **Co-owner** | Builder + InviteGuests, KickGuests, ManageRoles (up to Builder), UpgradeProperty (spending own Coins), ChangeExterior, WithdrawSharedStorage |
| **Owner** | Everything including Sell/Transfer/Delete/ManageRoles (all) |

Owners can customize any role's flag set per property ("Custom role"), and add **per-person overrides** and **per-room restrictions** ("Bedroom: Co-owners only"). A **change log** shows who changed permissions.

### 9.5 Property management UI (phone app + in-house menu)

- **My Properties** list: preview thumbnail, prestige stars, upkeep status, object count/cap, occupants.
- Detail tabs: *Overview* (rename, primary home), *Access* (mode, ban list, rules), *People & Roles*, *Upgrades*, *Layouts* (snapshots & saved room layouts), *Storage* (shared storage), *History* (edit audit log), *Sell*.

### 9.6 Shared Storage and "Delivery box"

- Every property has a **Shared Storage** (a piece of furniture slot or auto-provided "locker") — contribution items remain owned by contributors unless "Donate to property" is used.
- **Mailbox/Delivery box** (per player): overflow and delivered gifts; unlimited capacity; items expire never.

### 9.7 Prestige & Style (feeds progression)

Each property computes **Style Score** (variety, matched themes, filled-room ratio, lighting use, collection displays) and **Prestige Stars (0–5)** with likes/visits. Prestige unlocks exterior ornaments, house-directory features and "House of the Week" eligibility. Anti-gaming: caps on repeated items, diminishing returns by duplicates, can't farm by place/remove.

---

## 10. Building & decorating system

### 10.1 Spatial model (the foundation)

- **Grid:** 1 tile = 1 m. Floor *levels* are 3 m. Interior coordinates are integers in **centimeters** (int16) relative to the property origin (supports ±327 m; plenty).
- **Wall segments:** live on **tile edges** — `(x, z, axis(N|E), floor)`, with thickness 0.2 m rendered centered on the edge. Walls can have: material id per side, trim id per side, and **openings** (doors/windows/arches) at `u` position along the edge (in half-tile steps).
- **Floors:** per-tile **floor material** per level; tiles without floor are voids (for stairwells/double-height rooms).
- **Rooms** are **derived** (flood-fill of connected tiles bounded by walls/openings-as-doors), not hand-authored. A `Room` record stores *stable id*, name, settings, ambient preset, and optional music/permission overrides. When topology changes, new rooms inherit the id of the old room with the largest tile overlap. Room settings are therefore stable across walls edits.
- **Furniture transform:** position in cm (int16 x,y,z — y relative to floor level), **yaw as a byte** (256 steps = 1.40625°; grid mode uses 64-multiples = 90° or 32-multiples = 45°), optional pitch/roll *only* for items flagged `AllowTilt` (decorations), optional **scale** for flagged items (`0.75–1.25`, quantized byte), 2–3 color slots (palette index) + `materialVariant`.
- **Attachment types** (`PlacementKind` in `FurnitureDefinition`): `Floor`, `Wall` (mounted on a wall face), `Ceiling`, `Surface` (on top of other furniture, using its surface slots), `Anywhere` (outdoor), `Opening` (door/window), `Stair`.

### 10.2 Building Mode

Toggle with **B** (phone: Home → Build). The camera becomes a free-orbit "dollhouse" camera with **floor cutaway** (hide upper floors / fade walls toward camera). The world pauses *only locally* (you can still be seen as a ghost avatar marker). Others can keep walking around.

**Palette (bottom bar):** `Select · Walls · Rooms · Floors · Paint · Openings · Stairs · Lighting · Furniture · Decor · Yard · Blueprints`

| Tool | Behavior |
|---|---|
| **Wall** | Click-drag a straight line; segments snap to tile edges; shift = continue polyline; right-click cancel. Shows length and room-forming preview. Removes crossing walls only when confirmed. |
| **Room** (rect) | Drag rectangle → builds 4 walls + floor + auto-door suggestion. |
| **Eraser** | Click wall/tile/opening/furniture; drag for multi; deleted furniture returns to its owner's inventory. |
| **Floors** | Paint tiles; fill room with bucket; per-tile or per-room; includes void tool. |
| **Paint (wall materials)** | Per-side, per-segment/room/wall run; eyedropper (Alt-click). Trim/baseboard/crown as separate layers. |
| **Openings** | Pick door/window/arch; hover wall to preview position (half-tile steps); doors auto-orient; swing direction toggle; window sill height variants. |
| **Stairs** | Choose style (straight/L/U/spiral); place with footprint preview; auto-cuts upper-floor void and validates headroom. |
| **Lighting** | Place light fixtures (they're furniture) and set **Room Ambient Preset**; shows **Lighting Budget** meter. |
| **Furniture/Decor** | Opens the inventory/catalog drawer (also contains "Shop this" for items you don't own). |
| **Select** | Click, shift-click, marquee, "select all in room", "select same type"; shows transform gizmo. |
| **Yard** | Same tools in yard mode: paths, fences, garden beds, pool pad items, terrain paint (flat). |

**Modes:** *Snap-to-grid* (default; 0.5 m furniture grid; **Shift** = 0.125 m fine; **Alt/Free toggle** = free placement), *Free placement* (continuous with 1 cm quantization and wall/surface magnet snapping). Rotation: **Q/E** or scroll ±90° (grid) / ±5° (free), **R** quick 90°. **Duplicate (Ctrl+D)** only works if you have another owned copy; otherwise a ghost with "Need N more — Buy?" shopping hint.

**Placement validity** (client preview; Host is authoritative):
1. Inside buildable bounds and level; not intersecting walls/stairs void rules.
2. **Collision:** grid mode: footprint cell bitmask vs occupancy bitmask (`Furniture.Footprint[]` + `Height`), allowing *overlap-permitted layers* (rugs on floor layer 0, tall items on layer 1, wall items layer W, ceiling C). Free mode: **2D OBB overlap (SAT)** + vertical interval overlap check against the spatial hash.
3. **Support:** floor items need floor tile; wall items need a wall face of sufficient height; surface items need a free surface slot of matching size; stairs need headroom.
4. **Object cap** and per-definition **limits** (e.g., max 20 real-time lights).
5. **Door clear zone:** door swing and 1 tile in front must stay clear (warn+forbid for the main entry door; others warn only).
6. **Never trap rule:** players always have **"Unstuck / Go outside"** in the radial menu, so reachability is *advisory* — a warning icon if a room becomes unreachable.

### 10.3 Furniture categories & interaction

| Category | Examples | Interactions |
|---|---|---|
| Beds | single, double, bunk, hammock | Lie/sleep (multi-slot), sleep-in → "rested" cosmetic buff |
| Sofas & seating | sofas, loveseats, armchairs, benches, stools, beanbags | Sit (1–4 slots), pair emotes |
| Chairs | dining, office, rocking | Sit; office chair spin |
| Tables | dining, coffee, desks, bar | Surface slots; seats pull in |
| Cabinets & storage | wardrobe, dresser, chest, fridge | **Open storage** (capacity 12–60 slots, owner-owned items remain theirs), wardrobe = outfit swap |
| Shelves | wall shelves, bookcases, display cases | **Display slots** (put collectibles/books/trophies visible) |
| TVs/Media | TV, projector, speakers, jukebox, record player | On/off, channel/track, **synced playback** |
| Computers | desktop, laptop, console | "Use" → mini-apps (photo album, mail, small games), seat required |
| Lamps/Lighting | floor/table/ceiling/neon/string lights | On/off/dim; color presets |
| Rugs | all sizes | Floor decoration layer |
| Paintings/Frames | art, photo frames | Frames display **your in-game photos** |
| Plants | potted, hanging, trees, aquariums | Growth stages, optional watering (cosmetic) |
| Kitchen | counters, stove, fridge, sink, island | Modular sockets; "cook" emote makes food prop |
| Bathroom | tub, shower, toilet, sink | Animations (soak, brush teeth) — tasteful |
| Gaming | arcade cabinets, pinball, console, pool table, darts | **2-player minigames** |
| Luxury | chandeliers, grand pianos, fireplaces, fountains | Play piano (simple melodies), fireplace on/off |
| Outdoor | grills, hot tubs, pools, fire pits, swings, loungers | Multi-slot social seating, hot tub party |
| Casino-themed | mini-roulette table, poker table, slot cabinet, chip trays | **Home game tables** (social-only, no stakes: use **Fun Chips** ≠ Coins) |
| Seasonal | trees, lights, pumpkins | Event shop rotation |
| Collectibles | trophies, statues, rare art | Show in display cases; serial-numbered |

### 10.4 Additional furniture systems (AI proposals — included in the design)

1. **Smart sockets & modular kits** — items declare `sockets[]` (position/normal/type) so kitchen counters, sectional sofas, fences, bookcase modules, and railings **auto-snap and auto-corner**.
2. **Surface slots/stacking** — decor on shelves/tables; moving parents moves children; children keep their own owners.
3. **Social seating** — multi-seat furniture with partner animations (cuddle on sofa, board-game seating, hot tub).
4. **Display & showcase** — frames show photos; trophy cases show collections; bookshelf auto-populates with owned "books".
5. **Photo mode & Album** — in-game camera with filters; photos (256×256 JPEG ≤ 64 KB) saved in the world DB with hash dedupe; hang them in frames; a **Polaroid** collectible shows who/when/where.
6. **Light "wiring" (Contraptions Lite)** — a **Wire tool** connects *Triggers* (button, pressure plate, proximity sensor, clock) to *Targets* (lights, doors, music, fountain, fireworks, teleport pad). Only 6 logic nodes (Toggle, Timer, Delay, Sequence, And, Random). Evaluated Host-side at 4 Hz, **budgeted** (≤ 40 wires/property, no feedback loops). Unlocks via Builder level.
7. **Teleport pads & secret doors** within a property (rooms in a mansion; “speakeasy” rooms).
8. **Home game tables** — chess/checkers/cards/dominoes; poker/roulette/blackjack **home variants** use non-Coin *Fun Chips* (no economy link).
9. **Plants & Aquariums** — time-based growth stages, collectable fish/plants (collection hooks into progression).
10. **Seasonal home themes** — one-click "theme overlay" (lights/decor sets) per room.
11. **Room templates / Stylebooks** — curated blueprint packs (Cozy Cabin, Retro Diner, Modern Loft).
12. **Pets (later)** — cats/dogs follow owner, sleep on beds; feeds Social level.
13. **Open House mode** — owner enables **tour mode**: visitors get a guided path, a guestbook, a like button, optional ticket cost (Coin sink for entry? no — free, but **donation jar** social feature).
14. **Garage slot** — vehicles owned appear in driveways.

### 10.5 Undo/redo, multi-select, copy/paste, layouts, blueprints

- **Undo/redo:** per-player stack per property session (depth 100). Each entry is an **inverse command** (e.g., place → remove; move → move back with *expected current state*; delete → re-place from inventory/removed buffer). Undo is a **normal command**: re-authorized and re-validated. If someone else changed that object meanwhile → undo for that step fails gracefully ("couldn't undo — it was changed by X") and the stack continues. Undo never reverts *other* people's edits.
- **Multi-select:** marquee/shift/ctrl; operations apply as a **group command** (`MoveGroup`, `RotateGroup`, `RecolorGroup`, `DeleteGroup`) = single atomic Host transaction (all or nothing; max 200 items/command). Group locks acquire atomically.
- **Copy/paste:** clipboard stores *definition + relative transforms + colors* (not instances). Paste creates **new instances only from items you own** (otherwise the shopping list prompt); `Ctrl+V` shows a ghost group that obeys placement validity; partial paste option "Skip invalid".
- **Saved room layouts (Layout Slots):** snapshot of a room (walls, floors, openings, furniture transforms) — *furniture items are unplaced into inventory on restore*; slots per property: 5 free, +5 per upgrade. Also automatic **safety snapshots** (every 15 min while editing, last 8).
- **Blueprints:** portable data object `{id, name, author, bounds, floors, walls, openings, stairs, paints, items[defId, transform, colors], thumbnail}`. **Apply flow:** choose blueprint → ghost preview → **bill of materials** (what you own / missing + price at current shops) → "Buy missing" (one-click shopping list, Host verifies stock/prices) → atomic `ApplyBlueprint` (all-or-nothing within the target rectangle; partial mode places owned items only). **Share**: export as text code (compressed base64, ≈ 2–30 KB) or `.cbp` file; import sanitizes unknown IDs (placeholder cube, flagged).

### 10.6 Interactions & state

- Every furniture definition declares `InteractionSlots[]` (type, offset, animation, max users) and **state machine** (`stateByte`: on/off, open/closed, channel index, plant stage).
- **Interaction commands:** `Interact{placedId, slotIndex, verb}` validated for range, permission (`UseFurniture`/`OpenStorage`), occupancy (slot claims are atomic).
- **Sit/lie sync:** seat claim event → avatar snapped to the slot with the animation id; leaving releases.
- **Media furniture** keeps `{trackId, startServerTime}`; others compute playhead.

### 10.7 Collaborative building

**Roles** (Visitor/Friend/Decorator/Builder/Co-owner) → capabilities as in 9.4.

**How simultaneous editing works** (optimistic concurrency + leases):

1. **Revisions:** every placed object has `rev` (uint32). `Property.layoutRev` increments per op batch. Commands carry `baseRev`.
2. **Leases (soft locks):** when a player starts dragging/rotating an object they send `BeginEdit(ids)`. Host grants **leases** to *all or none* (`TryLockMany`). A lease lasts 8 s and is renewed by heartbeat every 2 s while the object is held. Others see the object **ghost-tinted with the editor's color and name** and cannot select it (UI says "Alex is moving this").
3. **Commit:** `CommitMove(ids, newTransforms, baseRev, leaseToken)` → Host verifies lease, revision, permission, placement validity at *current* state (another player's committed edits may have changed collisions) → apply, bump `rev`, release lease, broadcast op. Failure returns `StaleRevision/Conflict/InvalidPlacement` with current state; client snaps the ghost back.
4. **Disconnect/timeout:** leases expire; the object remains at its last committed state.
5. **Walls/floors/openings:** edits use **region leases** (rectangle of tiles + floor level). Overlapping region leases are rejected, so two builders can work in different rooms simultaneously; adjacent edits on the shared wall edge conflict only on that edge.
6. **Create operations** (placing from inventory) don't need leases but are serialized by the Host; two players dropping into the same spot → first accepted, second fails `InvalidPlacement`. The loser's item is *not* consumed.
7. **Delete vs move race:** whichever command Host processes first wins; the other fails with `NotFound/StaleRevision`.
8. **Presence & communication:** colored cursors/ghosts, "X is building in the Kitchen" banner, quick **ping** emote on a tile, and an **edit audit log** (who did what) with **Revert to snapshot** (owner/co-owner).
9. **Moderation:** owner can instantly demote/kick/ban a collaborator; role changes apply immediately (existing leases of that player are revoked).
10. **Ownership of contributed items:** items stay owned by their contributors; "Donate to property" moves ownership to the property (shared). Removing returns items to owner’s inventory/mailbox.

### 10.8 Lighting & atmosphere

- Light furniture exposes `LightSpec {type, range, intensity, colorPresets, castsShadow, cost}`; **Lighting Budget** per room (default 4 shadowed + 24 unshadowed; upgradeable). Excess lights degrade gracefully to baked-style glow (emissive + additive cookie) — never silently disappear.
- **Room Ambient Presets** (Day, Golden, Night, Neon, Cozy, Moody): set sun-through-window tint, ambient color, post-processing (bloom/vignette) and indoor reverb zone. Window light follows the world clock.
- Exterior lights (yard) switch automatically at dusk (optional).

### 10.9 Stairs and multiple floors

- Floors are discrete (0..3, plus basement −1). **Stairs** are furniture-like `Stair` items with footprints (1×3 straight, 2×3 L, 2×2 spiral) linking floor *f* → *f+1*. Placement auto-creates the **void** in the upper floor and a **railing** if enabled.
- Navigation: avatar movement on stairs uses a ramp collider + animation; Host treats stair tiles as walkable ramps between levels.
- Camera: cutaway modes — *All floors*, *Current + below*, *Current only*; walls toward camera fade to 20% alpha.
- Elevators (towers only) are public interior objects.

### 10.10 Build-mode performance guardrails

- Dirty-chunk **procedural mesh** rebuild for walls/floors (8×8 tile chunks per level; ≤ 2 ms per chunk rebuild on a worker thread + main-thread upload), material texture arrays for one draw per material per chunk.
- Furniture rendering: instanced rendering for static items; pooled GameObjects only for interactables within 12 m (see file 07 performance).
- Placement validator: spatial-hash broadphase, <0.2 ms per query for 3,000 objects.
