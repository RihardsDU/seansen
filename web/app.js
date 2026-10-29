// Seansen: klientsiden. All tekst fra serveren settes med textContent, aldri innerHTML.
import * as lyd from './lyd.js';
import * as skrekk from './skrekk.js';

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...barn) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const b of barn.flat()) if (b != null && b !== false) el.append(b);
  return el;
}

const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dato = (s) => new Date(`${s}T00:00:00`);
const kortDato = (s) => { const d = dato(s); return `${d.getDate()}. ${MND[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };
const romertall = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const VERKTØY = {
  sok_kompetanse: ['🔮', 'Leter i kompetanseskyggene'],
  sjekk_tilgjengelighet: ['⏳', 'Spør hvem som kan vekkes'],
  hent_cv: ['📜', 'Leser CV-ruller'],
  finn_prosjekthistorikk: ['🕯️', 'Graver i prosjektgravene'],
  sok_prosjekter: ['🗝️', 'Leter i prosjektgravene'],
  tidslinje_kapasitet: ['🕰️', 'Leser oppvåkningskalenderen'],
  sett_sammen_team: ['🧟', 'Vekker et helt lag'],
  lever_svar: ['⚰️', 'Setter sammen svaret'],
  still_oppfolgingssporsmal: ['🦇', 'Hvisker et spørsmål'],
};

const TRANSE = [
  '🕯️ Lysene tennes. Mediet faller i transe …',
  'Bordet begynner å riste …',
  'Noe rører seg nede i kompetansegraven …',
  'Kontakt med den andre siden er opprettet …',
  'Åndene blar i gamle CV-ruller …',
];

const EKSEMPLER = [
  'Vi trenger noen som kan Terraform og Azure, ledig fra november, helst C-grad eller over',
  'Sett sammen et team på tre til et dataplattform-prosjekt i Oslo fra desember',
  'Vi trenger en utvikler',
  'Hvem kan starte på en sikkerhetsgjennomgang så fort som mulig?',
];

let historikk = [];
let opptatt = false;

// ---------- Tidslinje ----------
function tidslinje(rader, idag, { ønsket, måneder = 9 } = {}) {
  const start = dato(idag);
  const slutt = new Date(start.getFullYear(), start.getMonth() + måneder, start.getDate());
  const span = slutt - start;
  const pst = (d) => Math.min(100, Math.max(0, ((d - start) / span) * 100));

  const mnd = h('div', { class: 'tl-måneder' });
  for (let i = 1; i <= måneder; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    if (d >= slutt) break;
    mnd.append(h('span', { style: `left:${pst(d)}%` }, `${MND[d.getMonth()]}${d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ''}`));
  }

  const linjer = h('div', { class: 'tl-linjer' }, h('div', { class: 'tl-linje idag', style: 'left:0' }, h('span', {}, 'I dag')));
  if (ønsket && dato(ønsket) >= start && dato(ønsket) < slutt) {
    linjer.append(h('div', { class: 'tl-linje', style: `left:${pst(dato(ønsket))}%` }, h('span', {}, `Ønsket ${kortDato(ønsket)}`)));
  }

  const el = h('div', { class: 'tl', style: `--mnd:${måneder}` },
    h('div', { class: 'tl-akse' }, h('div'), mnd),
    rader.map((r) => {
      const t = r.tilgjengelighet;
      const fra = t ? dato(t.ledig_fra) : null;
      const helt = t && t.ledig_prosent >= 100;
      const kunde = t?.nåværende_oppdrag?.kunde;
      const tittel = t
        ? `${r.navn}: ${kunde ? `på oppdrag hos ${kunde} til ${t.nåværende_oppdrag.til ? kortDato(t.nåværende_oppdrag.til) : 'videre'}. ` : ''}Ledig fra ${kortDato(t.ledig_fra)} (${t.ledig_prosent} %).${t.kommentar ? ` ${t.kommentar}` : ''}`
        : `${r.navn}: ingen tilgjengelighetsdata`;
      const opptattPst = fra ? pst(fra) : 0;
      return h('div', { class: 'tl-rad', title: tittel },
        h('div', { class: 'tl-navn' }, h('b', {}, r.navn), h('small', {}, r.undertekst ?? `${r.rolle} · ${r.lokasjon}`)),
        h('div', { class: 'tl-spor' },
          opptattPst > 0 && h('div', { class: 'tl-opptatt', style: `width:${opptattPst}%` }, kunde && h('span', {}, kunde)),
          fra && fra < slutt && h('div', { class: `tl-ledig${helt ? '' : ' delvis'}`, style: `width:${100 - opptattPst}%` },
            h('span', {}, opptattPst > 0 ? `${kortDato(t.ledig_fra)} · ${t.ledig_prosent} %` : `Ledig nå · ${t.ledig_prosent} %`))));
    }),
    linjer);

  return h('div', {},
    h('div', { class: 'tidslinje-boks' }, el),
    h('div', { class: 'tl-tegnforklaring' },
      h('span', {}, h('i', { style: 'background:repeating-linear-gradient(135deg,#2a1822 0 4px,#1d1118 4px 8px);border:1px solid rgba(209,48,76,.4)' }), 'På oppdrag'),
      h('span', {}, h('i', { style: 'background:rgba(125,255,106,.45);border:1px solid rgba(125,255,106,.6)' }), 'Helt ledig'),
      h('span', {}, h('i', { style: 'background:rgba(255,138,43,.5);border:1px solid rgba(255,138,43,.6)' }), 'Delvis ledig')));
}

// ---------- Svarkomponenter ----------
function miniMarkdown(tekst) {
  const linje = (s) => s.split(/\*\*(.+?)\*\*/g).map((d, i) => (i % 2 ? h('strong', {}, d) : d));
  return tekst.split('\n').filter((l) => l.trim()).map((l) =>
    l.startsWith('#') ? h('h4', {}, l.replace(/^#+\s*/, '')) : h('p', {}, linje(l)));
}

function ledigLinje(t) {
  if (!t) return h('div', { class: 'ledig' }, 'Ingen tilgjengelighetsdata');
  const kl = t.ledig_prosent >= 100 ? '' : t.ledig_prosent > 0 ? 'delvis' : 'opptatt';
  const avdato = dato(t.ledig_fra) <= new Date() ? 'Ledig nå' : `Ledig fra ${kortDato(t.ledig_fra)}`;
  return h('div', { class: 'ledig' },
    h('span', {}, h('span', { class: `dot ${kl}` }), avdato, ` · ${t.ledig_prosent} %`),
    t.nåværende_oppdrag && h('span', { style: 'color:var(--dempet)' }, `nå hos ${t.nåværende_oppdrag.kunde}`),
    t.kommentar && h('span', { class: 'kommentar' }, t.kommentar));
}

function kompetanseChips(k) {
  return h('div', { class: 'kompetanse' }, k.kompetanse.slice(0, 6).map((f) =>
    h('span', { title: `Nivå ${f.nivå} av 5` }, f.ferdighet,
      h('i', {}, [1, 2, 3, 4, 5].map((n) => h('s', { class: n <= f.nivå ? 'på' : '' }))))));
}

function gravstein(c, i) {
  const k = c.konsulent;
  return h('article', { class: `gravstein${i === 0 ? ' først' : ''}`, style: `--i:${i}`, onmouseenter: () => Math.random() < 0.2 && lyd.hvisk(0.6) },
    h('div', { class: 'rang', 'aria-label': `Plass ${i + 1}` }, romertall[i + 1] ?? i + 1),
    h('div', { class: 'hode' },
      h('div', {},
        h('h3', { class: 'navn' }, k.navn, h('span', { class: 'grad', title: `Grad ${k.grad}` }, k.grad)),
        h('div', { class: 'rolle' }, `${k.rolle} · ${k.lokasjon}`)),
      h('div', { class: 'ring', style: `--p:${c.treff}`, role: 'img', 'aria-label': `${c.treff} prosent treff` }, h('b', {}, `${c.treff}`))),
    c.gravskrift && h('p', { class: 'gravskrift' }, c.gravskrift),
    h('p', { class: 'begrunnelse' }, c.begrunnelse),
    c.mangler && h('div', { class: 'mangler' }, h('b', {}, 'Mangler'), c.mangler),
    kompetanseChips(k),
    ledigLinje(k.tilgjengelighet),
    k.cv && h('details', { class: 'cv' }, h('summary', {}, 'Les CV-en'), h('div', { class: 'cvtekst' }, miniMarkdown(k.cv))));
}

function teamKort(team) {
  const initialer = (n) => n.split(' ').map((d) => d[0]).slice(0, 2).join('');
  return h('section', { class: 'team' },
    h('h3', {}, team.navn ?? 'Foreslått team'),
    h('p', {}, team.begrunnelse),
    h('div', { class: 'medlemmer' }, team.medlemmer.map((m, i) =>
      h('div', { class: 'medlem', style: `--i:${i}` },
        h('div', { class: 'sigil' }, initialer(m.konsulent.navn)),
        h('b', {}, m.konsulent.navn),
        h('em', {}, m.rolle_i_teamet),
        h('span', {}, `${m.konsulent.rolle} · ${m.konsulent.lokasjon} · grad ${m.konsulent.grad}`)))));
}

function svarVisning(svar, idag) {
  const ut = h('div', { class: 'agent' });
  ut.append(h('p', { class: 'oppsummering' }, svar.oppsummering));
  if (svar.ingen_perfekt_match) ut.append(h('div', { class: 'advarsel' }, '🩸 Ingen perfekt match i graven. Under er de nærmeste, og hva som mangler.'));
  if (svar.kandidater?.length) {
    ut.append(h('h2', {}, 'Rangerte sjeler'), h('div', { class: 'gravstein-rad' }, svar.kandidater.map(gravstein)));
  }
  if (svar.team?.medlemmer?.length) ut.append(h('h2', {}, 'Teamet'), teamKort(svar.team));
  const ider = new Set();
  const rader = [...(svar.team?.medlemmer ?? []), ...(svar.kandidater ?? [])]
    .map((x) => x.konsulent).filter((k) => k.tilgjengelighet && !ider.has(k.id) && ider.add(k.id));
  if (rader.length) ut.append(h('h2', {}, 'Hvem våkner når?'), tidslinje(rader, idag, { ønsket: svar.onsket_start }));
  if (svar.spaadom) ut.append(h('div', { class: 'spaadom' }, h('b', {}, 'Åndenes varsel'), svar.spaadom));
  return ut;
}

// ---------- Séanceloggen ----------
function nyLogg() {
  const liste = h('ol');
  const logg = h('details', { class: 'logg', open: true }, h('summary', {}, h('span', { class: 'puls' }), 'Séanceloggen'), liste);
  return {
    el: logg,
    legg(rad) { liste.append(rad); rad.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    verktøy(navn, input) {
      const [ikon, tekst] = VERKTØY[navn] ?? ['✦', navn];
      const arg = Object.entries(input ?? {}).filter(([k]) => !['oppsummering', 'kandidater', 'team'].includes(k))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.rolle ?? JSON.stringify(x) : x)).join(', ') : v}`).join(' · ');
      this.legg(h('li', {}, `${ikon} ${tekst}`, arg && h('span', { class: 'arg' }, ` — ${arg}`)));
    },
    resultat(ok, kort) {
      const siste = liste.lastElementChild;
      siste?.append(h('span', { class: `ut${ok ? '' : ' feil'}` }, `${ok ? '↳' : '✖'} ${kort}`));
    },
    tanke(tekst) { this.legg(h('li', { class: 'tanke' }, tekst)); },
    ferdig() { logg.classList.add('ferdig'); logg.open = false; },
  };
}

