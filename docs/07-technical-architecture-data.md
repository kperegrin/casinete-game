# 07 — Technical Architecture, Data, Performance, Structure

## 20. Technical architecture

### 20.1 Engine comparison

| Criterion (weight) | **Unity 6 LTS** | **Unreal Engine 5** | **Godot 4.x** |
|---|---|---|---|
| Team size fit: small/indie (×3) | Excellent | Heavy for small team | Excellent |
| Stylized 3D + URP-class perf on modest PCs (×3) | Very good (URP, SRP Batcher, GPU instancing, Burst) | Overkill; Nanite/Lumen not needed; higher min-spec | Good; Forward+/Mobile renderer ok, less mature tooling for scale |
| C# + engine-free libraries (testability) (×3) | **Native** (C#, asmdef, `dotnet test` on pure code) | C++/Blueprints; pure-C++ lib possible but friction | C# supported but .NET export/AOT/platform gaps; GDScript default |
| Networking options (×3) | UTP, NGO, Mirror, FishNet, Steam/EOS/Relay SDKs; headless server builds | Strong built-in replication but actor/UObject model; heavy for thousands of data-objects | ENet/high-level multiplayer API; fine for small scale, fewer production tools |
| Runtime UI (×2) | UI Toolkit + uGUI | UMG (good) | Control nodes (good) |
| Asset pipeline & marketplace (modular characters, furniture kits) (×2) | Huge ecosystem | Large | Smaller |
| Many-small-objects rendering (instancing/Jobs) (×2) | `Graphics.RenderMeshInstanced`, DOTS optional | ISM/HISM | MultiMesh (good) |
| Console/PC/Deck reach (×1) | Excellent | Excellent | PC/Deck; consoles via third parties |
| Cost/licensing (×1) | Free until revenue thresholds; per-seat above | 5% royalty above threshold | MIT, free |
| Hiring/community knowledge (×1) | Largest | Large | Growing |

**Decision: Unity 6 LTS, C#, URP.** Reasons: (1) C# lets us put *all rules* (economy, housing, casino, saving) in engine-free assemblies tested with plain `dotnet test`, which is the cheapest way to get a trustworthy server-authoritative economy; (2) mature multi-platform transport/SDK options and headless builds make the Host→dedicated path realistic; (3) instancing/pooling/Addressables/Profiler tools suit thousands of small stylized objects; (4) biggest asset/tool ecosystem for modular characters and furniture kits, lowering content risk; (5) best fit for a small team. Godot is the strongest alternative if licensing becomes a concern; because the Sim is engine-free, only the presentation layer would need a port.

### 20.2 Stack summary

| Concern | Choice |
|---|---|
| Language | C# 9 (Unity 6, .NET Standard 2.1 compatible for Sim assemblies) |
| Render | URP, SRP Batcher, GPU instancing, texture arrays/atlases, Shader Graph toon |
| Input | Input System package |
| UI | UI Toolkit (screens) + TextMeshPro world-space |
| Networking | **Unity Transport (UTP)** under `INetTransport`; own protocol (Command/Event/Snapshot) — *not* NetworkObject-per-entity. Alternatives considered: Netcode for GameObjects (great for few networked objects, awkward for thousands of data-objects + headless Sim), Mirror/FishNet (good, but still object-centric). |
| Serialization | **MessagePack-CSharp** (with AOT/mpc codegen, LZ4) for commands/events/saves; hand-written bit-packing for movement snapshots |
| Persistence | SQLite (`Microsoft.Data.Sqlite` or `sqlite-net` + native e_sqlite3 per platform), WAL |
| Crypto | Ed25519/X25519/ChaCha20-Poly1305 via `NSec`/`libsodium` bindings (or BouncyCastle) |
| Content | Data-driven definitions (JSON/YAML → baked `.ccpack` binary + Addressables for assets) |
| Procedural meshes | Unity Mesh API with Jobs/Burst for wall/floor chunk building |
| Audio | AudioMixer behind `IAudioService` |
| Tests | NUnit via `dotnet test` (Sim) + Unity Test Framework (EditMode/PlayMode) + custom bot harness |
| CI | GitHub Actions: `dotnet test`, content validation, headless Unity build, slot RTP certification |

### 20.3 Layered architecture & assemblies

