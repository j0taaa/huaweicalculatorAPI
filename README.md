# Huawei Calculator API Explorer

This repository now contains a Bun + Next.js (TypeScript + Tailwind) UI that reads `postmanLog.json`, explains captured Huawei Cloud calculator endpoints, and replays them server-side for testing.

## What is in `postmanLog.json`

The log contains 5 endpoints from `portal-intl.huaweicloud.com`:

1. `Get price` (`POST /api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource`)
2. `Get all carts` (`GET /api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/share/list`)
3. `Create cart` (`POST /api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/share/add`)
4. `Get product options and info` (`GET /api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/productInfo`)
5. `Edit cart` (`POST /api/calculator/rest/cbc/portalcalculatornodeservice/v4/api/share/update`)

## Local run

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Test commands

```bash
# lint and build
bun run lint
bun run build

# replay all captured requests directly (server-to-server)
bun run test:replay

# replay without captured auth headers (informational)
bun run test:replay:noauth
```

To test the app routes while the app is running:

```bash
bun run test:api
```

## Docker

Build and run:

```bash
docker build -t huaweicalculatorapi:latest .
docker run --rm -p 3000:3000 huaweicalculatorapi:latest
```

## UI behavior

- Loads endpoint templates from `/api/templates` (masked sensitive headers in UI).
- Replays selected endpoint via `/api/replay`.
- Supports overrides for URL, body, CSRF, and cookie.
- Includes one-click smoke test for all 5 endpoints.
