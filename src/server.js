// Webserveren: npm run web  →  http://localhost:3000
// Serverer web/ og kjører agenten for POST /api/spor, med fremdriften
// strømmet som server-sent events.
import './env.js'; // må ligge først
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { kjørAgent } from './agent.js';
import { system, eksempelOppgave, verktøy } from './verktoy.js';

const PORT = Number(process.env.PORT ?? 3000);
const ROT = path.join(import.meta.dirname, '..');
const WEB = path.join(ROT, 'web');
const lesJson = (fil) => JSON.parse(fs.readFileSync(path.join(ROT, 'data', fil), 'utf8'));

const konsulenter = lesJson('konsulenter.json');
const tilgjengelighet = lesJson('tilgjengelighet.json');
const etterId = new Map(konsulenter.map((k) => [k.id, k]));
const tilgEtterId = new Map(tilgjengelighet.map((t) => [t.id, t]));

const idsKort = {
  type: 'string',
  description: 'Konsulent-id, f.eks. "k007". Bare id-er du har sett i verktøyresultater.',
};

// Leveranse-verktøy: modellen avslutter ved å kalle ett av dem, så siden får
// strukturert data i stedet for tekst som må tolkes.
const leveranser = [
  {
    avslutt: true,
    kjør: async () => 'mottatt', // kjøres aldri, men agent.js sender bare verktøy med kjør
    definisjon: {
      name: 'lever_svar',
      description: `Leverer det ferdige svaret til brukeren. Kall denne når du har nok til å anbefale, og bare da.
Kandidatene skal stå i rangert rekkefølge, best først (2–6 stk). Skriv begrunnelsen kort og konkret på norsk:
nivå, erfaring fra CV/prosjekter, og når personen er ledig. Si fra i «mangler» hvis noe ikke stemmer med behovet
eller hvis CV og profil spriker. Er ingen en perfekt match, sett ingen_perfekt_match til true og forklar i oppsummeringen.
Foreslå også et team når behovet kan dekkes bedre av flere personer i samspill (f.eks. arkitekt + utvikler + tester).`,
      input_schema: {
        type: 'object',
        properties: {
          oppsummering: { type: 'string', description: 'Ett–to avsnitt: hvordan du tolket behovet og hva du fant.' },
          onsket_start: { type: 'string', description: 'Ønsket startdato (ÅÅÅÅ-MM-DD) hvis behovet nevner en, ellers utelat.' },
          ingen_perfekt_match: { type: 'boolean' },
          kandidater: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: idsKort,
                treff: { type: 'integer', minimum: 0, maximum: 100, description: 'Hvor godt personen dekker behovet, i prosent.' },
                begrunnelse: { type: 'string' },
                mangler: { type: 'string', description: 'Hva som ikke dekkes eller bør sjekkes. Nøkternt og konkret. Utelat hvis ingenting.' },
                gravskrift: { type: 'string', description: 'Én linje på maks 10 ord, som en innskrift på en gravstein om kandidaten. F.eks. «Her hviler en Terraform-mester. Våkner 1. november.»' },
              },
              required: ['id', 'treff', 'begrunnelse', 'gravskrift'],
            },
          },
          spaadom: { type: 'string', description: 'Én avsluttende setning i Mediets stemme: et varsel eller råd til brukeren om veien videre.' },
          team: {
            type: 'object',
            description: 'Valgfritt: et helt team som sammen dekker behovet.',
            properties: {
              navn: { type: 'string', description: 'Kort, passende teamnavn.' },
              begrunnelse: { type: 'string' },
              medlemmer: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: idsKort, rolle_i_teamet: { type: 'string' } },
                  required: ['id', 'rolle_i_teamet'],
                },
              },
            },
            required: ['begrunnelse', 'medlemmer'],
          },
        },
        required: ['oppsummering', 'kandidater', 'spaadom'],
      },
    },
  },
  {
    avslutt: true,
    kjør: async () => 'mottatt', // kjøres aldri, men agent.js sender bare verktøy med kjør
    definisjon: {
      name: 'still_oppfolgingssporsmal',
      description: `Stiller brukeren ett oppfølgingsspørsmål i stedet for å søke. Bruk den BARE når behovet er så vagt at søk ville
vært gjetting (f.eks. «vi trenger en utvikler» uten teknologi, rolle eller tidspunkt). Er det nok til å gjøre et fornuftig første søk,
søk heller, og nevn antakelsene dine i oppsummeringen.`,
      input_schema: {
        type: 'object',
        properties: {
          sporsmal: { type: 'string', description: 'Ett konkret spørsmål, på norsk.' },
          forslag: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Korte svaralternativer brukeren kan trykke på.' },
        },
        required: ['sporsmal'],
      },
    },
  },
];

