# 08 — MVP, Roadmap, Testing, Risks, Expansion, Prototype Plan

## 26. MVP feature list (the first playable prototype — "Milestone M1")

Exactly the 16 points requested, with the minimum viable definition of each:

| # | Feature | Minimum viable definition |
|---|---|---|
| 1 | Main menu | Play (Host/Join), Settings (audio/graphics/keys), Quit; Unity UI Toolkit; localized string tables |
| 2 | Host game | New world or load; name, max players, port; shows LAN address + join code; autosave on |
| 3 | Join game | LAN beacon list + direct IP/code; handshake with identity key; clear errors |
| 4 | Basic multiplayer movement | WASD + camera; interpolated remote avatars; host-validated movement; 8 players smoke-tested |
| 5 | Character appearance | Creator-lite: 3 bodies, 8 skin tones, 12 hair, 8 hair colors, 10 tops, 8 bottoms, 6 shoes (data-driven); saved; synced; baked into one mesh |
| 6 | One small neighborhood | **Sunny Row** greybox-plus: 12 lots (8 studio/cottage doors + 4 houses), plaza spawn, shop, 3 NPCs |
| 7 | One house | One cottage interior (10×10, fixed walls — no wall editing yet), instanced, entry/exit transitions |
| 8 | Property ownership | Claim a free starter property; owner stored; lock/unlock; visitor can enter if unlocked |
| 9 | Basic furniture inventory | ~30 furniture definitions; inventory UI with categories, search, counts |
| 10 | Furniture placement | Grid placement from inventory with ghost/green-red validity, collision, object cap |
| 11 | Rotation/removal | 90° rotate, pick up (returns to inventory); undo of last action |
| 12 | Multiplayer furniture sync | Host-authoritative ops with revisions; two players in one house see edits live; lease on drag; rejection feedback |
| 13 | Saving/loading | SQLite world: players, wallet, inventory, properties, layouts; autosave 60 s; manual save; rotating backups; reload verified |
| 14 | Basic shop | One furniture shop with 30 items, buy with Coins, price/rarity/owned badge, confirmation |
| 15 | Currency | Coins wallet (Host-owned, ledger-protected), starter 5,000, one daily reward |
| 16 | Chat | Local chat + bubbles, rate limit, basic filter |

**Out of M1:** wall/floor editing, stairs, casino, trading, friends/party, clothing shops, NPC dialogues beyond a stub, achievements, audio beyond placeholders, vehicles.

## 27. Development roadmap

**Assumptions:** small team of ~4 (2 gameplay/network engineers, 1 tech artist/UI, 1 generalist artist) + part-time audio/design. Durations are *calendar weeks of the team*; a solo developer should multiply by ≈ 2.5–3×. Each phase ends with a **playable build and a playtest**. Never start a phase's content work before its **systems** are stable (and its tests green).

### Phase 0 — Foundations & technical spikes (3 weeks)
- **Goal:** retire the biggest technical risks and set up the pipeline before building features.
- **Features:** repo/CI, assembly structure, content pipeline v0, `INetTransport` + UTP + loopback, LAN beacon, SQLite on IL2CPP, 3,000-object instanced furniture benchmark, procedural wall mesh prototype, MessagePack AOT, identity handshake.
- **Systems required:** `Core`, `Net` skeleton, `Persistence` skeleton, CI (`dotnet test` + Unity build).
- **Dependencies:** none.
- **Test:** 2 machines on LAN exchange commands/events with simulated 150 ms/5% loss; SQLite read/write on a Windows IL2CPP build; 3,000 instanced objects hold 60 fps on target low-end GPU; headless Sim runs unit tests in CI.
- **Done when:** the four spikes pass their numeric budgets and are documented; ADRs written for transport/serialization/persistence.

