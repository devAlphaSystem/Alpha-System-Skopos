This package is the **self-hosted dashboard, ingestion API, and automation layer** for the Skopos analytics platform. It exposes:

- an Express 5 server that speaks to PocketBase,
- an authenticated dashboard rendered with EJS templates,
- a lightweight browser script (`client/skopos.js`) that posts telemetry to `/api/event`,
- cron jobs for retention and notifications,
- an uptime monitor, SEO analyzer, notification engine, and SSE real-time feed.

Pair it with the `@alphasystem/skopos` Node SDK (bundled in this workspace) to instrument your back-end services.

---

### Architecture at a Glance

```
┌──────────────┐      ┌─────────────┐      ┌──────────────┐
│ Browser Apps │──┐   │  Express    │   ┌─▶│ PocketBase   │
└──────────────┘  │   │  (Skopos)   │   │  └──────────────┘
						      ├─▶│  API & SSE  │◀──┘      ▲
┌──────────────┐  │   │             │          │
│ Node SDK     │──┘   │  Services   │──────────┘
└──────────────┘      └─────────────┘
```

- **PocketBase** stores users, websites, sessions, visitors, events, SEO snapshots, uptime checks, and notification rules.
- **Express** authenticates against PocketBase on every request, renders views, and proxies API calls.
- **Cron & Services** enforce retention, send emails (Resend), monitor uptime, run SEO scans, and publish SSE updates from PocketBase subscriptions.

---

### Feature Checklist
- Multi-website overview with comparative KPIs and per-site dashboards.
- Real-time session/event counters via Server-Sent Events (SSE).
- Detailed visitor/session explorer with IP intelligence lookups (Chapybara).
- Declarative notification rules (new visitor, custom event, error thresholds, uptime status, daily summaries).
- Integrated SEO analyzer with Lighthouse export, CSV/JSON downloads, and actionable recommendations.
- Built-in uptime monitor with incident tracking, MTTR/MTBF, and on-demand checks.
- Client script distribution plus REST endpoint for ingesting telemetry.

---

### Requirements
- Node.js **20+** (the codebase uses top-level `await`, `fetch`, and ES modules).
- PocketBase **0.26.x** running with the included `pb_schema.json`.
- npm or pnpm for dependency management.
- (Optional) API keys for:
  - **Resend** – transactional email notifications.
  - **Google PageSpeed** – enhanced SEO auditing.
  - **Chapybara** – IP reputation/intel in the session view.

---

### Setup

1. **Clone the workspace** (contains both SDK and Web packages):
	```bash
	git clone https://github.com/devAlphaSystem/Alpha-System-Skopos-SDK.git
	cd Alpha-System-Skopos-SDK/Alpha_Skopos_Web
	```

2. **Install dependencies**:
	```bash
	npm install
	```

3. **Configure environment variables** by copying `.env.example` → `.env` and updating:

	| Variable | Description |
	| --- | --- |
	| `PORT` | HTTP port for the dashboard (default `3000`). |
	| `NODE_ENV` | `development` or `production`. Controls logging & cookies. |
	| `LOG_LEVEL` | Pino/Winston-compatible log level (`info`, `debug`, etc.). |
	| `POCKETBASE_URL` | Internal URL that the Node server can reach (ex: `http://127.0.0.1:8090`). |
	| `POCKETBASE_ADMIN_EMAIL/PASSWORD` | Credentials for a PocketBase admin or superuser. Required for background jobs and rule bypass. |
	| `ENCRYPTION_KEY` | 32-byte secret used by the API key vault. Never commit this. |
	| `DATA_RETENTION_DAYS` | Global cap for raw event data (default `180`). |

4. **Boot PocketBase** using the bundled schema:
	```bash
	./pocketbase serve --http=0.0.0.0:8090 --dir ./pb_data --publicDir ./pb_public --auto-migrate pb_schema.json
	```

