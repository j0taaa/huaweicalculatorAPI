import { loadTemplates, replayRequest } from "../lib/postman";

const withoutAuth = process.argv.includes("--without-auth");
const allowNon2xx = process.argv.includes("--allow-non-2xx");
const sessionCookie = process.env.HWC_COOKIE;
const sessionCsrf = process.env.HWC_CSRF;

const AUTH_REQUIRED_IDS = new Set([
  "get-all-carts",
  "create-cart",
  "edit-cart",
]);

async function main() {
  const templates = loadTemplates();
  if (!templates.length) {
    console.error("No templates found in postmanLog.json");
    process.exit(1);
  }

  let failures = 0;
  for (const endpoint of templates) {
    const requiresSession = AUTH_REQUIRED_IDS.has(endpoint.id);
    const hasManualSession = Boolean(sessionCookie);

    if (requiresSession && withoutAuth) {
      console.log(`SKIP ${endpoint.name}: requires session`);
      continue;
    }

    if (requiresSession && !hasManualSession && !allowNon2xx) {
      console.log(`SKIP ${endpoint.name}: set HWC_COOKIE to test authenticated cart APIs`);
      continue;
    }

    try {
      const result = await replayRequest({
        id: endpoint.id,
        useCapturedAuth: !withoutAuth,
        cookie: sessionCookie,
        csrf: sessionCsrf,
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