const idag = () => new Date().toISOString().slice(0, 10);

const webSystem = () => `${system}

Tilleggsregler for webgrensesnittet (de overstyrer reglene over om å ikke spørre):
- I dag er ${idag()}. Tolk «fra november» o.l. ut fra den datoen.
- Du leverer svaret ved å kalle lever_svar. Skriv ikke svaret som vanlig tekst.
- Er behovet for vagt til å søke på (ingen teknologi, rolle eller fagområde), kall still_oppfolgingssporsmal i stedet.
- Foreslå et team når behovet gir mening som en gruppe, eller når brukeren ber om det.
- Sjekk tilgjengelighet for alle du vurderer, og hent CV for toppkandidatene.
- Tidligere meldinger i samtalen er kontekst: bygg videre på svarene brukeren har gitt.

Stemme og tone (det er Halloween):
- Du er Mediet: en séanceleder som kanaliserer konsulentenes ånder fra kompetansegraven. All tekst til brukeren skrives i en mørk,
  høytidelig og lett humoristisk grøsserstil med graver, ånder, hvisking, tåke, levende lys og måneskinn. Kandidatene «hviler»,
  «vekkes» og «stiger opp»; oppdrag er «bundet til» en kunde; ledig fra-dato er når de «våkner».
- Fakta er hellige. Navn, id-er, nivåer, grader, datoer, prosenter og kundenavn skal være nøyaktige og lette å finne i teksten.
  Metaforene legges oppå innholdet, de erstatter det aldri. Maks én skrekkmetafor per setning. «mangler» skrives nøkternt og konkret.
- Hver kandidat får en gravskrift: én kort, treffende linje som en gravsteinsinnskrift, maks 10 ord.
- Avslutt alltid med en spådom: én setning i Mediets stemme med et varsel eller råd til brukeren.
- Teamnavn skal være grøssende og passende, f.eks. «Skyvokterne» eller «Nattens arkitekter».
- Oppfølgingsspørsmål stilles som en hvisking fra den andre siden, men selve spørsmålet skal være lett å forstå.
- Korte tekster underveis, før verktøykall, er dramatiske utbrudd fra Mediet på én setning, f.eks. «Jeg kjenner to ferdigheter i tåka … la meg kalle på dem begge.»`;

const anrikKonsulent = (id) => {
  const k = etterId.get(id);
  if (!k) return null;
  const cvFil = path.join(ROT, 'data', 'cv', `${id}.md`);
  return {
    id, navn: k.navn, grad: k.grad, rolle: k.rolle, avdeling: k.avdeling, lokasjon: k.lokasjon,
    sertifiseringer: k.sertifiseringer, språk: k.språk,
    kompetanse: [...k.kompetanse].sort((a, b) => b.nivå - a.nivå),
    tilgjengelighet: tilgEtterId.get(id) ?? null,
    cv: fs.existsSync(cvFil) ? fs.readFileSync(cvFil, 'utf8') : null,
  };
};

