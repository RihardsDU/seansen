// Må importeres FØRST i index.js: ES-importer evalueres i rekkefølge,
// så .env må være lastet før agent.js leser process.env.
try {
  process.loadEnvFile();
} catch {
  // Ingen .env — da må ANTHROPIC_API_KEY være satt i miljøet.
}
