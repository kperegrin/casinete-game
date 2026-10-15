# 02 — Multiplayer Architecture & Security

## 7. Multiplayer architecture

### 7.1 Options considered and the decision

| Model | Pros | Cons | Verdict |
|---|---|---|---|
| **Listen-server (Host + Clients)** | Zero infrastructure, perfect for LAN/friends, simple saves (Host owns world) | Host must be online; Host can cheat; Host machine does more work; no NAT traversal for free | **Chosen for v1** |
| Dedicated server | Always on, trusted authority, scalable | Needs hosting; heavier ops | **Designed-in, built later** (same Sim, headless build) |
| Peer-to-peer lockstep | No host | Terrible for persistent economy/saves; cheating; desync | Rejected |
| Client-authoritative + cloud DB | Easy persistence | Needs backend, cost, trust problems | Rejected |

**Key design move:** the game is split into three layers so "Host" is just a *role*, not a code path.

```
┌────────────────────── CLIENT (presentation) ──────────────────────┐
│ Unity views, UI, input, audio, prediction ghosts, interpolation   │
│ ClientReplica (read-only mirror of the Sim state it may see)      │
└───────▲──────────────────────────────────────────┬────────────────┘
        │ Events (facts, filtered by interest)     │ Commands (intent)
┌───────┴──────────────────────────────────────────▼────────────────┐
│ NET LAYER  Casinete.Net: INetTransport, sessions, serialization,  │
│ reliable/unreliable channels, interest manager, rate limiter      │
└───────▲──────────────────────────────────────────┬────────────────┘
        │                                          │
┌───────┴──────────────────────────────────────────▼────────────────┐
│ SIM (authoritative, engine-free C#)  Casinete.Sim                 │
│ Ledger · Inventory · Economy · Housing · Casino · Social · XP     │
│ Command handlers → validate → execute → emit Events → persist     │
└───────────────────────────────────────────────────────────────────┘
```