```
Casinete.Core        (no deps)           IDs, Result<T>, Rng, math (int cm vectors), BitPacking, Clock abstraction
Casinete.Content     → Core              *Definition classes, ContentDb, validators, redirects
Casinete.Sim         → Core, Content     Authoritative rules: Ledger, Inventory, Economy, Shops, Housing, Building, Casino, Social, Progression, NPC logic
Casinete.Net         → Core              Transport interfaces, protocol messages, serializers, sessions, interest mgmt, rate limiting
Casinete.Persistence → Core, Sim         Repositories (SQLite), migrations, backups
Casinete.Host        → Sim, Net, Persistence   Composition root for Host/Dedicated: tick loop, command routing
Casinete.Client      → Net, Core, Content      ClientReplica (read model), prediction, ViewModels (pure C#)
Casinete.Unity.*     → UnityEngine       Presentation: views, UI Toolkit screens, audio, input, rendering, character baker, build mode UX
```
Only `Casinete.Unity.*` references UnityEngine. `Core/Content/Sim/Net/Persistence/Host/Client` are **engine-free** and live as Unity local packages with `noEngineReferences: true` asmdefs, *and* are compiled by a plain `.csproj` for `dotnet test`.

**Dependency rules:** Sim never references Net/Unity; Client never references Sim internals (only shared message/contract types in `Casinete.Core`/`Net`); UI never mutates state — it emits commands.

### 20.4 Runtime composition (Host vs Client)

```
HOST PROCESS                                         CLIENT PROCESS (remote player)
┌───────────────────────────────┐                    ┌─────────────────────────────┐
│ UnityHostBootstrap            │                    │ UnityClientBootstrap        │
│  └ HostRuntime                │                    │  └ ClientRuntime            │
│     ├ SimWorld (Ledger, ...)  │◄── UDP (UTP) ─────►│     ├ ClientReplica         │
│     ├ CommandRouter           │                    │     ├ CommandSender         │
│     ├ InterestManager         │                    │     ├ EventApplier          │
│     ├ PersistenceService      │                    │     └ ViewModels/Views/UI   │
│     └ LoopbackTransport ──────┼─► local ClientRuntime (same code as remote clients)
└───────────────────────────────┘
```

### 20.5 Core module designs

**Multiplayer** — see file 02. Key classes: `INetTransport`, `Session`, `CommandRouter`, `CommandHandlerRegistry`, `InterestManager`, `EventBus`, `ReplicationSerializer`, `TimeSync`, `RateLimiter`, `LanBeacon`.

**Player controller** — `PlayerAvatar` (Unity `CharacterController`-style kinematic mover) + `LocomotionInput` (WASD/stick/click-to-move via nav path), states: Idle/Walk/Sprint/Sit/Lie/Emote/Build(ghost marker)/Casino-seated/Vehicle. Sends `MoveInput` snapshot at 20 Hz; host validates. Camera: orbit with collision, build-mode camera separate component, photo-mode camera.

**Characters** — `CharacterAppearance` data → `CharacterBaker` (mesh merge/atlas) → `AvatarView`. `AnimationController` driven by a small replicated `AnimState` + emote ids (Animator with override controllers; state-machine behaviours kept minimal for performance).

**Interaction system** — `Interactable` (component on views) ↔ `InteractionSlotDef` (data). Client does local proximity detection, shows prompt, sends `Interact` command; Host validates distance/permission/occupancy and emits `InteractionStarted/Ended`. Seat/bed claims use `SlotClaimTable`.

**Inventory & Items** — `ItemDefinition` + `FurnitureDefinition`/`CosmeticDefinition`/etc. via `ContentDb`; `ItemLedger` (atomic moves with CAS), `InventoryService` (queries/projections), `ContainerService`. Events: `ItemsChanged`.

**Housing** — `PropertyService` (ownership, tiers, upgrades, permissions, upkeep, sale), `HouseLayout` (walls/floors/openings/stairs/rooms/objects), `PlacementValidator`, `SpatialIndex`, `RoomGraph` (flood fill & id stability), `LeaseManager` (edit leases, region leases), `LayoutOps` (op log with revisions), `BlueprintService`, `SnapshotService`.

**Furniture placement & building** — client: `BuildController` (tools as `IBuildTool` strategy objects: WallTool, RoomTool, FloorTool, PaintTool, OpeningTool, StairTool, LightTool, PlaceTool, SelectTool, YardTool), `GhostManager`, `UndoRedoStack`, `Clipboard`, `GridSnapper`. Host: `HousingCommandHandlers` mirror each tool with authoritative validation.

**Economy** — `Ledger` (only mutator of wallets/items; supports multi-op transactions with idempotency key + journal append), `PricingService`, `FaucetService` (daily/jobs/diminishing returns), `SinkService` (upkeep, taxes), `EconomyTelemetry`.

**Shops** — `ShopService` (stock/rotation/purchase), `ShopQuery` projection for UI, `CatalogService` (remote ordering).

