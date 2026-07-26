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

// randomize per-round combat temperament so no two bouts move the same way
function rollTraits(f) {
  f.aggression = 0.5 + Math.random() * 0.35;    // how eagerly it commits to strikes
  f.agility = 0.45 + Math.random() * 0.4;       // dodge / parry reflex + footwork speed
  f.circleDir = Math.random() < 0.5 ? 1 : -1;   // which way it orbits the opponent
  f.preferredRange = 1.1 + Math.random() * 0.6; // spacing it likes to keep while circling
  f.decideT = 0.3 + Math.random() * 0.5;        // time to next micro-decision
  f._reactCd = 0;                               // cooldown between reactive dodges/parries
  f._dvx = 0; f._dvz = 0;                        // stored dodge burst velocity
  f._dealt = false;
}

function placeFighter(f, startAngle) {
  f.x = Math.cos(startAngle) * (RING_RADIUS - 0.6);
  f.z = Math.sin(startAngle) * (RING_RADIUS - 0.6);
  f.angle = startAngle + Math.PI; // face roughly toward center
  f.health = MAX_HEALTH;
  f.stamina = 100;
  f.state = 'idle';
  f.stateT = 0;
  f.vx = 0;
  f.vz = 0;
  rollTraits(f);
}

function makeFighter(name, color, startAngle) {
  const f = {
    name,
    color,
    // states: idle | circle | approach | feint | dodge | parry | strike |
    //         recover | hurt | strut | victory | defeated
    state: 'idle',
  };
  placeFighter(f, startAngle);
  return f;
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
  match.fighters.forEach((f, i) => placeFighter(f, angles[i]));
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

// Slow, occasionally-reversing bias that walks the whole engagement around the
// ring center so the duel travels the arena instead of parking in one spot.
let arenaSpin = Math.random() < 0.5 ? 1 : -1;
let arenaSpinT = 6 + Math.random() * 5;

// Ramps 0 → 1 over the course of a round: fighters tire, evade less and hit
// harder, so a bout always builds to a finish instead of stalling.
let fightElapsed = 0;
let fightIntensity = 0;

function stepFighter(f, foe, dt) {
  f.stateT -= dt;
  f.decideT -= dt;
  f._reactCd -= dt;
  f.stamina = Math.min(100, f.stamina + dt * 8);

  if (f.state === 'defeated') {
    f.vx = f.vz = 0;
    return;
  }

  const d = dist(f, foe);
  const toFoe = Math.atan2(foe.z - f.z, foe.x - f.x);

  // smoothly turn to face the opponent (slower mid-lunge so a strike can be juked)
  let da = toFoe - f.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const turnRate = f.state === 'strike' ? 3 : 8;
  f.angle += da * Math.min(1, dt * turnRate);

  // --- reactive defense: dodge or parry a strike/feint coming our way ---
  // Decide ONCE per incoming threat (on the transition), not every tick — a
  // strike's active window is many ticks, so a per-tick roll would always evade.
  // A feint counts as a threat, so it baits (and burns) the defender's reflex.
  const foeThreat = foe.state === 'strike' || foe.state === 'feint';
  const newThreat = foeThreat && f._foePrev !== foe.state;
  f._foePrev = foe.state;
  const reactable = f.state === 'circle' || f.state === 'approach' ||
                    f.state === 'feint' || f.state === 'idle';
  if (newThreat && reactable && f._reactCd <= 0 && d < 1.6) {
    const roll = Math.random();
    const evade = 1 - 0.5 * fightIntensity; // reflexes fade as the round wears on
    if (roll < f.agility * 0.6 * evade && f.stamina > 22) {
      // sidestep out of the strike line
      const side = Math.random() < 0.5 ? 1 : -1;
      const dir = toFoe + (Math.PI / 2) * side;
      const burst = 3.6;
      f._dvx = Math.cos(dir) * burst;
      f._dvz = Math.sin(dir) * burst;
      setState(f, 'dodge', 0.3);
      f.stamina -= 16;
      f._reactCd = 1.0;
    } else if (roll < (f.agility * 0.6 + 0.2) * evade && f.stamina > 12) {
      // stand and deflect
      setState(f, 'parry', 0.4);
      f.stamina -= 8;
      f._reactCd = 1.0;
    }
    // otherwise: no reflex this time — the strike will land
  }

  switch (f.state) {
    case 'strike': {
      const lunge = 3.5;
      f.vx = Math.cos(f.angle) * lunge;
      f.vz = Math.sin(f.angle) * lunge;
      if (f.stateT <= 0) setState(f, 'recover', 0.26);
      break;
    }
    case 'recover': {
      // brief vulnerable settle after a strike
      f.vx *= 0.8; f.vz *= 0.8;
      if (f.stateT <= 0) setState(f, 'circle', 0.2);
      break;
    }
    case 'hurt': {
      f.vx *= 0.86; f.vz *= 0.86;
      if (f.stateT <= 0) setState(f, 'circle', 0.2);
      break;
    }
    case 'dodge': {
      f.vx = f._dvx; f.vz = f._dvz;
      f._dvx *= 0.86; f._dvz *= 0.86;
      if (f.stateT <= 0) setState(f, 'circle', 0.15);
      break;
    }
    case 'parry': {
      // plant and give a little ground
      f.vx = -Math.cos(f.angle) * 0.5;
      f.vz = -Math.sin(f.angle) * 0.5;
      if (f.stateT <= 0) setState(f, 'circle', 0.2);
      break;
    }
    case 'feint': {
      // fake a lunge in, then pull back out — baits a dodge/parry
      const s = f.stateT > 0.12 ? 2.2 : -1.6;
      f.vx = Math.cos(f.angle) * s;
      f.vz = Math.sin(f.angle) * s;
      if (f.stateT <= 0) setState(f, 'circle', 0.25);
      break;
    }
    case 'strut':
    case 'victory': {
      f.vx = f.vz = 0;
      break;
    }
    case 'circle':
    case 'approach':
    case 'idle':
    default: {
      // orbit the opponent: radial term corrects spacing, tangential term circles
      const radialErr = d - f.preferredRange;              // >0 = too far away
      const radialSpeed = Math.max(-1.4, Math.min(1.4, radialErr * 1.8));
      const rvx = Math.cos(toFoe) * radialSpeed;
      const rvz = Math.sin(toFoe) * radialSpeed;
      const tang = toFoe + (Math.PI / 2) * f.circleDir;
      const tSpeed = 0.9 + f.agility * 0.7;
      const tvx = Math.cos(tang) * tSpeed;
      const tvz = Math.sin(tang) * tSpeed;
      // roam: drift tangent to the ring center so the fight travels the arena
      const ringAng = Math.atan2(f.z, f.x) + (Math.PI / 2) * arenaSpin;
      const roam = 0.7;
      f.vx = rvx + tvx + Math.cos(ringAng) * roam;
      f.vz = rvz + tvz + Math.sin(ringAng) * roam;

      if (f.state !== 'circle') setState(f, 'circle', 0.4);

      // periodic micro-decision: attack (primary), feint, or reposition
      if (f.decideT <= 0) {
        f.decideT = 0.3 + Math.random() * 0.45;
        const r = Math.random();
        const aimed = Math.abs(da) < 0.7;
        if (d < 1.7 && aimed && f.stamina > 26 && r < f.aggression) {
          setState(f, 'strike', 0.26);
          f.stamina -= 20;
          f._dealt = false;
        } else if (d < 1.9 && f.stamina > 24 && r < 0.15) {
          setState(f, 'feint', 0.3);
          f.stamina -= 6;
        } else {
          // change it up so the duel travels around the ring
          if (Math.random() < 0.4) f.circleDir *= -1;
          f.preferredRange = 1.1 + Math.random() * 0.6;
        }
      }
      break;
    }
  }

  // hugging the boards? steer back inward so they sweep along the wall, not into it
  const rr = Math.hypot(f.x, f.z);
  if (rr > RING_RADIUS - 0.4) {
    const inward = Math.atan2(-f.z, -f.x);
    f.vx += Math.cos(inward) * 0.9;
    f.vz += Math.sin(inward) * 0.9;
  }

  f.x += f.vx * dt;
  f.z += f.vz * dt;
  clampToRing(f);
}

function resolveHits() {
  const [a, b] = match.fighters;
  for (const [att, def] of [[a, b], [b, a]]) {
    if (att.state !== 'strike' || att._dealt || att.stateT >= 0.18) continue;
    if (def.state === 'defeated') continue;

    const d = dist(att, def);

    // dodged — the strike sails through empty air
    if (def.state === 'dodge') {
      if (d < 1.0) att._dealt = true; // committed and whiffed
      continue;
    }

    // parried — deflect the blow, stagger the attacker, open a counter
    if (def.state === 'parry' && d < 1.05) {
      att._dealt = true;
      const away = Math.atan2(att.z - def.z, att.x - def.x);
      att.vx = Math.cos(away) * 3.0;
      att.vz = Math.sin(away) * 3.0;
      setState(att, 'hurt', 0.5);
      def.stamina = Math.max(0, def.stamina - 12);
      // riposte if the defender has anything left
      if (def.stamina > 18) {
        setState(def, 'strike', 0.24);
        def.stamina -= 18;
        def._dealt = false;
      } else {
        setState(def, 'recover', 0.3);
      }
      continue;
    }

    // clean hit
    if (d < 0.9) {
      att._dealt = true;
      const dmg = (7 + Math.random() * 9) * (1 + 0.6 * fightIntensity);
      def.health = Math.max(0, def.health - dmg);
      const away = Math.atan2(def.z - att.z, def.x - att.x);
      def.vx = Math.cos(away) * 2.6;
      def.vz = Math.sin(away) * 2.6;
      setState(def, 'hurt', 0.35);
      if (def.health <= 0) setState(def, 'defeated', 999);
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
      fightElapsed = 0;
      fightIntensity = 0;
      match.fighters.forEach((f) => setState(f, 'idle', 0.2));
    }
  } else if (match.phase === 'fight') {
    fightElapsed += dt;
    fightIntensity = Math.min(1, fightElapsed / 35);
    arenaSpinT -= dt;
    if (arenaSpinT <= 0) {
      if (Math.random() < 0.55) arenaSpin *= -1; // sometimes reverse direction
      arenaSpinT = 6 + Math.random() * 5;
    }
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
