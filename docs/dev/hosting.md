# Player hosting: the desktop game on the player's own PC

The desktop app (desktop/, [desktop.md](desktop.md)) never needs our servers. It runs the whole game on the player's PC: the site (the hub), the game server and a save file. Co-op is one player's PC hosting the others through a Steam lobby and Steam's relay network. If undercroft.us went away, the desktop game would keep working.

The browser game is unchanged and still runs on our servers. The two keep separate saves: an explorer in the desktop app is not the same as one on undercroft.us.

```
Host's PC                                            Guest's PC
┌ Electron main ───────────────────────┐            ┌ Electron main ────────────────────────┐
│ host process:                        │            │ host process: their own site, server   │
│   site (SvelteKit) ─┐                │            │   and save (their stash, shop, loadout) │
│   game server ──────┼─ LocalDb (save)│            │                                        │
│ Steam lobby (owner)                  │ Steam P2P  │ Steam lobby (member)                   │
│ TunnelHost ⇄ ws://127.0.0.1 (server) ┼───relay────┼─ TunnelGuest ⇄ ws://127.0.0.1 (page)  │
└──────────────────────────────────────┘            └────────────────────────────────────────┘
```

## Files

| File                                        | What                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/server/localdb/`                   | LocalDb: the MongoDB-compatible store the save is kept in                          |
| `src/lib/server/local.ts`                   | Local mode: the settings the host process sets, the cookie, the guest headers      |
| `src/lib/server/store/accounts.ts`          | `localAccount`: the desktop app's own account                                      |
| `src/hooks.server.ts`                       | `handleLocal`: the window is the player; nothing else gets in                      |
| `server/start.ts`                           | `startGameServer` (both ways of running it), `guestOf` (who a tunnelled guest is)  |
| `server/guests.ts`                          | The vault: a guest's belongings, asked of their own client                         |
| `server/belongings.ts`, `server/parties.ts` | Guests in the descent and the party                                                |
| `src/routes/api/local/vault/`               | The guest's side of the vault, on their own save                                   |
| `src/lib/game/net/vault.ts`                 | The guest's client answering the host's vault requests                             |
| `desktop/src/localHost.ts`                  | Starting the host process                                                          |
| `desktop/src/host/`                         | The host process: `boot.ts`, `entry.ts` (packaged), `dev.ts` (Vite, `desktop:dev`) |
| `desktop/src/lobby.ts`                      | The party: Steam lobbies (`SteamParty`), loopback testing, solo without Steam      |
| `desktop/src/tunnel.ts`, `frames.ts`        | The tunnel and its frames                                                          |
| `desktop/src/transports.ts`                 | Loopback and in-memory transports (Steam's is in `lobby.ts`)                       |

## The local host

The main process starts a **host process** (`startLocalHost`). It is Electron's own Node, run with `ELECTRON_RUN_AS_NODE`, so a heavy tick never stalls the window. It:

1. Opens the save, a `LocalDb` at `<userData>/save/undercroft.json`, and registers local mode (`registerLocalHost`) on `globalThis`, before the site or game server load.
2. Starts the game server on `127.0.0.1` (`startGameServer`, port chosen by the system) with a **host key** for the tunnel.
3. Serves the site on `127.0.0.1`. In the packaged build that is adapter-node's handler; in `pnpm desktop:dev`, Vite's dev server in the same process, so hot reload works.
4. Tells the main process both ports. The main process sets the `undercroft.local` cookie (a random secret) on the window's session and loads the site.

If the host process stops unexpectedly, the main process starts it again and reloads the window. On quit it is asked to stop, and saves first.

The user data folder is `%APPDATA%\Undercroft` for the packaged app, and `%APPDATA%\undercroft-desktop` for `desktop:dev` (Electron names it after the package). `--user-data-dir=<folder>` gives a copy its own save.

### Local mode in the site

`handleLocal` (`hooks.server.ts`) replaces sign-in. A request with the right `undercroft.local` cookie is the local player, signed in as `localAccount`. That is the account with the player's SteamID, made on first run with their Steam name as the gamer tag, or a single account with the id `local` when Steam isn't running. Anything without the cookie is refused, so another program on the PC can't use the site. The sign-in pages redirect to the hub.

`+layout.server.ts` passes `local: true` to every page, and the UI hides what only the hosted site has:

- signing out
- the email, password and two-step settings (the Account screen shows only its Profile tab)
- Report a bug, and Ideas and feedback (they would only reach our servers, and there are none here)
- the friends list (the Social page shows the Steam party instead)

The client's bridge has `local` too (`isLocal()` in `src/lib/desktop.ts`).

### LocalDb

A document store that keeps everything in memory and writes it to one JSON file. It implements exactly the subset of the `mongodb` driver that the store code (`src/lib/server/store/`) and the game server use, so that code runs unchanged on it:

- `find` (with sort, skip, limit, projection), `findOne`, `countDocuments`
- `insertOne`, `updateOne`/`updateMany` (with upsert), `replaceOne`, `findOneAndUpdate`, `deleteOne`/`deleteMany`, `bulkWrite`
- `createIndex` with `unique`, `sparse`, `partialFilterExpression` and TTL, and `dropIndex`
- query operators: equality on dotted paths and arrays, `$in $nin $eq $ne $gt $gte $lt $lte $exists $type $size $regex $or $and`
- update operators: `$set $unset $inc $setOnInsert $max $addToSet $push $pull`

Duplicate keys throw `code: 11000` with the index name, as the driver does, so `duplicate()` in `accounts.ts` works. `aggregate` throws: only the admin app uses it, and there is no admin app locally.

**Anything it doesn't implement throws**, rather than quietly matching wrongly. A store change that uses a new operator fails its tests on LocalDb, and gets added to `query.ts` or `update.ts` with a test in `LocalDb.test.ts`.

Saving: a change schedules a save 250 ms later. The file is written beside the save and swapped in, keeping the previous save as `.bak`. A save that can't be read is kept as `.broken-<time>`, and the `.bak` is used instead. Dates and binaries (avatars) are tagged in the JSON. Indexes aren't saved, because `ensureIndexes` makes them on every start.

LocalDb is also what the store's unit tests run on ([testing.md](testing.md#the-store)).

## Co-op: guests

### The lobby

With Steam, every desktop app hosts a FriendsOnly lobby of `PARTY.maxSize` from the start (`SteamParty`). Its data holds the protocol version, and its rich presence sets `connect` so "Join game" works from a friend's Steam friends list.

- **Joining:** accepting an invite, choosing "Join game" (`GameLobbyJoinRequested`), or Steam starting the game with `+connect_lobby <id>` joins that lobby. A lobby of another protocol version is refused with a notice.
- **As a guest:** a player in someone else's lobby is their **guest**. Their page switches game server to the tunnel (`onGameServer`), so they see and play in the host's party. Their hub (stash, shop, loadout) is still their own local site.
- **Leaving:** leaving goes back to their own lobby and server, and so does the host leaving the lobby. So does being sent home by the host's server (a `reject`), with its reason.
- **Joinable:** the lobby is only joinable while the host's party is on the surface (`setJoinable`, from `showPresence`).

Without Steam there is only solo (`SoloParty`).

### The tunnel

The guest's game connection is carried to the host over Steam's peer-to-peer packets (`sendP2PPacket`, reliable, through Valve's relay network: no ports to open, and no IP addresses shared).

- **Guest side:** `TunnelGuest` is a WebSocket server on the guest's PC that their page connects to.
- **Host side:** for each guest connection, `TunnelHost` opens a WebSocket to its own game server with two headers: the host key, and the guest's SteamID **as Steam reports the sender of the packets**, never one the guest claims. Sessions are only accepted from lobby members.
- **Frames:** one byte for the kind (`open`, `data`, `close`), four for the connection, then the payload (`frames.ts`).
- **Compression:** each message is compressed with the previous one as zlib's dictionary, so a tick of about 8 KB goes as a few hundred bytes, as with permessage-deflate.
- **Polling:** packets are read every 4 ms.

### Guests on the host's game server

`guestOf` (`server/start.ts`) refuses a connection with a guest header but the wrong key. A guest is identified as `steam:<SteamID>`, account and explorer alike, named by the gamer tag they send in `hello`. The host's database keeps nothing of theirs. They join the host's party on arrival (`joinHost`), or are sent home if the host isn't there or is underground. Leaving the party, or being removed from it, sends them home (`sendHome`). They have no friends list here, and they are left out of the suspension check (`accounts()`), where they would look deleted.

### The vault

A guest's stash and loadout are in **their own save**, on their PC. So the host's server asks their client for them (`server/guests.ts`), with `vault` messages over the same connection:

| Server → guest's client              | Guest's client does (its own `/api/local/vault`)                           |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `{ op: 'lock', ready }`              | Locks (or unlocks) its hub, as `markReady` does for local players          |
| `{ op: 'take', id, session }`        | `takeLoadout`, then answers `{ type: 'vault', id, kit, owned, markWheel }` |
| `{ op: 'return', session, carried }` | `returnFromExpedition`: what they carried out (null if lost) goes back     |

`takeKit`, `owned`, `markWheels`, `giveBack` and `lockKit` in `server/belongings.ts` route to these for guests, so the party and session code doesn't know the difference.

- **Timeout:** a guest whose client doesn't answer within `VAULT_TIMEOUT_MS` goes down with nothing.
- **A return while disconnected:** it waits for them to reconnect.
- **A guest who crashes:** their own server's start-up `clearUnderground` unlocks their hub. What they carried is lost, as it is for anyone.

### Trust

The host's PC is the authority, and the server stays authoritative as ever: positions, combat, loot and the Affliction are all decided there.

- **What the host checks:** a guest's kit comes from their own save, and the host checks it for shape and the rules (`sanitizeInventory`: known items, stack sizes, slots that take them), not for ownership.
- **What the guest trusts:** the guest's client trusts what the host's server says they carried out.

Among friends, which is who can join a FriendsOnly lobby, that is the usual trust model for co-op games like this. Don't rely on it for anything competitive.

### Limitations

- **Rite progress:** the party plays at the host's rite progress (as before). A guest's clues are recorded in the host's save, not their own.
- **Avatars:** guests have no avatar in the host's party.
- **Bug reports and ideas:** not available in the desktop app. Sending them somewhere (GitHub issues) is a follow-up.

## Testing

- **Unit tests:**
  - `LocalDb.test.ts`
  - the store tests on LocalDb
  - `server/guests.test.ts`: guest identity, the host's party, the vault, the timeout, the suspension check
  - `desktop/src/tunnel.test.ts`, `frames.test.ts`: the tunnel end to end over in-memory transports, and compression
- **On one PC (loopback):** Steam can't be signed in twice, so the tunnel has a loopback mode over a local socket (dev only, never in a packaged build). Two copies, each with its own save:

  ```
  # The host (DEV_MODE gives admin commands; not needed otherwise)
  UNDERCROFT_TUNNEL=loopback UNDERCROFT_LOOPBACK=host pnpm desktop:dev -- --user-data-dir=<folder A>
  # The guest, once the host is up: it joins straight away
  UNDERCROFT_TUNNEL=loopback UNDERCROFT_LOOPBACK=guest pnpm desktop:dev -- --user-data-dir=<folder B>
  ```

  The guest sees the host's party. Ready both, descend, and what the guest carries out lands in folder B's save.

- **With Steam:** two PCs and two Steam accounts. Check invites, "Join game" from the friends list, the game starting for a join, and the host leaving.
