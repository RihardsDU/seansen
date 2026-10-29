// Verktøyene til seansen. Hvert verktøy er en definisjon (det modellen ser) og
// en kjør-funksjon (det som faktisk skjer). kjør: null betyr stub: verktøyet
// sendes ikke til modellen før dere har implementert det.
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(import.meta.dirname, '..', 'data');
const lesJson = (fil) => JSON.parse(fs.readFileSync(path.join(DATA, fil), 'utf8'));

const konsulenter = lesJson('konsulenter.json');
const tilgjengelighet = lesJson('tilgjengelighet.json');
const prosjekthistorikk = lesJson('prosjekthistorikk.json');
const tilgEtterId = new Map(tilgjengelighet.map((t) => [t.id, t]));

export const idag = () => new Date().toISOString().slice(0, 10);

export const system = `Du er bemanningsagenten i et konsulentselskap med kontorer i Oslo, Bergen, Trondheim og Stavanger.
Du får et behov i naturlig språk og skal finne de beste kandidatene. I dag er ${idag()}.

- Bryt behovet ned i konkrete søk (ferdigheter, tidspunkt, grad, lokasjon) før du slår opp.
- Gjør flere oppslag og sjekk det du kan, ikke stol på ett søk.
- Hent CV og prosjekthistorikk for de øverste kandidatene før du anbefaler dem, og si fra hvis de spriker med profilen.
- Svar med en rangert liste der hver kandidat har en kort begrunnelse.
- Finner du ingen perfekt match, foreslå nest beste og si tydelig hva som mangler.
- Trenger behovet flere personer (et team, flere roller, «et lag»), eller dekkes det tydelig bedre av flere i samspill
  (f.eks. arkitekt + utvikler + tester), bruk sett_sammen_team og foreslå et helt team: én person per rolle, hva hver
  bidrar med, felles startdato og hvem som kan byttes inn. Sjekk CV og prosjekthistorikk for de foreslåtte først.
- Spør brukeren «hvem blir ledig når», eller er tidspunktet viktigere enn én bestemt ferdighet, bruk tidslinje_kapasitet
  og gjengi tegningen fra verktøyet ordrett i svaret, i en kodeblokk.
- Si fra hvis du ikke har verktøy til å sjekke noe som betyr noe for svaret.
- Grad går fra A (junior) til E (mest senior). Svar på norsk.`;

// Regler for oppfølgingsspørsmål. Hvilken som gjelder avhenger av om brukeren
// kan svare underveis (terminal med tastatur, webgrensesnittet) eller ikke.
export const regelOppfølging = `- Er behovet for vagt til å søke på (ingen teknologi, rolle eller fagområde), kall still_oppfolgingssporsmal med ett konkret
  spørsmål i stedet for å gjette. Er det nok til et fornuftig første søk, søk heller og nevn antakelsene dine i svaret.
  Still aldri mer enn to oppfølgingsspørsmål i samme samtale.`;
export const regelIngenOppfølging = `- Du får ikke svar fra brukeren underveis. Ikke spør om du skal gjøre mer, gjør det du trenger før du svarer, og nevn antakelsene dine.`;

// Oppfølgingsspørsmålet er en leveranse (avslutt: true): agent.js stopper når
// modellen kaller det, og den som kjører agenten må skaffe svaret fra brukeren.
// Ligger utenfor `verktøy` så den som kjører agenten velger om det er mulig å spørre.
export const oppfølging = {
  avslutt: true,
  kjør: async () => 'mottatt', // kjøres aldri, men agent.js sender bare verktøy med kjør
  definisjon: {
    name: 'still_oppfolgingssporsmal',
    description: `Stiller brukeren ett oppfølgingsspørsmål i stedet for å søke. Bruk den BARE når behovet er så vagt at søk ville
vært gjetting (f.eks. «vi trenger en utvikler» uten teknologi, rolle eller tidspunkt). Er det nok til å gjøre et fornuftig første søk,
søk heller, og nevn antakelsene dine i svaret. Svaret fra brukeren kommer tilbake som resultatet av dette verktøyet.`,
    input_schema: {
      type: 'object',
      properties: {
        sporsmal: { type: 'string', description: 'Ett konkret spørsmål, på norsk.' },
        forslag: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Korte svaralternativer brukeren kan velge mellom.' },
      },
      required: ['sporsmal'],
    },
  },
};