**Casino** — `CasinoTable`/`ITableGame` implementations: `RouletteGame`, `BlackjackGame`, `PokerGame`, `SlotEngine`, `HorseRaceService`, shared `RoundRng`, `Escrow`, `TableSeatManager`, `ResponsiblePlay`.

**NPCs** — `NpcDefinition`, `NpcSpawner`, `ServiceNpcController` (state machine), `RoamingNpcAgent` (behavior tree + nav), `AmbientCrowdSystem` (client deterministic), `DialogueRunner`.

**Saving** — `IWorldRepository` (SQLite), `AggregateSaver` (dirty tracking, snapshotting, worker thread), `BackupService`, `MigrationRunner`, `IntegrityChecker`, `ProfileStore` (client JSON).

**UI** — `UiRoot` (UI Toolkit `UIDocument` host), `Screen` stack with `ScreenManager`, `ViewModel`s (INotifyPropertyChanged-style binding), `WorldSpaceUiPool` (nameplates/bubbles), `InputGlyphService`, `Tooltip/ConfirmDialog` services, `ThemeTokens`.

**Audio** — `AudioService`, `SoundCue`, `MusicDirector`, `AmbienceDirector`, `FootstepService`, `ReverbZoneManager`.

### 20.6 Content pipeline (data-driven)

```
content/
  items/*.json          (ItemDefinition + FurnitureDefinition/CosmeticDefinition...)
  shops/*.json  properties/*.json  achievements/*.json  slots/*.json  horses/*.json  npcs/*.json  dialogues/*.json  events/*.json
  redirects.json        (old DefId → new DefId)
  ↓  tools/ContentBuilder (validates references, IDs unique, prices > 0, assets exist, footprints sane, no cycles)
  ↓  bakes → Content.ccpack (binary, hashed) + Addressables groups (prefabs, icons, audio)
```
- **Add a new couch:** drop the prefab (validated by an editor tool for footprint/pivot/color slots), add a JSON entry (`id`, name key, category, tags, rarity, price, footprint, surfaces, interactions, color slots, shop listings) → `ContentBuilder` validates → ships. No code changes.
- **Content hash** = hash of the `.ccpack`; clients/hosts compare at join. DLC/packs follow the same format.
- **ScriptableObjects** are for *authoring convenience only* (icons, prefab refs, audio cues); gameplay data lives in the content DB so the headless server doesn't need Unity assets.

## 21. Data architecture

### 21.1 Entity relationships

```
World 1──* Player ─────────────* Property ◄── PropertyDefinition (tier, shell, caps)
  │           │  ├ CurrencyWallet            │ 1──* HouseLayout (interior/yard)
  │           │  ├ CharacterAppearance       │        ├ WallSegment*, FloorTile*, Opening*, Stair*
  │           │  ├ Inventory ── InventoryItem│        ├ Room* (derived + settings)
  │           │  │      (stacks / instances) │        └ PlacedFurniture* ── FurnitureDefinition ◄─ ItemDefinition
  │           │  ├ AchievementProgress*      ├ BuildingPermission* (role per player/room)
  │           │  └ Stats / Friends / Settings └ Container* (storage furniture contents → InventoryItem)
  ├ Shop* ── stock entries → ItemDefinition
  ├ CasinoTable* → RouletteGame | BlackjackGame | PokerGame ; SlotMachineDefinition ; HorseRace
  ├ Journal (Transactions)  └ SaveGame (SQLite world + manifest)
```
All cross-references are by **ID** (player id, property id, def id, item id), never object pointers, so state serializes trivially and definitions can be added without touching saves.

### 21.2 Schemas (C#)