// ---------- Kommunikasjon ----------
async function strøm(historikk, på) {
  const svar = await fetch('/api/spor', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historikk }),
  });
  if (!svar.ok || !svar.body) throw new Error(`Serveren svarte ${svar.status}`);
  const leser = svar.body.getReader();
  const dekoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    buf += dekoder.decode(value, { stream: true });
    let skille;
    while ((skille = buf.indexOf('\n\n')) >= 0) {
      const blokk = buf.slice(0, skille);
      buf = buf.slice(skille + 2);
      if (blokk.startsWith('data: ')) på(JSON.parse(blokk.slice(6)));
    }
  }
}

function sammendragAvSvar(svar) {
  const navn = svar.kandidater.map((c) => `${c.konsulent.navn} (${c.id}, ${c.treff} %)`).join(', ');
  const team = svar.team?.medlemmer?.length ? ` Teamforslag: ${svar.team.medlemmer.map((m) => `${m.konsulent.navn} som ${m.rolle_i_teamet}`).join(', ')}.` : '';
  return `${svar.oppsummering} Rangerte kandidater: ${navn || 'ingen'}.${team}`;
}

async function påkall(tekst) {
  tekst = tekst.trim();
  if (!tekst || opptatt) return;
  opptatt = true;
  $('send').disabled = true;
  $('forslag').replaceChildren();
  $('ny').hidden = false;
  historikk.push({ rolle: 'bruker', tekst });
  const trad = $('trad');
  trad.append(h('div', { class: 'bruker' }, tekst));
  const agent = h('div', { class: 'agent' });
  const logg = nyLogg();
  agent.append(logg.el);
  trad.append(agent);
  agent.scrollIntoView({ behavior: 'smooth', block: 'end' });

  // Transen: en hviskende plassholder som skifter til serveren sier noe.
  lyd.startHjerte();
  lyd.hvisk(1.2);
  const transe = h('li', { class: 'tanke' }, TRANSE[0]);
  logg.legg(transe);
  let steg = 0;
  const transeTimer = setInterval(() => { transe.textContent = TRANSE[++steg % TRANSE.length]; }, 2600);
  const våkn = () => { clearInterval(transeTimer); transe.remove(); };

  let agentTekst = null;
  const idag = new Date().toISOString().slice(0, 10);
  try {
    await strøm(historikk, (e) => {
      if (e.type !== 'ferdig') våkn();
      if (e.type === 'tanke') { logg.tanke(e.tekst); lyd.hvisk(); }
      else if (e.type === 'verktoy') { logg.verktøy(e.navn, e.input); lyd.tikk(); }
      else if (e.type === 'resultat') { logg.resultat(e.ok, e.kort); if (e.ok) lyd.plink(); else { lyd.surr(); skrekk.lyn('rød'); } }
      else if (e.type === 'svar') {
        logg.ferdig();
        lyd.stoppHjerte();
        skrekk.lyn();
        lyd.torden();
        lyd.klokke();
        agent.append(svarVisning(e.svar, idag));
        agentTekst = sammendragAvSvar(e.svar);
        if (e.svar.ingen_perfekt_match) setTimeout(() => lyd.latter(), 1400);
        setTimeout(() => skrekk.kanskjeSkrem(0.35), 2200);
      } else if (e.type === 'sporsmal') {
        logg.ferdig();
        lyd.stoppHjerte();
        lyd.hvisk(2.2);
        agent.append(h('div', { class: 'spørsmål' },
          h('div', { class: 'hvisk' }, 'Séancen hvisker tilbake'),
          h('p', {}, e.sporsmal),
          h('div', { class: 'valg' }, (e.forslag ?? []).map((f) => h('button', { type: 'button', onclick: () => påkall(f) }, f)))));
        agentTekst = e.sporsmal;
      } else if (e.type === 'feil') {
        logg.ferdig();
        lyd.stoppHjerte();
        lyd.surr();
        skrekk.lyn('rød');
        agent.append(h('div', { class: 'sjelefeil' }, `Séancen ble avbrutt: ${e.melding}`));
      }
    });
  } catch (e) {
    våkn();
    logg.ferdig();
    lyd.stoppHjerte();
    lyd.surr();
    skrekk.lyn('rød');
    agent.append(h('div', { class: 'sjelefeil' }, `Kunne ikke nå åndeverdenen: ${e.message}`));
  }
  lyd.stoppHjerte();
  if (agentTekst) historikk.push({ rolle: 'agent', tekst: agentTekst });
  else historikk.pop(); // mislyktes: la brukeren prøve igjen uten å forurense historikken
  opptatt = false;
  $('send').disabled = false;
  $('behov').focus();
  agent.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function visEksempler() {
  $('forslag').replaceChildren(...EKSEMPLER.map((e) => h('button', { type: 'button', onclick: () => påkall(e) }, e)));
}

$('skjema').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('behov').value;
  $('behov').value = '';
  påkall(t);
});
$('behov').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('skjema').requestSubmit(); }
});
// Påskeegg: skriv «bø» (eller «boo») i feltet.
$('behov').addEventListener('input', (e) => {
  if (/^(bø+|boo+)!?$/i.test(e.target.value.trim()) && skrekk.skrem({ tving: true })) e.target.value = '';
});
$('ny').addEventListener('click', () => {
  if (opptatt) return;
  lyd.knirk();
  historikk = [];
  $('trad').replaceChildren();
  $('ny').hidden = true;
  visEksempler();
});
visEksempler();

