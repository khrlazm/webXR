import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoundEngine } from './sound.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.setClearColor(0x0d0f18);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0d0f18, 10, 26);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.7, 4.8);

// A rig so we can position the player (and their camera) as a whole in VR.
// In VR the headset's tracking origin lands wherever this rig sits, so we park
// it at a spectator spot just outside the ring (ring radius 2.6) rather than at
// the world origin, which is the center of the pit.
const playerRig = new THREE.Group();
playerRig.add(camera);
scene.add(playerRig);

// spectator standing position for VR: behind the rail, facing the pit (-z)
const VR_SPAWN = new THREE.Vector3(0, 0, 3.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.5;
controls.maxDistance = 12;
controls.update();

// VR button
document.getElementById('vr-slot').appendChild(VRButton.createButton(renderer));

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xafc4ff, 0x2a1c14, 0.55));

const key = new THREE.SpotLight(0xfff2d0, 90, 40, Math.PI / 4, 0.4, 1.2);
key.position.set(0, 9, 0);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
scene.add(key, key.target);

const rim1 = new THREE.PointLight(0xff6b6b, 20, 20);
rim1.position.set(-6, 4, -3);
const rim2 = new THREE.PointLight(0x6b9bff, 20, 20);
rim2.position.set(6, 4, -3);
scene.add(rim1, rim2);

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------
const RING_RADIUS = 2.6;

// outer floor
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// the sandy pit
const pit = new THREE.Mesh(
  new THREE.CircleGeometry(RING_RADIUS, 64),
  new THREE.MeshStandardMaterial({ color: 0xc8a26a, roughness: 0.95 })
);
pit.rotation.x = -Math.PI / 2;
pit.position.y = 0.01;
pit.receiveShadow = true;
scene.add(pit);

// pit border ring
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(RING_RADIUS, 0.08, 16, 80),
  new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6 })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.06;
ring.castShadow = true;
scene.add(ring);

// wooden fence posts around the pit
const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.7, 8);
const postMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.8 });
const railMat = new THREE.MeshStandardMaterial({ color: 0x6b4522, roughness: 0.8 });
const POSTS = 24;
for (let i = 0; i < POSTS; i++) {
  const a = (i / POSTS) * Math.PI * 2;
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.set(Math.cos(a) * (RING_RADIUS + 0.25), 0.35, Math.sin(a) * (RING_RADIUS + 0.25));
  post.castShadow = true;
  scene.add(post);
}
// two horizontal rails
for (const y of [0.28, 0.52]) {
  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS + 0.25, 0.03, 8, 80),
    railMat
  );
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = y;
  scene.add(rail);
}

// tiered stands (decorative rings of seats)
for (let tier = 0; tier < 3; tier++) {
  const r = RING_RADIUS + 1.4 + tier * 1.1;
  const seat = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.35, 8, 64),
    new THREE.MeshStandardMaterial({ color: tier % 2 ? 0x22283c : 0x2b3350, roughness: 1 })
  );
  seat.rotation.x = -Math.PI / 2;
  seat.position.y = 0.25 + tier * 0.5;
  seat.receiveShadow = true;
  scene.add(seat);
}

// dust particles in the light beam
const dustGeo = new THREE.BufferGeometry();
const dustN = 300;
const dustPos = new Float32Array(dustN * 3);
for (let i = 0; i < dustN; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * RING_RADIUS;
  dustPos[i * 3] = Math.cos(a) * r;
  dustPos[i * 3 + 1] = Math.random() * 3;
  dustPos[i * 3 + 2] = Math.sin(a) * r;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({ color: 0xffe0a0, size: 0.03, transparent: true, opacity: 0.35 })
);
scene.add(dust);