### Phase 1 — Prototype A "Walk Together" (4 weeks)
- **Goal:** two to eight players walk around one neighborhood together and chat.
- **Features:** MVP #1–6, #16 (menu, host, join, movement, appearance-lite, Sunny Row, chat). Day/night optional stub.
- **Systems required:** `HostRuntime`, `CommandRouter`, sessions/handshake, `InterestManager` (cells), movement validation, `AvatarView` + `CharacterBaker` v1, UI Toolkit shell/theme, chat service.
- **Dependencies:** Phase 0.
- **Test:** 8-bot join/leave soak (30 min), reconnect within 60 s, movement under 150 ms RTT with 5% loss (no rubber-banding for honest clients, snap-back for speed hack), version mismatch rejection, chat rate limit.
- **Done when:** a friend group can host/join over LAN and move/chat for an hour without desync or crash; 60 fps on low-end target with 8 avatars.

### Phase 2 — Prototype B "My Home" (7 weeks) → **Milestone M1**
- **Goal:** own a house, furnish it together, and keep it.
- **Features:** MVP #7–15: one house interior instance, property ownership/locking, furniture inventory, placement/rotation/removal, undo(1), multiplayer furniture sync with leases/revisions, saving/loading with backups, basic shop, Coins + ledger, daily reward.
- **Systems required:** `Ledger`/`ItemLedger`, `PropertyService`, `HouseLayoutService` v1 (furniture only), `PlacementValidator` + `SpatialIndex`, `LeaseManager`, `ContentDb`/`ContentBuilder`, `PersistenceService` (dirty aggregates, backups, integrity), `ShopService`, `InventoryService` + UI, furniture views (instanced), interior instancing, `InterestManager` instances.
- **Dependencies:** Phase 1.
- **Test:** unit tests for ledger conservation and placement; fuzz two clients editing the same room (no dupes, no overlaps, leases expire); save → kill process → reload → identical layout hash; crash during autosave; two players buying last-limited item; item-duplication attack scripts all rejected.
- **Done when (M1 gate):** 4 players can each own a home, decorate with ≥ 30 furniture types, visit each other, buy items, quit, relaunch, and find everything intact; all duplication/exploit tests pass; playtest feedback says "placing furniture feels good".

### Phase 3 — Advanced building (8 weeks)
- **Goal:** the full "build anything" toolset with safe collaboration.
- **Features:** walls/rooms/floors/openings/stairs, multi-floor cutaway, wall paint/trim, free placement + snap modes, surface stacking, wall-mounted items, lighting budget & ambient presets, multi-select, copy/paste, full undo/redo, saved layouts + auto snapshots, blueprints (capture/apply/BOM/share), region leases, edit audit log + revert, room derivation + stable ids.
- **Systems required:** `HouseLayout` full model, `RoomGraph`, `ProceduralHouseMesher`, `IBuildTool` suite, `UndoRedoStack`, `Clipboard`, `BlueprintService`, `SnapshotService`, layout blob format v2 + migration, room visibility culling.
- **Dependencies:** Phase 2.
- **Test:** property-based tests on wall/room topology (rooms partition tiles, ids stable); placement edge cases (SAT, stacking cycles); 3,000-object perf scene; concurrent edit fuzz with region leases; blueprint round-trip equality; layout migration golden files.
- **Done when:** an untrained tester can build a 2-story house with stairs in under 30 minutes; 3 builders edit simultaneously without conflicts/dupes; mansion perf budget met.

### Phase 4 — Properties & housing depth (5 weeks)
- **Goal:** many properties, upgrades, access control and the rental/ownership economy.
- **Features:** all property tiers/shells, apartments (towers + elevator), yards, upgrades/expansions, sell/transfer, upkeep + dusty state, roles/capability matrix + per-room overrides, doorbell/invites/bans/capacity, house directory & likes, prestige/style score v1, town hall property office, lot map, shell exterior styles.
- **Systems required:** `PropertyService` full, permission matrix UI, shell variant swapping, `StyleScoreService`, invitation tokens, directory.
- **Dependencies:** Phase 3.
- **Test:** permission matrix tests (each role × capability); sale refunds/ledger audit; upgrade migrations; grief scenarios (revoke mid-edit, kick while editing); upkeep arithmetic by playtime.
- **Done when:** a group can buy different tiers, share roles, upgrade, sell, and never lose items; role changes apply instantly in live sessions.

