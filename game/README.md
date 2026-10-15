# ♣ Casinete — playable prototype (Host + Clients)

A runnable, multiplayer, local-network social city game built from the blueprint in [`../docs`](../docs/README.md).
**One player runs the Host; everyone else opens the Host's address in a browser.** The Host is the authority for money,
items, houses, casino results and saves — clients only send requests.

> This is a **web prototype** (Node.js Host + HTML5 canvas clients), not the Unity build the design documents recommend.
> It exists so the design can be played and tested right now. The authoritative rules (ledger, housing, casino, saving)
> are plain JavaScript modules with the same architecture as the planned engine-free C# "Sim" — see *Mapping to the design* below.

## Run it

```bash
cd game
npm install
npm start                 # Host on http://localhost:3000   (prints LAN addresses + join code for friends)
npm run start:fast        # same, with short casino/upkeep timers — best for testing everything quickly
```

Open `http://localhost:3000` → enter a name → create your character → play.
Friends on the same Wi-Fi/LAN open `http://<host-LAN-IP>:3000` (printed in the console) **or** type the printed **join code** in the address box.
Options: `--port 3000 --world "My World" --dir saves/my-world --password secret --max 16 --no-casino --fast`.

The player on the Host computer (localhost) gets the **Host panel (F2)**: integrity audit, backups, world settings (casino on/off, chat filter),
admin tools (kick/ban/mute/announce) and **dev tools** (give Coins/items, set level, advance the day, force upkeep, teleport) so every feature can be tested in minutes.
Disable dev tools in the Host panel to play "for real".

## Controls

| Key | Action | Key | Action |
|---|---|---|---|
| WASD / arrows / gamepad stick | Move (screen-relative, like Habbo: W = up the screen) | `E` | Interact (doors, shops, tables, furniture, NPCs) |
| `B` | Build mode (inside a home you may edit) | `I` | Inventory / Wardrobe / Mailbox / Blueprints |
| `Tab` | Phone (map, friends, party, catalog, directory, achievements…) | `G` or `1`–`9` | Emotes |
| `Enter` | Chat (`/w name msg`, `/me`, `/dance`…) | `Esc` | Close panels / settings |
| Mouse wheel | Zoom | `F2` | Host panel (Host only) |

Build mode: pick furniture in the left drawer → click to place · `R`/`Q` rotate · drag to move · `Shift`+click / drag a box to multi-select · `Del` remove ·
`Ctrl+Z/Y` undo/redo · `Ctrl+C/V/D` copy/paste/duplicate · tools for walls (drag a line; `Shift` = room outline), doors, windows, floors (drag a rectangle), erase and **blueprints**.

## A 15-minute test tour (what to try)