```csharp
// Design sketch. `record struct` needs C# 10; with Unity 6 (C# 9) implement the ID types as `readonly struct` with IEquatable.
using System; using System.Collections.Generic;

public readonly record struct PlayerId(Guid Value);          // actually 128-bit from SHA-256(pubkey)
public readonly record struct ItemInstanceId(ulong Value);
public readonly record struct PlacedId(ulong Value);
public readonly record struct PropertyId(int Value);
public readonly record struct DefId(string Value);           // "core:furn.sofa.cozy_2seat"

// ---------------- PLAYER ----------------
public sealed class PlayerData {
    public PlayerId Id; public string DisplayName; public ushort NameTag; public string Pronouns; public string Bio;
    public CharacterAppearance Appearance; public CurrencyWallet Wallet; public InventoryData Inventory;
    public ProgressData Progress;           // levels, xp, titles, badges, tutorial flags
    public Dictionary<string, AchievementProgress> Achievements;
    public PlayerStats Stats;               // counters: placed items, visits, rounds played ...
    public List<PropertyId> OwnedProperties; public PropertyId? PrimaryHome;
    public List<PlayerId> Friends; public PlayerSettingsInWorld Settings;
    public DailyState Daily; public PendingFeature Pending;   // e.g. unfinished free spins
    public ZoneId LastZone; public Int3 LastPos; public long LastSeenUnix; public uint Rev;
}

public sealed class CharacterAppearance {    // see 8.6 for field list
    public byte BodyType; public sbyte Height, Build; public byte SkinTone; public sbyte Undertone;
    public byte EyeShape, EyeColor, Brows, BrowColor, Nose, Mouth; public sbyte[] FaceSliders; // 5
    public ushort Hair; public byte HairColorA, HairColorB; public ushort FacialHair; public byte FacialHairColor;
    public MakeupLayer[] Makeup; public TattooLayer[] Tattoos; public EquippedCosmetic[] Equipped; public ushort Version;
}
public struct EquippedCosmetic { public CosmeticSlot Slot; public ItemInstanceId? Instance; public DefId FreeDef; public byte ColorA, ColorB, Pattern; }

// ---------------- CURRENCY ----------------
public sealed class CurrencyWallet {                // mutated ONLY by Ledger
    public long Coins { get; internal set; } public int Stars { get; internal set; }
    public long LifetimeEarned, LifetimeSpent;      // stats/telemetry
    public uint Rev;
}

// ---------------- ITEMS ----------------
public enum ItemType : byte { Furniture, BuildingPiece, Decor, Cosmetic, Consumable, Collectible, Event, Key, Vehicle }
public enum Rarity : byte { Common, Uncommon, Rare, Epic, Legendary, Collectible }

public sealed class ItemDefinition {
    public DefId Id; public uint Hash; public string NameKey, DescKey; public ItemType Type; public Rarity Rarity;
    public string Category; public string[] Tags; public string SetId; public int BasePrice; public int SellBackPercent;
    public bool Stackable; public int MaxStack; public bool Tradable, Giftable, Sellable; public bool Unique;  // unique => instance rows
    public bool Retired; public DefId? RedirectTo; public string IconRef, PrefabRef;     // asset refs (Addressables keys)
}

public sealed class FurnitureDefinition {            // 1:1 extension of ItemDefinition (same Id)
    public DefId Id; public PlacementKind Placement;           // Floor/Wall/Ceiling/Surface/Anywhere/Opening/Stair
    public Int2[] FootprintCells;  public int HeightCm; public byte CollisionLayer;     // grid occupancy
    public ObbDef FreeCollider;                                 // for free placement
    public bool AllowFreePlacement, AllowTilt, AllowScale; public (byte min, byte max) ScaleRange;
    public SurfaceSlot[] Surfaces; public Socket[] Sockets; public InteractionSlotDef[] Interactions;
    public ColorSlotDef[] ColorSlots; public byte[] MaterialVariants;
    public int LightBudgetCost; public LightSpec? Light; public int ContainerCapacity;       // storage
    public int StyleValue; public string[] StyleTags; public int ObjectCost = 1;               // counts toward object cap
    public StateMachineDef States;                                                            // on/off, open/closed, channels
    public string[] AllowedRoomTypes;                                                         // optional
}

public sealed class InventoryData {
    public Dictionary<(DefId def, int variant), int> Stacks;     // fungible items
    public List<InventoryItem> Instances;                        // unique items (metadata; truth lives in item_instance rows)
    public HashSet<DefId> Favorites; public int MailboxCount;
}
public sealed class InventoryItem {
    public ItemInstanceId Id; public DefId Def; public PlayerId Owner; public ItemLocation Location;
    public int Serial; public byte[] ColorOverride; public int Flags; public byte[] State;   // container contents ref, signed text...
    public long AcquiredUnix;
}

// ---------------- HOUSING ----------------
public sealed class Property {
    public PropertyId Id; public Guid Uid; public DefId Definition; public PlayerId Owner; public string Name;
    public int Tier; public PropertyUpgrades Upgrades; public AccessMode Access; public int Capacity; public string HouseRules;
    public List<BuildingPermission> Permissions; public List<PlayerId> Banned;
    public UpkeepState Upkeep; public int Prestige; public ExteriorStyle Exterior;
    public HouseLayout Interior; public HouseLayout Yard; public long PurchasedUnix; public uint Rev;
    public int ObjectCap;                    // cached: PropertyDefinition.ObjectCap + Upgrades.ExtraObjects
}

public sealed class HouseLayout {
    public uint LayoutRev; public Bounds3 Bounds; public int Floors;
    public List<WallSegment> Walls; public FloorMap Floor;       // per-level tile materials (RLE)
    public List<Opening> Openings; public List<StairInstance> Stairs;
    public List<Room> Rooms; public List<PlacedFurniture> Objects; public List<Wire> Wires;
    public List<PlayerId> OwnerTable;                            // dictionary for compact ownerIdx
}
public struct WallSegment { public short X, Z; public byte Axis, Floor; public ushort MatA, MatB, TrimA, TrimB; }
public struct Opening { public int WallIndex; public byte U2;  /* half-tile position */ public DefId Def; public byte Variant; public bool SwingFlip; public byte State; }

public sealed class Room {
    public ushort Id; public string Name; public RoomType Type; public List<TileRef> Tiles;     // derived cache
    public AmbientPreset Ambient; public RoomAccess Access; public DefId? MusicTrack; public uint LightBudgetUsed;
}

public sealed class PlacedFurniture {                // ~16–24 bytes in blob
    public PlacedId Id; public DefId Def; public uint DefHash;
    public short X, Y, Z; public byte Yaw; public byte Flags; public sbyte Pitch, Roll; public byte Scale;
    public byte[] Colors; public byte Variant; public byte[] State;
    public PlayerId Owner; public PlayerId PlacedBy; public PlacedId? Parent; public byte SurfaceSlot;   // stacking
    public WallAnchor? Wall; public ushort RoomId; public uint Rev; public long PlacedUnix;
    public ItemInstanceId? BackingItem;              // if it came from a unique instance
}

public sealed class BuildingPermission {
    public PlayerId Player; public Role Role; public PropertyCap Caps;       // Role preset + custom flags
    public PropertyCap Denied; public List<ushort> RoomOverrides;            // per-room restrictions
    public long GrantedUnix; public PlayerId GrantedBy; public long? ExpiresUnix;
}
public enum Role : byte { Visitor, Friend, Decorator, Builder, CoOwner, Owner, Custom }

// ---------------- SHOPS ----------------
public sealed class Shop {
    public string Id; public string NameKey; public string NpcId; public string InteriorId; public float PriceMultiplier;
    public List<ShopEntry> Entries; public float BuyBackRate; public string[] Services; public RotationRule Rotation;
}
public sealed class ShopEntry { public string EntryId; public DefId Item; public int Price; public StockRule Stock; public int MinLevel; public string RequiresAchievement; public long? From, To; public int PerPlayerLimit; }

// ---------------- ACHIEVEMENTS ----------------
public sealed class Achievement {
    public string Id; public string NameKey, DescKey; public string Category; public bool Secret;
    public AchievementRule Rule;          // { Event: "FurniturePlaced", Filter: {...}, Target: 100, Counter: Unique|Total }
    public Reward[] Rewards;              // Coins, Stars, items, titles, badges
}
public sealed class AchievementProgress { public string Id; public int Progress; public long UnlockedUnix; public bool Claimed; }

// ---------------- CASINO ----------------
public sealed class CasinoTable {
    public TableId Id; public GameType Type; public ZoneId Zone; public TableLimits Limits; public Seat[] Seats;
    public HashSet<PlayerId> Spectators; public long RoundCounter; public byte[] StateBlob;   // game-specific serialized state
}
public sealed class Seat { public int Index; public PlayerId? Occupant; public long Escrow; public bool SittingOut; public int ConsecutiveTimeouts; public double LastActionServerTime; }

public sealed class RouletteGame {
    public Phase Phase; public double PhaseEndsAt; public ulong RoundId; public byte[] RoundSeedHash;      // receipt
    public Dictionary<PlayerId, List<PlacedBet>> Bets; public int? Result; public Queue<int> History;
    public bool LaPartage;
}
public readonly struct PlacedBet { public ushort SpotId; public long Stake; }

public sealed class BlackjackGame {
    public Phase Phase; public double TurnEndsAt; public List<int> Shoe; public int ShoeIndex, CutIndex;
    public BjHand Dealer; public BjSeat[] Seats; public int ActiveSeat; public ulong RoundId;
}
public sealed class BjHand { public List<int> Cards; public long Bet; public bool Doubled, FromSplit, Stood, Busted, Blackjack; public long Insurance; }

public sealed class PokerGame {
    public Phase Phase; public int ButtonSeat, SmallBlindSeat, BigBlindSeat, ActingSeat; public int SmallBlind, BigBlind;
    public int[] Deck; public int DeckIndex; public List<int> Board; public PokerSeat[] Seats;
    public List<Pot> Pots; public long CurrentBet, MinRaise; public double ActionEndsAt; public ulong HandId; public long RakeTaken;
}
public sealed class PokerSeat { public PlayerId? Player; public long Stack; public int[] Hole; public long BetThisRound, TotalContributed; public bool Folded, AllIn, SittingOut; public int TimeBankMs; }
public sealed class Pot { public long Amount; public List<int> EligibleSeats; }

public sealed class HorseRace {
    public ulong RaceId; public Phase Phase; public double PhaseEndsAt; public int DistanceM; public TrackCondition Condition;
    public List<RaceEntry> Entries;               // 8 horses: id, ratings snapshot, win probability, odds (locked)
    public Dictionary<PlayerId, List<HorseBet>> Bets; public int[] FinishOrder;      // decided at race start
    public ulong AnimSeed; public byte[] SeedHash; public double[] FinishTimes;
}
public sealed class HorseBet { public BetKind Kind; public int[] Horses; public long Stake; public float LockedOdds; }

// ---------------- SAVE ----------------
public sealed class SaveGame {                        // logical view of a world on disk
    public Guid WorldId; public string Name; public int SaveSchemaVersion; public int ContentVersion; public List<PackRef> Packs;
    public WorldSettings Settings; public PlayerId Host; public long CreatedUnix, LastPlayedUnix; public long PlaytimeSeconds;
    public ulong NextItemId, NextObjectId, NextTxId; public bool ModifiedFlag; public string DbPath;
    // Players/Properties/etc. are rows in world.db, loaded as aggregates on demand
}
```

