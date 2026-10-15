# Casinete — Design & Technical Blueprint

> Working title: **Casinete** ("little house / little casino"). Setting: **Marigold Bay**, a sunny coastal social city.
> This folder is the complete blueprint: game design, multiplayer architecture, systems, data, security, roadmap, and a
> step-by-step plan for the first playable prototype.

## How to read this

The brief asked for 30 sections in a fixed order. They are split across files; section numbers are preserved in headings.

| File | Sections |
|---|---|
| [01-concept-and-world.md](01-concept-and-world.md) | 1 Titles · 2 Pitch · 3 Core loop · 4 Pillars · 5 Target experience · 6 World design |
| [02-multiplayer-and-security.md](02-multiplayer-and-security.md) | 7 Multiplayer architecture · 22 Multiplayer security |
| [03-character-housing-building.md](03-character-housing-building.md) | 8 Character · 9 Housing · 10 Building/decorating |
| [04-inventory-economy-shops-social.md](04-inventory-economy-shops-social.md) | 11 Inventory · 12 Economy · 13 Shops · 14 Social |
| [05-casino.md](05-casino.md) | 15 Casino systems (roulette, slots, blackjack, poker, horses) |
| [06-progression-saving-ui-npc.md](06-progression-saving-ui-npc.md) | 16 Progression · 17 Saving · 18 UI/UX · 19 NPCs (+ art & audio) |
| [07-technical-architecture-data.md](07-technical-architecture-data.md) | 20 Tech architecture (engine comparison) · 21 Data architecture · 23 Performance · 24 Folder structure · 25 Classes |
| [08-roadmap-testing-risks.md](08-roadmap-testing-risks.md) | 26 MVP · 27 Roadmap · 28 Testing · 29 Risks · 30 Expansion · **Prototype implementation plan** |

`tools/slot-sim/` contains runnable scripts that verified the slot-machine RTP numbers quoted in `05-casino.md`.

## The ten decisions everything else hangs on

1. **Engine:** Unity 6 LTS (URP, C#). Gameplay/economy/casino/housing rules live in **engine-free C# assemblies** ("the Sim"), so they are unit-testable with `dotnet test` and a dedicated server is a headless build of the same code.
2. **Multiplayer model:** listen-server (Host = authoritative Sim + local client). Clients send **commands (intent)**; the Host validates and broadcasts **events (facts)**. Furniture is *data*, not network objects.
3. **Transport:** Unity Transport (UDP) behind an `INetTransport` interface; LAN discovery via UDP beacon; direct IP/join-code; Relay/Steam/EOS adapters later.
4. **Housing shape:** *Shell + Interior.* Each property has a fixed exterior shell in the open world and an **instanced, grid-based interior** (walls on tile edges, floors, openings, stairs, up to 3 floors + basement, 3,000-object hard cap), plus an outdoor **yard** build zone.
5. **Item model:** every item has exactly **one location** at all times (inventory, placed, storage, trade escrow, mailbox, equipped). All moves are atomic ledger transactions. This is the anti-duplication backbone.
6. **Collaboration:** per-object **leases** + revision numbers (optimistic concurrency), region locks for walls, per-user undo that is re-validated like any other command.
7. **Saves:** one **SQLite** database per world (WAL), per-property compressed layout blobs with hashes, rotating backups, ordered migrations.
8. **Identity:** `PlayerId` = hash of a client-held Ed25519 public key; challenge-response on join. Progress lives in the **Host's world**, appearance travels with the player.
9. **Currencies:** `Coins` (soft, tradable) and `Stars` (rare, earned only, non-transferable, never bettable). **No real-money purchases, no cash-out, no loot boxes.** Casino is fictional-currency-only and host-toggleable.
10. **Scope control:** a 16-point prototype (menu → host/join → walk together → one house → place furniture synced → save → shop → chat) is the first gate; everything else is phased behind it.