// ---------- Brytere for lyd og skremsler ----------
{
  const lydKnapp = $('lydbryter');
  const tegnLyd = (v) => {
    lydKnapp.setAttribute('aria-pressed', String(v));
    lydKnapp.querySelector('.ikon').textContent = v ? '🔊' : '🔇';
    lydKnapp.classList.toggle('sover', v && !lyd.lydErVåken());
    lydKnapp.title = v && !lyd.lydErVåken() ? 'Lyden våkner ved første trykk' : 'Slå lyden av eller på';
  };
  lyd.vedLydEndring(tegnLyd);
  tegnLyd(lyd.lydErPå());
  lydKnapp.addEventListener('click', () => lyd.settLyd(!lyd.lydErPå()));

  const skrekkKnapp = $('skrekkbryter');
  const tegnSkrekk = (v) => skrekkKnapp.setAttribute('aria-pressed', String(v));
  skrekk.vedSkrekkEndring(tegnSkrekk);
  tegnSkrekk(skrekk.skrekkErPå());
  if (!skrekk.skrekkErMulig()) { skrekkKnapp.disabled = true; skrekkKnapp.title = 'Av fordi systemet ber om redusert bevegelse'; }
  skrekkKnapp.addEventListener('click', () => skrekk.settSkrekk(!skrekk.skrekkErPå()));

  skrekk.startØyne();
  skrekk.startLurer();
}

