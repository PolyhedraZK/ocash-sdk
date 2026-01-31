# OCash SDK Browser Demo

This demo runs the OCash SDK in the browser and connects wallets via wagmi + viem.

## Quick start

```bash
pnpm --filter @ocash/sdk build
pnpm --filter @ocash/sdk-browser-demo dev
```

## Notes

- The demo expects `assetsOverride` URLs to be accessible from the browser.
- Use the config editor in the UI to update chain/token settings.
