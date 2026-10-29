// Lyden i seansen. Alt er syntetisert med Web Audio, så det finnes ingen
// lydfiler å laste. Nettleseren slipper ikke lyd gjennom før brukeren har
// trykket på noe, så lydmotoren vekkes ved første berøring.

let ctx = null;
let master = null;
let ambient = null;
let hjerte = null;
let hvitBuf = null;
let brunBuf = null;

let på = localStorage.getItem('seansen-lyd') !== 'av';
const lyttere = new Set();

export const lydErPå = () => på;
export const lydErVåken = () => !!ctx;
export function vedLydEndring(f) { lyttere.add(f); }

export function settLyd(v) {
  på = v;
  localStorage.setItem('seansen-lyd', v ? 'på' : 'av');
  if (v) { vekk(); startAmbient(); } else stoppAmbient();
  for (const f of lyttere) f(v);
}

// Vekkes ved første brukerhandling. Kalles også fra settLyd.
export function vekk() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // master → (tørr + klang) → kompressor, så skriket ikke klipper høyttalerne.
    const komp = ctx.createDynamicsCompressor();
    komp.threshold.value = -14; komp.knee.value = 20; komp.ratio.value = 6; komp.attack.value = 0.003; komp.release.value = 0.25;
    komp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(komp);
    const klang = ctx.createConvolver();
    klang.buffer = impuls(2.4);
    const send = ctx.createGain();
    send.gain.value = 0.28;
    master.connect(send); send.connect(klang); klang.connect(komp);
    for (const f of lyttere) f(på);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (på) startAmbient();
  return ctx;
}

for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => vekk(), { once: true, passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stoppHjerte(); });

// Lyd planlagt på en kontekst som ennå ikke er gjenopptatt, spilles når den våkner.
const klar = () => på && ctx && ctx.state !== 'closed';

// ---------- Byggeklosser ----------
function osc(type, freq) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
function gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
function filter(type, freq, q = 1) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function buffer(brun) {
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let sist = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brun) { sist = (sist + 0.02 * w) / 1.02; d[i] = sist * 3.5; } else d[i] = w;
  }
  return b;
}
function støy(brun = false, loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = brun ? (brunBuf ??= buffer(true)) : (hvitBuf ??= buffer(false));
  s.loop = loop;
  return s;
}
function impuls(sek) {
  const len = ctx.sampleRate * sek;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let k = 0; k < 2; k++) {
    const d = b.getChannelData(k);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
  }
  return b;
}
// Enkel konvolutt: stille → topp på a sekunder → ned igjen på d sekunder.
function env(g, t, a, topp, d, slutt = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(topp, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(slutt, t + a + d);
}
function panorert(x) {
  if (!ctx.createStereoPanner) return master;
  const p = ctx.createStereoPanner();
  p.pan.value = x;
  p.connect(master);
  return p;
}

// ---------- Bakgrunn: vind og en dyp dur ----------
function startAmbient() {
  if (ambient || !på || !ctx) return;
  const t = ctx.currentTime;
  const ut = gain(0.0001);
  ut.gain.setValueAtTime(0.0001, t);
  ut.gain.exponentialRampToValueAtTime(0.075, t + 5);
  ut.connect(master);

  const lp = filter('lowpass', 170, 5);
  const lfo = osc('sine', 0.07); const lfoG = gain(80); lfo.connect(lfoG); lfoG.connect(lp.frequency);
  const o1 = osc('sawtooth', 55); const o2 = osc('sawtooth', 55.35); const o3 = osc('sine', 27.5);
  const drone = gain(0.5);
  for (const o of [o1, o2, o3]) o.connect(drone);
  drone.connect(lp); lp.connect(ut);

  const vind = støy(false);
  const bp = filter('bandpass', 420, 0.6);
  const vg = gain(0.3);
  const lfo2 = osc('sine', 0.045); const lfo2G = gain(260); lfo2.connect(lfo2G); lfo2G.connect(bp.frequency);
  const lfo3 = osc('sine', 0.11); const lfo3G = gain(0.18); lfo3.connect(lfo3G); lfo3G.connect(vg.gain);
  vind.connect(bp); bp.connect(vg); vg.connect(ut);

  const kilder = [o1, o2, o3, lfo, lfo2, lfo3, vind];
  for (const k of kilder) k.start();
  ambient = { ut, kilder };
}
function stoppAmbient() {
  if (!ambient) return;
  const { ut, kilder } = ambient;
  ambient = null;
  const t = ctx.currentTime;
  ut.gain.cancelScheduledValues(t);
  ut.gain.setValueAtTime(Math.max(ut.gain.value, 0.0002), t);
  ut.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  setTimeout(() => { for (const k of kilder) { try { k.stop(); } catch { /* alt stoppet */ } } }, 1400);
}

// ---------- Hjerteslag mens agenten jobber ----------
export function startHjerte() {
  if (!klar() || hjerte) return;
  let tempo = 1050;
  const meg = { timer: null };
  const slag = () => {
    if (hjerte !== meg) return;
    const t = ctx.currentTime;
    dunk(t, 0.55); dunk(t + 0.19, 0.38);
    tempo = Math.max(520, tempo * 0.965);
    meg.timer = setTimeout(slag, tempo);
  };
  hjerte = meg;
  slag();
}
export function stoppHjerte() {
  if (!hjerte) return;
  clearTimeout(hjerte.timer);
  hjerte = null;
}
function dunk(t, vol) {
  const o = osc('sine', 70);
  o.frequency.setValueAtTime(72, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.16);
  const g = gain();
  env(g, t, 0.008, vol * 0.5, 0.24);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.3);
}