// ---------- Faner og kapasitet ----------
let kapasitet = null;
function tegnKapasitet() {
  if (!kapasitet) return;
  const q = $('filter').value.trim().toLowerCase();
  const rader = kapasitet.konsulenter
    .filter((k) => !q || [k.navn, k.rolle, k.lokasjon, ...k.topp].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.tilgjengelighet?.ledig_fra ?? '9').localeCompare(b.tilgjengelighet?.ledig_fra ?? '9') || a.navn.localeCompare(b.navn))
    .map((k) => ({ ...k, undertekst: `${k.rolle} · ${k.lokasjon}` }));
  const boks = $('kap-liste');
  boks.replaceChildren(rader.length ? tidslinje(rader, kapasitet.idag, {}) : h('p', {}, 'Ingen sjeler matcher.'));
}
async function lastKapasitet() {
  if (kapasitet) return;
  try {
    kapasitet = await (await fetch('/api/kapasitet')).json();
    tegnKapasitet();
  } catch (e) {
    $('kap-liste').replaceChildren(h('p', { class: 'sjelefeil' }, `Kunne ikke lese kapasiteten: ${e.message}`));
  }
}
$('filter').addEventListener('input', tegnKapasitet);

const FANER = [['fane-spor', 'panel-spor'], ['fane-kap', 'panel-kap'], ['fane-reg', 'panel-reg']];
for (const [fane, panel] of FANER) {
  $(fane).addEventListener('click', () => {
    for (const [f, p] of FANER) {
      $(f).setAttribute('aria-selected', String(f === fane));
      $(p).hidden = p !== panel;
    }
    if (panel === 'panel-kap') lastKapasitet();
    if (panel === 'panel-reg') lastRegister();
  });
}

