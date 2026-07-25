// Fowl Play — authoritative cockfight simulation + multiplayer spectator relay.
//
// The server owns the fight: two roosters are simulated here so every connected
// spectator sees exactly the same match. Clients only send their own head /
// controller poses (so people can see each other in VR) and receive world state.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8080;

// ---------------------------------------------------------------------------
// Static file server (so `npm start` serves the client too)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Cockfight simulation
// ---------------------------------------------------------------------------
const RING_RADIUS = 2.6;     // meters
const BODY_RADIUS = 0.34;    // fighter collision radius (half-width of the bird)
const MAX_HEALTH = 100;
const TICK_HZ = 60;
const BROADCAST_HZ = 20;

function makeFighter(name, color, startAngle) {
  return {
    name,
    color,
    x: Math.cos(startAngle) * (RING_RADIUS - 0.6),
    z: Math.sin(startAngle) * (RING_RADIUS - 0.6),
    angle: startAngle + Math.PI, // face roughly toward center
    health: MAX_HEALTH,
    stamina: 100,
    state: 'idle',   // idle | approach | strike | hurt | strut | victory | defeated
    stateT: 0,       // seconds remaining in current state
    vx: 0,
    vz: 0,
  };
}

const match = {
  phase: 'countdown', // countdown | fight | finished
  phaseT: 3,
  round: 1,
  winner: null,
  fighters: [
    makeFighter('Rojo', 0xd23b3b, Math.PI),        // red, west side
    makeFighter('Azul', 0x3b6fd2, 0),              // blue, east side
  ],
};

function resetMatch() {
  match.round += 1;
  match.phase = 'countdown';
  match.phaseT = 3;
  match.winner = null;
  const angles = [Math.PI, 0];
  match.fighters.forEach((f, i) => {
    f.x = Math.cos(angles[i]) * (RING_RADIUS - 0.6);
    f.z = Math.sin(angles[i]) * (RING_RADIUS - 0.6);
    f.angle = angles[i] + Math.PI;
    f.health = MAX_HEALTH;
    f.stamina = 100;
    f.state = 'idle';
    f.stateT = 0;
    f.vx = 0;
    f.vz = 0;
  });
}