### 21.3 Design notes
- **Aggregates and boundaries:** `Player`, `Property(+Layouts)`, `World`, `Casino` are separately loaded/saved aggregates → partial loading (only properties with occupants or owners online are in memory), partial saves, and independent recovery.
- **Everything has an ID, everything references by ID:** adding furniture = new `DefId`; adding a property = new lot entry; adding an activity = new definition + achievement rules.
- **Interfaces for extension:** `IGameEvent` (for achievements/telemetry), `ICommandHandler<T>`, `ITableGame`, `IBuildTool`, `ISaveMigration`, `IContentValidator`.

## 23. Performance strategy

**Targets:** 1080p/60 fps on GTX 1050 Ti / Radeon RX 560 / Intel Iris Xe (Low), 60 fps on Steam Deck (Medium), 120+ on mid-range PCs; Host with 16 players at ≥ 60 fps on same hardware. Memory ≤ 3 GB. Interiors with 1,500 objects at 60 fps, 3,000 objects at ≥ 40 fps (max cap).

**Frame budget (16.6 ms):** render 9 ms · gameplay/Sim 2 ms (Host extra) · net 1 ms · UI 1.5 ms · audio 0.5 ms · headroom 2.5 ms.

### Rendering
- **Furniture batching:** placed furniture is data in `PlacedFurnitureStore`. `FurnitureViewManager` partitions per room/chunk (8×8 tiles): non-interactive static items render via **`Graphics.RenderMeshInstanced`/BatchRendererGroup** grouped by `(mesh, material)`; per-instance color slots via instanced property data (no material duplication). Interactive/animated items (lamps with lights, TVs, chairs with sit slots, doors) get **pooled GameObjects** only within **12 m** of any local avatar/camera focus, spawned over several frames (time-sliced) to avoid spikes.
- **Shared atlases/palettes:** one 1024² palette atlas per category + texture arrays for wall/floor materials → minimal material count; SRP Batcher compatible shaders.
- **LOD:** 3 LODs per furniture (100% / 50% / 20%) + imposter billboard for >40 m in yards/outdoors; screen-size cull for tiny decor (<1% screen).
- **Occlusion:** exterior: baked occlusion culling per 64 m cell; interior: **room/portal visibility** — render only the camera's room + rooms visible through open doors/windows (computed from `RoomGraph` + openings); **cutaway camera** in build mode disables this.
- **Lights:** per-room budgets (default 4 shadowed + 24 unshadowed), shadow distance and cascades low in interiors; others use emissive+glow cards; light-probe grids baked per shell type.
- **Walls/floors:** procedural meshes per chunk/level merged per material; rebuilt only for dirty chunks on worker threads (Jobs/Burst), uploaded via `Mesh.SetVertexBufferData`.
- **Characters:** baked single skinned mesh/atlas per `appearanceHash`; **animation LOD** (update rate and bone count reduced with distance); crowd NPCs use GPU-skinned instancing; hide nameplates >30 m; cap fully-rendered avatars to 40 nearest.
- **Overdraw/postfx:** modest post stack (bloom, color grading, SSAO off by default on Low); dynamic resolution option.