// ---------- Små hendelser ----------
export function hvisk(varighet = 1.4) {
  if (!klar()) return;
  const t = ctx.currentTime;
  const n = støy(false);
  const bp = filter('bandpass', 2000, 2.5);
  const g = gain(0.0001);
  n.connect(bp); bp.connect(g); g.connect(panorert(Math.random() * 1.6 - 0.8));
  let tid = t;
  const slutt = t + varighet;
  g.gain.setValueAtTime(0.0001, t);
  while (tid < slutt) {
    const l = 0.07 + Math.random() * 0.16;
    bp.frequency.setValueAtTime(1100 + Math.random() * 2600, tid);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.06, tid + l * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0005, tid + l);
    tid += l + Math.random() * 0.06;
  }
  n.start(t); n.stop(slutt + 0.15);
}

export function tikk() {
  if (!klar()) return;
  const t = ctx.currentTime;
  const n = støy(false, false);
  const hp = filter('highpass', 2500, 1);
  const g = gain();
  env(g, t, 0.003, 0.18, 0.05);
  n.connect(hp); hp.connect(g); g.connect(master);
  n.start(t); n.stop(t + 0.08);
  const o = osc('sine', 1400);
  const og = gain();
  env(og, t, 0.002, 0.08, 0.04);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 0.06);
}

export function plink() {
  if (!klar()) return;
  const t = ctx.currentTime;
  const o = osc('sine', 330);
  o.frequency.exponentialRampToValueAtTime(220, t + 0.12);
  const g = gain();
  env(g, t, 0.004, 0.1, 0.18);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.25);
}

export function surr() {
  if (!klar()) return;
  const t = ctx.currentTime;
  const g = gain();
  env(g, t, 0.01, 0.25, 0.45);
  const lp = filter('lowpass', 900, 2);
  lp.connect(g); g.connect(master);
  for (const f of [92, 97, 138]) { const o = osc('sawtooth', f); o.connect(lp); o.start(t); o.stop(t + 0.5); }
}