5. **Run the dashboard**:
	```bash
	npm run dev         # nodemon + hot reload
	# or
	node server.js      # production-style start
	```

6. Visit `http://localhost:3000`, register the first user (once), then log in.

---

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Launches nodemon (defined in `nodemon.json`) for iterative development. |
| `npm run format` | Applies Prettier across the project. |

---

### Key Directories

- `client/` – the raw (`skopos.js`) and minified (`skopos-min.js`) browser bundle.
- `docs/` – platform documentation rendered in the dashboard and README.
- `public/` – static assets served verbatim (`css`, `js`, `img`).
- `src/controllers/` – page renderers and JSON endpoint handlers.
- `src/services/` – integration logic (PocketBase, cron, uptime, SEO, notifications, SSE, analytics, API keys).
- `views/` – EJS templates for pages and partials.

---

### Data Flow & Integration Points
1. **Browser ingest** → `/api/event` route → `SkoposSDK.trackApiEvent` → PocketBase `events` / `sessions` / `visitors` collections.
2. **Server events** → `SkoposSDK.trackServerEvent` (see SDK README) → same collections.
3. **Dashboard** pulls aggregated metrics via `/overview/data` and `/dashboard/data/:websiteId` endpoints backed by `analyticsService`.
4. **Realtime**: `src/services/realtime.js` subscribes to PocketBase changes and emits SSE messages at `/dashboard/events`. UI widgets refresh without polling.
5. **Notifications**: `notificationService` uses Resend and user-defined rules stored in `notyf_rules`.

---
### Deployment & Operations

| Concern | Recommended practice |
| --- | --- |
| **Network & TLS** | Terminate HTTPS at your reverse proxy (Nginx, Traefik) and forward `X-Forwarded-For` / `X-Real-IP` so PocketBase stores accurate IPs. Disable proxy buffering for `/dashboard/events` (text/event-stream). |
| **Process management** | Run the server under PM2, systemd, Docker, or another supervisor. Ensure `SIGTERM` reaches Node so the uptime monitor can shut down gracefully. |
| **PocketBase schema** | Keep `pb_schema.json` version-controlled. When upgrading collections, export a new schema and redeploy before rolling the dashboard update. |
| **Backups** | Snapshot `pb_data/` regularly (cron + rsync, S3 sync, etc.). Every metric in the app lives inside PocketBase. |
| **Environment parity** | Mirror `.env` values across environments. For production, set `NODE_ENV=production`, `LOG_LEVEL=info`, and unique `ENCRYPTION_KEY` values per deployment. |
| **Scaling** | Horizontal scaling is usually handled at the proxy layer. Keep a single PocketBase instance for now; if you cluster it, ensure all dashboard replicas point to the same PocketBase URL. |

#### Deployment Checklist
1. Build or pull the latest release.
2. Run `npm install --production` (or `npm ci`).
3. Copy `.env` and validate credentials.
4. Run database migrations / PocketBase schema sync.
5. Restart the Node service and verify `/ready` (if you expose a health endpoint) plus the dashboard homepage.
6. Trigger a test event (load the browser script) and confirm metrics update.

---

### Keeping Things Healthy
- Cron jobs (see `src/services/cron.js`) enforce retention, prune orphaned visitors, send daily summaries, and enforce JS error thresholds. They launch automatically when `server.js` starts.
- Keep the SDK version reported via `websites.sdkVersion` in sync across environments so the dashboard warns you when a site runs an outdated tracker.
- Monitor logs (stdout or `logs/`) for auth errors, PocketBase connectivity issues, and cron output. Consider piping logs into a centralized stack like ELK or Loki.

---

### Support
- **Documentation**: Everything inside `docs/` ships with the repo and can be surfaced inside the dashboard, knowledge base, or CI pipelines.
- **Issues & Feature Requests**: Open a ticket in the repository and include Node/PocketBase versions plus any relevant logs.
- **Security**: Report vulnerabilities privately (do not file public issues) so maintainers can coordinate a fix.