### Phase 5 — Characters & cosmetics (6 weeks)
- **Goal:** unique, expressive characters with a real wardrobe.
- **Features:** full creator (face sliders, makeup, tattoos, 3 bodies), all slots/layering/conflicts, color channels/patterns, wardrobe/outfits, salon & dressing rooms, clothing shops, cosmetic inventory, appearance validation & hash caching, emotes v1.
- **Systems required:** `CosmeticDefinition` + auto-fit pipeline, `CharacterBaker` v2 (atlas), wardrobe service, appearance validation.
- **Dependencies:** Phase 2 (inventory/shops); can parallelize with Phase 3–4 (art-heavy).
- **Test:** all-slot combination clipping matrix (automated renders), baking perf (≤ 8 ms spike per spawn), validation rejects unowned cosmetics, appearance persistence.
- **Done when:** 20 testers create visibly distinct characters in < 3 minutes; no clipping in the standard test matrix.

### Phase 6 — Social systems (5 weeks)
- **Goal:** reasons to meet.
- **Features:** friends, parties, phone app hub, profiles & inspect/try-look, house invitations, guestbook/likes, emote wheel + paired emotes, trading (escrow), gifting + mailbox, mute/block/report, Host admin tools (kick/ban/mod log), notification center.
- **Systems required:** `FriendService`, `PartyService`, `TradeService`, `MailboxService`, `ModerationService`, phone UI.
- **Dependencies:** Phase 2 (ledger), Phase 4 (invitations).
- **Test:** trade race/duplication tests (disconnect at every step), spam/flood tests, party teleports with permissions, privacy toggles.
- **Done when:** 12 players can party, trade, and visit with zero item-loss/dup in 2-hour soak.

### Phase 7 — Economy & activities pass + district expansion 1 (6 weeks)
- **Goal:** a healthy, fun economy and a bigger town.
- **Features:** full shop network (furniture, hardware, nursery, clothing…), daily rewards/tasks, jobs/activities (barista, courier, gardener, fishing, DJ, photographer), diminishing returns, taxes/fees, Daily Deals/rotations, catalog, economy telemetry dashboard; districts: **Fountain Square, Market Street, Maple Hills, Greenway Park**; tram; postcards.
- **Systems required:** `FaucetService`, `SinkService`, `EconomyTelemetry`, activity framework (`ActivityDefinition` + minigame runner), `WorldStreamer` v2, tram.
- **Dependencies:** Phases 2, 4, 6.
- **Test:** Monte-Carlo economy simulation (simulated players over 200 hrs → wealth curves, sink ratio); anti-farm tests; streaming transitions.
- **Done when:** simulated and live playtests hit the pacing table (Cottage ≈ 10–15 hrs); no single activity dominates income (> 40% share).

### Phase 8 — Casino foundation: roulette & slots (6 weeks)
- **Goal:** the casino table framework with the first two games.
- **Features:** Lucky Mile greybox → casino interior, cashier/responsible-play, table framework (`ITableGame`), `RoundRng`, **European Roulette** (full bets, UI, animation, multiplayer), **slots** engine + 2 machines (Clover, Boardwalk), Town Jackpot, SlotSim tool + CI RTP gates, Fun-Chip home tables stub.
- **Systems required:** `CasinoManager`, `RouletteGame`, `SlotEngine`, escrow/seat manager, `Tools/SlotSim`.
- **Dependencies:** Phase 2 (ledger), 6 (spectators/social), 7 (economy).
- **Test:** RNG chi-square, roulette payout table vs reference for all 157 bet spots, 10⁹-spin RTP certification, bet-after-lock attacks, disconnect settlement, wallet conservation property tests.
- **Done when:** 8 players on one roulette table with synced spin; RTP within bands; zero ledger drift after 100k simulated rounds.