export function knirk() {
  if (!klar()) return;
  const t = ctx.currentTime;
  const o = osc('sawtooth', 170);
  const bp = filter('bandpass', 950, 7);
  const g = gain();
  env(g, t, 0.12, 0.13, 1.1);
  let f = 170;
  for (let i = 0; i < 26; i++) {
    f = Math.max(90, Math.min(420, f + (Math.random() - 0.5) * 70));
    o.frequency.linearRampToValueAtTime(f, t + 0.05 * i + 0.05);
  }
  o.connect(bp); bp.connect(g); g.connect(panorert(-0.4));
  o.start(t); o.stop(t + 1.4);
}

// ---------- Store hendelser ----------
export function torden(styrke = 1, når = 0) {
  if (!klar()) return;
  const t = ctx.currentTime + når;
  const n = støy(true);
  const lp = filter('lowpass', 900, 0.8);
  lp.frequency.setValueAtTime(1000, t);
  lp.frequency.exponentialRampToValueAtTime(70, t + 3.2);
  const g = gain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7 * styrke, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.25 * styrke, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.4 * styrke, t + 1.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
  n.connect(lp); lp.connect(g); g.connect(master);
  n.start(t); n.stop(t + 3.7);
}

export function klokke(slag = 2) {
  if (!klar()) return;
  const t0 = ctx.currentTime;
  const grunn = 98;
  for (let s = 0; s < slag; s++) {
    const t = t0 + s * 1.7;
    for (const [r, v, d] of [[1, 0.45, 5], [2.0, 0.22, 4], [2.98, 0.16, 3.4], [4.42, 0.07, 2.4], [5.4, 0.04, 1.8]]) {
      const o = osc('sine', grunn * r);
      const g = gain();
      env(g, t, 0.004, v * 0.32, d);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + d + 0.1);
    }
  }
}

export function latter() {
  if (!klar()) return;
  let t = ctx.currentTime;
  const grunn = 90 + Math.random() * 25;
  const munn = gain(0.6);
  const f1 = filter('bandpass', 620, 1.3);
  const f2 = filter('bandpass', 1150, 1.5);
  const f2g = gain(0.5);
  f1.connect(munn); f2.connect(f2g); f2g.connect(munn);
  munn.connect(panorert(0.5));
  for (let i = 0; i < 8; i++) {
    const l = 0.15 + i * 0.025;
    const o = osc('sawtooth', grunn * (1 - i * 0.03));
    o.frequency.exponentialRampToValueAtTime(grunn * (1 - i * 0.03) * 0.85, t + l);
    const g = gain();
    env(g, t, 0.02, 0.5, l * 0.85);
    o.connect(g); g.connect(f1); g.connect(f2);
    o.start(t); o.stop(t + l + 0.05);
    t += l + 0.07;
  }
}

export function skrik() {
  if (!klar()) return;
  const t = ctx.currentTime;
  const ws = ctx.createWaveShaper();
  ws.curve = forvrengning(380);
  const g = gain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.85, t + 0.025);
  g.gain.setValueAtTime(0.85, t + 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
  ws.connect(g); g.connect(master);
  for (const det of [0, 9, -6, 14]) {
    const o = osc('sawtooth', 300);
    o.detune.value = det * 9;
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(950, t + 0.22);
    o.frequency.exponentialRampToValueAtTime(400, t + 1.35);
    const vib = osc('sine', 9); const vg = gain(45); vib.connect(vg); vg.connect(o.frequency);
    o.connect(ws);
    o.start(t); o.stop(t + 1.5); vib.start(t); vib.stop(t + 1.5);
  }
  const n = støy(false, false);
  const hp = filter('highpass', 1600, 0.8);
  const ng = gain();
  env(ng, t, 0.004, 0.6, 0.5);
  n.connect(hp); hp.connect(ng); ng.connect(master);
  n.start(t); n.stop(t + 0.6);
  torden(0.9, 0.08);
}
function forvrengning(k) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return c;
}