const anrikSvar = (u) => ({
  ...u,
  kandidater: (u.kandidater ?? []).flatMap((c) => {
    const k = anrikKonsulent(c.id);
    return k ? [{ ...c, konsulent: k }] : [];
  }),
  team: u.team && {
    ...u.team,
    medlemmer: (u.team.medlemmer ?? []).flatMap((m) => {
      const k = anrikKonsulent(m.id);
      return k ? [{ ...m, konsulent: k }] : [];
    }),
  },
});

const kapasitet = () =>
  konsulenter.map((k) => ({
    id: k.id, navn: k.navn, grad: k.grad, rolle: k.rolle, lokasjon: k.lokasjon,
    topp: [...k.kompetanse].sort((a, b) => b.nivå - a.nivå).slice(0, 4).map((f) => f.ferdighet),
    tilgjengelighet: tilgEtterId.get(k.id) ?? null,
  }));

function lesBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (d) => {
      data += d;
      if (data.length > 200_000) { reject(new Error('For stor forespørsel')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const forhåndsvisning = (r) => {
  const t = typeof r.content === 'string' ? r.content : '';
  if (r.is_error) return t;
  try {
    const o = JSON.parse(t);
    if (o.antall_treff != null) return `${o.antall_treff} treff`;
    if (o.resultater) return `${o.resultater.length} tilgjengelighetsoppslag`;
    if (o.prosjekter) return `${o.prosjekter.length} prosjekter`;
  } catch { /* ikke JSON, f.eks. CV-tekst */ }
  return t.startsWith('#') ? 'CV funnet' : t.slice(0, 90);
};

// DEMO=1: scriptet kjøring med de ekte verktøyene, uten API-nøkkel.
async function demo(historikk, send) {
  const kjør = async (navn, input) => {
    send('verktoy', { navn, input });
    await new Promise((r) => setTimeout(r, Number(process.env.DEMO_MS ?? 500)));
    const v = verktøy.find((x) => x.definisjon.name === navn);
    const ut = await v.kjør(input);
    send('resultat', { navn, ok: true, kort: forhåndsvisning({ content: typeof ut === 'string' ? ut : JSON.stringify(ut) }) });
    return ut;
  };
  const tekst = historikk.map((h) => h.tekst).join(' ');
  if (tekst.split(/\s+/).length < 5) {
    send('sporsmal', { sporsmal: 'Tåka er for tett til å se noe … Hvilken teknologi eller rolle kaller dere på, og når skal sjelen våkne?', forslag: ['Backend i Java, fra januar', 'Dataingeniør, så fort som mulig', 'Frontend med React i Bergen'] });
    return;
  }
  send('tanke', { tekst: 'Jeg kjenner to ferdigheter i tåka, en dato og en minstegrad … la meg kalle på dem begge og se hvilke sjeler som svarer to ganger.' });
  const a = await kjør('sok_kompetanse', { ferdighet: 'Terraform', min_niva: 3 });
  const b = await kjør('sok_kompetanse', { ferdighet: 'Azure', min_niva: 3 });
  const felles = (a.treff ?? []).filter((x) => (b.treff ?? []).some((y) => y.id === x.id) && x.grad >= 'C').slice(0, 4);
  const ider = felles.map((x) => x.id);
  send('tanke', { tekst: `${felles.length} sjeler svarte på begge rop. Nå må jeg vite når de våkner.` });
  await kjør('sjekk_tilgjengelighet', { ider });
  await kjør('hent_cv', { id: ider[0] });
  const gravskrifter = ['Her hviler en skymester. Våkner når november kaller.', 'Bundet til Azure i live, bundet til Azure i døden.', 'Terraform i blodet, tåke i lungene.', 'Stiger opp litt senere enn de andre.'];
  send('svar', { svar: anrikSvar({
    oppsummering: `Lysene flakket, og tåka delte seg: jeg tolket ropet deres som Terraform og Azure på minst nivå 3, grad C eller høyere, med oppvåkning fra 1. november. ${felles.length} sjeler svarte på begge navn, og de ligger nå rangert foran dere. (Demo-modus: dette er et scriptet svar.)`,
    onsket_start: '2026-11-01',
    kandidater: felles.map((x, i) => ({ id: x.id, treff: 94 - i * 11, begrunnelse: `Har både Terraform og Azure på høyt nivå og grad ${x.grad}. Ånden er sterk, og profilen bekrefter det.`, mangler: i === 2 ? 'Ledig først etter ønsket start.' : undefined, gravskrift: gravskrifter[i] })),
    team: felles.length >= 3 ? { navn: 'Skyvokterne', begrunnelse: 'Sammen vokter de plattform, drift og leveranse fra graven til produksjon.', medlemmer: felles.slice(0, 3).map((x, i) => ({ id: x.id, rolle_i_teamet: ['Teknisk leder', 'Plattformingeniør', 'DevOps'][i] })) } : undefined,
    spaadom: 'Jeg ser en kalender i tåka: book den første sjelen før månen er full, ellers blir hun bundet til en annen kunde.',
  }) });
}

async function spor(req, res) {
  let body;
  try {
    body = JSON.parse(await lesBody(req));
  } catch {
    res.writeHead(400).end('Ugyldig JSON');
    return;
  }
  // Historikk er ren tekst: [{ rolle: 'bruker' | 'agent', tekst }]. Den siste er nytt behov/svar.
  const historikk = Array.isArray(body.historikk) ? body.historikk.slice(-12) : [];
  if (!historikk.length || historikk.at(-1).rolle !== 'bruker' || !String(historikk.at(-1).tekst ?? '').trim()) {
    res.writeHead(400).end('Mangler melding');
    return;
  }
  const meldinger = [];
  for (const h of historikk) {
    const rolle = h.rolle === 'bruker' ? 'user' : 'assistant';
    const tekst = String(h.tekst ?? '').slice(0, 4000);
    if (meldinger.at(-1)?.role === rolle) meldinger.at(-1).content += `\n${tekst}`;
    else meldinger.push({ role: rolle, content: tekst });
  }
  if (meldinger[0].role !== 'user') meldinger.shift();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  let ferdig = false;
  res.on('close', () => { ferdig = true; });

  try {
    if (process.env.DEMO === '1') {
      await demo(historikk, send);
      send('ferdig');
      res.end();
      return;
    }
    const r = await kjørAgent({
      system: webSystem(),
      meldinger,
      verktøy: [...verktøy, ...leveranser],
      på: {
        tekst: (tekst) => !ferdig && send('tanke', { tekst }),
        verktøy: (navn, input) => !ferdig && send('verktoy', { navn, input }),
        resultat: (navn, r) => !ferdig && send('resultat', { navn, ok: !r.is_error, kort: forhåndsvisning(r) }),
      },
    });
    if (r.utfall && r.verktøy === 'lever_svar') send('svar', { svar: anrikSvar(r.utfall) });
    else if (r.utfall) send('sporsmal', r.utfall);
    else send('svar', { svar: { oppsummering: r.content?.find?.((b) => b.type === 'text')?.text ?? 'Ingenting å vise.', kandidater: [] } });
  } catch (e) {
    console.error(e);
    send('feil', { melding: e.message });
  }
  send('ferdig');
  res.end();
}

const TYPER = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/spor') return spor(req, res);
    if (req.method === 'GET' && url.pathname === '/api/kapasitet') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ idag: idag(), konsulenter: kapasitet() }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/eksempel') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ eksempel: eksempelOppgave }));
      return;
    }
    if (req.method !== 'GET') return res.writeHead(405).end();
    const fil = path.normalize(path.join(WEB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!fil.startsWith(WEB + path.sep) || !fs.existsSync(fil) || !fs.statSync(fil).isFile()) {
      res.writeHead(404).end('Ikke funnet');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPER[path.extname(fil)] ?? 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  })
  .listen(PORT, () => {
    if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠ Mangler ANTHROPIC_API_KEY. Kopier .env.example til .env.');
    console.log(`🎃 Seansen åpner portene på http://localhost:${PORT}`);
  });
