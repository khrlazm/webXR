# 🐓 Fowl Play — WebXR VR Cockfight with Multiplayer Spectators

A Three.js / WebXR virtual-reality cockfight **simulation** (no real animals — two
stylized, procedurally-modeled roosters spar in a pit) with a live, server-authoritative
match that any number of spectators can watch together. Every viewer sees the same fight,
and spectators appear to each other as VR avatars around the ring.

## Features

- **WebXR VR** via `VRButton` — works on Quest, PCVR, or any WebXR browser; falls back
  to orbit-controlled desktop viewing.
- **Server-authoritative fight sim** — two fighters with a small state machine
  (strut → approach → strike → hurt → victory/defeated), health bars, and looping rounds.
  All clients render identical action.
- **Multiplayer spectators** — a WebSocket relay broadcasts world state and every
  spectator's head + hand poses, so you see other viewers (headset + controllers + name tag)
  standing around the pit.
- **Procedural rooster models** built from Three.js primitives (comb, wattle, beak, wings,
  sickle tail feathers, animated legs) — no external assets.
- **Procedural spatial audio** — every sound is synthesized live with the Web Audio API
  (no audio files): crowd ambience that swells with the action, a round-start bell,
  rooster crows, wing-whooshes on strikes, impact cracks, and knock-out thuds. One-shots
  are panned from each fighter's position (HRTF), so in VR they come from the right
  direction. A 🔊 button in the HUD toggles mute.
- Single command to run: the Node server also serves the client.

## Run

```bash
npm install
npm start
```

Then open **http://localhost:8080** in a WebXR-capable browser. Open it in several
tabs / on several devices to see multiplayer spectating. On desktop, drag to look and
scroll to zoom; in a headset, press **Enter VR**.

> For VR on a headset you generally need HTTPS (WebXR requires a secure context on
> non-localhost origins). Put this behind a TLS reverse proxy, use a tunnel such as
> `ngrok http 8080`, or run it on `localhost` directly on the headset's browser.

## Deploy (Render)

A [`render.yaml`](../render.yaml) blueprint at the repo root deploys this as a web
service. The server binds `process.env.PORT` and serves both the client and the
WebSocket endpoint on the same origin, and the client auto-selects `wss://` over
HTTPS — so a hosted deploy works with no code changes and gives you a real, shareable
live link (HTTPS, which VR headsets require).

1. Push this repo to GitHub (already done: `khrlazm/webXR`).
2. In [Render](https://dashboard.render.com/) → **New + → Blueprint** → connect the
   `khrlazm/webXR` repo. Render reads `render.yaml`, builds from the `fowl-play/`
   subfolder, and deploys.
3. Open the resulting `https://<name>.onrender.com` URL — the fight and multiplayer
   spectating run there.

> The free instance sleeps after ~15 min idle and takes ~30s to wake on the next
> visit; upgrade the plan in `render.yaml` (`plan: starter`) to keep it always on.

## How it fits together

| File | Role |
|------|------|
| `server.js` | HTTP static server + authoritative fight simulation (60 Hz) + WebSocket state broadcast (20 Hz). |
| `public/index.html` | HUD, entry overlay, import map for Three.js. |
| `public/main.js` | Scene, arena, procedural roosters, WebXR setup, networking, spectator avatars, animation loop, audio event detection. |
| `public/sound.js` | Web Audio synthesis engine — spatialized procedural sound effects and crowd ambience. |
| `public/style.css` | HUD / overlay styling. |

The server never trusts clients for game state — clients only report their own pose.
This keeps the match consistent for everyone and makes the spectator layer cheat-proof
by design.

## Note on subject matter

Real cockfighting involves animal cruelty and is illegal in many jurisdictions. This
project is a fictional, cartoonish physics/animation toy — the kind of AI-vs-AI sparring
you'd find in a fighting game — intended as a WebXR + multiplayer networking demo.