export const eksempelOppgave = 'Vi trenger noen som kan Terraform og Azure, ledig fra november, helst C-grad eller over.';

// ---------- Hjelpere for dato, grad og tidslinje ----------
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const GRADER = ['A', 'B', 'C', 'D', 'E'];
const DAG = 86_400_000;
const erDato = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const renGrad = (g) => (typeof g === 'string' ? g.trim().toUpperCase() : '');
const leggTilMåneder = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const dagerMellom = (fra, til) => Math.round((Date.parse(til) - Date.parse(fra)) / DAG);

// Finner den beste ferdigheten i profilen som matcher et søkeord (delstreng, uavhengig av store/små bokstaver).
const finnFerdighet = (k, ord, minNivå = 1) =>
  k.kompetanse
    .filter((f) => f.ferdighet.toLowerCase().includes(ord.toLowerCase()) && f.nivå >= minNivå)
    .sort((a, b) => b.nivå - a.nivå)[0] ?? null;

const ledighet = (id) => {
  const t = tilgEtterId.get(id);
  return t
    ? { ledig_fra: t.ledig_fra, ledig_prosent: t.ledig_prosent, nåværende_kunde: t.nåværende_oppdrag?.kunde ?? null, kommentar: t.kommentar }
    : { ledig_fra: null, ledig_prosent: null, nåværende_kunde: null };
};

