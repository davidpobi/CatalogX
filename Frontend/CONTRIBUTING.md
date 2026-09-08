# Contributing

Use Node.js 22 or newer, copy `.env.example` to `.env.local`, and run `npm install` followed by `npm run check`.

Keep domain contracts in `src/interfaces`, pure logic in `src/utils`, browser networking in `src/services`, and provider SDKs under `src/app/api`. Components must not call `fetch` or import server modules. Add tests for every operation-switch branch and behavior change.

Do not commit credentials, generated product imagery, provider outputs, benchmark traces, or customer data. Paid integration tests must remain opt-in.
