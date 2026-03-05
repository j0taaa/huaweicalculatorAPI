import { loadTemplates, replayRequest } from "../lib/postman";

const withoutAuth = process.argv.includes("--without-auth");
const allowNon2xx = process.argv.includes("--allow-non-2xx");

async function main() {
  const templates = loadTemplates();
  if (!templates.length) {
    console.error("No templates found in postmanLog.json");
    process.exit(1);
  }

  let failures = 0;
  for (const endpoint of templates) {
    try {
      const result = await replayRequest({
        id: endpoint.id,
        useCapturedAuth: !withoutAuth,
      });

      const ok = result.response.ok;
      const line = `${endpoint.name}: ${result.response.status} (${result.response.durationMs} ms)`;
      if (!ok) {
        failures += 1;
        console.error(`FAIL ${line}`);
      } else {
        console.log(`PASS ${line}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`ERROR ${endpoint.name}:`, error);
    }
  }

  if (failures > 0 && !allowNon2xx) {
    console.error(`\n${failures} endpoint(s) failed`);
    process.exit(1);
  }

  console.log("\nReplay run complete");
}

void main();
