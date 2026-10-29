# Seansen 🔮

![Megakart over oppgaven](kart.jpg)

Bygg en agent som svarer på «hvem kan ta denne jobben?» ved å lete i kompetanse-, tilgjengelighets- og CV-data for 80 oppdiktede konsulenter.

## Kom i gang

```bash
npm install
cp .env.example .env        # lim inn API-nøkkelen
npm start                   # kjører eksempelbehovet
npm start -- "Vi trenger en React-utvikler i Bergen fra desember"
```

Krever Node 20.12 eller nyere.

## Webgrensesnitt (Halloween-utgaven)

```bash
npm run web                 # http://localhost:3000, krever .env med API-nøkkel
DEMO=1 npm run web          # scriptet svar uten API-nøkkel, for å se designet
```

Mørk, grøssende side med séancelogg (verktøykallene live), rangerte «gravstein»-kort med begrunnelse og hva som mangler, teamforslag, tidslinjen «Hvem våkner når?» og en fane med hele flokkens kapasitet. Agenten stiller oppfølgingsspørsmål når behovet er for vagt. Koden ligger i `src/server.js` og `web/`.

**Grøss.** Siden har lyd og skremsler, begge med bryter oppe til høyre (valget huskes i nettleseren):

- Lyden er syntetisert i nettleseren med Web Audio (`web/lyd.js`), ingen lydfiler. Vind og dur i bakgrunnen, hjerteslag som øker mens agenten jobber, hvisking på tanker, klikk på verktøykall, lyn, torden og kirkeklokke når svaret kommer, ond latter når ingen er perfekt match. Nettleseren slipper lyden løs ved første trykk på siden.
- Skremslene (`web/skrekk.js`): hodeskallen hopper fram tilfeldig etter svar (aldri det første, og minst 90 sekunder mellom hver gang), når du har sittet stille i ett minutt, eller når du skriver «bø» i feltet. Øyne åpner seg i tåka innimellom. Alt er av når systemet ber om redusert bevegelse.
- Agenten svarer som «Mediet» (se `webSystem` i `src/server.js`): grøsserstil oppå nøyaktige fakta, en gravskrift per kandidat og en avsluttende spådom.

## Hva ligger her

| Fil | Hva |
|---|---|
| `src/agent.js` | Agentløkka: spør modellen, kjør verktøy, send svar tilbake, gjenta. |
| `src/verktoy.js` | Systemprompt, eksempelbehov og verktøyene. Her jobber dere. |
| `src/index.js` | Startpunkt for `npm start`. |
| `data/konsulenter.json` | Profiler: grad, rolle, avdeling, lokasjon, kompetanse (nivå 1–5), sertifiseringer, språk. |
| `data/tilgjengelighet.json` | Nåværende oppdrag, ledig fra-dato og ledig prosent per konsulent. |
| `data/prosjekthistorikk.json` | Tidligere prosjekter: kunde, bransje, år, rolle, teknologier. |
| `data/cv/<id>.md` | Korte CV-sammendrag. Bare rundt 20 har CV. |

Kun `sok_kompetanse` er implementert. `sjekk_tilgjengelighet`, `hent_cv` og `finn_prosjekthistorikk` er stubber med ferdig beskrivelse. All data er syntetisk, og den er ikke helt ryddig: CV og profil sier ikke alltid det samme.

**Grad:** Vi antar at A er graduate/junior og E er mest senior (A, B, C, D, E i stigende ansiennitet). Stemmer ikke det med deres virkelighet, rett det i `system` i `src/verktoy.js` og i verktøybeskrivelsen.

## Legg til et verktøy

Finn stubben i `src/verktoy.js` og bytt ut `kjør: null` med en funksjon. Den sendes til modellen fra neste kjøring.

```js
const tilgjengelighet = lesJson('tilgjengelighet.json');

// i sjekk_tilgjengelighet:
kjør: async ({ ider }) => {
  if (!ider?.length) throw new Error('Oppgi minst én id.');
  return tilgjengelighet.filter((t) => ider.includes(t.id));
},
```

Kaster funksjonen en feil, får modellen meldingen tilbake som et feilresultat og kan prøve på nytt. Beskrivelsen er det modellen leser for å forstå verktøyet, så skriv den som til en ny kollega.

## Hvis du ikke bruker JavaScript

Dataene er ren JSON og markdown. Ta med `data/`-mappa og bygg løkka i det språket dere vil. `src/agent.js` er rundt 80 linjer og viser hele mønsteret.

## Tips

- MVP er to verktøy og én løkke. `sok_kompetanse` og `sjekk_tilgjengelighet` holder til en god demo.
- Vis verktøykallene i demoen. Det er der publikum ser at agenten faktisk jobber.
- `MAX_ITERASJONER` i `.env` stopper en agent som går i ring (standard 10).
- `.env` committes aldri. Den står i `.gitignore`, la den bli der.

## Lagt til

- `sjekk_tilgjengelighet`: ledig fra-dato, prosent og nåværende oppdrag for en liste id-er. Ukjente id-er listes separat.
- `hent_cv`: henter CV-en som markdown. Id-en valideres, og mangler CV-en, får modellen beskjed om det.
- `finn_prosjekthistorikk`: tidligere prosjekter for én konsulent, nyeste først. Gir egen beskjed hvis historikk mangler.
- `sok_prosjekter`: søker i alles prosjekthistorikk på bransje og/eller teknologi. Gjør at behov som `npm start -- "Vi trenger noen med erfaring fra helsesektoren"` fungerer.
- `sett_sammen_team`: agenten foreslår et helt team, ikke bare én person. Modellen beskriver rollene med ferdigheter, og verktøyet finner de beste per rolle uten dobbeltbooking (rollene med færrest kandidater velger først), regner ut felles startdato og lister advarsler (delvis ledig, forsinket, annen by, ferdighet som mangler) og alternativer per rolle. Prøv `npm start -- "Sett sammen et team på tre til et dataplattform-prosjekt i Oslo fra desember"`.
- `tidslinje_kapasitet`: «Hvem blir ledig når?» Filtrer på ferdighet, lokasjon, grad eller id-er og få konsulentene gruppert per måned de blir ledige, pluss en tekst-tidslinje (én kolonne per uke) som agenten gjengir i svaret. Prøv `npm start -- "Hvem i Bergen blir ledig før jul?"`.
- Oppfølgingsspørsmål: er behovet for vagt til å søke på (f.eks. «vi trenger en utvikler»), kaller agenten `still_oppfolgingssporsmal` i stedet for å gjette. I terminalen stopper kjøringen, spørsmålet vises med nummererte forslag, du svarer (tall eller egen tekst), og agenten fortsetter med svaret ditt. Maks to spørsmål per kjøring. Kjøres agenten uten terminal (pipe, script), får modellen beskjed om å klare seg uten å spørre. Verktøyet er delt mellom terminal og web og ligger i `src/verktoy.js` som `oppfølging`.
- Systemprompt: henter CV og prosjekthistorikk for toppkandidatene, vet hvilken dato det er, og har regler for team, tidslinje og når det er lov å spørre (`regelOppfølging` / `regelIngenOppfølging`).
