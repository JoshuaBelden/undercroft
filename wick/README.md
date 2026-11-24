# WICK

**WICK** (WebGL Integrated Creation Kit) is a set of TypeScript packages for building browser games on Three.js and the Web platform: audio, rendering, input, settings, multiplayer, membership and tooling. A game installs the packages it needs and passes in its own content; WICK never depends on the game.

- **Learn it:** the University, the docs site with live demos. Run `pnpm -C wick/university dev`, then open <http://localhost:5175>.
- **The boundary:** nothing in `wick/` imports anything outside it. Each package depends only on other `@wick/*` packages and on libraries.

| Package       | What it does                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@wick/audio` | Web Audio category buses, low-pass muffling, convolution reverb, HRTF positional sound, recordings by id, captions, fading loops |