1. **Join / character** — create a look; open a second browser window as a second player (they appear in each other's world; chat bubbles, emotes).
2. **Town Hall** (north-west) → *Claim FREE* studio. Walk to **Home & Hearth** → buy furniture (search, filters, preview, confirmation, owned badge, "Try on" in Threadworks).
3. **Go home** (Sunny Row #1) → `B` → place, rotate, drag, undo, multi-select, copy/paste, draw walls/doors/windows, paint floors/walls, save a blueprint.
4. **Collaborate** — Phone → Home → Manage → *People*: give your friend **Builder**. Both of you edit at once: grabbing an object locks it for others ("✋ Name"), edits sync live, items always return to their real owner.
5. **Access control** — set the home to *Invite only*, ring the doorbell from the other player, ban/unban, invite, house rules, likes, house directory.
6. **Economy** — daily reward (Town Board), jobs: **fishing** (pier/pond), **courier** (Parcel Pete), 10 hidden **postcards**; achievements; level-ups; upkeep (Host panel → *Force upkeep period*) → arrears → dusty → pay at Town Hall; sell the home (70% refund).
7. **Social** — click a player: profile, friend, trade (two-phase lock + 3 s safety delay), gift, party, invite home.
8. **Casino (Lucky Mile, east)** — roulette (all 157 European bet spots; right-click a number for splits/corners), 2 slot machines with free spins and Town Jackpot, blackjack (double/split/insurance), Texas Hold'em (practice table with bots, or a Coins table with 2+ humans), horse races at Marigold Downs (odds, place/show/exacta). The **Cashier** has loss limits and cool-off.
9. **Host panel (F2)** — *Integrity* must always say "coin & item conservation OK" no matter what you did. Try *Backup*, then stop the Host and start it again: everything is still there.

## The isometric look (tileset)

The game renders a **Habbo-style isometric view** (2:1 projection, depth-sorted sprites, cut-away walls) — there are no emoji in the world any more.
Third-party tilesets could not be downloaded in the build environment, so Casinete ships an **original tileset generated from code**:

* `public/js/models.js` (furniture), `props.js` (shops, casino tables, buildings, trees), `chars.js` (characters) describe every object as a handful of
  boxes / cylinders / spheres; `iso.js` shades and depth-sorts them into sprites.
* `npm run tileset` bakes the static sprites (278 of them: every furniture piece in 4 rotations + on/off states, buildings, trees, tables…) into
  `public/assets/tileset.png` + `tileset.json` (2× resolution; add `-- --split` for one PNG per sprite in `public/assets/sprites/`).
  The client loads that atlas when it exists and otherwise renders the same models live, so deleting `public/assets/` still works.
* **Swapping in your own art:** replace `tileset.png` and edit the rectangles / anchors in `tileset.json` (`x,y,w,h` = sheet rectangle, `ox,oy` = where the
  tile's top-left corner sits relative to the sprite, `scale` = sheet pixels per game pixel). Keys look like `f:sofa_3:0:0` (furniture id, rotation, on?),
  `b:casino`, `tree:1`, `t:roulette::4x3`. Characters stay procedural because they are recoloured per player.
* Visual checks: `node test/preview-shots.mjs /tmp/prev` (contact sheets of every sprite) and `node test/outdoor-shots.mjs /tmp/town` (tour of the districts).

## Tests

```bash
npm test                 # 25 unit + integration tests (rules, security, persistence, casino math) — ~1 min
npm run slotsim          # slot RTP certification (20M spins per machine by default)
npm run e2e              # drives the real UI in headless Chromium (needs `npm i` + a Chromium; set CHROME=/path/to/chrome if needed)
```

The tests include: speed-hack rejection, duplicate-command idempotency, item/coin conservation audit after every scenario, lease conflicts, permission matrix,
atomic blueprints, hostile-client fuzzing, corruption recovery (hash-verified sections restored from backups), schema migration, roulette payout table for every spot,
a 5-card/7-card evaluator check against the known hand counts, scripted blackjack shoes, poker side pots, bot poker hands, hole-card privacy, and horse payouts vs. the decided order.

## What is implemented vs. the design documents

| Area | Status in this prototype |
|---|---|
| Host/Client over LAN, join code, password, max players, kick/ban/mute | ✅ (WebSocket; Host authoritative; per-player token identity) |
| Open world: 7 districts, 13 buildings, 5 public interiors, tram-less single map, day/night, minimap | ✅ (isometric 2.5D, Habbo-style; ~64×44 tiles) |
| Character creator, wardrobe, salon, free+purchasable cosmetics, rarity, try-on, validation of ownership | ✅ (isometric blocky avatars with 4 facings + walk/sit animation; no tattoos/makeup/facial hair) |
| Housing: buy/sell/transfer, 8 lots (studio→mansion), upgrades, upkeep→dusty, roles, access modes, doorbell, invites, bans, capacity, rules, likes, style score, directory | ✅ |
| Building: walls/doors/windows, floors, wall colours, furniture (53 pieces, 18 categories) and 30 cosmetics, rotate/move/remove, collision & wall/rug layers, object cap, undo/redo, multi-select, copy/paste, blueprints with bill of materials, storage furniture, sit/lie/toggle interactions | ✅ (single floor; grid placement only — no stairs, free-placement mode, stacking or wiring) |
| Collaboration: edit leases, live ghosts, revision checks, audit log, items return to contributors | ✅ |
| Inventory: categories, search, sort, favourites, stacks, preview, equip, mailbox, gifting, trading (escrow-style atomic swap) | ✅ |
| Economy: Coins/Stars, shops (4), limited stock, per-player limits, sell-back, daily streak, jobs, diminishing returns, taxes, upkeep, journal | ✅ |
| Casino: roulette, 2 slot machines (RTP verified), blackjack, Hold'em (+bots), horse racing, jackpot, cashier limits/cool-off, fair-play receipts | ✅ |
| Social: chat channels, bubbles, emotes, sitting, friends, party, profiles, inspect | ✅ (no voice, no pair emotes) |
| Progression: player/builder/social/explorer XP, 24 achievements, titles | ✅ (no collections albums, prestige perks) |
| Persistence: sectioned world files, hash manifest, hash-chained journal, rotating backups, corruption recovery, migrations | ✅ (JSON files instead of SQLite) |
| NPCs: shopkeepers, dealers, cashier, agent, courier, guide (dialogue + actions) | ✅ (stationary; no ambient crowds / schedules) |
| Audio: procedural SFX + music with independent bus sliders | ✅ (synthesised; no recorded assets) |
| Not built (designed only): true 3D models, multi-floor/stairs, yards, vehicles, pets, photo mode, wiring contraptions, voice, Relay/online invites, dedicated server, passport export, Unity port | 📄 see `../docs` |

## Mapping to the design

| Design (docs) | Prototype |
|---|---|
| `Casinete.Sim` rules in engine-free code | `server/ledger.js`, `housing.js`, `casino/*.js`, `cmds-*.js` (no network/UI imports in the rule modules) |
| Command → validate → execute → event | `Game.onMessage` → handler in `cmds-*.js` → `Ledger.tx` / `Housing.*` → events to the location's members |
| Single-location item invariant, atomic ledger | `server/ledger.js` (`tx`, compare-and-swap locations, journal, `audit`) |
| Interest management by zone | `Game.toLoc` — events only go to players in the same location (open world / interior / home) |
| Leases + revisions for collaborative edits | `Housing.lease/move/moveGroup` (`rev` checks) |
| Round RNG + fair-play receipt | `server/rng.js` (HMAC-DRBG, unbiased ints; roulette and horse races reveal the seed after the round, poker/blackjack show the hash only) |
| Save format with hashes, backups, migrations | `server/persistence.js` |
| Slot certification tool | `tools/slotsim.js` |
