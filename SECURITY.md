# Security

This is a **static** site. There is no server of ours that receives API keys.

## What we store

- **API keys** live in RAM only. Refreshing the tab discards them. They are not written to `localStorage`, cookies, IndexedDB, or game logs.
- **Provider URLs, extra non-auth headers, model configs, and seats** persist in `localStorage`. Auth-like extra headers (`Authorization`, `x-api-key`, `Cookie`, …) are stripped on save so they cannot linger after a refresh.
- Game logs live in IndexedDB on this origin. They include prompts and model replies, not keys.

Anyone with this origin in a browser (or a copy of its storage) can read persisted settings and logs. Treat this machine as the trust boundary.

## Reporting a vulnerability

Please use [GitHub Security Advisories](https://github.com/higginsrob/chess/security/advisories/new) rather than a public issue.

If the advisory form is unavailable, email the maintainer listed on the GitHub profile. Do not include live API keys in the report.
