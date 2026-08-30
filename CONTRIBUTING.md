# Contributing

## Setup

Node 22+ (`nvm use` if you have [nvm](https://github.com/nvm-sh/nvm)).

```bash
npm install
npm test
npm run dev
```

Open `https://localhost:5173/chess/`. The first visit shows a self-signed certificate warning — proceed so the page is a secure origin.

```bash
npm run build
npm run preview
```

## Pull requests

- Keep changes focused. Match the surrounding TypeScript style (strict, no unused locals).
- Add or update tests next to the code (`src/**/*.test.ts`). `npm test` runs in CI on every PR.
- Do not commit API keys, `.env` files, or 8K Poly Haven packs. Re-download 2K assets with `scripts/ingest-polyhaven.sh`.
- The GitHub Actions workflow on `main` tests, builds, and publishes `dist` to Pages.

## License

Code you contribute is MIT (see `LICENSE`). Do not add assets whose license is incompatible with that plus the third-party notices in the README (Poly Haven CC0, Stockfish GPL-3 in `public/stockfish`).
