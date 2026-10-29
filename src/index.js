// Startpunktet: npm start -- "spørsmålet ditt"
import './env.js'; // må ligge først
import readline from 'node:readline/promises';
import { kjørAgent } from './agent.js';
import { system, eksempelOppgave, verktøy, oppfølging, regelOppfølging, regelIngenOppfølging } from './verktoy.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Mangler ANTHROPIC_API_KEY. Kopier .env.example til .env og lim inn nøkkelen.');
  process.exit(1);
}

const grå = (t) => `\x1b[90m${t}\x1b[0m`;
const lilla = (t) => `\x1b[38;5;141m${t}\x1b[0m`;

// Oppfølgingsspørsmål krever at noen sitter ved tastaturet. Kjøres agenten i
// et script eller en pipe, får modellen beskjed om å klare seg uten.
const interaktiv = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const MAKS_SPØRSMÅL = 2;

const oppgave = process.argv.slice(2).join(' ') || eksempelOppgave;
console.log(`\n🎃 ${oppgave}\n`);

async function spørBrukeren({ sporsmal, forslag = [] }) {
  console.log(`\n🦇 ${lilla(sporsmal)}`);
  forslag.forEach((f, i) => console.log(grå(`   ${i + 1}) ${f}`)));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const svar = (await rl.question(grå(forslag.length ? '   Svar (tall eller egen tekst): ' : '   Svar: '))).trim();
    const n = Number(svar);
    return (Number.isInteger(n) && forslag[n - 1]) || svar;
  } finally {
    rl.close();
  }
}

let meldinger = [{ role: 'user', content: oppgave }];
for (let spurt = 0; ; spurt++) {
  const kanSpørre = interaktiv && spurt < MAKS_SPØRSMÅL;
  const r = await kjørAgent({
    system: `${system}\n${kanSpørre ? regelOppfølging : regelIngenOppfølging}`,
    meldinger,
    verktøy: kanSpørre ? [...verktøy, oppfølging] : verktøy,
  });
  if (r?.verktøy !== 'still_oppfolgingssporsmal') break;

  const svar = await spørBrukeren(r.utfall);
  console.log();
  meldinger = [
    ...r.meldinger,
    {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: r.id,
        content: svar || 'Brukeren svarte ikke. Gjør ditt beste med det du har, og nevn antakelsene dine.',
      }],
    },
  ];
}