function setState(f, state, duration) {
  f.state = state;
  f.stateT = duration;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// keep a fighter inside the circular pit
function clampToRing(f) {
  const r = Math.hypot(f.x, f.z);
  const max = RING_RADIUS - 0.15;
  if (r > max) {
    f.x = (f.x / r) * max;
    f.z = (f.z / r) * max;
  }
}

function stepFighter(f, foe, dt) {
  f.stateT -= dt;
  f.stamina = Math.min(100, f.stamina + dt * 6);

  if (f.state === 'defeated') {
    f.vx = f.vz = 0;
    return;
  }

  const d = dist(f, foe);
  const toFoe = Math.atan2(foe.z - f.z, foe.x - f.x);

  // smoothly turn to face the opponent
  let da = toFoe - f.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  f.angle += da * Math.min(1, dt * 6);

  switch (f.state) {
    case 'strike': {
      // lunge forward during the strike window
      const lunge = 3.2;
      f.vx = Math.cos(f.angle) * lunge;
      f.vz = Math.sin(f.angle) * lunge;
      if (f.stateT <= 0) setState(f, 'idle', 0.25 + Math.random() * 0.2);
      break;
    }
    case 'hurt': {
      // knocked backward
      f.vx *= 0.86;
      f.vz *= 0.86;
      if (f.stateT <= 0) setState(f, 'idle', 0.15);
      break;
    }
    case 'strut':
    case 'victory': {
      f.vx = f.vz = 0;
      break;
    }
    case 'approach':
    case 'idle':
    default: {
      if (d > 0.95) {
        // close the distance, with a little sidestep juke
        const juke = Math.sin(Date.now() * 0.003 + f.x) * 0.5;
        const dir = f.angle + juke * 0.4;
        const speed = 1.15;
        f.vx = Math.cos(dir) * speed;
        f.vz = Math.sin(dir) * speed;
        if (f.state !== 'approach') setState(f, 'approach', 0.5);
      } else {
        f.vx *= 0.7;
        f.vz *= 0.7;
        // in range: maybe strike
        if (f.stateT <= 0 && f.stamina > 25 && Math.abs(da) < 0.6) {
          if (Math.random() < 0.65) {
            setState(f, 'strike', 0.28);
            f.stamina -= 22;
            f._dealt = false;
          } else {
            setState(f, 'idle', 0.3 + Math.random() * 0.4);
          }
        }
      }
      break;
    }
  }

  f.x += f.vx * dt;
  f.z += f.vz * dt;
  clampToRing(f);
}

function resolveHits() {
  const [a, b] = match.fighters;
  for (const [att, def] of [[a, b], [b, a]]) {
    if (att.state === 'strike' && !att._dealt && att.stateT < 0.18) {
      if (dist(att, def) < 0.85 && def.state !== 'defeated') {
        att._dealt = true;
        const dmg = 6 + Math.random() * 9;
        def.health = Math.max(0, def.health - dmg);
        // knock the defender back
        const away = Math.atan2(def.z - att.z, def.x - att.x);
        def.vx = Math.cos(away) * 2.4;
        def.vz = Math.sin(away) * 2.4;
        setState(def, 'hurt', 0.35);
        if (def.health <= 0) {
          setState(def, 'defeated', 999);
        }
      }
    }
  }
}

// Keep the two fighters from overlapping: push them apart along the axis
// between them and cancel any velocity still driving them into each other.
function resolveBodyCollision() {
  const [a, b] = match.fighters;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let d = Math.hypot(dx, dz);
  const minD = BODY_RADIUS * 2;

  if (d > minD) return;

  let nx, nz;
  if (d < 1e-4) {
    // exactly coincident — pick an arbitrary axis to separate on
    nx = 1; nz = 0; d = 0;
  } else {
    nx = dx / d; nz = dz / d;
  }

  const overlap = minD - d;
  // a defeated bird is a heavy sack on the ground: shove the other one instead
  const aFixed = a.state === 'defeated';
  const bFixed = b.state === 'defeated';
  const aShare = aFixed ? 0 : bFixed ? 1 : 0.5;
  const bShare = 1 - aShare;

  a.x -= nx * overlap * aShare;
  a.z -= nz * overlap * aShare;
  b.x += nx * overlap * bShare;
  b.z += nz * overlap * bShare;

  // remove the components of velocity pointing into the other fighter
  const av = a.vx * nx + a.vz * nz;   // >0 means a is moving toward b
  if (av > 0) { a.vx -= av * nx; a.vz -= av * nz; }
  const bv = b.vx * nx + b.vz * nz;   // <0 means b is moving toward a
  if (bv < 0) { b.vx -= bv * nx; b.vz -= bv * nz; }

  clampToRing(a);
  clampToRing(b);
}

let lastTick = Date.now();
function simulate() {
  const now = Date.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;

  match.phaseT -= dt;

  if (match.phase === 'countdown') {
    match.fighters.forEach((f) => setState(f, 'strut', 1));
    if (match.phaseT <= 0) {
      match.phase = 'fight';
      match.fighters.forEach((f) => setState(f, 'idle', 0.2));
    }
  } else if (match.phase === 'fight') {
    const [a, b] = match.fighters;
    stepFighter(a, b, dt);
    stepFighter(b, a, dt);
    resolveBodyCollision();
    resolveHits();

    const loser = match.fighters.find((f) => f.state === 'defeated');
    if (loser) {
      match.phase = 'finished';
      match.phaseT = 6;
      match.winner = match.fighters.find((f) => f !== loser).name;
      match.fighters.forEach((f) => {
        if (f.state !== 'defeated') setState(f, 'victory', 999);
      });
    }
  } else if (match.phase === 'finished') {
    if (match.phaseT <= 0) resetMatch();
  }
}

setInterval(simulate, 1000 / TICK_HZ);

// ---------------------------------------------------------------------------
// WebSocket layer — spectators
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });
const spectators = new Map(); // id -> { id, name, pose }
let nextId = 1;
const COLORS = [0xffcf5c, 0x5cffb0, 0xff8cc6, 0x8cd0ff, 0xc79bff, 0xffa45c];

wss.on('connection', (ws) => {
  const id = nextId++;
  const spec = {
    id,
    name: `Spectator ${id}`,
    color: COLORS[id % COLORS.length],
    // pose: head + two hands, each [x,y,z, qx,qy,qz,qw]
    pose: { head: [0, 1.6, 4.5, 0, 0, 0, 1], hands: [] },
    ws,
  };
  spectators.set(id, spec);

  ws.send(JSON.stringify({ t: 'welcome', id, color: spec.color, ringRadius: RING_RADIUS }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'pose') {
      spec.pose = msg.pose;
      if (typeof msg.name === 'string') spec.name = msg.name.slice(0, 24);
    }
  });

  ws.on('close', () => spectators.delete(id));
  ws.on('error', () => spectators.delete(id));
});

function broadcast() {
  const others = [...spectators.values()].map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    pose: s.pose,
  }));

  const state = {
    t: 'state',
    ts: Date.now(),
    phase: match.phase,
    phaseT: Math.max(0, match.phaseT),
    round: match.round,
    winner: match.winner,
    fighters: match.fighters.map((f) => ({
      name: f.name,
      color: f.color,
      x: +f.x.toFixed(3),
      z: +f.z.toFixed(3),
      angle: +f.angle.toFixed(3),
      health: +f.health.toFixed(1),
      state: f.state,
    })),
    spectators: others,
  };

  const payload = JSON.stringify(state);
  for (const s of spectators.values()) {
    if (s.ws.readyState === 1) s.ws.send(payload);
  }
}

setInterval(broadcast, 1000 / BROADCAST_HZ);

server.listen(PORT, () => {
  console.log(`\n  Fowl Play running`);
  console.log(`  Open http://localhost:${PORT} in a WebXR-capable browser`);
  console.log(`  (open it on multiple devices/tabs for multiplayer spectating)\n`);
});
