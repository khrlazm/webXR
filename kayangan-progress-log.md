# KAYANGAN — Progress Log
*WebXR god-sim inspired by Populous. Handoff document for continuing in a new chat.*
*Last updated: July 21, 2026*

> **Rename:** Project formerly "GENESIS," now **Kayangan** (Malay: celestial abode / heaven). All prior references to GENESIS in files and sketches refer to this project.

---

## 1. Project vision

A WebXR god game built with Three.js. The player stands in space before a **floating disc-world (~1m wide)** — grabbing, rotating, and sculpting it like wet clay. No units, no scripted story: terrain, climate, ecology, and civilizations all emerge from interacting systems. Divine powers are natural interventions (rain, quakes, volcanoes, plagues, eclipses), not spells.

- Tagline: *"The world exists in the palm of your hands."*
- Aesthetic: disc-world artifact in a nebula; waterfalls pour off the rim into the void; sun and moon orbit it. Gold/space visual identity (dark space, gold serif UI).
- Reference docs: Populous.rtf concept doc + "GENESIS" infographic (in project files).

## 2. The 5-phase plan (agreed)

1. **The World Exists** — scaffold, procedural disc renderer, space environment, XR grab/rotate/zoom. *(Front-load rim waterfalls + grab interaction: they're the identity.)*
2. **The World Responds** — sculpting ("wet clay" feel), water/rivers, biomes, live terrain shader.
3. **The World Lives** — climate/ecology engine: grabbable clouds, sun-driven temperature, seasons via tilt, vegetation + animals. **Event-bus architecture is the keystone.**
4. **The World Believes** — villagers with needs → emergent settlements, trade, civilization values, reaction chains (crop failure → migration → conflict).
5. **The World Fears You** — divine powers hooked into existing systems, VFX/audio polish, Quest optimization.

## 3. What's been built: `genesis-sketch.html`

A **single-file desktop sandbox** (Three.js r128 via cdnjs, no build step) to validate feel. Working features:

- **Disc world**: custom polar-grid mesh (84 rings × 220 segs ≈ 18.5k verts), fbm value-noise continents, jagged rock skirt underside + bottom cap, vertex-color biomes (abyss/sand/grass/forest/rock/snow) derived from height relative to sea level.
- **Sculpting**: raise/lower with gaussian brush (gold ring cursor), live recolor + normal recompute; forest brush plants instanced trees (cone+trunk InstancedMesh, cap 1600) only on viable biomes.
- **Sea**: animated transparent plane; sea-level slider floods/exposes land.
- **Rim waterfalls**: additive particles spawning wherever rim height < sea level; recompute on sculpt/sea change.
- **Sun/moon cycle**: draggable sun slider + auto day cycle; directional sun + cool-blue **moonlight** (fades in at night), emissive glowing moon, night ambience shifts blue.
- **Clouds — the signature interaction**: 5 drifting cloud groups, each **grabbable** (drag on its altitude plane, resumes orbit where dropped). **Shake detection via direction reversals** builds energy → rain. Clouds **darken progressively** (per-cloud material) → past storm threshold: **lightning** (jagged bolt line, point-light flash, thunder, burns trees at strike, each bolt discharges energy).
- **Rain**: streak particles (LineSegments, stretch with speed) + impact **splash** sparks; landing drops **soak a per-vertex moisture map** → grass darkens to lush green / wet sand (spreads to neighbors, dries out over ~1 min, recolor at 4Hz); rain sprouts trees on viable land (~4%/drop).
- **Meteor tool**: click-to-strike, crater with raised rim, tree destruction, flood-if-below-sea, flash + boom.
- **Generative soundtrack** (Web Audio, no files): breathing drone (D2+A2, LFO lowpass), gliding chord pads (D-lydian-ish, 22s changes, 7s portamento), pentatonic chimes through feedback delay (denser at night), wind noise. **System-driven**: sun brightens/darkens drone filter, rain drives a patter layer, meteor → sub boom, lightning → crack + rumble. Toggle in UI (autoplay-safe).
- **Controls**: drag land = tool, drag space/right-drag = orbit, wheel = zoom, grab clouds. Minimal gold/space UI panel (Raise/Lower/Forest/Meteor, brush/sea/sun sliders, time-flow + soundtrack checkboxes).

### Bugs fixed / lessons learned
- **Frustum culling bug**: dynamic particle geometries with verts initialized at y=-999 get a stale zero-size bounding sphere → whole object culled forever. Fix: `frustumCulled = false` on all per-frame-rewritten geometry (rain, splashes, bolt, waterfalls). Rule for real build: all particle systems either uncullable or manual generous bounds.
- r128 has no OrbitControls in the cdnjs single-file build → custom spherical orbit implemented.
- Full `computeVertexNormals` on 18k verts per sculpt frame is fine on desktop but must become localized/BVH-assisted (three-mesh-bvh) in the real build.
- Color-only refresh (`recolorOnly`) vs full refresh split keeps moisture updates cheap.

### Other files
- `index.html` — styled sketch-gallery launcher (CSS starfield, gold serif, roman-numeral list) linking genesis-sketch.html + user's other sketches (malacca-sketch, port, the-last-audience, harbor). *(To do at some point: rename genesis-sketch → kayangan-sketch and update the launcher link.)*

## 4. Key technical decision: WebGPU (researched July 2026)

- WebGPU is **Baseline in all major browsers since Jan 2026** → desktop build uses it, full stop.
- **WebXR-on-WebGPU**: shipping on Vision Pro, experimental on Chrome; Quest Browser added **experimental** WebGPU in the Apr 21, 2026 release — not stable, and current XR bindings have an internal texture copy (not auto-faster than WebGL yet).
- **Strategy**: Three.js `WebGPURenderer` + **TSL node materials** (compile to WGSL on WebGPU, GLSL on WebGL2). Write shaders once; desktop gets WebGPU showcase, Quest falls back to WebGL2 until Meta stabilizes, then flips with zero rewrite. Renderer chosen once at boot via feature detection.
- WebGPU compute unlocks the real wishlist: **hydraulic erosion**, **shallow-water river sim**, massive GPU particles, later GPU agent updates.
- Visual targets: procedural nebula skybox → PMREM environment map (cosmos reflected in ocean/snow), PBR sun, bloom + god rays, AgX/ACES tone mapping, atmospheric rim glow on disc edge, triplanar terrain with moisture darkening, real water shader (depth absorption, shoreline foam, SSR, refraction), flow-mapped waterfalls. Quest tier: stripped post (tone map + selective bloom only).

## 5. Phase 1 plan (agreed) — "The World Exists"

Goals to prove: (a) WebGPU+TSL+fallback stack holds, (b) disc reads as divine artifact, (c) grab/rotate feels physical. **No sculpting/water-sim/life in Phase 1.**

- **Stack**: Vite + TypeScript + current three (not r128), `WebGPURenderer` w/ WebGL2 fallback, all materials TSL from day one. Three run modes: desktop orbit (primary dev), flat-screen visual bench, XR (emulator + real Quest).
- **Event bus skeleton pulled forward from Phase 3** (typed events: `world:edited`, `sun:moved`, `xr:grab`) — cheap now, prevents prototype tangle.
- **Weeks 1–2**: scaffold, renderer fallback, camera rigs, port polar-grid terrain into seeded `WorldGeometry` module, first TSL biome material.
- **Weeks 3–4 (visual bench)**: procedural nebula sky in TSL → PMREM env lighting, PBR sun/moon + day-night, bloom, AgX, atmospheric rim. Exit test: screenshot matches concept art.
- **Weeks 5–6**: XR sessions, controller+hand input behind one abstraction (semantic gesture events), grab-to-rotate, two-hand pinch scale, waterfalls/stars as first **compute-shader particles** (low-risk compute pipeline validation for Phase 2 erosion).
- **Risks**: verify TSL-on-WebGL2 on real Quest by week 3; ship controller-first if hand pinch is unreliable; perf HUD + 72/90fps budget from day one.
- **Exit criteria**: headset on → world floating in nebula, waterfalls off the rim, sun arcing; grab it, turn it, pull close. "Whoa" test passes.

## 6. DECISION MADE (July 20, 2026): Option B — Visual bench first

Between (A) scaffold the full Vite/TS project vs. (B) standalone visual bench, **B is chosen**. Rationale: the bench answers the four riskiest questions before any architecture exists —

1. Does the WebGPU/TSL/WebGL2-fallback stack actually hold (every shader compiling on both backends)?
2. What is the visual ceiling — does the disc read like the concept art?
3. Does TSL compute work for us (waterfall particles as low-risk proxy for Phase 2 erosion)?
4. What survives the Quest tier?

Bench code is written **portable but not precious**: clean module boundaries (SkyEnv, WaterMaterial, PostStack, WorldGeometry) so it lifts into the Phase 1 scaffold later, but no framework, no build step beyond an importmap.

## 7. Visual bench action list (agreed order — dependency & risk first)

**Step 0 — Harness before beauty.**
One HTML + one module JS via importmap → current three (`three/webgpu`, `three/tsl`). Renderer boot feature-detects WebGPU, falls back to WebGL2, shows a visible backend badge. Perf HUD (fps/ms). **AgX tone mapping on from frame one** — grading against concept art with wrong tone mapping invalidates everything after.

**Step 1 — Nebula sky (it's the light source, so it goes first).**
TSL fbm nebula + starfield as scene background node, graded toward the gold/deep-blue identity. Render to cube target → PMREM → scene environment. Decision to test: static baked env vs. re-baking as the sun moves — default plan: re-bake throttled, only on sun-position change.

**Step 2 — Sun/moon + day cycle.**
Emissive PBR sun disc (bloom-driven glow), directional light slaved to sun position, cool moon fill at night. Port the sketch's sun slider + auto cycle. Needed before terrain/water so materials are judged in real lighting.

**Step 3 — Terrain stand-in.**
Port the polar-grid disc geometry unchanged (no sculpting). First real TSL terrain material: triplanar rock on slopes, height-band biome blend, moisture-darkening uniform stubbed. **This step is the WebGL2 compatibility canary — verify the fallback path here, not later.**

**Step 4 — Water (the headline shot).**
Sub-order by payoff: (i) depth-based absorption + shoreline foam (needs depth texture — ⚠ depth access differs between backends, test both); (ii) PMREM nebula reflection; (iii) refraction via scene-color node; (iv) SSR as stretch only. Absorption + foam + nebula reflection is 90% of the shot — cut SSR without guilt if it eats budget.

**Step 5 — Rim waterfalls as compute particles.**
TSL compute on WebGPU — the strategic validation for Phase 2 erosion. Known gap: **TSL compute does not run on WebGL2**; fallback = the sketch's CPU particle approach (acceptable; bench's job is proving the WebGPU path and measuring headroom).

**Step 6 — Post + atmosphere.**
Selective bloom, cheap radial-blur god rays from the sun, fresnel rim glow on disc edge, faint under-disc fog. Build a **"Quest preset" toggle** (tone map + selective bloom only) so the two tiers are compared live, not guessed.

**Step 7 — Exit test.**
Side-by-side screenshot vs. concept art. Written verdict: visual ceiling, what falls off on Quest tier, which modules lift into the Phase 1 scaffold. Bench is done when the verdict is written — resist polishing past it.

**Risk register (ordered):**
1. Depth-texture access parity across backends → hits water (Step 4).
2. TSL compute absent on WebGL2 → hits waterfalls (Step 5, mitigated by CPU fallback).
3. PMREM re-bake cost → hits day cycle (Step 1, mitigated by throttling).
4. Bloom cost on Quest → Step 6, mitigated by preset toggle.

## 8. Bench Steps 0–1: BUILT & DEVICE-TESTED (July 20, 2026)

`kayangan-bench.html` — single file, importmap → **three@0.180.0** (`three.webgpu.js` + `three.tsl.js`), no build step, lives in the sketches folder / GitHub Pages.

**Harness (Step 0):** `WebGPURenderer` with auto WebGL2 fallback, backend+tier badge, perf HUD (2Hz), AgX tone mapping + exposure slider, `?forcewebgl` forces fallback, guarded console logging (preview panes stub `console.info`).

**Nebula sky (Step 1), baked-static architecture:** v1 evaluated the procedural nebula (~19 `mx_noise_float` calls/pixel) per-frame → **9fps on Samsung A06 & Quest 2**. Fix: expensive BAKE shader renders only into a CubeCamera cube target (throttled, on sun change); visible sky = DISPLAY shader doing one cube fetch + live cheap stars + live crisp sun disc (baked soft sun doubles as halo). Env = `pmremTexture(cubeRT.texture)` with raw-cube fallback. Sky content: fbm gold/blue/magenta layers on tilted galactic band, dust lanes, hashed-grid tinted stars, sun disc+corona; `uSunDir` uniform shared with lighting.

**Quality tiers** (pulled forward from Step 6; auto from UA, `?q=` override): high 5-oct/1024³/PR2/AA · medium 4-oct/512³/PR1.5/AA · low 3-oct/256³/PR1/no-AA/no-detail. Every shader must survive the low tier.

**Device results (all vsync-capped → headroom ≥ cap):** desktop WebGPU high **60fps** · Samsung A06 WebGPU low **90fps** (90Hz panel) · Quest 2 browser WebGPU low **72fps**. Also runs inside the Claude app preview pane on WebGPU at 60fps.

**Strategic findings:** TSL compiled and ran on WebGPU *and* WebGL2 incl. mobile → write-once strategy validated. **Quest Browser's experimental WebGPU actually ran it** — Quest may flip to WebGPU early; keep WebGL2 fallback anyway. Low tier has spare budget; spend only after disc + water land. Known rough edge: low tier may hitch during sun-drag (900ms bake throttle) → if ugly, switch low to bake-on-release.

## 9. Bench Steps 2–3: BUILT, BUGS FIXED (July 20, 2026)

**Step 2 — moon + day cycle:** mottled moon (cheap 2-noise TSL basic material) rides the **anti-sun axis** at 760u; cool blue `moonLight` DirectionalLight fades in as sun sets; "time flows" checkbox = 90s days, sun sliders self-update + dim. Moving sun = continuous throttled env re-bakes — deliberate stress test of in-game sun motion (untested on low tier so far).

**Step 3a — WorldGeometry (CPU, seeded):** polar-grid disc port: 84 rings × 220 segs top surface (**wrap-indexed, no seam duplicates**), 5 noise-jagged skirt rows (radius profile [1.03, 1.045, 0.99, 0.86, 0.56]) descending to y≈−1.25, bottom tip fan at −1.55. Seeded JS value-noise fbm; continents 5-oct @ freq **1.25** + detail 4-oct @ 3.4, ×0.62 → heights ≈ ±0.45, sea at 0. `?seed=N` rerolls; some seeds are simply better worlds. ~19.8k verts, static.

**Step 3b — TerrainMaterial (TSL, `MeshStandardNodeMaterial`):** biomes are per-pixel now, not vertex colors. Height bands rel. to `uSeaLevel` uniform: abyss→sand→grass→forest→rock→snow, band edges wandered by noise breakup; **slope>~0.35 overrides to cliff rock** (colors the skirt for free); depth-darkening below world floor; tier-gated fine grain; roughnessNode (glossy snow 0.55, sand 0.78, base 0.93). **`uMoisture` uniform = Phase 2 stub**: darkens vegetated bands toward lush/wet (global now, per-texel map later). All reads from LOCAL position/normal → rotation-proof for XR grab. All-procedural = 3D noise inherently seamless; true triplanar only needed when texture maps arrive.

**Step 3c — sea placeholder:** dumb glossy `MeshStandardMaterial` disc (rough 0.12) at `uSeaLevel` — under PMREM nebula it previews Step 4's reflective ceiling for free. Sea slider moves plane + biome bands together.

### Bugs found on-device this session (→ project rules)
1. **Double tone mapping in bakes** (sky rendered as washed lavender fog): cube bake had AgX applied, display applied AgX again. Fix: `renderer.toneMapping = NoToneMapping` around `cubeCam.update()`, restore after. **Pipeline rule #2: every render-to-target pass must be explicit about linear vs display space** (will recur in water refraction scene-color, god rays, any bake).
2. **Continent noise freq too low** (0.55 = one feature per disc → tilted-bowl world, all rock/snow). Fixed to 1.25 (~3–4 features/diameter).
3. **Inverted winding on the polar grid** (radial×tangential faced DOWN → top surface culled from above, disc looked inside-out/concave). Fix: global triangle reversal before `setIndex`. **Rule #3: verify winding on any hand-built geometry before shading it.**
(Rule #1, from Step 1: procedural sky/env content never runs per-pixel per-frame.)

**Grading state for judging:** sea 0.00, moisture ~0.3, exposure ~1.0, orbit to the sunlit side. Post-fix sky confirmed: deep black space, stars, gold nebula (screenshot-verified); winding fix applied but **not yet screenshot-verified — first thing next session**.

## 10. Bench Step 4: WATER — BUILT, DEVICE-TESTED, DONE (July 21, 2026)

**Step 4 — real TSL water** replaces the Step-3c placeholder. Mesh still named `sea`; `applySea()` untouched, so the sea slider still moves plane + terrain biome bands together. Construction ported from the official `webgpu_backdrop_water` example (the one arrangement known to compile on both backends), deviating only in the shading math, not the plumbing.

**What it does:**
- **Wave normals** — procedural, no textures. 2–3 octaves of `mx_noise_float` scrolled on a time axis, central-difference slope → `transformNormalToView`. Octave count tiered (high 3 / med 2 / low 1, see §12).
- **Shoreline foam** — water depth in ~world units via `viewportLinearDepth.sub(linearDepth()).mul(cameraFar.sub(cameraNear))`, so `uFoamWidth` reads in disc units and survives a far-plane change. Base foam + (high/med) retreating foam bands marching to shore + (high) whitecaps on wave crests.
- **Depth absorption** — per-channel `kRGB` (red dies first) via `exp(-k·depth·absorb)`, plus an ink-blue scatter-in floor.
- **Refraction** — backdrop pattern: `viewportSharedTexture(screenUV + slope·uRefr)` as `backdropNode`, guarded by a depth test so foreground geometry doesn't smear into the water body. `backdropAlphaNode = foam.oneMinus()` (foam is opaque over the see-through).

**Tiering / severability** — the two framebuffer copies are independently switchable, giving a three-way live A/B: **Depth FX** checkbox = the depth copy (foam+absorption); **Refraction** checkbox = the color copy. Low tier boots refraction-off. Untick Depth FX too → placeholder-equivalent glossy disc (nothing lost). Grading sliders (absorption, foam width, wave amp, wave scale, refr strength) drive uniforms live; the checkboxes change the graph → material rebuild (old disposed).

**Free architectural win:** env bakes from the dedicated `skyScene`, never the main scene → water cannot reflect itself through its own env map. The feedback-mud risk from the plan's checklist is structurally impossible here; no layer juggling needed.

**Device results — MAXIMAL config (time flows + refraction + depth FX all ON; above what low preset ships):**
- **Quest 2** browser WebGPU: **60–72fps** zoomed out · **36–48fps** zoomed in.
- **Samsung A06** WebGPU: **70–90fps** zoomed out · **39–51fps** zoomed in.

Both hold panel cap zoomed out with everything burning + continuous bake. Zoom-in dip is **fill-rate** (water covers most of the screen; up to ~9 noise evals/fragment for wave normals + copies), not the viewport copies (those are constant-cost/frame). Decision it was gating — *does Quest keep shoreline foam?* — **yes, comfortably.** → Step 4 closed on these numbers.

### Rule learned this session
4. **`.toVar()` / `.assign()` / `.addAssign()` only inside an `Fn()` scope.** At material top-level, compose nodes with plain JS reassignment (`let foam = …; foam = foam.add(…)`). Symptom of breaking it: `THREE.TSL: No stack defined for assign operation` — **non-fatal**, the offending layers silently drop (here: foam bands + whitecaps rendered nothing until fixed, base foam still showed → easy to miss). Will recur in Step 5 compute and Phase 2 erosion.

### Caveats carried (not blockers)
- **Double-tonemap check — CONFIRMED REAL, then FIXED (§12).** Night-camera A/B (refraction off vs on, same view) showed the refracted sea body glowing milky-bright — brighter than the night sky, which water can't be. Root cause + fix in §12.
- **XR viewport textures** under a multiview session are untested — fine for the flat-screen bench, revisit before Phase-1 XR.
- **SSR** deliberately not built — absorption + foam + nebula reflection is the shot. Only if it comes free.

## 11. Step 4.1 — WATER PERF PASS (CLOSED — "no action", July 21, 2026)

Split out so Step 4 could close on **verified** numbers rather than re-gathering all four after a change. Goal: recover the zoom-in dip on the two devices.

- **Low-tier wave octaves 2 → 1** (3 noise evals for the normal instead of 6). *Committed in bench, NOT yet device-tested* — invalidates the §11 low-tier numbers if/when low is measured; §11's numbers are the *maximal* config and stand regardless.
- **Candidate: resolution governor** — drop `renderer.setPixelRatio` a notch when a frame-time budget is blown (coverage-driven, so it targets exactly the zoom-in case). Not built.
- **Candidate: fill cap** — clamp effective water pixel work when the disc fills the frame. Not built.

Close 4.1 when: low tier re-measured post-octave-cut on A06 + Quest 2, and a verdict on whether the governor is worth the complexity (may already be fine at 39–51fps — a playable floor, so this could close as "no further action").

**VERDICT (July 21, 2026): NO ACTION.** 39–51fps zoomed-in is a playable floor; the resolution governor and fill cap are not worth the complexity at bench stage. The low-tier octave cut (2→1) stays committed in the bench. If a real perf problem surfaces once bloom/god-rays land (Step 6, also on the postFX pass), revisit the governor then — it targets exactly the disc-fills-frame case. Closed.

## 12. Step 4.2 — REFRACTION TONE-MAP FIX (July 21, 2026) — DONE

Confirmed on-device: refraction ON made the sea body wash out, clearest at night where the refracted water glowed brighter than the sky behind it. Textbook pipeline rule #2 breach.

**Root cause:** rendering direct-to-canvas, opaque fragments write **AgX-graded** color to the framebuffer. `viewportSharedTexture` samples that graded buffer as the refraction backdrop, runs absorption on it, and the water's own output gets AgX **again** → double tone-map. (Absorption was also being computed on non-linear color — physically wrong, secondary to the brightness blow-out.)

**Fix:** a `THREE.PostProcessing` pass (r180; renamed `RenderPipeline` in r183) — `postFX.outputNode = pass(scene, camera)`. The scene pass renders to a **linear** render target; tone mapping is applied exactly once at the output transform (`outputColorTransform` default true, so AgX + `toneMappingExposure` are still honored — exposure slider unchanged). `viewportSharedTexture` now samples linear color → single AgX, and absorption math is honest.

**Routed in only when refraction is live** — `usesRefraction() = depthFX && refraction`. The double-tonemap only exists when the color copy is sampled, so depth-FX-only and **low tier keep the cheaper direct `renderer.render()` path** and pay nothing for a fix they don't use (survives-the-low-tier rule). Opaque terrain/sky render identically on both paths (same AgX, same exposure), so toggling refraction causes no grade shift — only the water body corrects.

**Env bake untouched:** `bakeEnvironment()` still renders `skyScene` directly via `cubeCam.update(renderer, …)` with NoToneMapping around it — independent of postFX, separate targets, still correct.

**Watch item (not a blocker):** the renderer's built-in MSAA may not carry through the scene `pass()` on the high-tier refraction path → possible edge aliasing when refraction is on. Bench-acceptable; if visible, set sample count on the pass. Only affects refraction-on high tier.

## 13. Step 4.3 — NIGHT WATER "LIFTED" (OPEN, deferred)

On-device after the §12 refraction fix: the sea body at night still reads as **"lifted"** — brighter than it should be relative to the darkened land, so it looks like it floats above the terrain instead of sitting in it. The §12 double-tonemap fix was necessary but did not fully resolve the night look.

**Working hypothesis (not yet confirmed on-device):** the water's brightness at night is dominated by two terms that DON'T track the sun setting:
1. **Env reflection.** Albedo is near-black (`surfTint`), so the shot is carried by the PMREM nebula reflection. But the baked sky is emissive/constant — it does not dim at night the way sun-lit terrain does. So as the land goes dark, the sea keeps mirroring a bright nebula → relative "lift."
2. **`deepCol` scatter-in floor** (`vec3(0.014, 0.095, 0.155)`) is a constant added regardless of lighting — a fixed blue glow that stays put while everything around it darkens.

**Candidate fix (Step 4.3, when picked up):** introduce a day/night factor — reuse the `horizon` term already computed in `setSun()` (drives sun/moon intensity) as a `uNight` uniform, and multiply the water's env-reflection contribution and the `deepCol` scatter floor by it (floored at a small moonlit minimum so night water isn't pure black). Terrain already darkens correctly via the directional lights, so only the water's lighting-independent terms need gating. Keep foam (albedo, already lit) untouched.

**User asked (July 21): "is it lifted because of the incidence angle?" — largely yes, and it sharpens term #1.** The material is `MeshStandardNodeMaterial`, `metalness 0`, near-black albedo, roughness ~0.09. So the look is carried by the dielectric specular env reflection, whose weight is the **Fresnel term** — low (~0.04) looking straight down, →1.0 at grazing incidence. The night camera sits low and looks *across* the disc, so the visible sea ring is grazing → Fresnel ≈ 1 → the water is nearly a pure mirror of the env. Nothing wrong with the Fresnel — it's physically correct. The bug is *what it mirrors*: a baked nebula PMREM with no day/night notion. So it's **Fresnel × (constant-bright sky)** — incidence angle is the multiplier that makes term #1 visible; it is not itself the fault, and the fix is NOT to touch Fresnel. Gating the env contribution (and `deepCol`) by `horizon`/`uNight` still resolves it; grazing angles will then just mirror a correctly-dimmed night sky. (A cheaper partial mitigation if the full gate is fiddly: lower `envMapIntensity` at night via the same `uNight`.)

**Decision:** deferred by user — noted, not fixed. Does not block Step 5. Pick up after the waterfalls, or fold into Step 6 polish.

## 14. Step 5 — RIM WATERFALLS: BUILT, DEVICE-TEST PENDING (July 21, 2026)

The disc-world identity shot — ocean pouring off the rim into the void. Built in `kayangan-bench.html`; **not yet device-tested** (next session's job).

**API pinned from the real r180 source** (not memory): compute-particle path verified against `examples/webgpu_compute_particles*.html` @ tag r180 — `instancedArray(N,'vec3')` + `.element(instanceIndex)` in an `Fn().compute(N)` node, `renderer.computeAsync(init)` once + `renderer.compute(update)` per frame, render via `MeshBasicNodeMaterial` with `vertexNode = billboarding({ position: buf.toAttribute() })` on a `PlaneGeometry` mesh with `mesh.count = N`. Confirmed exports exist in `three.tsl.js`: `instancedArray, instanceIndex, uniformArray, billboarding, hash, uint, deltaTime, cos, PI, If, attribute, uv`.

**Two backends, one `update()` interface (chosen at boot by `isWebGPU`):**
- **WebGPU — TSL compute** (the strategic validation for Phase 2 GPU erosion / shallow-water). Three `instancedArray` buffers (position, velocity, life). `computeUpdate`: gravity into velocity, integrate, age; alpha fades in off the lip + out near end of life; recycle when below `WF_FLOOR` or aged out. Billboarded additive streaks (0.014×0.17 quads).
- **WebGL2 — CPU-stepped `THREE.Points`** (the sketch's proven approach). Same constants/motion in JS; round additive sprites via `uv()` falloff (point `uv()` is WebGL-only — WebGPU points are 1px, per the r180 source note, which is *why* the WebGPU path uses billboarded quads instead). Manual `boundingSphere` + `frustumCulled=false` to dodge the known stale-bounds cull bug.

**Emission gated LIVE by sea level, zero rebuild.** Rim height per segment (`rimY`) is captured during `buildWorldGeometry` and stashed on `geo.userData.rimY`; GPU reads it via a static `uniformArray` indexed by emitter slot (`instanceIndex % SEGS`), CPU reads the JS array. `active = rimY < uSeaLevel` is a scalar compare, so dragging the sea slider grows/shrinks the falls instantly (matches the sketch's "recompute on sea change" without any recompute). Emitters spawn at radius 2.50 (just outside the 2.4 lip) at the sea surface, launch slightly outward so the sheet arcs clear of the skirt into the void.

**Safety:** GPU build wrapped in try/catch → CPU fallback on any synchronous setup error (won't white-screen the desktop WebGPU dev path). Node-graph compile errors would still surface at first render, but every node op matches the verified example. Rule #4 honored — all `.assign/.addAssign/.x =` live inside `Fn()` compute scopes.

**UI:** "Rim waterfalls" checkbox (Step 5 group), on by default. Counts per tier: high 7000 / medium 4200 / low 2200. Loop calls `waterfall.update(dt)` before render (GPU dispatches compute ignoring dt; CPU steps with dt).

### 14a. Aesthetic pass (July 21) — first render read as a "picket fence", redesigned

First on-device render (user screenshot, WebGPU high, 60fps — the GPU compute path **runs on desktop WebGPU**, big green tick for Risk #2): waterfalls worked but looked like a **barcode** — evenly-spaced identical bright-white vertical rods with a dead-flat bottom edge. Root causes and fixes (applied to BOTH backends, kept in lockstep via a shared `spawn()`):
- **Picket fence** ← every one of 220 segments emitted an identical thin collinear column. Fix: **theta jitter** per particle across ~`WF_SPREAD` (3.4) segment-widths so neighbouring columns overlap into continuous **sheets**, + a per-particle **tangential kick** (`WF_TAN`) so the sheet fans/frays instead of dropping as parallel rods.
- **Uniform density / no clustering** ← binary `active = rimY<sea`. Fix: **depth-weighted flow** `smoothstep(0, WF_DEPTH, sea−rimY)` × a per-particle **seed gate** (`seed < flow`) → deep-submerged rim gushes at full density, barely-dipped rim shows a sparse few, with real gaps. Still 100% live off the sea slider, zero rebuild. (CPU note: `MathUtils.smoothstep` guards `x<=min`, so the edges must be `(sea−WF_DEPTH, sea)` then `1−`; the reversed form silently returns 0.)
- **Flat curtain hem** ← uniform life + uniform floor. Fix: **per-particle maxLife** (0.55–1.25× `WF_LIFE`, stored in `life.z` / `maxL[]`) so falls fade out at scattered heights, + a **disperse** term thinning alpha toward `WF_FLOOR` (mist dissipation, not a hard cutoff).
- **Blown-out white** ← 27 collinear additive sprites saturating + high opacity. Fix: opacity mult 0.5→0.30 (GPU) / 0.6→0.42 (CPU), streak thinner+longer (0.010×0.20), soft `sin(uv.y·π)` cap on the quad, per-particle brightness 0.55–1.05 from the seed. Less collinearity (from jitter) also cuts pile-up.
- lifeBuf widened `vec3`→`vec4` (x=age, y=alpha, z=maxLife, w=seed).

**Verified billboarding from r180 source** (`src/nodes/utils/SpriteUtils.js`): `billboarding({position,horizontal=true,vertical=false})` ends `cameraProjectionMatrix.mul(modelViewMatrix).mul(positionLocal)` — it multiplies the *shared* geometry `positionLocal`, with no per-instance scale hook. So **velocity-stretch (elongating fast particles) needs a custom vertexNode** that scales `positionLocal` by a per-instance factor before the same matrix chain — deferred (higher TSL risk; the jitter+fan already breaks the rod look). This is the top remaining "joy" lever if sheets still read stiff on device.

**Shape knobs (all module-scope consts, tune against concept art):** `WF_SPREAD` (sheet merge), `WF_TAN` (fan width), `WF_DEPTH` (clustering threshold), `WF_OUT` (arc), `WF_GRAV`, `WF_LIFE`, `WF_FLOOR`, `WF_COUNT` per tier, streak dims, opacity mults. No live sliders yet (compute bakes consts at build) — a future UI pass could promote `WF_SPREAD/OUT/DEPTH` to uniforms for live tuning.

**Known edges to watch on-device (next session):**
- Fallback-of-fallback: if GPU compute throws on a WebGPU device, the CPU Points path renders 1px points there (WebGPU point-size limit). Rare; acceptable; note it if it bites.
- Still camera-billboarded, not velocity-aligned. Jitter+fan should stop the "floating flecks" read; if it doesn't, do the custom-vertexNode velocity-stretch (above).
- Additive over the two render paths (direct vs postFX linear pass) will differ slightly in grade; check both. Selective bloom in Step 6 will hit these hard (additive) — grade them together.
- **Phase-1 XR:** waterfalls live in world space here because the bench disc is world-fixed. The grab rotates the disc → the WaterfallSystem must reparent into the disc group and express spawn/velocity in disc-local space.

## 15. Next session

1. **Device-test Step 5 (§14 + §14a redesign) — the priority.** Desktop WebGPU already renders at 60fps; now check the **redesigned** falls on Samsung A06 + Quest 2. Read for: (a) do they cluster at the low/submerged rim points with gaps elsewhere (not a uniform ring); (b) sea slider grows/shrinks + clusters them live; (c) do they read as **sheets/veils** now, not a picket fence or floating flecks; (d) scattered bottom edge, no flat hem; (e) fps at max config (falls + refraction + time flows) at the higher counts (7000/4200/2200). Force fallback with `?forcewebgl` to check the CPU Points path. Tune the §14a shape knobs against the concept art. **If still stiff → custom-vertexNode velocity-stretch (the deferred lever).**
2. **Step 4.3 (§13) — night water "lifted"**, if/when picked up: wire the `uNight`/`horizon` gate on env reflection + `deepCol`. Deferred, not blocking.
3. **Step 6** — selective bloom (will make the additive waterfalls glow — grade them together), cheap radial god rays from the sun, fresnel rim glow on the disc edge, faint under-disc fog, and the **Quest preset toggle**. Bloom/god-rays route through the postFX pass that already exists (§12).
4. **Step 7** — exit test vs concept art; bench done when the written verdict lands (visual ceiling, what falls off on Quest tier, which modules lift into the Phase-1 scaffold). Resist polishing past it.

**Risk register update:** #1 (depth-texture backend parity → water) **RETIRED**. #2 (TSL compute absent on WebGL2 → waterfalls) — GPU path now **built and API-verified against r180 source**; CPU fallback built for WebGL2. Downgraded from "live" to **"verify on-device"**: confirm the WebGPU compute path actually runs on Quest 2's experimental WebGPU and measure headroom; the WebGL2 fallback removes the hard blocker regardless.

Bench file: `kayangan-bench.html` (v5.1, ~1135 lines) — Step 5 rim waterfalls **redesigned** (§14a: clustered/fanned/variable-life sheets, WebGPU compute + WebGL2 CPU fallback) on top of Step 4 water + §12 refraction fix + panel toggle. Log + bench both in outputs / user's GitHub.
---

User's stated interests: procedural generation, environmental storytelling, symbolic world-building. Target hardware: Quest-class. Development so far is desktop-first single-file sketches in a folder served statically alongside index.html. User location context: Malaysia (hence *Kayangan*).