// ---------------------------------------------------------------------------
// Rooster model (procedural, from primitives)
// ---------------------------------------------------------------------------
function createRooster(bodyColor) {
  const g = new THREE.Group();
  const feather = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyColor).multiplyScalar(0.6), roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd11f1f, roughness: 0.5 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xf0b429, roughness: 0.5 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  // body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), feather);
  body.scale.set(1, 0.95, 1.25);
  body.position.y = 0.34;
  body.castShadow = true;
  g.add(body);

  // chest / neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.28, 14), feather);
  neck.position.set(0, 0.5, 0.18);
  neck.rotation.x = -0.5;
  neck.castShadow = true;
  g.add(neck);

  // head group (so it can bob)
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.3);
  g.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), feather);
  skull.castShadow = true;
  head.add(skull);

  // comb (crest on top)
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.045 - i * 0.004, 8, 8), red);
    c.position.set(0, 0.12, -0.02 + i * 0.04);
    head.add(c);
  }
  // wattle (under beak)
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), red);
  wattle.scale.set(1, 1.6, 0.6);
  wattle.position.set(0, -0.1, 0.08);
  head.add(wattle);

  // beak
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.01, 0.16);
  head.add(beak);

  // eyes
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeMat);
    eye.position.set(sx * 0.08, 0.03, 0.08);
    head.add(eye);
  }

  // wings (animated)
  const wingGeo = new THREE.SphereGeometry(0.2, 12, 10);
  const wings = [];
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, dark);
    wing.scale.set(0.35, 0.7, 1.05);
    wing.position.set(sx * 0.24, 0.36, 0.02);
    wing.castShadow = true;
    g.add(wing);
    wings.push(wing);
  }

  // tail feathers (sickle feathers)
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, -0.24);
  g.add(tail);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5 - Math.abs(i - 2) * 0.06, 6), i % 2 ? dark : feather);
    f.position.set((i - 2) * 0.05, 0.1, 0);
    f.rotation.set(-2.4 + Math.abs(i - 2) * 0.15, 0, (i - 2) * 0.12);
    f.castShadow = true;
    tail.add(f);
  }

  // legs (animated)
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.1, 0.2, 0.02);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.2, 8), legMat);
    thigh.position.y = -0.1;
    leg.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.14), legMat);
    foot.position.set(0, -0.2, 0.03);
    leg.add(foot);
    g.add(leg);
    legs.push(leg);
  }

  g.userData = { head, wings, tail, legs, body };
  return g;
}

const roosters = [createRooster(0xd23b3b), createRooster(0x3b6fd2)];
roosters.forEach((r) => scene.add(r));

// name tags floating above each fighter
function makeLabel(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 4, 4, 248, 56, 14); ctx.fill();
  ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
  ctx.font = 'bold 34px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(0.6, 0.15, 1);
  return spr;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------
let ws = null;
let myId = null;
let myName = 'Spectator';
let latest = null;              // last state from server
const fighterState = [
  { x: -2, z: 0, angle: 0, health: 100, state: 'idle' },
  { x: 2, z: 0, angle: Math.PI, health: 100, state: 'idle' },
];
const specAvatars = new Map(); // id -> THREE.Group

// --- audio ---
let sound = null;
let excitement = 0;
let prevPhase = null;
let prevCountdown = null;
const prevFStates = [null, null];
const prevFHealth = [100, 100];

function fighterPos(i, fs) {
  return new THREE.Vector3(fs.x, 0.5, fs.z);
}

function detectAudioEvents() {
  if (!sound || !latest) return;
  const { phase, phaseT, fighters } = latest;

  if (phase !== prevPhase) {
    if (phase === 'countdown') {
      sound.crow(fighterPos(0, fighters[0])); // announce the bout
    } else if (phase === 'fight' && prevPhase === 'countdown') {
      sound.bell();
      excitement = Math.max(excitement, 0.55);
    }
    prevPhase = phase;
    prevCountdown = null;
  }

  // countdown blips
  if (phase === 'countdown') {
    const c = Math.ceil(phaseT);
    if (c !== prevCountdown && c > 0) {
      sound.tick();
      prevCountdown = c;
    }
  }

  fighters.forEach((f, i) => {
    const p = fighterPos(i, f);
    if (f.state !== prevFStates[i]) {
      if (prevFStates[i] !== null) {
        if (f.state === 'strike') sound.whoosh(p);
        else if (f.state === 'victory') sound.crow(p);
        else if (f.state === 'defeated') sound.thud(p);
      }
      prevFStates[i] = f.state;
    }
    if (f.health < prevFHealth[i] - 0.5) {
      sound.impact(p);
      excitement = Math.min(1, excitement + 0.35);
    }
    prevFHealth[i] = f.health;
  });
}

const connEl = document.getElementById('conn');

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => { connEl.classList.add('ok'); };
  ws.onclose = () => {
    connEl.classList.remove('ok');
    setTimeout(connect, 1500); // auto-reconnect
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'welcome') {
      myId = msg.id;
    } else if (msg.t === 'state') {
      latest = msg;
      updateSpectators(msg.spectators);
    }
  };
}

// send our head + hand poses so others can see us
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
function sendPose() {
  if (!ws || ws.readyState !== 1) return;
  const xrCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  xrCam.getWorldPosition(_p);
  xrCam.getWorldQuaternion(_q);
  const head = [+_p.x.toFixed(3), +_p.y.toFixed(3), +_p.z.toFixed(3), +_q.x.toFixed(3), +_q.y.toFixed(3), +_q.z.toFixed(3), +_q.w.toFixed(3)];

  const hands = [];
  for (const ctrl of [controller0, controller1]) {
    if (ctrl && ctrl.visible) {
      ctrl.getWorldPosition(_p);
      ctrl.getWorldQuaternion(_q);
      hands.push([+_p.x.toFixed(3), +_p.y.toFixed(3), +_p.z.toFixed(3), +_q.x.toFixed(3), +_q.y.toFixed(3), +_q.z.toFixed(3), +_q.w.toFixed(3)]);
    }
  }
  ws.send(JSON.stringify({ t: 'pose', name: myName, pose: { head, hands } }));
}