// Tekst-tidslinje: én kolonne per uke. █ på oppdrag, ░ helt ledig, ▒ delvis ledig.
function tegnTidslinje(rader, fra, til) {
  const uker = Math.max(1, Math.ceil(dagerMellom(fra, til) / 7));
  const kolonne = (iso) => Math.min(uker, Math.max(0, Math.round(dagerMellom(fra, iso) / 7)));
  const bredde = Math.max(5, ...rader.map((r) => r.navn.length));

  const hode = Array(uker).fill(' ');
  const d = new Date(`${fra}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.toISOString().slice(0, 10) < til; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const c = kolonne(d.toISOString().slice(0, 10));
    const navn = MND[d.getUTCMonth()];
    for (let i = 0; i < navn.length && c + i < uker; i++) hode[c + i] = navn[i];
  }

  const linjer = [`${'I dag'.padEnd(bredde)}  ${hode.join('')}`];
  for (const r of rader) {
    if (!r.ledig_fra) { linjer.push(`${r.navn.padEnd(bredde)}  ${'?'.repeat(uker)}  ingen tilgjengelighetsdata`); continue; }
    const c = kolonne(r.ledig_fra);
    const tegn = r.ledig_prosent >= 100 ? '░' : '▒';
    const status = r.ledig_fra <= fra ? 'ledig nå' : r.ledig_fra > til ? `først ${r.ledig_fra}` : r.ledig_fra;
    linjer.push(`${r.navn.padEnd(bredde)}  ${'█'.repeat(c)}${tegn.repeat(uker - c)}  ${status} · ${r.ledig_prosent} %`);
  }
  linjer.push(`${''.padEnd(bredde)}  █ på oppdrag  ░ helt ledig  ▒ delvis ledig  (én kolonne er én uke fra ${fra} til ${til})`);
  return linjer.join('\n');
}

export const verktøy = [
  {
    definisjon: {
      name: 'sok_kompetanse',
      description: `Søker etter konsulenter som har en bestemt ferdighet i kompetanseprofilen sin.
Søket matcher på deler av ferdighetsnavnet uten å skille på store og små bokstaver, så «azure» treffer også «Azure DevOps» og «Azure Bicep».
Søk på én ferdighet om gangen. Trenger du to ferdigheter, gjør to søk og se hvem som går igjen.
Nivå er selvvurdert fra 1 (kjent med) til 5 (ekspert). Grad går fra A (junior) til E (mest senior).
Returnerer id, navn, grad, lokasjon og de matchende ferdighetene, sortert med høyest nivå først. Ikke hele profilen.
Sier ingenting om hvem som er ledig.`,
      input_schema: {
        type: 'object',
        properties: {
          ferdighet: { type: 'string', description: 'Ferdigheten du leter etter, f.eks. «Terraform» eller «React».' },
          min_niva: { type: 'integer', minimum: 1, maximum: 5, description: 'Laveste nivå som teller. Standard er 1.' },
          maks_treff: { type: 'integer', minimum: 1, maximum: 50, description: 'Hvor mange treff du vil ha tilbake. Standard er 15.' },
        },
        required: ['ferdighet'],
      },
    },
    kjør: async ({ ferdighet, min_niva = 1, maks_treff = 15 }) => {
      if (typeof ferdighet !== 'string' || !ferdighet.trim()) {
        throw new Error('Mangler eller ugyldig «ferdighet». Oppgi en ferdighet å søke på, f.eks. {"ferdighet": "Terraform"}.');
      }
      const søk = ferdighet.trim().toLowerCase();
      const treff = konsulenter
        .map((k) => ({
          id: k.id, navn: k.navn, grad: k.grad, lokasjon: k.lokasjon,
          ferdigheter: k.kompetanse.filter((f) => f.ferdighet.toLowerCase().includes(søk) && f.nivå >= min_niva),
        }))
        .filter((k) => k.ferdigheter.length)
        .sort((a, b) => Math.max(...b.ferdigheter.map((f) => f.nivå)) - Math.max(...a.ferdigheter.map((f) => f.nivå)));
      if (!treff.length) return `Ingen treff på «${ferdighet}» med nivå ${min_niva} eller høyere. Prøv et annet ord eller lavere nivå.`;
      return { antall_treff: treff.length, viser: Math.min(treff.length, maks_treff), treff: treff.slice(0, maks_treff) };
    },
  },
  {
    definisjon: {
      name: 'sjekk_tilgjengelighet',
      description: `Sjekker når konsulenter blir ledige. Gi en liste med id-er fra sok_kompetanse.
Returnerer for hver: nåværende oppdrag (kunde og sluttdato, eller null), dato de er ledige fra, og hvor mange prosent de er ledige.
Merk at noen bare er delvis ledige, og at enkelte har en kommentar som begrenser hva de kan ta.`,
      input_schema: {
        type: 'object',
        properties: { ider: { type: 'array', items: { type: 'string' }, description: 'Konsulent-id-er, f.eks. ["k007", "k023"].' } },
        required: ['ider'],
      },
    },
    kjør: async ({ ider }) => {
      if (!Array.isArray(ider) || !ider.length) {
        throw new Error('Mangler eller tom «ider». Oppgi id-er fra sok_kompetanse, f.eks. {"ider": ["k007", "k023"]}.');
      }
      const resultater = [];
      const ukjente_ider = [];
      for (const id of ider) {
        const rad = tilgjengelighet.find((t) => t.id === String(id).trim().toLowerCase());
        if (rad) resultater.push(rad);
        else ukjente_ider.push(id);
      }
      if (!resultater.length) return `Fant ingen tilgjengelighet for ${ider.join(', ')}. Sjekk at id-ene kommer fra sok_kompetanse.`;
      return ukjente_ider.length ? { resultater, ukjente_ider } : { resultater };
    },
  },
  {
    definisjon: {
      name: 'hent_cv',
      description: `Henter CV-sammendraget til én konsulent som markdown.
Bruk den på toppkandidatene for å bekrefte erfaringen før du anbefaler dem. Du kan hente flere CV-er i samme runde.
Ikke alle har CV. Mangler den, får du beskjed om det, og da må du klare deg med profilen og prosjekthistorikken.
CV-en kan være mer oppdatert, eller mindre, enn kompetanseprofilen. Si fra hvis de spriker.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Konsulent-id, f.eks. "k007".' } },
        required: ['id'],
      },
    },
    kjør: async ({ id }) => {
      const renId = typeof id === 'string' ? id.trim().toLowerCase() : '';
      // Bare id-er på formen k + tre sifre, så ingen kan be om «../../.env».
      if (!/^k\d{3}$/.test(renId)) {
        throw new Error(`Ugyldig id «${id}». Bruk en id fra sok_kompetanse, f.eks. {"id": "k007"}.`);
      }
      const fil = path.join(DATA, 'cv', `${renId}.md`);
      if (!fs.existsSync(fil)) return `Ingen CV for ${renId}. Bruk profilen og prosjekthistorikken i stedet.`;
      return fs.readFileSync(fil, 'utf8');
    },
  },
  {
    definisjon: {
      name: 'finn_prosjekthistorikk',
      description: `Henter tidligere prosjekter for én konsulent: kunde, bransje, år, rolle og teknologier.
Nyttig for å se om noen faktisk har brukt en teknologi i et oppdrag, ikke bare oppgitt den i profilen.
Juniorer har ofte ingen historikk ennå.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Konsulent-id, f.eks. "k007".' } },
        required: ['id'],
      },
    },
    kjør: async ({ id }) => {
      const renId = typeof id === 'string' ? id.trim().toLowerCase() : '';
      if (!konsulenter.some((k) => k.id === renId)) {
        throw new Error(`Ukjent id «${id}». Bruk en id fra sok_kompetanse, f.eks. {"id": "k007"}.`);
      }
      const historikk = prosjekthistorikk.find((p) => p.konsulent_id === renId);
      if (!historikk?.prosjekter.length) return `Ingen prosjekthistorikk for ${renId}. Vanlig for juniorer.`;
      // Nyeste først, så det mest relevante kommer øverst.
      return { id: renId, prosjekter: [...historikk.prosjekter].sort((a, b) => b.år - a.år) };
    },
  },
  {
    definisjon: {
      name: 'sok_prosjekter',
      description: `Søker i prosjekthistorikken til alle konsulenter etter bransje og/eller teknologi.
Bruk den når behovet handler om erfaring fra en bransje («noen som har jobbet i helse») eller når du vil se hvem som faktisk har brukt en teknologi i et oppdrag.
Bransjene er: Helse, Offentlig sektor, Energi, Forsikring, Bank og finans, Media, Telekom, Varehandel, Logistikk, Havbruk, Eiendom, Maritim.
Søket matcher på deler av ordet uten å skille på store og små bokstaver. Gir du både bransje og teknologi, må prosjektet treffe begge.
Returnerer id, navn, grad, lokasjon og de matchende prosjektene, sortert med flest treff først. Sier ingenting om hvem som er ledig.`,
      input_schema: {
        type: 'object',
        properties: {
          bransje: { type: 'string', description: 'Bransjen du leter etter, f.eks. «Helse» eller «Bank».' },
          teknologi: { type: 'string', description: 'Teknologien du leter etter, f.eks. «Terraform».' },
          maks_treff: { type: 'integer', minimum: 1, maximum: 50, description: 'Hvor mange konsulenter du vil ha tilbake. Standard er 15.' },
        },
      },
    },
    kjør: async ({ bransje, teknologi, maks_treff = 15 }) => {
      const b = typeof bransje === 'string' ? bransje.trim().toLowerCase() : '';
      const t = typeof teknologi === 'string' ? teknologi.trim().toLowerCase() : '';
      if (!b && !t) {
        throw new Error('Oppgi «bransje», «teknologi» eller begge, f.eks. {"bransje": "Helse"}.');
      }
      const passer = (p) =>
        (!b || p.bransje.toLowerCase().includes(b)) &&
        (!t || p.teknologier.some((x) => x.toLowerCase().includes(t)));
      const treff = prosjekthistorikk
        .map(({ konsulent_id, prosjekter }) => {
          const k = konsulenter.find((k) => k.id === konsulent_id);
          return {
            id: konsulent_id, navn: k?.navn, grad: k?.grad, lokasjon: k?.lokasjon,
            prosjekter: prosjekter.filter(passer).sort((x, y) => y.år - x.år),
          };
        })
        .filter((k) => k.prosjekter.length)
        .sort((x, y) => y.prosjekter.length - x.prosjekter.length || y.prosjekter[0].år - x.prosjekter[0].år);
      const søkt = [bransje && `bransje «${bransje}»`, teknologi && `teknologi «${teknologi}»`].filter(Boolean).join(' og ');
      if (!treff.length) return `Ingen prosjekter med ${søkt}. Prøv et annet ord.`;
      return { antall_treff: treff.length, viser: Math.min(treff.length, maks_treff), treff: treff.slice(0, maks_treff) };
    },
  },
  {
    definisjon: {
      name: 'tidslinje_kapasitet',
      description: `Svarer på «hvem blir ledig når?»: en tidslinje over når konsulenter blir ledige i en periode.
Avgrens med id-er (fra andre verktøy), ferdighet, lokasjon og/eller laveste grad. Uten avgrensning får du hele selskapet, så bruk helst et filter.
Perioden starter i dag hvis du ikke oppgir «fra», og varer seks måneder hvis du ikke oppgir «til».
Returnerer konsulentene gruppert etter måneden de blir ledige («ledig nå» først, «etter perioden» sist), hver med ledig fra-dato, prosent,
nåværende kunde og eventuell kommentar, pluss en ferdig tegnet tekst-tidslinje («tegning») som du gjengir ordrett i svaret, i en kodeblokk.
Sier ingenting om hvor gode de er; bruk sok_kompetanse for det.`,
      input_schema: {
        type: 'object',
        properties: {
          ider: { type: 'array', items: { type: 'string' }, description: 'Avgrens til disse konsulentene, f.eks. ["k007", "k023"].' },
          ferdighet: { type: 'string', description: 'Avgrens til de som har ferdigheten i profilen (delstreng, f.eks. «React»).' },
          min_niva: { type: 'integer', minimum: 1, maximum: 5, description: 'Laveste nivå på ferdigheten. Standard er 1.' },
          lokasjon: { type: 'string', description: 'Oslo, Bergen, Trondheim eller Stavanger.' },
          min_grad: { type: 'string', enum: GRADER, description: 'Laveste grad som teller, f.eks. "C".' },
          fra: { type: 'string', description: 'Start på perioden (ÅÅÅÅ-MM-DD). Standard er i dag.' },
          til: { type: 'string', description: 'Slutt på perioden (ÅÅÅÅ-MM-DD). Standard er seks måneder etter «fra».' },
          maks_treff: { type: 'integer', minimum: 1, maximum: 80, description: 'Hvor mange konsulenter du vil ha med. Standard er 20.' },
        },
      },
    },
    kjør: async ({ ider, ferdighet, min_niva = 1, lokasjon, min_grad, fra, til, maks_treff = 20 }) => {
      if (fra != null && !erDato(fra)) throw new Error(`Ugyldig «fra»: ${fra}. Bruk ÅÅÅÅ-MM-DD.`);
      if (til != null && !erDato(til)) throw new Error(`Ugyldig «til»: ${til}. Bruk ÅÅÅÅ-MM-DD.`);
      const start = fra ?? idag();
      const slutt = til ?? leggTilMåneder(start, 6);
      if (slutt <= start) throw new Error(`«til» (${slutt}) må være etter «fra» (${start}).`);
      const grad = renGrad(min_grad);
      if (min_grad != null && !GRADER.includes(grad)) throw new Error(`Ugyldig «min_grad»: ${min_grad}. Bruk A, B, C, D eller E.`);
      const ønsketIder = Array.isArray(ider) ? new Set(ider.map((i) => String(i).trim().toLowerCase())) : null;
      const sted = typeof lokasjon === 'string' ? lokasjon.trim().toLowerCase() : '';
      const ord = typeof ferdighet === 'string' ? ferdighet.trim() : '';

      const alle = konsulenter
        .filter((k) => (!ønsketIder || ønsketIder.has(k.id)) && (!sted || k.lokasjon.toLowerCase().includes(sted)) && (!grad || k.grad >= grad))
        .map((k) => ({ k, f: ord ? finnFerdighet(k, ord, min_niva) : null }))
        .filter(({ f }) => !ord || f)
        .map(({ k, f }) => ({
          id: k.id, navn: k.navn, grad: k.grad, rolle: k.rolle, lokasjon: k.lokasjon,
          ...(f ? { ferdighet: f.ferdighet, nivå: f.nivå } : {}),
          ...ledighet(k.id),
        }))
        .sort((a, b) => (a.ledig_fra ?? '9').localeCompare(b.ledig_fra ?? '9') || b.ledig_prosent - a.ledig_prosent || a.navn.localeCompare(b.navn));

      if (!alle.length) return 'Ingen konsulenter matcher avgrensningen. Prøv et bredere filter.';
      const rader = alle.slice(0, maks_treff);

      const grupper = new Map();
      for (const r of rader) {
        const nøkkel = !r.ledig_fra ? 'ukjent' : r.ledig_fra <= start ? 'ledig nå' : r.ledig_fra > slutt ? 'etter perioden' : r.ledig_fra.slice(0, 7);
        if (!grupper.has(nøkkel)) grupper.set(nøkkel, []);
        grupper.get(nøkkel).push(r);
      }
      return {
        periode: { fra: start, til: slutt },
        antall: alle.length,
        viser: rader.length,
        grupper: [...grupper].map(([periode, konsulenter]) => ({ periode, antall: konsulenter.length, konsulenter })),
        tegning: tegnTidslinje(rader, start, slutt),
      };
    },
  },
  {
    definisjon: {
      name: 'sett_sammen_team',
      description: `Setter sammen et helt team når behovet er større enn én person. Beskriv rollene du trenger, hver med ferdighetene
rollen krever, så finner verktøyet de beste kandidatene per rolle og foreslår én person per rolle uten at noen brukes to ganger.
Kandidater rangeres etter hvor mange av rollens ferdigheter de dekker, om de er ledige til ønsket start, om de er helt ledige, lokasjon (hvis oppgitt), nivå og grad.
Rollene med færrest kandidater får velge først, så ingen sjelden kompetanse blir brukt opp av en annen rolle.
Returnerer forslaget (medlemmer med rolle, ferdighetsnivåer og ledighet), «felles_start» (første dato hele teamet kan starte),
advarsler (delvis ledige, forsinkede, annen by, ferdigheter som mangler) og alternativene per rolle, så du kan bytte.
Verktøyet ser bare på kompetanseprofil og tilgjengelighet. Hent CV og prosjekthistorikk for de foreslåtte før du anbefaler teamet.`,
      input_schema: {
        type: 'object',
        properties: {
          roller: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            description: 'Rollene teamet trenger, f.eks. arkitekt, backendutvikler, tester.',
            items: {
              type: 'object',
              properties: {
                rolle: { type: 'string', description: 'Navn på rollen i teamet, f.eks. «Skyarkitekt».' },
                ferdigheter: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Ferdigheter rollen krever, f.eks. ["Azure", "Terraform"].' },
                min_niva: { type: 'integer', minimum: 1, maximum: 5, description: 'Laveste nivå som teller for ferdighetene. Standard er 3.' },
                min_grad: { type: 'string', enum: GRADER, description: 'Laveste grad for rollen, f.eks. "D" for en teknisk leder.' },
              },
              required: ['rolle', 'ferdigheter'],
            },
          },
          fra: { type: 'string', description: 'Ønsket startdato (ÅÅÅÅ-MM-DD). Standard er i dag.' },
          lokasjon: { type: 'string', description: 'Foretrukket kontor. Kandidater fra andre byer tas med, men rangeres lavere og gir en advarsel.' },
          maks_per_rolle: { type: 'integer', minimum: 1, maximum: 10, description: 'Hvor mange alternativer per rolle du vil se. Standard er 3.' },
        },
        required: ['roller'],
      },
    },
    kjør: async ({ roller, fra, lokasjon, maks_per_rolle = 3 }) => {
      if (!Array.isArray(roller) || !roller.length) {
        throw new Error('Mangler «roller». Oppgi minst én rolle med ferdigheter, f.eks. {"roller": [{"rolle": "Backend", "ferdigheter": ["Java"]}]}.');
      }
      if (fra != null && !erDato(fra)) throw new Error(`Ugyldig «fra»: ${fra}. Bruk ÅÅÅÅ-MM-DD.`);
      const start = fra ?? idag();
      const sted = typeof lokasjon === 'string' ? lokasjon.trim().toLowerCase() : '';

      const vurderte = roller.map((r, i) => {
        const navn = typeof r.rolle === 'string' && r.rolle.trim() ? r.rolle.trim() : `Rolle ${i + 1}`;
        const ferdigheter = (Array.isArray(r.ferdigheter) ? r.ferdigheter : []).map((f) => String(f).trim()).filter(Boolean);
        if (!ferdigheter.length) throw new Error(`Rollen «${navn}» mangler ferdigheter. Oppgi minst én, f.eks. ["React"].`);
        const minNivå = r.min_niva ?? 3;
        const minGrad = renGrad(r.min_grad);
        if (r.min_grad != null && !GRADER.includes(minGrad)) throw new Error(`Ugyldig min_grad «${r.min_grad}» for «${navn}». Bruk A–E.`);

        const kandidater = konsulenter
          .filter((k) => !minGrad || k.grad >= minGrad)
          .map((k) => {
            const dekker = ferdigheter.map((f) => ({ søkt: f, funnet: finnFerdighet(k, f, minNivå) }));
            const treff = dekker.filter((d) => d.funnet);
            if (!treff.length) return null;
            const t = ledighet(k.id);
            return {
              id: k.id, navn: k.navn, grad: k.grad, rolle_i_profilen: k.rolle, lokasjon: k.lokasjon,
              dekker: treff.map((d) => ({ ferdighet: d.funnet.ferdighet, nivå: d.funnet.nivå })),
              mangler: dekker.filter((d) => !d.funnet).map((d) => d.søkt),
              ...t,
              _poeng: [
                treff.length,
                t.ledig_fra && t.ledig_fra <= start ? 1 : 0,
                t.ledig_prosent >= 100 ? 1 : 0,
                !sted || k.lokasjon.toLowerCase().includes(sted) ? 1 : 0,
                treff.reduce((s, d) => s + d.funnet.nivå, 0),
                GRADER.indexOf(k.grad),
              ],
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            for (let j = 0; j < a._poeng.length; j++) if (a._poeng[j] !== b._poeng[j]) return b._poeng[j] - a._poeng[j];
            return (a.ledig_fra ?? '9').localeCompare(b.ledig_fra ?? '9');
          });
        return { rekkefølge: i, rolle: navn, ferdigheter, min_niva: minNivå, min_grad: minGrad || undefined, kandidater };
      });

      // Grådig tildeling: rollene med færrest kandidater velger først.
      const brukt = new Set();
      const valgt = new Map();
      for (const r of [...vurderte].sort((a, b) => a.kandidater.length - b.kandidater.length || a.rekkefølge - b.rekkefølge)) {
        const k = r.kandidater.find((c) => !brukt.has(c.id));
        if (k) { brukt.add(k.id); valgt.set(r.rolle, k); }
      }

      const rens = ({ _poeng, ...k }) => k;
      const advarsler = [];
      const medlemmer = [];
      for (const r of vurderte) {
        const k = valgt.get(r.rolle);
        if (!k) continue;
        medlemmer.push({ rolle: r.rolle, ...rens(k) });
        if (k.ledig_fra == null) advarsler.push(`${k.navn} (${r.rolle}) mangler tilgjengelighetsdata.`);
        else if (k.ledig_fra > start) advarsler.push(`${k.navn} (${r.rolle}) er først ledig ${k.ledig_fra}, ${dagerMellom(start, k.ledig_fra)} dager etter ønsket start.`);
        if (k.ledig_prosent != null && k.ledig_prosent < 100) advarsler.push(`${k.navn} (${r.rolle}) er bare ${k.ledig_prosent} % ledig.`);
        if (k.kommentar) advarsler.push(`${k.navn} (${r.rolle}): ${k.kommentar}`);
        if (sted && !k.lokasjon.toLowerCase().includes(sted)) advarsler.push(`${k.navn} (${r.rolle}) sitter i ${k.lokasjon}, ikke ${lokasjon}.`);
        if (k.mangler.length) advarsler.push(`${k.navn} (${r.rolle}) har ikke ${k.mangler.join(', ')} på nivå ${r.min_niva} eller høyere i profilen.`);
      }
      const uten = vurderte.filter((r) => !valgt.has(r.rolle)).map((r) => r.rolle);
      for (const rolle of uten) advarsler.push(`Fant ingen ledig kandidat til «${rolle}». Prøv lavere nivå eller andre ferdigheter.`);

      const datoer = medlemmer.map((m) => m.ledig_fra).filter(Boolean);
      const felles_start = datoer.length ? [start, ...datoer].sort().at(-1) : null;

      return {
        ønsket_start: start,
        forslag: { medlemmer, felles_start, advarsler },
        roller_uten_kandidat: uten,
        alternativer_per_rolle: vurderte.map((r) => ({
          rolle: r.rolle, ferdigheter: r.ferdigheter, min_niva: r.min_niva, min_grad: r.min_grad,
          antall_kandidater: r.kandidater.length,
          kandidater: r.kandidater.filter((c) => c.id !== valgt.get(r.rolle)?.id).slice(0, maks_per_rolle).map(rens),
        })),
      };
    },
  },
];