// ---------- Sjeleregisteret: hele flokken med filter og sortering ----------
const GRADER = ['A', 'B', 'C', 'D', 'E'];
const KOLONNER = [
  { id: 'navn', tittel: 'Navn', verdi: (k) => k.navn },
  { id: 'grad', tittel: 'Grad', verdi: (k) => k.grad },
  { id: 'rolle', tittel: 'Rolle', verdi: (k) => k.rolle },
  { id: 'avdeling', tittel: 'Avdeling', verdi: (k) => k.avdeling },
  { id: 'lokasjon', tittel: 'Sted', verdi: (k) => k.lokasjon },
  { id: 'kompetanse', tittel: 'Toppkompetanse', verdi: (k) => k.kompetanse[0]?.ferdighet ?? '', sorterbar: false },
  { id: 'ledig_fra', tittel: 'Ledig fra', verdi: (k) => k.tilgjengelighet?.ledig_fra ?? '9999' },
  { id: 'ledig_prosent', tittel: '%', verdi: (k) => k.tilgjengelighet?.ledig_prosent ?? -1 },
  { id: 'prosjekter', tittel: 'Prosj.', verdi: (k) => k.prosjekter.length },
  { id: 'cv', tittel: 'CV', verdi: (k) => (k.cv ? 1 : 0) },
];