- **Listen-server:** the Host process runs Sim + Net(server side) + a normal client using an **in-process loopback transport** (the Host's own client talks to the Sim through exactly the same Command/Event interface as remote clients — no privileged back door, which also guarantees a dedicated server behaves identically).
- **Dedicated server later:** build `Casinete.Server` (a headless Unity batch-mode build, or a plain .NET host once Sim has no UnityEngine dependency — it doesn't) that loads the same world SQLite file. Needs only: console admin commands, no local client, optional auth/ban list. No gameplay code changes.

### 7.2 Transport & connectivity

- **Library:** Unity Transport (UTP, UDP) with pipelines: *Reliable-Sequenced* (commands, events), *Unreliable-Sequenced* (movement snapshots, ghosts, emote pings), *Fragmentation* (large blobs such as property layouts, appearance, photos).
- **Abstraction:** `INetTransport { Listen, Connect, Send(connId, channel, bytes), Poll, Disconnect }`. Adapters: `UtpTransport` (v1), `LoopbackTransport` (Host's own client + tests), `LatencySimTransport` (wraps any transport with delay/loss/jitter — also used in CI), later `SteamTransport` / `RelayTransport` / `EosTransport`.
- **LAN discovery:** the Host broadcasts a UDP beacon on port **47801** once per second: `{magic, protocolVersion, sessionName, hostName, playerCount/max, hasPassword, contentHash, gamePort}`. The Join screen lists these live; works with zero configuration.
- **Direct connection:** enter `IP:port`, or a short **join code** (base32 of IP+port+checksum, e.g. `K7QX-92MD`) shown on the Host's screen. Port 47800/UDP; optional UPnP/NAT-PMP port mapping button for hosting over the internet (best-effort, off by default).
- **Online invites (later):** Steam/EOS lobby or UGS Relay: transport adapter + "Invite friend" UI entry. Because everything above `INetTransport` is transport-agnostic, this is an additive feature.
- **Capacity:** v1 design target **16 concurrent players** per Host (tested to 32); dedicated target 64+. A Host-defined `MaxPlayers` (2–32).
- **Security of transport:** DTLS-like encryption is optional for LAN; for direct/online use a lightweight authenticated key exchange (X25519 + ChaCha20-Poly1305 over the identity handshake below) so passwords and chat aren't plaintext. Packets include a monotonic sequence + MAC.

### 7.3 Identity, join and leave

**Identity.** On first launch, the client generates an **Ed25519 keypair** stored in `profile` (private key protected by OS keystore/DPAPI where available). `PlayerId = first 16 bytes of SHA-256(publicKey)` (128-bit, globally unique, stable across worlds).

**Join handshake** (all on the reliable channel):

1. `C→H Hello{protocolVersion, contentHash, gameVersion, publicKey}`
2. `H→C Challenge{nonce, hostInfo, passwordRequired}` — or `Reject{reason}` (version mismatch, full, banned, wrong content packs, host closed).
3. `C→H Auth{signature(nonce || hostId), passwordProof?, desiredName, appearanceProposal, clientSettings}`
4. Host verifies signature, ban list, whitelist/password, capacity. Looks up `PlayerRecord` by `PlayerId`:
   - **Known:** loads their saved data (wallet, inventory, properties, look, progress).
   - **New:** creates a record with starter package (starting Coins, starter clothes, a free starter apartment *assignment offer*, tutorial state). Appearance proposal is **validated** (only free/starter cosmetic IDs allowed) and corrected if not.
5. `H→C Welcome{sessionToken, serverTime, tickRate, yourPlayerSnapshot, worldClockState, ownedPropertyList, friendsList, zoneSnapshot, eventSeq}`.
6. Host registers the session in the **InterestManager**, spawns avatar at last location (or Fountain Square), broadcasts `PlayerJoined` to relevant zones; system chat "X joined".

**Leaving (graceful).** `C→H Leave` → Host removes avatar, releases all locks/seat claims, **flushes that player's data** (immediate save of their aggregate), closes poker/blackjack seats via the table's leave rules, broadcasts `PlayerLeft`.

**Host closing.** Host quits → `HostClosing{secondsRemaining}` broadcast → all aggregates flushed → clients get a "Session ended, your progress is saved on the host's world" screen. **No host migration in v1** (documented tradeoff: migration would require shipping the world DB between peers and re-establishing trust; the dedicated-server path is the supported answer).

### 7.4 Reconnection

- Welcome gives a `sessionToken` + `lastEventSeq`. On unexpected disconnect, the client shows "Reconnecting…" and retries with exponential backoff for up to 60 s using `Resume{sessionToken, publicKey signature, lastAckedEventSeq}`.
- Host keeps the **ghost session** for 90 s: avatar stays (semi-transparent with a "reconnecting" icon), seat claims and table seats are held, edit locks are released after the normal lease timeout (8 s).
- Resume path: if `lastAckedEventSeq` is within the ring buffer (last 512 reliable events per interest set) the Host replays missed events; otherwise it sends a fresh **zone snapshot** (full resync). Either way the client discards stale predictions.
- After 90 s the session is closed as a normal leave. Casino consequences are defined per game (poker: auto-fold then sit-out, stack held in escrow for 10 min then returned to wallet; blackjack: bet stands, auto-stand; roulette: bets stand and are settled; horses: bets stand).
- Commands carry `cmdId` and the Host de-duplicates the last 256 per session, so a command re-sent after reconnect cannot be applied twice.

### 7.5 Authority model: what the Host controls vs what the Client controls

| Data / decision | Authority | Notes |
|---|---|---|
| Currency balances (Coins/Stars) | **Host only** | Client displays a mirrored value; changes only via events |
| Inventory contents, item locations, stack counts | **Host only** | Client holds a mirrored copy for UI |
| Item creation/destruction (shop buy, rewards, casino wins) | **Host only** | Via `Ledger.Transaction` |
| Property ownership, prices, permissions | **Host only** | |
| Placed furniture / walls / floors / openings state | **Host only** | Client previews with local ghosts |
| Storage furniture contents | **Host only** | |
| All casino/minigame outcomes (RNG, deals, payouts, odds) | **Host only** | Clients only animate |
| NPC state & behaviour (interactive NPCs) | **Host only** | Ambient crowd is client-deterministic (see 7.9) |
| XP, level, achievements, statistics | **Host only** | |
| Chat delivery, mute/ban, friends/party state | **Host only** | |
| World clock, weather, events | **Host only** | Clients interpolate with `serverTime` |
| Player position/animation | **Client proposes, Host validates** | Speed/bounds/nav checks, snap-back on violation |
| Camera, UI state, graphics/audio/keybind settings | **Client only** | Never networked |
| Local preview ghost of furniture being dragged | **Client only** | Mirrored to others as *cosmetic* ghost, not state |
| Character appearance (current) | **Client proposes, Host validates** | Host checks ownership of every cosmetic ID |
| Blueprint library (local copy) | **Client** (and mirrored to Host per player for portability) | Applying a blueprint is always a Host-validated command |

**Rule of thumb:** *anything that has value, ownership, or fairness consequences is Host-owned; anything that is purely personal presentation is Client-owned; movement is the only "trust-but-verify" exception.*

### 7.6 Command/Event protocol

Everything that changes the world is `Command` (client → Host) → `Event` (Host → clients).

```csharp
public interface ICommand { /* marker */ }
public readonly struct CommandEnvelope { public ushort Type; public ulong CmdId; public uint ClientTick; public byte[] Payload; }
public readonly struct EventEnvelope   { public ushort Type; public uint EventSeq; public double ServerTime; public byte[] Payload; }

public enum CmdError : byte { None, NoPermission, NotFound, Conflict, StaleRevision, InvalidPlacement,
    InsufficientFunds, InsufficientItems, OutOfRange, RateLimited, LimitReached, Locked, InvalidState, Malformed }
public readonly struct CommandResult { public ulong CmdId; public CmdError Error; public int Detail; public uint CurrentRev; }
```

**Host pipeline for every command** (a single, ordered place where security lives):

```
Receive → size/shape check → Decode (MessagePack, bounds-checked) → RateLimit (token bucket per cmd type)
 → Session auth (valid session, not ghosted, not muted/banned)
 → Idempotency check (cmdId seen?) → Authorization (role/capability, ownership, proximity)
 → Validation (state, rules, balance, collisions, revisions)
 → Execute: single Ledger transaction + state mutation (all-or-nothing)
 → Persist: mark aggregates dirty / append journal row (critical ops flush immediately)
 → Emit events → InterestManager fan-out → CommandResult to sender
```

Every handler is `ICommandHandler<TCmd>` with `Authorize`, `Validate`, `Execute` — easy to unit test without Unity or a network.

**Prediction policy.** Only two things are predicted client-side: (1) own movement; (2) furniture/walls **ghost previews**, which are purely visual until the `Event` arrives. On reject, the ghost snaps back and a toast explains why (`CmdError` + localized text).

### 7.7 Synchronization by system

| System | Mechanism | Rate / size notes |
|---|---|---|
| **Character (transform + anim)** | Unreliable snapshots, 15 Hz in near range, 5 Hz mid, none far (map pins only). Quantized: position 16-bit per axis relative to cell origin (≈1.5 cm precision at 64 m cells), yaw 8-bit, anim state 6 bit + emote id 10 bit + speed 6 bit. ≈ 14 bytes/player/snapshot. Remote avatars interpolate with a 100 ms buffer, extrapolate ≤ 200 ms. | Host validates and rebroadcasts |
| **Character appearance** | Reliable, sent once on spawn + on change; others cache by `appearanceHash` (64-bit) so repeat sightings cost 8 bytes. | ~100 bytes full |
| **Inventory** | Per-player reliable events to the owner only: `ItemsGranted/Removed/Changed`, `WalletChanged`. Full snapshot at join/resync. | Never broadcast to others |
| **Furniture** | Property layout is **replicated state, not NetworkObjects.** On entering a property: client sends its cached `(propertyId, layoutRev)`; Host answers with *delta ops since rev* (if within op log) or the full compressed layout blob. Then reliable `FurnitureOps` events batch edits (place/move/rotate/recolor/remove/state change) with a per-property `layoutRev` increment. Furniture *interaction state* (lamp on, TV channel, door open) is a small per-item `stateByte(s)` in the same op stream. | 3,000 items ≈ 50 KB raw / ~20 KB compressed full sync |
| **Building (walls/floors/openings/stairs)** | Same revisioned op stream as furniture, with `WallOps` working on **edge records**; region-lock leases (see 3.x Collaboration). | Ops are tiny (≈ 10–20 bytes) |
| **Edit presence** | Unreliable 10 Hz "ghost drag" of the object each editor holds + colored cursor/name; purely cosmetic. | Dropped silently if congested |
| **Casino/minigames** | Each table is a Host-side state machine; reliable events for state transitions and per-seat actions (`BetPlaced`, `CardDealt{seat, card|hidden}`, `PhaseChanged{phase, endsAtServerTime}`), full table snapshot to anyone entering the table's interest zone. Timers are sent as **absolute server timestamps**, never "seconds left". Hidden info (hole cards) is sent only to its owner. | Roulette result includes animation seed |
| **NPCs** | *Ambient:* not synced, deterministic from `(seed, serverTime)`. *Service:* stationary, state enum synced on change. *Interactive/roaming:* Host-simulated, replicated like players at 5–10 Hz within AoI. | Cap ≈ 30 replicated NPCs per zone |
| **World clock/weather** | One reliable message `(serverTimeAtSync, dayFraction, weather)`; clients simulate locally. | Re-synced every 30 s |
| **Shared media (jukebox, TV)** | `{trackId, startServerTime, loop}`; clients compute playhead. | Audio is local content only (no streaming of copyrighted music) |

**Time sync:** Host's monotonic `serverTime`. Client estimates offset using NTP-style ping/pong every 2 s with min-RTT filtering. All "synchronized events" (roulette spin, horse race start, music start) are defined in `serverTime`.

### 7.8 Interest management

- Space is partitioned into **Interest Zones**:
  - `Cell(x,y)` — 64 m open-world cells. A client is subscribed to its own cell + the 8 neighbors (≈ 96 m radius around the player) for avatars/NPCs/yard furniture.
  - `Instance(propertyId)` — everyone inside a property interior.
  - `Instance(publicInteriorId)` — a shop/casino hall/club.
  - `Table(tableId)` — subset of an interior; seat events broadcast to anyone in the interior within 25 m.
  - `Global` — chat shouts, system messages, world clock (tiny).
- The `InterestManager` maintains `zone → subscribers` and `client → zones`. Entering a zone triggers a **snapshot** (zone state) + `PlayerEntered`; leaving triggers `EntityRemoved`. Sim events carry a `ZoneId`; fan-out is `subscribers[zone]`. Hysteresis (±8 m) avoids flapping at borders.
- Cost control: if a zone's subscribers exceed N (e.g. 24), movement snapshot rate degrades by distance tiers; avatars beyond 40 m get ≤ 5 Hz; casino/idle avatars (seated/emoting) send only on change.

### 7.9 NPC synchronization

Three tiers (details in file 06, NPC section):
1. **Ambient crowd** — cosmetic pedestrians; each client computes positions from `(npcSeed, pathId, serverTime)` so everyone sees the same stream with **zero bandwidth**. Not interactable. Density scales by `max(0.3, 1 - playersInZone/16)`.
2. **Service NPCs** — dealers, shopkeepers, receptionists. Stationary; their animation is driven by *events* (e.g. `CardDealt` → dealing animation) or interaction state. Dialogue is client-side UI; outcomes are Host commands.
3. **Interactive/roaming NPCs** — tutorial guide, taxi, couriers. Host-run behavior trees + nav; replicated like players.

### 7.10 Ownership & permissions

- **Property roles** (Visitor, Friend, Decorator, Builder, Co-owner, Owner) map to capability bit flags (see 3.x). Permissions live in `Property.Permissions` and are checked in `Authorize` for every housing command; they are **never** trusted from the client.
- **Item ownership:** each item instance has `OwnerPlayerId`. Items placed in someone else's property remain *owned by the contributor*; removing them returns them to the contributor's inventory (or mailbox).
- **World roles:** `Host`, `Admin` (delegated by Host: kick/mute/ban, teleport, event control), `Player`. World settings (casino on/off, economy preset, PvP-free by default, chat filter) are Host-only.
- **Proximity & session checks:** purchases require being at a shop (`distance < 6 m` to the shop NPC/counter, in the correct interior), table actions require being seated, furniture interaction requires within interaction range of the item. Tolerance accounts for latency.

### 7.11 Preventing duplication and exploits (summary; details in section 22)

- Single-owner location invariant for every item instance.
- All value changes in atomic transactions with idempotency keys.
- No client-supplied totals, prices, rarities, or results — clients send only IDs and intent.
- Rate limits, bounded collections, and sanity checks.
- Append-only journal and periodic conservation audits.

### 7.12 Saving multiplayer progress

- The **Host's world database is the single source of truth.** A player's wallet, inventory, properties, achievements, stats, friends and unlocked content are stored under their `PlayerId` in that world.
- On join, the Host loads or creates the `PlayerRecord`; on leave (and periodically) it persists that aggregate.
- A client's **local profile** holds only identity key, settings, keybinds, UI preferences, recent servers, and a cached appearance template — never authoritative game state.
- **Optional Passport backup (v1.1):** the Host can export a player's record as a signed `.cpass` file for them to keep; the Host can import it to restore the player if the world is lost. Importing into a *different* world is allowed only if the Host enables "accept passports" (values clamped by a validation profile, e.g. cap on Coins), preventing value injection.
- Full details in file 06 (section 17).

### 7.13 Tick model

| Loop | Rate | Purpose |
|---|---|---|
| Net poll/send | 60 Hz | drain transport, flush batched events |
| Movement snapshot broadcast | 15 Hz (tiered) | avatars |
| Sim fixed tick | 20 Hz | NPCs, timers (casino phases, horse sim), lease expiry, triggers (wiring) |
| Autosave scheduler | 1 Hz check | flush dirty aggregates every 30–60 s |
| Slow tick | 0.2 Hz | upkeep, daily reset, economy audits |

---

## 22. Multiplayer security and validation

**Threat model.** *Malicious or buggy clients* (primary), *chatty griefers*, *casual save editors* (secondary), and *hostile Hosts* (limited: a Host controls their own world; we protect joiners' *local* data and identity, not the integrity of a hostile Host's world).

### 22.1 Principles

1. **Never trust the client.** Clients send intent with IDs; the Host looks up everything (price, definition, rarity, ownership, location).
2. **Validate in the Host pipeline, in order:** shape → rate → session → idempotency → authorization → state/rules → execute → persist.
3. **Atomic, journaled value changes.** One ledger transaction per command.
4. **Fail closed.** Unknown enum, oversized array, out-of-range ID → `Malformed` + strike counter; repeated strikes auto-kick.
5. **Least data.** Hidden info is never sent to a client that shouldn't have it.

### 22.2 Threats and mitigations

| Threat | Mitigation |
|---|---|
| **Money cheating** (client edits balance) | Balances exist only on Host; `WalletChanged` events are display-only. No command accepts an amount for credit. Debits/credits only inside handlers (`Buy`, `Reward`, `CasinoSettle`, `Trade`). |
| **Client-authoritative currency changes** | Impossible by construction (no such command). Static analysis rule: only `Casinete.Sim.Economy.Ledger` may mutate `CurrencyWallet`; enforced with an internal setter + code-review/analyzer rule. |
| **Item duplication** | (a) *Single-location invariant:* `ItemInstance.Location` is one of `{Inventory, Placed, Container, Equipped, Escrow, Mailbox, Destroyed}`. (b) `MoveItem` is one atomic transaction that checks the *current* location equals the expected one, then changes it. (c) Idempotent `cmdId`. (d) Trade uses escrow with two-phase confirm. (e) Save writes aggregate + journal in one SQLite transaction, so a crash can't produce "in two places". (f) Conservation audit (see below). |
| **Inventory duplication via reconnect/lag** | Commands carry `cmdId`; Host keeps last 256 results per session and replays the *result* (not the effect) for duplicates. |
| **Invalid furniture placement** | Host re-runs the full placement validator (bounds, collision, surface/wall anchors, floor level, stack rules, object cap, definition allows position/rotation/scale, item location). Client validator is advisory. |
| **Unauthorized building** | `Authorize` checks `PropertyCap` flags for the caller on that property and room; per-object "who can move" rules; owner-only operations never delegable (sell, transfer, delete, change owner). |
| **Two players claiming the same object** | Lease locks + revision numbers + atomic `TryLock`; first request in Host order wins; others get `Conflict`/`Locked` with the holder's name. Seats/slots use `SeatClaim` with the same atomic rule. |
| **Casino result manipulation** | Outcomes generated Host-side with a CSPRNG (`RandomNumberGenerator`) and unbiased sampling; clients never send seeds/results; animation seeds are derived after the outcome is decided; hole cards/dealer hole card never sent early; table actions validated against the state machine and whose turn it is. Optional "**Fair Play Receipt**": the Host publishes `SHA-256(roundSeed)` before the round and reveals the seed after, so players can verify the shuffle (useful between friends, and for dedicated servers later). |
| **Bet after outcome / late betting** | Phase checks use Host `serverTime`; `NoMoreBets` is enforced Host-side, never by client timers. |
| **Poker collusion/ghosting** | Hole cards only to owner; table chat during hand restricted to "table-talk only" preset phrases/emotes (configurable); Host moderation tools and a hand-history log (Host can review). |
| **Speed/teleport hacking** | Host validates each position update: max speed (with tolerance + latency allowance), nav-mesh/collision containment, transition rules (only via doors/tram/teleport commands). Violations → snap-back; repeated → kick. Movement has *no* economy impact beyond proximity checks. |
| **Spam/flood/abuse** | Token buckets per command type and per chat channel; message length caps; profanity/slur filter (client-side display filter + Host-side block list; configurable); mute/block/report; Host kick/ban by `PlayerId` + optional IP. |
| **Malformed packets / DoS** | Length-prefixed decoding with hard caps; strict serializer (MessagePack in `Strict` mode with allowed types); max packets/s per connection; connection cap and half-open timeout; blob size caps (photos ≤ 64 KB). |
| **Impersonation** | Ed25519 challenge-response; display names are cosmetic, identity is `PlayerId`; name collisions disambiguated by suffix tag; Host can display "verified returning player" badge. |
| **Save manipulation** | *Tamper-evidence, not DRM.* Each aggregate blob has an xxHash64 integrity hash and the journal is hash-chained (`prevHash`); a save with a broken chain or edited balances without journal entries is flagged "Modified" in the world list (informational; the Host owns their world). Joining clients are never affected by their *own* local files (no authoritative data there). |
| **Replay of old packets** | Monotonic per-session sequence numbers + MAC; Host ignores out-of-window sequence numbers. |
| **Permission escalation via paste/blueprint** | `ApplyBlueprint` is expanded Host-side into primitive ops and each op re-authorized and re-validated; imported blueprints are sanitized (unknown IDs flagged, counts capped). |
| **Gifting/trade scams** | Two-phase trade (offer → lock → 3 s countdown → confirm), any change resets locks; both inventories re-validated at commit; undo window not provided (clear UI warnings); trade log kept 30 days; untradeable flags enforced by Host. |
| **Griefing in homes** | Role system; Visitor cannot move or remove anything; owner can kick/ban from property; "edit audit log" (who placed/removed what, last 500 ops per property) with one-click **revert to snapshot**; auto-snapshot of layout every 15 min of editing (keep last 8). |

### 22.3 Conservation audit

A debug/admin job (also on every autosave in dev builds and daily in release) verifies:

- For each `ItemDefinition`: `minted − destroyed == Σ(items in all locations)` using journal counters.
- For each currency: `Σ wallets + Σ escrows (poker stacks, trades) + house bank delta == minted − sunk` per journal.
- No `ItemInstanceId` appears in two locations; no `Placed` item references a missing property; no container cycle.

Failures produce a Host log + (in release) a "Repair" prompt that quarantines the offending entity and restores from journal/backup.

### 22.4 Honest limits

- A **Host can cheat in their own world** (edit save, read hole cards in memory). The architecture reduces this (no authoritative state on clients; passport clamps; tamper-evident saves) but a listen-server fundamentally trusts its Host. Players who need a trusted authority use a dedicated server (planned). The UI states this clearly for poker ("host is a player on this table: play with friends").
- LAN play isn't encrypted by default; local-network sniffers can read chat. Acceptable; encryption is on for non-LAN connections.
