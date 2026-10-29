// Skremslene: lyn, hodeskallen og skjelettet som hopper fram, skjeletthånden
// som griper opp fra bunnen, edderkoppen som firer seg ned, spøkelset som
// svever forbi, øyne i tåka og lureren som slår til når brukeren har sittet
// stille for lenge. Alt kan slås av med bryteren i toppen, og alt er av når
// brukeren har bedt om redusert bevegelse.
import * as lyd from './lyd.js';

const rolig = matchMedia('(prefers-reduced-motion: reduce)').matches;
let på = !rolig && localStorage.getItem('seansen-skrekk') !== 'av';
let sist = 0;
let antallSvar = 0;
let antallSkrem = 0;
const PAUSE = 90_000; // minst halvannet minutt mellom hvert hopp
const lyttere = new Set();

export const skrekkErPå = () => på;
export const skrekkErMulig = () => !rolig;
export function vedSkrekkEndring(f) { lyttere.add(f); }
export function settSkrekk(v) {
  på = v && !rolig;
  localStorage.setItem('seansen-skrekk', v ? 'på' : 'av');
  for (const f of lyttere) f(på);
}

const synlig = () => document.visibilityState === 'visible';

// Et lynglimt over hele siden. farge: 'hvit' (standard) eller 'rød'.
export function lyn(farge = 'hvit') {
  if (rolig) return;
  const el = document.getElementById('lyn');
  el.className = `lyn ${farge}`;
  void el.offsetWidth; // start animasjonen på nytt
  el.classList.add('aktiv');
  setTimeout(() => el.classList.remove('aktiv'), 800);
}

// Selve hoppskremselet. tving hopper over pausen, men aldri over bryteren.
// Figuren veksler mellom hodeskallen og skjelettet, så to skremsler på rad
// aldri er like. figur: 'hodeskalle' | 'skjelett' overstyrer vekslingen.
export function skrem({ tving = false, figur } = {}) {
  if (!på || !synlig()) return false;
  const nå = Date.now();
  if (!tving && nå - sist < PAUSE) return false;
  sist = nå;
  const o = document.getElementById('skrekk');
  o.dataset.figur = figur ?? (antallSkrem++ % 2 ? 'skjelett' : 'hodeskalle');
  o.hidden = false;
  o.classList.remove('vis');
  void o.offsetWidth;
  o.classList.add('vis');
  document.body.classList.add('rist');
  lyd.skrik();
  if (o.dataset.figur === 'skjelett') lyd.torden(1, 0.15);
  setTimeout(() => {
    o.classList.remove('vis');
    o.hidden = true;
    document.body.classList.remove('rist');
  }, 1150);
  return true;
}

// Småskrekk: kortvarige figurer i eget lag, uten pause mellom. De er ment
// som overraskelser midt i arbeidet, ikke som hoppskremsler.
const lag = () => document.getElementById('skrekk-lag');
function vis(el, ms) {
  lag().append(el);
  setTimeout(() => el.remove(), ms);
}
function figur(symbol) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${symbol}`);
  svg.append(use);
  return svg;
}

// Skjeletthånden griper opp fra bunnen av skjermen. x er i piksler
// (f.eks. clientX fra en musehendelse) eller utelatt for et tilfeldig sted.
export function hånd(x) {
  if (!på || !synlig()) return false;
  const el = document.createElement('div');
  el.className = 'hånd';
  el.style.left = x == null ? `${8 + Math.random() * 84}%` : `${Math.min(innerWidth - 60, Math.max(60, x))}px`;
  el.style.setProperty('--vri', `${-10 + Math.random() * 20}deg`);
  el.append(figur('haand'));
  vis(el, 2700);
  lyd.knirk();
  return true;
}

// Edderkoppen firer seg ned fra toppen, dingler og trekker seg opp igjen.
export function edderkopp() {
  if (!på || !synlig()) return false;
  const el = document.createElement('div');
  el.className = 'edderkopp';
  el.style.left = `${10 + Math.random() * 80}%`;
  el.style.setProperty('--fall', `${26 + Math.random() * 30}vh`);
  el.append(figur('edderkopp'));
  vis(el, 5200);
  lyd.tikk();
  setTimeout(() => lyd.tikk(), 1400);
  return true;
}

// Spøkelset svever gjennom bakgrunnen og hvisker. Det bor i #øyne-laget,
// som ligger bak innholdet, så det glir forbi bak kortene.
export function spøkelse() {
  if (!på || !synlig()) return false;
  const el = document.createElement('div');
  el.className = `spøkelse${Math.random() < 0.5 ? ' fra-høyre' : ''}`;
  el.style.top = `${10 + Math.random() * 60}%`;
  el.style.setProperty('--t', `${8 + Math.random() * 5}s`);
  el.append(figur('spoekelse'));
  document.getElementById('øyne').append(el);
  setTimeout(() => el.remove(), 13_500);
  lyd.hvisk(2.4);
  return true;
}

// Tilfeldig småskrekk med ujevne mellomrom, uavhengig av hva agenten gjør.
export function startSmåskrekk() {
  if (rolig) return;
  const plan = () => setTimeout(() => {
    if (på && synlig()) [hånd, edderkopp, spøkelse][Math.floor(Math.random() * 3)]();
    plan();
  }, 25_000 + Math.random() * 40_000);
  plan();
}

// Kalles når et svar har kommet. Det første svaret får være i fred, så
// brukeren rekker å se designet før graven slår tilbake.
export function kanskjeSkrem(sjanse = 0.35) {
  antallSvar++;
  if (antallSvar < 2 || Math.random() > sjanse) return false;
  return skrem();
}

// Øyne som åpner seg i tåka med ujevne mellomrom.
export function startØyne() {
  if (rolig) return;
  const vert = document.getElementById('øyne');
  const plan = () => setTimeout(() => {
    if (på && synlig()) visØyne(vert);
    plan();
  }, 15_000 + Math.random() * 35_000);
  plan();
}
function visØyne(vert) {
  const e = document.createElement('div');
  e.className = 'øyepar';
  e.style.left = `${4 + Math.random() * 88}%`;
  e.style.top = `${8 + Math.random() * 78}%`;
  e.style.setProperty('--sz', `${9 + Math.random() * 13}px`);
  vert.append(e);
  lyd.hvisk(0.8);
  setTimeout(() => e.remove(), 4600);
}

// Lureren: sitter brukeren stille lenge nok, slår graven til.
export function startLurer(ms = 60_000) {
  if (rolig) return;
  let timer;
  const nullstill = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (synlig() && document.hasFocus()) skrem(); }, ms);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart']) addEventListener(ev, nullstill, { passive: true });
  nullstill();
}