### Phase 9 — Blackjack & poker (7 weeks)
- **Goal:** the two card games.
- **Features:** blackjack (rules in 15.C), Texas Hold'em (blinds, side pots, timers, rake, rebuy, hand history), dealer NPC animation hooks, hole-card privacy, card UI/animations.
- **Systems required:** `BlackjackGame`, `PokerGame`, `HandEvaluator`, shoe/deck, `TableSeatManager` (turn timers), card views.
- **Dependencies:** Phase 8.
- **Test:** hand evaluator vs exhaustive 7-card enumeration; side-pot scenarios (multi all-ins, folds, odd chips); blackjack strategy-based simulation (house edge ≈ 0.5%); timeout/disconnect fuzz; hole-card leak tests (packet inspection shows no foreign hole cards).
- **Done when:** 6-player poker hands complete flawlessly through 500 simulated hands; no leaks; accounts reconcile exactly.

### Phase 10 — Horse racing (4 weeks)
- **Goal:** the social spectacle.
- **Features:** Marigold Downs track, 24 horses, race scheduler, odds engine (Plackett–Luce), betting UI/booths/phone, parade/race cameras, announcer, grandstand seats/emotes, pools, form updates.
- **Systems required:** `HorseRaceService`, choreography generator, track spline/animation system, betting UI.
- **Dependencies:** Phase 8.
- **Test:** simulate 10⁶ races: empirical win freq vs displayed probabilities within 0.2%; payout/takeout ≈ 85%; animation always finishes in decided order; late-join sync.
- **Done when:** a watch party of 10 can bet, watch, cheer and get correct payouts, and a photo-finish reads clearly.

### Phase 11 — NPCs, remaining districts, audio pass (6 weeks)
- **Goal:** a living, finished-feeling world.
- **Features:** all districts (Downtown towers, Bistro Lane, Neon Quarter, Pearl Beach, Lakeside, Gilded Crest), nightclub/arcade/cinema/karaoke, ambient crowds + schedules, service NPCs + dialogue graphs, Pip tutorial, roaming NPCs (taxi/couriers), audio system complete (mixer/cues/music/ambience/footsteps), vehicles (bikes/scooters/golf carts) *optional*.
- **Systems required:** `NpcDirector`, `AmbientCrowdSystem`, `DialogueRunner`, `AudioService` full, world streaming at full scale.
- **Dependencies:** Phases 4, 7, 8–10.
- **Test:** streaming perf walk-through (no hitch > 50 ms), crowd density scaling, audio snapshot transitions, NPC sync (service/roaming), full-world memory budget.
- **Done when:** a first-time player can complete the guided tutorial and wander for an hour with constant things to do; world meets perf budgets on low spec.

### Phase 12 — Progression, achievements, collections (4 weeks)
- **Goal:** long-term motivation without restricting creativity.
- **Features:** Player/Builder/Social/Explorer/High-Roller tracks, ~120 achievements, titles/badges, collections albums, prestige & House of the Week, weekly challenges, events system, XP anti-farm rules.
- **Systems required:** `AchievementEngine`, `ProgressionService`, `CollectionService`, `EventScheduler`.
- **Dependencies:** nearly all gameplay systems (events feed rules).
- **Test:** achievement rule unit tests, XP simulation (curve checks), anti-farm scripts (place/remove loops yield nothing).
- **Done when:** completion rate telemetry plausible (no single trivially-farmable XP source); designers can add an achievement without code.