let register = null;
const regValg = { grad: new Set(), sted: new Set(), avd: new Set(), sorter: 'navn', retning: 1 };
const åpneRader = new Set();

function chipGruppe(boks, verdier, valgt, navn) {
  boks.replaceChildren(...verdier.map((v) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: (e) => {
      valgt.has(v) ? valgt.delete(v) : valgt.add(v);
      e.currentTarget.setAttribute('aria-pressed', String(valgt.has(v)));
      tegnRegister();
    } }, navn ? navn(v) : v)));
}

function søketekst(k) {
  return [k.navn, k.id, k.grad, k.rolle, k.avdeling, k.lokasjon, ...k.sertifiseringer, ...k.språk,
    ...k.kompetanse.map((f) => f.ferdighet), ...k.prosjekter.flatMap((p) => [p.kunde, p.bransje, p.rolle, ...p.teknologier]),
    k.tilgjengelighet?.nåværende_oppdrag?.kunde ?? '', k.tilgjengelighet?.kommentar ?? '']
    .join(' ').toLowerCase();
}

function filtrertRegister() {
  const q = $('reg-sok').value.trim().toLowerCase();
  const senest = $('reg-dato').value;
  const minPst = Number($('reg-pst').value);
  const måHaCv = $('reg-cv').checked;
  return register.konsulenter.filter((k) => {
    if (regValg.grad.size && !regValg.grad.has(k.grad)) return false;
    if (regValg.sted.size && !regValg.sted.has(k.lokasjon)) return false;
    if (regValg.avd.size && !regValg.avd.has(k.avdeling)) return false;
    const t = k.tilgjengelighet;
    if (senest && (!t || t.ledig_fra > senest)) return false;
    if (minPst && (!t || t.ledig_prosent < minPst)) return false;
    if (måHaCv && !k.cv) return false;
    if (q && !(k._søk ??= søketekst(k)).includes(q)) return false;
    return true;
  });
}