### World streaming & loading
- Open world in **64 m cells** via Addressables; async load/unload ring (load radius 1.5 cells, unload 2.5) with time-sliced instantiation; interiors (shops/casino) as additive scenes loaded on door transition with a fade (≤ 1.5 s target).
- **Property interiors:** loaded on demand; **furniture layout cache** keyed `(propertyId, layoutRev)`; unload 60 s after last occupant leaves; object pools persist.
- **Yards** stream with their cell; yard objects are LOD'd aggressively; max 150–400 objects.

### Networking performance
- Interest management (7.8), movement tiering, delta/op-based furniture sync, appearance hash caching, batched reliable events per tick (coalesce multiple ops into one packet ≤ 1,200 bytes MTU-friendly; fragment big blobs), LZ4 for blobs, bit-packed snapshots.
- Bandwidth budget per client: ≤ 40 KB/s typical (16 players), ≤ 150 KB/s burst (zone entry). Host upstream with 16 clients ≈ 0.7–1.5 MB/s.
- Property **layout sync on entry**: cached by rev → usually zero or tiny delta; else ≤ 20–30 KB compressed.
- Server work scales with *zones*, not world size: idle zones don't tick (NPC/trigger systems sleep without subscribers).

### CPU / memory
- Sim in plain C# with arrays/structs (no LINQ in hot paths), **spatial hash** for placement, preallocated buffers, **object pooling** for events, bubbles, nameplates, VFX, audio sources; zero-GC target in steady state (profiled).
- **NPCs:** ambient crowd deterministic and cheap; interactive NPC AI ticks 5–10 Hz with distance LOD and sleep when unobserved.
- **Saves:** dirty-aggregate writes on worker threads; layout blobs ~20 KB; SQLite WAL; no per-frame I/O; backups throttled and low priority.
- **Memory:** Addressables ref-counted unload per district; texture streaming; audio compressed (Vorbis) with streaming for music.