### Phase 13 — Polish, hardening, beta → v1.0 (8 weeks)
- **Goal:** stable, fast, accessible, releasable.
- **Features:** perf optimization pass, controller polish, accessibility options, localization-ready, onboarding polish, save migrations v1→, backups UX, Passport export, host admin panel, crash reporting, moderation polish, store assets, closed beta w/ telemetry.
- **Test:** 24 h soak (16 bots + 4 humans), memory-leak run, migration matrix, security fuzz (malformed packets), compatibility matrix (OS/GPU), accessibility audit.
- **Done when:** crash-free sessions ≥ 99.5% in beta; no known dupe/exploit; perf budgets met on min spec; save migration verified from every beta version.

**Timeline summary:** M1 (playable prototype) ≈ **14 weeks** (Phases 0–2). Feature-complete alpha ≈ **+45 weeks**. v1.0 ≈ **~14 months** with 4 people (≈ 3 years solo).

**Parallel tracks:** art production (furniture/clothing/district kits) runs continuously from Phase 2 with a *content cadence* (e.g., +40 furniture & +40 cosmetics per month) driven by the content pipeline; audio and UI polish interleaved.

## 28. Testing strategy

### 28.1 Pyramid
1. **Pure C# unit tests (fast, CI on every PR):** economy, ledger, placement/collision, room graph, permissions, shop rules, casino games, hand evaluator, XP curves, migrations, serialization round trips. Engine-free Sim makes ~80% of logic testable without Unity.
2. **Property-based/fuzz tests (FsCheck-style):** invariants that must hold for *any* random command sequence:
   - Conservation: Σ(coins) + escrows + sunk − minted == 0; item units each in exactly one location.
   - No overlapping objects; all objects within bounds; object cap respected.
   - Permission invariants: no state change by an unauthorized actor.
   - Undo/redo never creates items.
3. **Deterministic casino tests:** seeded `RoundRng` replays; exhaustive enumeration where tractable (roulette spots; 7-card hand distribution counts 133,784,560); Monte-Carlo with confidence intervals (blackjack house edge, horse probabilities); slot RTP certification at 10⁹ spins in CI (nightly).
4. **Integration tests with bots:** headless `BotHarness` spins up a Host + N loopback/UTP clients with `LatencySimTransport` (RTT 20–300 ms, jitter, 0–10% loss, duplicate/reorder). Scripts: join/leave churn, simultaneous furniture edits, shopping races, trade disconnects, table play, reconnect.
5. **Security tests:** malicious-client fuzzer sending out-of-range IDs, replayed/duplicated commands, huge arrays, wrong-state actions, rate floods; assert Host never crashes, never changes value illegitimately, and kicks repeat offenders.
6. **Persistence tests:** kill -9 at random points during autosave; power-loss simulation (truncate WAL); corrupted blob injection; backup restore; **golden-save migration** from every historical version; forward-compat read-only.
7. **Unity PlayMode/EditMode tests:** UI flows (create world, join, buy item), mesher output vs expected, build tools produce expected commands, input rebinding, localization key coverage.
8. **Performance tests:** automated perf scenes (mansion 3,000 objects, 24 avatars, casino hall full) capturing frame time/GC/draw calls; gate on thresholds.
9. **Manual/Playtest QA:** weekly 8-player playtests; structured checklists (placement feel, camera in build mode, controller navigation), accessibility audit, localization pass, console/Steam-Deck input pass, **bug bash** before each milestone.
10. **Telemetry in beta:** opt-in anonymous metrics (crashes, perf, funnel: tutorial completion, first purchase, first placement, first visit), host-world economy stats.

### 28.2 Test matrix (key scenarios)
- Network: LAN, Wi-Fi, loopback, high latency, packet loss, NAT'd direct connect, host alt-tab/hitch, host quits while players in casino/trade/edit.
- Edge: 3,000-object house load/unload; sale with occupants; permission revoked mid-drag; duplicate cmd after reconnect; two buyers last stock; trade + disconnect; poker all-in side pots with disconnects; horse race joined mid-race; save while 16 players active.
- Content: validators fail on missing assets/duplicate IDs/overlapping footprint issues; every furniture item placed in every placement mode; every cosmetic worn on every body type.

