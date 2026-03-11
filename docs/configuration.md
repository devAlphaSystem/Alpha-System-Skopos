# Configuration Reference

All configuration is read from environment variables at startup. Copy `.env.example` to `.env` before starting the server.

---

## Quick Reference

| Variable | Required | Default | Category |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | Server |
| `NODE_ENV` | No | — | Server |
| `LOG_LEVEL` | No | `info` / `debug` | Server |
| `APP_URL` | No | — | Server |
| `POCKETBASE_MODE` | No | `external` | Database |
| `POCKETBASE_URL` | Required in `external` mode | `http://127.0.0.1:8090` | Database |
| `POCKETBASE_ADMIN_EMAIL` | **Required** | — | Database |
| `POCKETBASE_ADMIN_PASSWORD` | **Required** | — | Database |
| `POCKETBASE_VERSION` | No | latest | Database |
| `POCKETBASE_PORT` | No | random 8090–8190 | Database |
| `POCKETBASE_DATA_DIR` | No | `./data/pocketbase` | Database |
| `ENCRYPTION_KEY` | **Required** | — | Security |
| `DATA_RETENTION_DAYS` | No | `180` | Data |

---

## Server

### `PORT`
- **Type:** integer
- **Default:** `3000`
- **Description:** TCP port the Express HTTP server listens on.
- **Example:** `PORT=8080`

### `NODE_ENV`
- **Type:** string
- **Default:** — (unset)
- **Description:** Runtime environment. When set to `development`, the logger defaults to `debug` level. Has no other effect currently — does not toggle Express debug mode.
- **Example:** `NODE_ENV=production`

### `LOG_LEVEL`
- **Type:** string (`error` | `warn` | `info` | `debug` | `verbose` | `silly`)
- **Default:** `debug` when `NODE_ENV=development`, otherwise `info`
- **Description:** Controls the minimum severity of log output. Set to `error` or `warn` in production to reduce log volume. Logs are written to the console (coloured) and to `logs/skopos-YYYY-MM-DD.log` (JSON, daily rotating, 14-day retention, 20 MB max per file).
- **Example:** `LOG_LEVEL=warn`

### `APP_URL`
- **Type:** string (URL)
- **Default:** — (unset)
- **Description:** Public-facing base URL of the dashboard (without trailing slash). Used in notification email links to link back to the dashboard. If unset, email links will not include a domain.
- **Example:** `APP_URL=https://skopos.example.com`

---

## PocketBase

### `POCKETBASE_MODE`
- **Type:** string (`external` | `embedded`)
- **Default:** `external`
- **Description:** Controls who manages the PocketBase process.
  - `external`: Skopos connects to a separately running PocketBase instance. `POCKETBASE_URL` is required.
  - `embedded`: Skopos downloads the PocketBase binary and manages its lifecycle as a child process. `POCKETBASE_URL` is ignored; the URL is determined dynamically.
- **Example:** `POCKETBASE_MODE=embedded`

### `POCKETBASE_URL`
- **Type:** string (URL)
- **Default:** `http://127.0.0.1:8090`
- **Required:** Yes, when `POCKETBASE_MODE=external`
- **Description:** Internal URL that Skopos uses to communicate with PocketBase. Must be reachable from the Node.js process. Not required to be publicly accessible.
- **Example:** `POCKETBASE_URL=http://127.0.0.1:8090`

### `POCKETBASE_ADMIN_EMAIL`
- **Type:** string
- **Required:** Yes
- **Description:** Email address of the PocketBase superuser account. Skopos authenticates as this account for all server-side database operations. In embedded mode, this account is created automatically on first boot.
- **Example:** `POCKETBASE_ADMIN_EMAIL=admin@example.com`

### `POCKETBASE_ADMIN_PASSWORD`
- **Type:** string
- **Required:** Yes
- **Description:** Password for the PocketBase superuser account. Minimum 10 characters (PocketBase requirement).
- **Example:** `POCKETBASE_ADMIN_PASSWORD=changeme1234`

### `POCKETBASE_VERSION`
- **Type:** string (semver)
- **Default:** latest available release
- **Applies to:** Embedded mode only
- **Description:** Pin a specific PocketBase version. If unset, `pb-embedded.js` fetches and uses the latest GitHub release. The downloaded binary is cached in `POCKETBASE_DATA_DIR`.
- **Example:** `POCKETBASE_VERSION=0.26.8`

### `POCKETBASE_PORT`
- **Type:** integer
- **Default:** Auto-selected random port between 8090 and 8190; persisted to disk across restarts
- **Applies to:** Embedded mode only
- **Description:** Fix the port used by the embedded PocketBase server. If unset, the port is selected randomly on first boot and stored in a `.port` file inside `POCKETBASE_DATA_DIR`. This ensures the same port is reused across server restarts without requiring manual configuration.
- **Example:** `POCKETBASE_PORT=8090`

### `POCKETBASE_DATA_DIR`
- **Type:** string (path)
- **Default:** `./data/pocketbase`
- **Applies to:** Embedded mode only
- **Description:** Directory where the PocketBase binary, SQLite data files, and migration files are stored. Must be writable by the Node.js process.
- **Example:** `POCKETBASE_DATA_DIR=/var/lib/skopos/pocketbase`

---

## Security

### `ENCRYPTION_KEY`
- **Type:** string (64 hexadecimal characters = 32 bytes)
- **Required:** Yes
- **Description:** Master key used to encrypt and decrypt third-party API keys stored in PocketBase. Must be exactly 64 hex characters. Each encryption operation derives a unique subkey using PBKDF2 + random salt, so the master key is never used directly as the cipher key.

  **Generate a key:**
  ```sh
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

  **⚠ Never commit this value to version control.**  
  **⚠ Keep a secure backup — lost keys cannot decrypt existing stored API keys.**

- **Example:** `ENCRYPTION_KEY=a1b2c3d4e5f6...` (64 hex chars)

---

## Data Management

### `DATA_RETENTION_DAYS`
- **Type:** integer
- **Default:** `180`
- **Description:** Global maximum age in days for raw `sessions` and `events` records. Records older than this are deleted during the daily data pruning cron job (runs at 03:00). This is separate from per-website retention configured in the dashboard settings; the global retention acts as a hard ceiling.

  Set to a higher value to retain more history (requires more storage). Set to `0` to disable global pruning (per-website retention still applies).
- **Example:** `DATA_RETENTION_DAYS=365`

---

## Configuration Files

### `nodemon.json`

Controls the Nodemon development watcher. Change `watch` paths or add `ignore` patterns here. Not used in production.

```json
{
  "watch": ["server.js", "src/", "views/", "public/"],
  "ext": "js,ejs,json,css",
  "exec": "node server.js"
}
```

### `db_schema.json`

Machine-generated PocketBase collection schema derived from the live database using the `pb-embedded.js build-schema` command. Used during setup to provision PocketBase collections. Do not edit manually — make schema changes via the PocketBase Admin UI, then regenerate with:

```sh
node src/lib/pb-embedded.js build-schema
```

### `data/pocketbase/pb_migrations/`

PocketBase JS migration files. Each file is named with a Unix timestamp prefix and creates one collection. These are applied automatically by PocketBase on startup in embedded mode, or can be applied manually via the Admin UI in external mode.