function detaljer(k) {
  const t = k.tilgjengelighet;
  return h('div', { class: 'reg-detaljer' },
    h('div', {},
      h('h4', {}, 'Kompetanse'),
      h('div', { class: 'kompetanse' }, k.kompetanse.map((f) =>
        h('span', { title: `Nivå ${f.nivå} av 5` }, f.ferdighet, h('i', {}, [1, 2, 3, 4, 5].map((n) => h('s', { class: n <= f.nivå ? 'på' : '' })))))),
      h('h4', {}, 'Sertifiseringer'),
      h('p', {}, k.sertifiseringer.length ? k.sertifiseringer.join(' · ') : 'Ingen registrert'),
      h('h4', {}, 'Språk'),
      h('p', {}, k.språk.join(', ')),
      h('h4', {}, 'Tilgjengelighet'),
      ledigLinje(t),
      t?.nåværende_oppdrag && h('p', { class: 'dempet' }, `${t.nåværende_oppdrag.rolle} hos ${t.nåværende_oppdrag.kunde}${t.nåværende_oppdrag.til ? ` til ${kortDato(t.nåværende_oppdrag.til)}` : ''}`)),
    h('div', {},
      h('h4', {}, `Prosjekter (${k.prosjekter.length})`),
      k.prosjekter.length
        ? h('ul', { class: 'prosjekter' }, k.prosjekter.map((p) =>
          h('li', {}, h('b', {}, `${p.år} · ${p.kunde}`), ` — ${p.rolle}, ${p.bransje}`, h('span', { class: 'dempet' }, ` · ${p.teknologier.join(', ')}`))))
        : h('p', { class: 'dempet' }, 'Ingen prosjekthistorikk ennå.'),
      h('h4', {}, 'CV'),
      k.cv ? h('div', { class: 'cvtekst' }, miniMarkdown(k.cv)) : h('p', { class: 'dempet' }, 'Ingen CV registrert.')));
}

function tegnRegister() {
  if (!register) return;
  const rader = filtrertRegister();
  const kol = KOLONNER.find((c) => c.id === regValg.sorter);
  rader.sort((a, b) => {
    const x = kol.verdi(a), y = kol.verdi(b);
    const d = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'nb');
    return (d || a.navn.localeCompare(b.navn, 'nb')) * regValg.retning;
  });

  const thead = $('reg-tabell').tHead;
  thead.replaceChildren(h('tr', {}, h('th', { class: 'pil' }), KOLONNER.map((c) => {
    const aktiv = c.id === regValg.sorter;
    const th = h('th', { 'aria-sort': aktiv ? (regValg.retning > 0 ? 'ascending' : 'descending') : 'none' });
    if (c.sorterbar === false) return th.append(c.tittel), th;
    th.append(h('button', { type: 'button', onclick: () => {
      if (aktiv) regValg.retning *= -1;
      else { regValg.sorter = c.id; regValg.retning = c.id === 'ledig_prosent' || c.id === 'prosjekter' || c.id === 'cv' ? -1 : 1; }
      tegnRegister();
    } }, c.tittel, aktiv && h('span', { class: 'sort' }, regValg.retning > 0 ? ' ▲' : ' ▼')));
    return th;
  })));

  const tbody = $('reg-tabell').tBodies[0];
  tbody.replaceChildren(...rader.flatMap((k) => {
    const t = k.tilgjengelighet;
    const åpen = åpneRader.has(k.id);
    const ledigNå = t && dato(t.ledig_fra) <= dato(register.idag);
    const rad = h('tr', { class: `reg-rad${åpen ? ' åpen' : ''}`, tabindex: '0', 'aria-expanded': String(åpen), onclick: () => {
      åpneRader.has(k.id) ? åpneRader.delete(k.id) : åpneRader.add(k.id);
      tegnRegister();
    }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } } },
      h('td', { class: 'pil' }, '▸'),
      h('td', {}, h('b', {}, k.navn), h('small', { class: 'dempet' }, ` ${k.id}`)),
      h('td', {}, h('span', { class: 'grad', style: 'margin:0' }, k.grad)),
      h('td', {}, k.rolle),
      h('td', { class: 'dempet' }, k.avdeling),
      h('td', {}, k.lokasjon),
      h('td', {}, h('div', { class: 'topp' }, k.kompetanse.slice(0, 3).map((f) => h('span', { class: `nivå n${f.nivå}`, title: `Nivå ${f.nivå} av 5` }, f.ferdighet)))),
      h('td', { class: ledigNå ? 'ledig-nå' : '' }, t ? (ledigNå ? 'Nå' : kortDato(t.ledig_fra)) : '–',
        t?.kommentar && h('span', { class: 'merk', title: t.kommentar }, ' ⚠')),
      h('td', { class: 'tall' }, t ? h('span', { class: `pst ${t.ledig_prosent >= 100 ? 'hel' : t.ledig_prosent > 0 ? 'delvis' : 'opptatt'}` }, `${t.ledig_prosent} %`) : '–'),
      h('td', { class: 'tall' }, k.prosjekter.length || h('span', { class: 'dempet' }, '0')),
      h('td', { class: 'tall' }, k.cv ? '📜' : h('span', { class: 'dempet' }, '–')));
    return åpen ? [rad, h('tr', { class: 'reg-detaljrad' }, h('td', { colspan: KOLONNER.length + 1 }, detaljer(k)))] : [rad];
  }));
  $('reg-status').textContent = rader.length === register.konsulenter.length
    ? `${rader.length} sjeler i registeret`
    : `${rader.length} av ${register.konsulenter.length} sjeler matcher`;
}