### 28.3 Definition of done (per feature)
Design doc updated · unit tests + (if networked) bot test · security review checklist (authz, validation, rate-limit, idempotency, journaling) · perf budget check · accessibility check · localization keys · telemetry events · save/migration impact assessed.

## 29. Major technical risks and solutions

| # | Risk | Likelihood/Impact | Mitigation |
|---|---|---|---|
| 1 | **Furniture scale/performance** (thousands of objects) | M/H | Data-first model; instancing + pooled interactables; room culling; hard cap 3,000; perf gates from Phase 0 spike and every CI run |
| 2 | **Concurrent editing conflicts/desync** | M/H | Leases + revisions + atomic group ops; bot fuzzing; audit log + snapshots/revert |
| 3 | **Item/currency duplication** | M/Critical | Single-location invariant, ledger CAS, idempotent commands, journal + conservation audits, DB CHECK constraints, property tests |
| 4 | **Listen-server Host trust & NAT** | H/M | Document limits; dedicated-server path; LAN-first; optional UPnP; Relay/Steam adapter later; encryption for non-LAN |
| 5 | **Host performance** (sim + render + 16 clients) | M/M | Sim at 20 Hz with interest filtering, zones sleep without subscribers, bandwidth caps, avatar/NPC budgets; dedicated server option |
| 6 | **SQLite/native plugins on IL2CPP & consoles** | M/M | Spike in Phase 0 on target platforms; abstraction `IWorldRepository` allows a fallback binary backend |
| 7 | **Save corruption / migration breakage** | M/H | WAL ACID, hash-verified blobs, granular recovery, rotating backups, golden-file migration tests, forward-compat read-only |
| 8 | **Content production volume** (hundreds of furniture & cosmetics) | H/H | Strict style guide, prefab templates + validators, atlases/palettes, procedural recolor/variants, kit-bashing, modular sockets, marketplace/outsourcing budget, cadence planning |
| 9 | **Clothing fit/clipping across bodies** | H/M | Single rig, 3 bodies with blendshape auto-fit, region hiding masks, automated clipping test renders |
| 10 | **Procedural wall/room topology complexity** | M/M | Edge-based data model; property-based tests; room ids stable by overlap mapping; mesher on dirty chunks; strict validation of ops |
| 11 | **Scope creep / too many systems** | H/H | Phase gates, M1 prototype first, design pillars, "housing first" rule, cut list (vehicles, voice, pets) |
| 12 | **Gambling-themed content: ratings/platform policies/legal** | M/H | Fictional currency only, no purchase/cash-out/loot boxes, Stars unbettable, host toggle + compile flag, responsible-play tools, age-rating plan (ESRB "Simulated Gambling" descriptor etc.), policy review per storefront before launch |
| 13 | **UGC moderation (chat, names, photos)** | M/M | Filters, mute/block/report, Host admin tools, photo size limits and optional Host approval, default-safe chat settings |
| 14 | **Time/clock exploits** | L/M | All time Host-side (`serverTime`); daily resets by Host clock |
| 15 | **Casino fairness perception** | M/M | CSPRNG + unbiased sampling, replayable rounds, Fair Play Receipt, published rules/odds, no fake near-misses |
| 16 | **Accessibility/controller parity for build mode** | M/M | Design controller UX from Phase 2; virtual cursor, radial menus, test with controller-only QA |
| 17 | **Unity version/tooling changes** | L/M | Pin LTS, engine-free Sim isolates logic, avoid experimental packages in critical paths |
| 18 | **Networking edge cases (time sync, reconnection)** | M/M | Event sequence replay + snapshot resync, ghost sessions, LatencySim in CI |

## 30. Future expansion possibilities