### Profiling gates (CI/perf runs)
Automated PlayMode perf scene: 3,000-object mansion + 24 avatars; record frame time, GC alloc, draw calls (budget ≤ 1,500 interior), memory — fail PR if regressions exceed thresholds.

## 24. Suggested project / folder structure

```
casinete-game/
├─ docs/                              (this blueprint)
├─ content/                           authoring data (source of truth for definitions)
│  ├─ items/ furniture/ cosmetics/ shops/ properties/ achievements/ slots/ horses/ npcs/ dialogues/ events/
│  └─ redirects.json
├─ src/                               ENGINE-FREE C# (also consumed by Unity as local packages)
│  ├─ Casinete.Core/        (IDs, Result, Rng/RoundRng, math, BitPacking, Clock)
│  ├─ Casinete.Content/     (definitions, ContentDb, validators)
│  ├─ Casinete.Sim/
│  │   ├─ Economy/ (Ledger, Pricing, Faucets, Sinks)
│  │   ├─ Items/ (ItemLedger, Inventory, Containers)
│  │   ├─ Housing/ (Property, Layout, Placement, Rooms, Leases, Blueprints, Snapshots)
│  │   ├─ Shops/  ├─ Social/ (Chat, Friends, Party, Trade, Gifts)
│  │   ├─ Casino/ (Table framework, Roulette, Blackjack, Poker, Slots, Horses, ResponsiblePlay)
│  │   ├─ Progression/ (XP, Achievements, Collections, Prestige)
│  │   └─ Npc/ (definitions, dialogue graph runtime, behavior trees)
│  ├─ Casinete.Net/         (Transport interfaces, protocol, serializers, sessions, interest, rate limits)
│  ├─ Casinete.Persistence/ (SQLite repo, migrations, backups, integrity)
│  ├─ Casinete.Host/        (HostRuntime, CommandRouter, tick loop)
│  ├─ Casinete.Client/      (ClientReplica, prediction, ViewModels)
│  └─ Casinete.Tools/       (SlotSim, ContentBuilder, SaveInspector, BotHarness CLI)
├─ tests/
│  ├─ Casinete.Sim.Tests/ Casinete.Net.Tests/ Casinete.Persistence.Tests/ Casinete.Integration.Tests/ (bot harness)
│  └─ golden-saves/ v1/ v2/ …
├─ unity/Casinete/                    UNITY PROJECT (presentation only)
│  ├─ Packages/ (local packages → symlink/junction to src/*)
│  └─ Assets/_Game/
│     ├─ Bootstrap/ (scenes: Boot, MainMenu, World, Interiors/*, Districts/*)
│     ├─ Presentation/ (Avatars, Furniture views, Housing views/ProceduralMesh, Casino views, NPC views, VFX)
│     ├─ BuildMode/ (tools, ghosts, camera, undo UI)
│     ├─ UI/ (UIDocuments, USS themes, ViewModels glue, world-space UI)
│     ├─ Audio/ (mixer, cues, banks) ├─ Input/ ├─ Art/ (models, textures, materials, shaders, anims) └─ Addressables/
├─ tools/ slot-sim/ …  (python reference sims, build scripts)
└─ .github/workflows/ (ci.yml: dotnet test, content build, unity build, rtp certification)
```
Source of truth for Sim code is `src/`; Unity references it as local packages (each with an `.asmdef` where `noEngineReferences = true`), and `dotnet test` compiles the same files.

