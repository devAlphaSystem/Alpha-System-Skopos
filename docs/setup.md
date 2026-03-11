# Setup & Installation Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18 | Uses native ESM (`type: "module"`) and native `fetch` |
| npm | ≥ 9 | Bundled with Node.js ≥ 18 |
| PocketBase | ≥ 0.26 | Embedded mode auto-downloads. External mode requires self-hosting. |

No build step is required. The project runs directly from source.

---

## Installation

```sh
# 1. Clone the repository
git clone https://github.com/devAlphaSystem/alpha-system-skopos.git
cd alpha-system-skopos

# 2. Install dependencies
npm install

# 3. Copy and edit environment variables
cp .env.example .env
```

---

## Environment Variables

Open `.env` in your editor and configure the following. All variables marked **required** must be set before starting the server.

### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | TCP port the Express server listens on |
| `NODE_ENV` | No | — | Set to `production` for production deployments |
| `LOG_LEVEL` | No | `info` (prod) / `debug` (dev) | Winston log level: `error`, `warn`, `info`, `debug` |
| `APP_URL` | No | — | Public-facing base URL (e.g. `https://skopos.example.com`). Used in email links. |

### PocketBase

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POCKETBASE_MODE` | No | `external` | `external` — you run PocketBase; `embedded` — Skopos manages it |
| `POCKETBASE_URL` | Required in `external` mode | `http://127.0.0.1:8090` | Internal URL Skopos uses to reach PocketBase |
| `POCKETBASE_ADMIN_EMAIL` | **Required** | — | PocketBase superuser email |
| `POCKETBASE_ADMIN_PASSWORD` | **Required** | — | PocketBase superuser password (min 10 chars) |
| `POCKETBASE_VERSION` | No | latest | Pin a version for embedded mode (e.g. `0.26.8`) |
| `POCKETBASE_PORT` | No | random 8090–8190 | Fixed port for embedded PocketBase. Auto-persisted if unset. |
| `POCKETBASE_DATA_DIR` | No | `./data/pocketbase` | Data directory for embedded mode |

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | **Required** | — | 64-character hex string (32 bytes) used to encrypt stored API keys with AES-256-GCM. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Data Retention

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATA_RETENTION_DAYS` | No | `180` | Global maximum age (days) for raw session and event records before automatic deletion |

---

## PocketBase Setup

Skopos requires PocketBase as its database. Choose one of the following modes.

### Option A — Embedded Mode (Recommended for single-server deployments)

Set `POCKETBASE_MODE=embedded` in `.env`. On first boot, Skopos will:

1. Download the PocketBase binary appropriate for your OS/architecture into `./data/pocketbase/`.
2. Start the binary as a child process on an available port (or `POCKETBASE_PORT` if set).
3. Create the superuser account using `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD`.
4. Apply the collection schema from `db_schema.json`.

No manual PocketBase configuration is required.

### Option B — External Mode

1. Download and run PocketBase from [pocketbase.io](https://pocketbase.io/docs/).
2. Start PocketBase: `./pocketbase serve --http="127.0.0.1:8090"`
3. Visit the PocketBase Admin UI (default: `http://127.0.0.1:8090/_/`), create a superuser account.
4. Apply the schema. Either:
   - Use `db_schema.json` with the [pb-embedded.js CLI](#schema-cli), or
   - Import `data/pocketbase/pb_migrations/` via the PocketBase Admin UI.
5. Set `POCKETBASE_MODE=external`, `POCKETBASE_URL=http://127.0.0.1:8090`, and your admin credentials in `.env`.

#### Schema CLI (optional helper)

```sh
# Apply db_schema.json to a running PocketBase (embedded or external)
node src/lib/pb-embedded.js apply-schema

# Verify health + schema + authentication
node src/lib/pb-embedded.js test
```

---

## Starting the Server

### Development (with hot reload)

```sh
npm run dev
```

Nodemon watches `server.js`, `src/`, `views/`, and `public/` and restarts on changes.

### Production

```sh
node server.js
```

For production deployments, run this under a process manager such as [PM2](https://pm2.keymetrics.io/):

```sh
pm2 start server.js --name skopos
pm2 save
pm2 startup
```

---

## First-Run Setup

1. Open `http://localhost:3000` (or your configured `PORT`).
2. You will be redirected to `/register`. Create the administrator account.
3. After login, you land on the overview page.
4. Click **Websites → Add Website**. Enter a name and domain.
5. Copy the **Tracking ID** shown on the website card.
6. Embed the tracking script on any site you want to monitor:

```html
<script
  src="https://cdn.alphasystem.dev/skopos/latest/skopos.min.js"
  data-site-id="YOUR_TRACKING_ID"
  data-host="https://your-skopos-domain.com"
  defer
></script>
```

Data will appear in the dashboard within seconds of the first page view.

---

## Reverse Proxy (Nginx Example)

```nginx
server {
    listen 443 ssl;
    server_name skopos.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE (real-time dashboard)
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

For Cloudflare deployments, IP resolution uses the `CF-Connecting-IP` header automatically.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `POCKETBASE_URL is required` on startup | `POCKETBASE_MODE` is `external` but `POCKETBASE_URL` not set | Set `POCKETBASE_URL` in `.env` |
| `ENCRYPTION_KEY must be a 64-character hex string` | Key is missing or wrong length | Generate a new key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `Failed to authenticate with Pocketbase as admin` | Wrong admin credentials or PocketBase not running | Verify `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` and that PocketBase is reachable |
| Dashboard not updating in real time | SSE connection blocked | Ensure proxy is configured with `proxy_buffering off` and long `proxy_read_timeout` |
| Tracking script rejected with 403 | Domain not added to Skopos | Add the domain under **Websites** in the dashboard |
| Geo data shows `Unknown` | geoip-lite database not populated | Run `node -e "require('geoip-lite').reloadData()"` after `npm install` |
| Logs written to `logs/` directory | Default behaviour | Configure `LOG_LEVEL=error` in production to reduce verbosity |