- **Dedicated servers:** headless build, admin console, web dashboard, scheduled backups, whitelist, persistent worlds for communities.
- **Online invites & relay/lobbies:** Steam/EOS/UGS Relay transport adapters, friend lists across worlds, cross-platform play.
- **More world:** new districts (mountain lodge, island resort, snowy village), seasonal city re-skins, expansion lots, a second city.
- **Vehicles & pets** (bikes/scooters/cars with garages; cats/dogs).
- **Advanced building:** curved walls, roofs/attic editing, terrain sculpting for yards, modular facades, interior-visible windows, custom textures from approved library, procedural landscaping.
- **Contraptions v2:** richer logic, minigame creator (obstacle courses), scripted home events.
- **Creator economy (no real money):** blueprint workshop (shared via codes/Steam Workshop), house contests, "Architect" tier with cosmetic rewards.
- **Social:** proximity voice (opt-in), guilds/clubs with shared clubhouses, concerts with user-driven DJ sets, marketplace stalls (player shops with Coin tax), housemate chores, weddings/events.
- **Casino/minigames:** more machines, poker tournaments (sit&go), craps/baccarat/bingo, horse ownership/stable management, arcade leaderboards — always fictional currency.
- **Content:** seasonal event passes (non-FOMO), clothing creator (palette-limited), emote creator, photo contests, modding support via content packs (sandboxed data-only first).
- **Platforms:** Steam Deck verified, controller-first mode, eventually consoles.

---

# Step-by-step implementation plan for the first playable prototype (M1)

Principle: **build the vertical spine first (identity → net → sim → persistence), then features as thin slices through it.** Each step ends with something runnable/tested. Rough ordering with dependencies; (weeks) are guidance for a 4-person team.

### Stage A — Spine (Weeks 1–3)
1. **Repo & build:** create `src/*` projects (`netstandard2.1` + `.csproj` files), `tests/`, Unity project with local packages referencing `src/` (asmdefs, `noEngineReferences`), GitHub Actions CI (`dotnet test`).
2. **`Casinete.Core`:** IDs (`PlayerId`, `ItemInstanceId`, `PropertyId`, `DefId`), `Result/CmdError`, `IClock`, `Int2/Int3` cm math, `RoundRng` (even though casino is later — used for tests/IDs), BitWriter/BitReader.
3. **Content v0:** `ItemDefinition`/`FurnitureDefinition` classes, JSON loader, `ContentBuilder` validator (unique IDs, positive prices, footprint non-empty), 30 furniture entries with placeholder cube prefabs, `.ccpack` with hash.
4. **Net core:** `INetTransport`, `LoopbackTransport`, `UtpTransport`, message envelope, MessagePack setup (AOT codegen), `Session` handshake (Ed25519 identity), `CommandRouter` + `CommandHandlerRegistry`, rate limiter, `LatencySimTransport`.
5. **Persistence v0:** SQLite schema (`meta`, `player`, `item_instance`, `item_stack`, `property`, `property_layout`, `journal`), `IWorldRepository`, `AggregateSaver` (dirty/rev), `world.manifest.json`, basic backup (copy on save).
6. **Sim v0:** `SimWorld`, `Ledger` (wallet + item moves + journal + idempotency), `PlayerService` (create/load record with starter package). Unit-test conservation/idempotency now.

### Stage B — Walk together (Weeks 3–7)
7. **Main menu + Host/Join UI (UI Toolkit):** screen stack, theme tokens, World create/list, LAN beacon discovery, direct IP/code.
8. **HostRuntime/ClientRuntime bootstrap:** Host creates world → `SimWorld` + `UtpTransport` + local loopback client; join flow → `Welcome` snapshot.
9. **Avatar + movement:** `PlayerAvatar` controller, input, camera; movement snapshots (quantized), `InterestManager` cell zones; host-side validation (speed/bounds), remote interpolation; nameplates.
10. **Character-lite:** `CharacterAppearance` data, creator-lite UI (3 bodies, hair, colors, clothing slots), `CharacterBaker` v1, appearance validation, persistence, `appearanceHash` caching.
11. **Sunny Row (greybox → dressed):** scene cells, spawn, nav validation data, 12 lots with `PropertyLotAuthoring`, tram stub omitted, a shop building, door interaction.
12. **Chat:** `ChatService` (local channel, 25 m), bubbles (pooled world-space UI), rate limiter, simple filter.
13. **Milestone check (Playtest 1):** 8 players walk/chat on LAN; run bot soak and reconnect tests.

