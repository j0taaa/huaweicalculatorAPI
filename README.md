# Huawei Calculator API Explorer

This repository now contains a Bun + Next.js (TypeScript + Tailwind) UI that reads `postmanLog.json`, turns the captured Huawei Cloud calculator calls into task-focused screens, and replays them server-side.

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

# replay public endpoints directly
bun run test:replay

# replay without auth headers (informational)
bun run test:replay:noauth
```

To test the app routes while the app is running:

```bash
bun run test:api
```

To test cart APIs with a fresh session:

```bash
HWC_COOKIE='your-cookie' HWC_CSRF='your-csrf' bun run test:replay
HWC_COOKIE='your-cookie' HWC_CSRF='your-csrf' bun run test:api
```

## Docker

Build and run:

```bash
docker build -t huaweicalculatorapi:latest .
docker run --rm -p 3000:3000 huaweicalculatorapi:latest
```

## UI behavior

- Shared cookie/CSRF session panel in the corner, applied to every action.
- Create cart form with a single name field.
- Cart list browser with selectable cart keys.
- "Write sample config" action to push the captured ECS draft into a chosen cart.
- Price estimator and product flavor browser with simple inputs instead of raw JSON.
