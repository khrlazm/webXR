// Procedural sound engine for Fowl Play.
//
// Everything here is synthesized live with the Web Audio API — no audio files.
// One-shot sounds are routed through PannerNodes positioned at the fighters, so
// in VR the crows, wing-whooshes and impacts come from the right direction.
// The Web Audio listener itself is driven by THREE.AudioListener (attached to the
// camera), so head movement pans the sound field correctly.

export class SoundEngine {
  constructor(listener) {
    this.listener = listener;
    this.ctx = listener.context;

    // master bus
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    // reusable white-noise buffer
    this.noise = this._makeNoise(2.0);

    // waveshaper curve for a bit of rasp on the crow
    this.rasp = this.ctx.createWaveShaper();
    this.rasp.curve = this._distortionCurve(8);

    this._startAmbience();
    this.muted = false;
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  // crowd loudness follows the action (0..1)
  setExcitement(level) {
    if (!this._crowdGain) return;
    const base = 0.05 + level * 0.28;
    this._crowdGain.gain.setTargetAtTime(base, this.ctx.currentTime, 0.15);
    if (this._crowdBand) {
      this._crowdBand.frequency.setTargetAtTime(500 + level * 900, this.ctx.currentTime, 0.2);
    }
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------
  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _distortionCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    return src;
  }

  // build a positioned output node for a one-shot; connect your synth to it
  _panner(pos) {
    if (!pos) {
      return this.master; // non-positional
    }
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.2;
    p.maxDistance = 30;
    p.rolloffFactor = 0.9;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z); // older browsers
    }
    p.connect(this.master);
    return p;
  }

  // -------------------------------------------------------------------------
  // ambience: continuous filtered-noise crowd murmur
  // -------------------------------------------------------------------------
  _startAmbience() {
    const src = this._noiseSource();
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 500;
    band.Q.value = 0.6;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;

    // slow LFO so the murmur breathes
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.3;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);

    src.connect(band).connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();

    this._crowdGain = g;
    this._crowdBand = band;
  }

  // -------------------------------------------------------------------------
  // one-shot sounds
  // -------------------------------------------------------------------------

  // metallic ring — starts the round
  bell(pos) {
    const t = this.ctx.currentTime;
    const out = this._panner(pos);
    const partials = [1, 2.76, 5.4, 8.9];
    partials.forEach((ratio, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 520 * ratio;
      const g = this.ctx.createGain();
      const amp = 0.5 / (i + 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6 - i * 0.25);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 1.7);
    });
  }

  // rooster crow — pitch-contour sawtooth with rasp + warble
  crow(pos) {
    const t = this.ctx.currentTime;
    const out = this._panner(pos);
    const dur = 0.85;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const curve = new Float32Array([520, 470, 720, 660, 900, 840, 920, 620, 480]);
    osc.frequency.setValueCurveAtTime(curve, t, dur);

    // warble
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 13;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = 35;
    vib.connect(vibGain).connect(osc.frequency);

    // formant-ish shaping
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 2;

    const g = this.ctx.createGain();
    // syllable envelope: "er-er-er-errrrr"
    const env = new Float32Array([0, 0.9, 0.4, 0.85, 0.5, 0.95, 0.9, 0.6, 0]);
    g.gain.setValueCurveAtTime(env.map((v) => v * 0.5), t, dur);

    osc.connect(this.rasp).connect(band).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }

  // wing flurry / lunge — swept bandpassed noise
  whoosh(pos) {
    const t = this.ctx.currentTime;
    const out = this._panner(pos);
    const src = this._noiseSource();
    src.loop = false;

    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(400, t);
    band.frequency.linearRampToValueAtTime(1600, t + 0.12);
    band.frequency.linearRampToValueAtTime(500, t + 0.28);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    src.connect(band).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.35);
  }

  // strike landing — noise crack + low thump
  impact(pos) {
    const t = this.ctx.currentTime;
    const out = this._panner(pos);

    // crack
    const src = this._noiseSource();
    src.loop = false;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.09);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(lp).connect(ng).connect(out);
    src.start(t);
    src.stop(t + 0.12);

    // body thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.15);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // knock-out — heavy low thud with squawk tail
  thud(pos) {
    const t = this.ctx.currentTime;
    const out = this._panner(pos);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.5);

    // brief distressed squawk
    const sq = this.ctx.createOscillator();
    sq.type = 'sawtooth';
    sq.frequency.setValueAtTime(700, t);
    sq.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.25, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    sq.connect(this.rasp).connect(sg).connect(out);
    sq.start(t);
    sq.stop(t + 0.32);
  }

  // countdown blip
  tick(pos) {
    const t = this.ctx.currentTime;
    const out = this._panner(pos);
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 760;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.14);
  }
}