### Stage C — Property & furniture (Weeks 7–11)
14. **Properties:** `PropertyService` (claim starter property, owner, lock/unlock), `Property` persistence, lot ↔ property mapping, entering via door → **instance transition** (load interior scene additively, `InterestManager` instance zone, avatar spawn at entry).
15. **Inventory + items:** `ItemLedger` CAS moves, `InventoryService`, `InventoryViewModel` + UI (categories, search, counts), starter furniture grant.
16. **Layout model v1 + placement:** `HouseLayout` (objects only), `SpatialIndex` grid, `PlacementValidator` (bounds/collision/object cap) shared by client preview & Host; layout blob format v1 (MessagePack+LZ4+hash), `property_layout` persistence.
17. **Build-lite UX:** `BuildController` (toggle B, ghost, green/red, rotate 90°, pick up), `GhostManager`, Place/Move/Rotate/Remove commands + handlers, one-step undo, `FurnitureViewManager` v1 (instanced render + pooled interactables for chair/lamp).
18. **Multiplayer furniture sync:** per-property op log + `layoutRev`, interest on enter (cache `(propertyId, rev)` → delta or full blob), `LeaseManager` (BeginEdit/Commit), `FurnitureOps` events, rejection feedback UI, other builders' colored ghosts.
19. **Interactions:** sit-on-chair via `InteractionSlot` claims, lamp on/off state byte.
20. **Milestone check (Playtest 2):** 4 players furnish simultaneously; fuzz test for conflicts/dupes; leave/rejoin.

### Stage D — Economy & persistence polish (Weeks 11–14)
21. **Currency & shop:** `CurrencyWallet` projections + HUD, `ShopService`, shop UI (categories/search/preview/price/rarity/owned/confirm), `Purchase` command (price re-lookup, stock, proximity), daily reward.
22. **Save/Load completion:** autosave scheduler (worker thread), immediate flush on critical ops, manual save (F5), rotating backups, integrity check on load, "Saving…" indicator, world list with thumbnails/backups.
23. **Hardening:** malicious-client fuzzer vs all commands, duplication attack scripts, kill-during-autosave test, reconnect tests; fix findings.
24. **Performance pass:** 8-avatar neighborhood + 1,000-object house on min-spec; verify budgets.
25. **Polish & M1 gate:** tutorial stub (Pip text prompts), placeholder audio hooks (UI clicks, footsteps), settings (graphics/audio), bug bash, record M1 gameplay video, retro, update roadmap with measured velocities.

**How the pieces connect (data flow of "place a sofa"):**
`Inventory UI click` → `BuildController` makes a ghost (local `PlacementValidator` preview over the replicated `HouseLayout`) → on click sends `PlaceFurniture{propertyId, defId, pos, yaw, colors, baseRev, cmdId}` → `CommandRouter` (rate limit, session) → `PlaceFurnitureHandler.Authorize` (caller has `PlaceFurniture` cap in this property) → `Validate` (item location = caller's inventory, object cap, `PlacementValidator` against Host layout, lease/rev) → `Execute`: **single `Ledger` transaction** (move item `Inventory → Placed`, add `PlacedFurniture`, bump `layoutRev`, journal row) → mark `property_layout` dirty (autosave) → emit `FurniturePlaced{rev, object}` to the property's instance zone + `ItemsChanged` to the caller → clients apply via `EventApplier` to `ClientReplica` → `FurnitureViewManager` spawns/updates the instanced view; the ghost is replaced by the authoritative object (or rolled back on `CmdError`).
