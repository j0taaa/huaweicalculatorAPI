const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const sessionCookie = process.env.HWC_COOKIE;
const sessionCsrf = process.env.HWC_CSRF;

const AUTH_REQUIRED_IDS = new Set([
  "get-all-carts",
  "create-cart",
  "edit-cart",
]);

async function main() {
  const templatesResponse = await fetch(`${BASE_URL}/api/templates`, { cache: "no-store" });
  if (!templatesResponse.ok) {
    throw new Error(`Failed to load templates: ${templatesResponse.status}`);
  }

  const templatesData = (await templatesResponse.json()) as {
    templates: Array<{ id: string; name: string }>;
  };

  if (!templatesData.templates.length) {
    throw new Error("No templates returned by /api/templates");
  }

  for (const template of templatesData.templates) {
    const requiresSession = AUTH_REQUIRED_IDS.has(template.id);
    if (requiresSession && !sessionCookie) {
      console.log(`SKIP ${template.name}: set HWC_COOKIE to test authenticated cart APIs`);
      continue;
    }

    const replayResponse = await fetch(`${BASE_URL}/api/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: template.id,
        useCapturedAuth: true,
        cookie: sessionCookie,
        csrf: sessionCsrf,
      }),
    });

    if (!replayResponse.ok) {
      throw new Error(`Replay API failed for ${template.name}: ${replayResponse.status}`);
    }

    const replayData = (await replayResponse.json()) as {
      response: {
        status: number;
        ok: boolean;
      };
    };

    if (!replayData.response.ok) {
      throw new Error(`Remote endpoint failed for ${template.name}: ${replayData.response.status}`);
    }

    console.log(`PASS ${template.name}: ${replayData.response.status}`);
  }

  console.log("Local API smoke test complete");
}

void main();
