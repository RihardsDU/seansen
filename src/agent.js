// Agent-løkken. Hele «agent-greia» er dette: spør modellen, kjør verktøyene
// den ber om, send resultatene tilbake, gjenta til den er ferdig.
import Anthropic from '@anthropic-ai/sdk';

const MODELL = process.env.MODELL ?? 'claude-sonnet-5-5';

// Stopper en agent som går i ring før den brenner opp kostnadstaket.
const MAX_ITERASJONER = Number(process.env.MAX_ITERASJONER ?? 10);

const klient = new Anthropic();

const grå = (t) => `\x1b[90m${t}\x1b[0m`;
const oransje = (t) => `\x1b[38;5;208m${t}\x1b[0m`;
const grønn = (t) => `\x1b[32m${t}\x1b[0m`;

// `på` er valgfritt (brukes av webserveren): { tekst, verktøy, resultat }.
// Uten `på` skrives alt til terminalen. Et verktøy med `avslutt: true` er en
// leveranse: kjøringen stopper når modellen kaller det, og input returneres
// som `utfall` sammen med `id` (tool_use-id) og `meldinger` (samtalen så
// langt), så den som kaller kan svare på verktøykallet og kjøre videre.
export async function kjørAgent({ system, oppgave, meldinger, verktøy, på }) {
  // Bare verktøy med en kjør-funksjon sendes til modellen. Stubbene i
  // verktoy.js blir med av seg selv når dere implementerer dem.
  const aktive = verktøy.filter((v) => v.kjør);
  const etterNavn = new Map(aktive.map((v) => [v.definisjon.name, v]));

  const messages = meldinger ? [...meldinger] : [{ role: 'user', content: oppgave }];

  for (let i = 1; i <= MAX_ITERASJONER; i++) {
    const svar = await klient.messages.create({
      model: MODELL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system,
      tools: aktive.map((v) => v.definisjon),
      messages,
    });

    messages.push({ role: 'assistant', content: svar.content });

    for (const blokk of svar.content) {
      if (blokk.type === 'text' && blokk.text.trim()) {
        if (på) på.tekst?.(blokk.text);
        else console.log(svar.stop_reason === 'tool_use' ? grå(blokk.text) : blokk.text);
      }
    }

    if (svar.stop_reason === 'end_turn') return svar;
    if (svar.stop_reason === 'refusal') {
      if (på) throw new Error(`Modellen avslo (${svar.stop_details?.category ?? 'ukjent grunn'}).`);
      console.log(oransje(`\n✖ Modellen avslo (${svar.stop_details?.category ?? 'ukjent grunn'}).`));
      return svar;
    }
    if (svar.stop_reason === 'max_tokens') {
      if (på) throw new Error('Svaret ble kuttet (max_tokens).');
      console.log(oransje('\n✖ Svaret ble kuttet (max_tokens).'));
      return svar;
    }

    // Modellen kan be om flere verktøy samtidig. Alle resultatene må tilbake
    // i én og samme melding.
    const kall = svar.content.filter((b) => b.type === 'tool_use');
    const resultater = [];
    for (const k of kall) {
      const v = etterNavn.get(k.name);
      if (v?.avslutt) {
        på?.verktøy?.(k.name, k.input);
        return { utfall: k.input, verktøy: k.name, id: k.id, meldinger: messages };
      }
      if (på) på.verktøy?.(k.name, k.input);
      else console.log(oransje(`→ ${k.name}`) + grå(` ${JSON.stringify(k.input)}`));
      const r = await kjørVerktøy(etterNavn, k, !!på);
      på?.resultat?.(k.name, r);
      resultater.push(r);
    }
    messages.push({ role: 'user', content: resultater });
  }

  if (på) throw new Error(`Stoppet etter ${MAX_ITERASJONER} runder (MAX_ITERASJONER).`);
  console.log(oransje(`\n✖ Stoppet etter ${MAX_ITERASJONER} runder (MAX_ITERASJONER).`));
}

async function kjørVerktøy(etterNavn, kall, stille) {
  const logg = stille ? () => {} : console.log;
  const v = etterNavn.get(kall.name);
  if (!v) {
    return feil(kall, `Ukjent verktøy «${kall.name}». Gyldige: ${[...etterNavn.keys()].join(', ')}`, stille);
  }
  try {
    const resultat = await v.kjør(kall.input);
    const tekst = typeof resultat === 'string' ? resultat : JSON.stringify(resultat, null, 2);
    logg(grønn(`  ✓ ${tekst.length} tegn tilbake`));
    return { type: 'tool_result', tool_use_id: kall.id, content: tekst };
  } catch (e) {
    return feil(kall, e.message, stille);
  }
}

function feil(kall, melding, stille) {
  if (!stille) console.log(oransje(`  ✖ ${melding}`));
  return { type: 'tool_result', tool_use_id: kall.id, content: melding, is_error: true };
}