async function lastRegister() {
  if (register) return;
  try {
    register = await (await fetch('/api/konsulenter')).json();
  } catch (e) {
    $('reg-status').textContent = `Kunne ikke lese registeret: ${e.message}`;
    $('reg-status').classList.add('sjelefeil');
    return;
  }
  const unike = (f) => [...new Set(register.konsulenter.map(f))].sort((a, b) => a.localeCompare(b, 'nb'));
  chipGruppe($('reg-grad'), GRADER, regValg.grad, (g) => `${g}${g === 'A' ? ' (junior)' : g === 'E' ? ' (senior)' : ''}`);
  chipGruppe($('reg-sted'), unike((k) => k.lokasjon), regValg.sted);
  chipGruppe($('reg-avd'), unike((k) => k.avdeling), regValg.avd);
  for (const id of ['reg-sok', 'reg-dato', 'reg-pst', 'reg-cv']) $(id).addEventListener('input', tegnRegister);
  $('reg-nullstill').addEventListener('click', () => {
    $('reg-filtre').reset();
    $('reg-sok').value = '';
    for (const s of [regValg.grad, regValg.sted, regValg.avd]) s.clear();
    for (const b of document.querySelectorAll('#reg-filtre .chip')) b.setAttribute('aria-pressed', 'false');
    tegnRegister();
  });
  tegnRegister();
}

// ---------- Glør som svever ----------
(function glør() {
  const c = $('embers');
  const ctx = c.getContext('2d');
  if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let b, hh;
  const resize = () => { b = c.width = innerWidth; hh = c.height = innerHeight; };
  resize();
  addEventListener('resize', resize);
  const lag = () => ({ x: Math.random() * b, y: hh + Math.random() * 40, r: 0.6 + Math.random() * 1.8, v: 0.15 + Math.random() * 0.5, s: Math.random() * 6.28, grønn: Math.random() < 0.18 });
  const p = Array.from({ length: 55 }, () => ({ ...lag(), y: Math.random() * hh }));
  (function tegn(t) {
    ctx.clearRect(0, 0, b, hh);
    for (const e of p) {
      e.y -= e.v; e.x += Math.sin(t / 1800 + e.s) * 0.35;
      if (e.y < -10) Object.assign(e, lag());
      const a = Math.min(1, (hh - e.y) / 120, e.y / 120 + 0.2) * (0.5 + 0.5 * Math.sin(t / 400 + e.s));
      ctx.fillStyle = e.grønn ? `rgba(125,255,106,${a * 0.7})` : `rgba(255,150,60,${a})`;
      ctx.shadowColor = e.grønn ? '#7dff6a' : '#ff8a2b';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.28); ctx.fill();
    }
    requestAnimationFrame(tegn);
  })(0);
})();

// Lenkbare tilstander: /?q=… starter en påkallelse, /?fane=kapasitet åpner tidslinjen,
// /?fane=register åpner sjeleregisteret.
{
  const url = new URLSearchParams(location.search);
  if (url.get('fane') === 'kapasitet') $('fane-kap').click();
  else if (url.get('fane') === 'register') $('fane-reg').click();
  else if (url.get('q')) påkall(url.get('q'));
}
