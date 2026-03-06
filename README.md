# Huawei Calculator API Explorer

This repository now contains a Bun + Next.js (TypeScript + Tailwind) calculator UI that reads `postmanLog.json`, lets users build ECS configurations, estimate pricing, and publish the staged calculator into a Huawei cart.

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
HWC_COOKIE='HWS_INTL_ID=your-token' bun run test:replay
HWC_COOKIE='HWS_INTL_ID=your-token' bun run test:api
```

## Docker

Build and run:

```bash
docker build -t huaweicalculatorapi:latest .
docker run --rm -p 3000:3000 huaweicalculatorapi:latest
```

## UI behavior

- Shared session panel in the corner, applied to every action.
- Accepts a full cookie string, `HWS_INTL_ID=...`, or only the `HWS_INTL_ID` value and auto-normalizes it.
- Left sidebar for cart creation, cart selection, and current draft contents.
- Browse and search ECS flavors collected from the product catalog API.
- Filter the flavor matrix by minimum vCPU and RAM, and sort it by base price.
- Configure region, quantity, hours, and system disk before pricing.
- Estimate ECS monthly price from the pricing API.
- Stage multiple products locally in a calculator cart.
- Publish the full staged calculator into the selected Huawei cart with the captured update API.
- Debug payloads stay hidden by default so the main calculator renders faster.