## 25. Major classes/components and responsibilities

| Class / component | Layer | Responsibility |
|---|---|---|
| `HostRuntime` | Host | Composition root: loads world, creates `SimWorld`, `CommandRouter`, `InterestManager`, `PersistenceService`, transports; runs tick loop |
| `CommandRouter` | Net/Host | Decode, rate-limit, authenticate, route to `ICommandHandler<T>`, produce `CommandResult`, hand events to `InterestManager` |
| `ICommandHandler<T>` | Sim | `Authorize/Validate/Execute` of one command type |
| `Ledger` | Sim | Sole mutator of wallets/item locations; atomic multi-op transactions, idempotency, journal |
| `ItemLedger` | Sim | Item moves/mints/destroys with compare-and-swap on location |
| `InventoryService` | Sim | Queries, favorites, sort support projections, mailbox handling |
| `PropertyService` | Sim | Buy/sell/transfer, tiers/upgrades, access, permissions, upkeep |
| `HouseLayoutService` | Sim | Authoritative layout ops (walls/floors/openings/stairs/furniture), revisions, op log, snapshots |
| `PlacementValidator` | Sim + shared | Pure function used by Host (authoritative) and Client (preview) |
| `SpatialIndex` | Sim + shared | Per-floor hash grid for broadphase + OBB narrow-phase |
| `RoomGraph` | Sim + shared | Flood fill rooms, stable id mapping, visibility graph |
| `LeaseManager` | Sim | Object/region leases with expiry & heartbeat |
| `BlueprintService` | Sim | Capture/apply/validate blueprints, bill of materials |
| `ShopService` | Sim | Stock, rotation, purchases, buy-back |
| `FaucetService` / `SinkService` | Sim | Rewards with diminishing returns / upkeep, taxes |
| `CasinoManager` | Sim | Creates tables from content, manages seats/spectators/escrow |
| `RouletteGame`, `BlackjackGame`, `PokerGame`, `HorseRaceService`, `SlotEngine` | Sim | Game rules/state machines (pure, deterministic from `RoundRng`) |
| `RoundRng` | Core | HMAC-SHA256 DRBG from CSPRNG seed; unbiased ints; Fisher–Yates |
| `AchievementEngine` | Sim | Event-driven rule evaluation, rewards, claim |
| `NpcDirector` | Sim | Spawns/ticks service & roaming NPCs; dialogue runtime |
| `PersistenceService` | Persistence | Dirty tracking, worker-thread snapshot saves, immediate flushes, backups, integrity checks |
| `MigrationRunner` | Persistence | Detect/backup/migrate with golden-file-tested steps |
| `InterestManager` | Net | Zone subscriptions, snapshots on enter/leave, event fan-out |
| `INetTransport` (+ UTP/Loopback/LatencySim) | Net | Connection, channels, send/receive |
| `ClientRuntime` / `ClientReplica` | Client | Sends commands, applies events to a read-only mirror, resync handling |
| `ViewModels` | Client | Presentation state (inventory, shop, build, chat) with bindings |
| `AvatarView`, `CharacterBaker` | Unity | Appearance → baked mesh; animation, nameplate, bubble |
| `FurnitureViewManager` | Unity | Instanced rendering + pooled interactables by chunk |
| `ProceduralHouseMesher` | Unity | Walls/floors/stairs chunk meshes from layout data |
| `BuildController` + `IBuildTool`s | Unity | Input → ghosts → commands; undo/redo; clipboard |
| `WorldStreamer` | Unity | Cell/interior load-unload with Addressables |
| `UiRoot`, `ScreenManager` | Unity | UI Toolkit screen stack, input glyphs, focus nav |
| `AudioService`, `MusicDirector` | Unity | Buses, cues, zone music/ambience, snapshots |
