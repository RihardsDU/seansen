// Skremslene: lyn, hodeskallen som hopper fram, øyne i tåka og lureren som
// slår til når brukeren har sittet stille for lenge. Alt kan slås av med
// bryteren i toppen, og alt er av når brukeren har bedt om redusert bevegelse.
import * as lyd from './lyd.js';

const rolig = matchMedia('(prefers-reduced-motion: reduce)').matches;
let på = !rolig && localStorage.getItem('seansen-skrekk') !== 'av';
let sist = 0;
let antallSvar = 0;
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
export function skrem({ tving = false } = {}) {
  if (!på || !synlig()) return false;
  const nå = Date.now();
  if (!tving && nå - sist < PAUSE) return false;
  sist = nå;
  const o = document.getElementById('skrekk');
  o.hidden = false;
  o.classList.remove('vis');
  void o.offsetWidth;
  o.classList.add('vis');
  document.body.classList.add('rist');
  lyd.skrik();
  setTimeout(() => {
    o.classList.remove('vis');
    o.hidden = true;
    document.body.classList.remove('rist');
  }, 1150);
  return true;
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