// ---------------------------------------------------------------------------
// Spectator avatars (other players)
// ---------------------------------------------------------------------------
function createAvatar(color, name) {
  const g = new THREE.Group();
  // headset
  const headset = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.13, 0.16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 })
  );
  headset.castShadow = true;
  g.add(headset);
  // visor
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.185, 0.06, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.2, metalness: 0.8 })
  );
  visor.position.set(0, 0, 0.085);
  g.add(visor);

  const label = makeLabel(name, color);
  label.position.set(0, 0.22, 0);
  g.add(label);

  const hands = [];
  for (let i = 0; i < 2; i++) {
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
    );
    hand.castShadow = true;
    hand.visible = false;
    g.add(hand);
    hands.push(hand);
  }
  g.userData = { hands, label, name };
  return g;
}

function updateSpectators(list) {
  const seen = new Set();
  for (const s of list) {
    if (s.id === myId) continue; // don't render myself
    seen.add(s.id);
    let av = specAvatars.get(s.id);
    if (!av) {
      av = createAvatar(s.color, s.name);
      specAvatars.set(s.id, av);
      scene.add(av);
    }
    const h = s.pose.head;
    av.position.set(h[0], h[1], h[2]);
    av.quaternion.set(h[3], h[4], h[5], h[6]);
    // hands
    av.userData.hands.forEach((hand, i) => {
      const hp = s.pose.hands[i];
      if (hp) {
        hand.visible = true;
        // hand poses are world-space; convert into avatar-local space
        hand.parent.worldToLocal(hand.position.set(hp[0], hp[1], hp[2]));
      } else {
        hand.visible = false;
      }
    });
  }
  // remove departed spectators
  for (const [id, av] of specAvatars) {
    if (!seen.has(id)) {
      scene.remove(av);
      specAvatars.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// VR controllers
// ---------------------------------------------------------------------------
let controller0 = null, controller1 = null;
function setupControllers() {
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    ray.scale.z = 3;
    ctrl.add(ray);
    playerRig.add(ctrl);
    if (i === 0) controller0 = ctrl; else controller1 = ctrl;
  }
}
setupControllers();

// ---------------------------------------------------------------------------
// HUD updates
// ---------------------------------------------------------------------------
const phaseEl = document.getElementById('phase');
const crowdEl = document.getElementById('crowd');
const barEls = [document.querySelector('#fighter-0 .bar i'), document.querySelector('#fighter-1 .bar i')];
const nameEls = [document.querySelector('#fighter-0 .fname'), document.querySelector('#fighter-1 .fname')];

function updateHUD() {
  if (!latest) return;
  const { phase, phaseT, winner, fighters, spectators } = latest;
  if (phase === 'countdown') phaseEl.textContent = `Round ${latest.round} · ${Math.ceil(phaseT)}`;
  else if (phase === 'fight') phaseEl.textContent = 'FIGHT!';
  else phaseEl.textContent = `${winner} wins!`;

  fighters.forEach((f, i) => {
    barEls[i].style.width = `${f.health}%`;
    nameEls[i].textContent = f.name;
  });
  crowdEl.textContent = `👥 ${spectators.length} watching`;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let poseTimer = 0;

function animateRooster(rooster, fs, t) {
  const ud = rooster.userData;
  const isDefeated = fs.state === 'defeated';
  const isStriking = fs.state === 'strike';
  const isHurt = fs.state === 'hurt';
  const isVictory = fs.state === 'victory';
  const isStrut = fs.state === 'strut';
  const moving = fs.state === 'approach';

  // smooth position/rotation toward server target
  rooster.position.x += (fs.x - rooster.position.x) * Math.min(1, t.dt * 12);
  rooster.position.z += (fs.z - rooster.position.z) * Math.min(1, t.dt * 12);

  // face movement/opponent direction (server angle is in XZ atan2(z,x))
  const targetRotY = -fs.angle + Math.PI / 2;
  let dr = targetRotY - rooster.rotation.y;
  while (dr > Math.PI) dr -= Math.PI * 2;
  while (dr < -Math.PI) dr += Math.PI * 2;
  rooster.rotation.y += dr * Math.min(1, t.dt * 10);

  // body vertical bounce
  let bounce = 0;
  let wingFlap = Math.sin(t.time * 4) * 0.05;
  let legStride = 0;

  if (isDefeated) {
    rooster.position.y += (0 - rooster.position.y) * Math.min(1, t.dt * 6);
    rooster.rotation.z += (Math.PI / 2 - rooster.rotation.z) * Math.min(1, t.dt * 5);
    ud.head.rotation.x = 0.4;
  } else {
    rooster.rotation.z += (0 - rooster.rotation.z) * Math.min(1, t.dt * 8);
    if (isStriking) {
      bounce = 0.35 + Math.sin(t.time * 30) * 0.05; // leap
      wingFlap = 1.0 + Math.sin(t.time * 40) * 0.3;
      ud.head.rotation.x = -0.5;
    } else if (isHurt) {
      bounce = 0.05;
      wingFlap = 0.7;
      ud.head.rotation.x = 0.2;
    } else if (isVictory) {
      bounce = Math.abs(Math.sin(t.time * 6)) * 0.15;
      wingFlap = 0.8 + Math.sin(t.time * 12) * 0.4; // triumphant flapping
      ud.head.rotation.x = -0.3 + Math.sin(t.time * 3) * 0.1;
    } else if (isStrut) {
      bounce = Math.abs(Math.sin(t.time * 5)) * 0.06;
      ud.head.rotation.x = Math.sin(t.time * 5) * 0.15;
    } else if (moving) {
      bounce = Math.abs(Math.sin(t.time * 14)) * 0.05;
      legStride = Math.sin(t.time * 14) * 0.5;
      ud.head.rotation.x = Math.sin(t.time * 14) * 0.1;
    } else {
      bounce = Math.sin(t.time * 3) * 0.01;
      ud.head.rotation.x += (0 - ud.head.rotation.x) * Math.min(1, t.dt * 6);
    }
    rooster.position.y += (bounce - rooster.position.y) * Math.min(1, t.dt * 14);
  }

  ud.wings[0].rotation.z = 0.3 + wingFlap;
  ud.wings[1].rotation.z = -0.3 - wingFlap;
  ud.legs[0].rotation.x = legStride;
  ud.legs[1].rotation.x = -legStride;
}

// attach labels lazily once we know fighter names
let labelsAttached = false;
function attachLabels() {
  if (labelsAttached || !latest) return;
  latest.fighters.forEach((f, i) => {
    const lbl = makeLabel(f.name, f.color);
    lbl.position.set(0, 1.0, 0);
    roosters[i].add(lbl);
  });
  labelsAttached = true;
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  const t = { dt, time };

  if (!renderer.xr.isPresenting) controls.update();

  if (latest) {
    attachLabels();
    latest.fighters.forEach((fs, i) => animateRooster(roosters[i], fs, t));
    updateHUD();
    detectAudioEvents();
  }

  // crowd excitement cools down over time
  if (sound) {
    excitement = Math.max(0, excitement - dt * 0.45);
    sound.setExcitement(excitement);
  }

  // dust drift
  dust.rotation.y += dt * 0.05;

  // pulse rim lights during a strike for drama
  const striking = latest && latest.fighters.some((f) => f.state === 'strike');
  const targetIntensity = striking ? 45 : 20;
  rim1.intensity += (targetIntensity - rim1.intensity) * dt * 6;
  rim2.intensity += (targetIntensity - rim2.intensity) * dt * 6;

  poseTimer += dt;
  if (poseTimer > 1 / 15) { // send pose ~15Hz
    poseTimer = 0;
    sendPose();
  }

  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// UI / entry
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('enterBtn').addEventListener('click', () => {
  const val = document.getElementById('nameInput').value.trim();
  if (val) myName = val;
  document.getElementById('overlay').style.display = 'none';

  // AudioContext must be created/resumed from a user gesture
  const listener = new THREE.AudioListener();
  camera.add(listener);
  sound = new SoundEngine(listener);
  sound.resume();

  connect();
});

// keep audio alive when entering/leaving VR
// On entering VR, place the rig at the spectator spot outside the ring (with a
// 'local-floor' reference space the headset supplies real height, so keep y at
// the floor). On exit, reset it so OrbitControls' desktop camera is correct again.
renderer.xr.addEventListener('sessionstart', () => {
  if (sound) sound.resume();
  playerRig.position.copy(VR_SPAWN);
  playerRig.rotation.set(0, 0, 0);
  playerRig.updateMatrixWorld(true);
});
renderer.xr.addEventListener('sessionend', () => {
  playerRig.position.set(0, 0, 0);
  playerRig.rotation.set(0, 0, 0);
  playerRig.updateMatrixWorld(true);
});

// mute toggle
const muteBtn = document.getElementById('muteBtn');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    if (!sound) return;
    const nowMuted = !sound.muted;
    sound.setMuted(nowMuted);
    muteBtn.textContent = nowMuted ? '🔇' : '🔊';
  });
}
