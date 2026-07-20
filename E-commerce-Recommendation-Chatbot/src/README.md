# Node backend/data pipeline layout

- `server/`: HTTP API entrypoint.
- `services/`: auth/admin request handlers and shared service logic.
- `config/`: environment-backed configuration such as MongoDB.
- `storage/`: local detail-file persistence helpers.
- `cellphones/`: CellphoneS-specific parsers, labelers, and recency rules.
- `scrapers/`: crawlers that fetch CellphoneS pages/sitemaps.
- `jobs/`: one-off or batch data maintenance jobs.
- `tools/`: diagnostics and inspection CLIs.
- `utils/`: small shared utilities.

Use the root `package.json` scripts instead of calling files directly where possible.
