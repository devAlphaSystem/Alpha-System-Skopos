# Skopos Dashboard

A **self-hosted, privacy-focused analytics dashboard** with built-in uptime monitoring and SEO analysis. Powered by Express 5 and PocketBase.

## Features

- **Multi-website analytics** — Track unlimited websites with per-site dashboards and a unified overview
- **Privacy-first** — All data stays on your infrastructure; no third-party tracking
- **Real-time updates** — Live session and event counters via Server-Sent Events (SSE)
- **JavaScript error tracking** — Automatic error capture with stack traces and breadcrumbs
- **Visitor identification** — Enrich anonymous visitors with user IDs, emails, and custom metadata
- **Uptime monitoring** — Configurable intervals, incident tracking, MTTR/MTBF metrics, and status notifications
- **SEO analyzer** — On-demand audits with Lighthouse integration, actionable recommendations, and CSV/JSON export
- **Smart notifications** — Declarative email rules for new visitors, custom events, error thresholds, uptime alerts, and daily summaries
- **Data retention** — Automatic cleanup with configurable per-site and global retention policies
- **Lightweight client script** — ~9KB minified with SPA support, offline queuing, and bot filtering

---

## Architecture

```
┌──────────────────┐      ┌─────────────────┐      ┌──────────────┐
│  Browser Script  │─────▶│     Express     │◀────▶│  PocketBase  │
└──────────────────┘      │   Dashboard &   │      │   Database   │
                          │   Collection    │      └──────────────┘
                          │       API       │             ▲
                          └─────────────────┘             │
                                  │                       │
                          ┌───────▼───────┐               │
                          │   Services    │───────────────┘
                          │ (Cron, SSE,   │
                          │  Uptime, SEO) │
                          └───────────────┘
```

**PocketBase** stores users, websites, sessions, visitors, events, JS errors, SEO snapshots, uptime checks, uptime incidents, and notification rules.

**Express** handles authentication, renders EJS views, serves the collection API (`/collect`), and exposes real-time SSE endpoints.

**Background services** enforce data retention, send email notifications (via Resend), monitor uptime, and broadcast real-time updates.

---

## Requirements

- **Node.js 20+** (ES modules, top-level await, native fetch)
- **PocketBase 0.26.x** with the included `pb_schema.json`
- npm or pnpm

### Optional API Keys

| Service | Purpose |
| ------- | ------- |
| **Resend** | Transactional email notifications |
| **Google PageSpeed** | Enhanced Lighthouse SEO audits |
| **Chapybara** | IP intelligence/reputation lookups |

---

## Quick Start

1. **Clone the repository**:

   ```bash
   git clone https://github.com/devAlphaSystem/Alpha-System-Skopos.git
   cd Alpha-System-Skopos
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure environment**:

   Copy `.env.example` to `.env` and update:

   | Variable | Description |
   | -------- | ----------- |
   | `PORT` | Dashboard HTTP port (default `3000`) |
   | `NODE_ENV` | `development` or `production` |
   | `LOG_LEVEL` | Winston log level (`error`, `warn`, `info`, `debug`) |
   | `POCKETBASE_URL` | PocketBase instance URL (e.g., `http://127.0.0.1:8090`) |
   | `POCKETBASE_ADMIN_EMAIL` | PocketBase admin email |
   | `POCKETBASE_ADMIN_PASSWORD` | PocketBase admin password |
   | `ENCRYPTION_KEY` | 32-byte secret for API key encryption (never commit) |
   | `DATA_RETENTION_DAYS` | Global data retention period (default `180`) |

4. **Start PocketBase**:

   ```bash
   ./pocketbase serve --http=0.0.0.0:8090 --dir ./pb_data --publicDir ./pb_public
   ```

   Import `pb_schema.json` via the PocketBase admin UI or use `--auto-migrate`.

5. **Start the dashboard**:

   ```bash
   npm run dev          # Development with hot reload
   # or
   node server.js       # Production
   ```

6. Visit `http://localhost:3000`, register the first user, and log in.

---

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Start with nodemon for development |
| `npm run format` | Format codebase with Prettier |

---

## Project Structure

```
├── public/              # Static assets (CSS, JS, images)
├── script/              # Client tracking script (skopos.min.js)
├── src/
│   ├── controllers/     # Route handlers for pages and API
│   ├── routes/          # Express route definitions
│   ├── services/        # Core business logic
│   │   ├── analyticsService.js    # Metrics calculation
│   │   ├── cron.js                # Scheduled jobs
│   │   ├── notificationService.js # Email notifications via Resend
│   │   ├── realtime.js            # SSE broadcasting
│   │   ├── seoAnalyzer.js         # SEO audits + Lighthouse
│   │   ├── uptimeMonitor.js       # Uptime checks & incidents
│   │   └── ...
│   └── utils/           # Helpers (logging, encryption, geo, etc.)
├── views/               # EJS templates
├── pb_schema.json       # PocketBase collection schema
├── server.js            # Application entry point
└── package.json
```

---

## Client Script

The tracking script (`script/skopos.min.js`) is a lightweight (~9KB) privacy-focused tracker.

### Installation

```html
<script
  src="https://cdn.alphasystem.dev/skopos/latest/skopos.min.js"
  data-site-id="YOUR_TRACKING_ID"
  data-host="https://your-skopos-dashboard.com"
  defer
></script>
```

### Configuration

| Attribute | Default | Description |
| --------- | ------- | ----------- |
| `data-site-id` | *required* | Tracking ID from dashboard |
| `data-host` | *required* | Dashboard URL |
| `data-auto-track` | `true` | Auto-track page views |
| `data-track-errors` | `true` | Capture JavaScript errors |
| `data-track-outbound` | `true` | Track outbound link clicks |
| `data-track-downloads` | `true` | Track file downloads |
| `data-hash-mode` | `false` | Hash-based SPA routing |
| `data-respect-dnt` | `false` | Respect Do Not Track setting |
| `data-debug` | `false` | Enable console logging |

### Programmatic API

```javascript
// Custom events
skopos('event', 'button_click', { buttonId: 'cta', value: 100 });

// User identification
skopos('identify', 'user123', {
  name: 'John Doe',
  email: 'john@example.com',
  metadata: { plan: 'pro' }
});

// GDPR opt-out/opt-in
skopos('opt-out');
skopos('opt-in');
```

See [script/README.md](script/README.md) for full documentation.

---

## Data Collection

The `/collect` endpoint accepts telemetry from the client script:

- **Page views** — Automatic SPA-aware tracking
- **Custom events** — Programmatic and declarative (HTML attributes)
- **Sessions** — Created automatically with device, browser, OS, location, and referrer
- **Visitors** — Identified by hashed fingerprint; enrichable via `identify()` API
- **JavaScript errors** — Aggregated with stack traces, breadcrumbs, and occurrence counts
- **Outbound clicks** — External link tracking
- **File downloads** — Automatic for common file extensions

---

## Cron Jobs

Scheduled tasks run automatically when the server starts:

| Schedule | Job | Description |
| -------- | --- | ----------- |
| Daily (00:00 UTC) | Data retention | Enforces per-site and global retention policies |
| Daily (00:00 UTC) | Orphan cleanup | Removes visitors with no sessions |
| Daily (00:00 UTC) | Daily summaries | Sends summary emails for configured notification rules |
| Hourly | Error threshold checks | Triggers alerts when JS errors exceed configured limits |
| Every 5 minutes | Short session discard | Removes <1s sessions for sites with this option enabled |

---

## Notification Rules

Configure email alerts in the dashboard settings:

| Event Type | Trigger |
| ---------- | ------- |
| `new_visitor` | When a new unique visitor is detected |
| `new_session` | When a new session starts |
| `custom_event` | When a specific custom event fires |
| `daily_summary` | Daily analytics report |
| `error_threshold` | When JS errors exceed a threshold |
| `uptime_status` | When site status changes (up/down) |

Notifications require a configured **Resend** API key.

---

## Settings

The settings page allows you to customize your dashboard experience, privacy levels, and external integrations across several categories:

### Appearance Settings

Manage the visual and temporal aspects of the application:

- **Dark Mode** — Switch between light and dark themes.
- **Toast Notifications** — Toggle small on-screen notifications when settings are updated.
- **Timezone** — Set your preferred timezone for displaying dates and times globally.

### Overview Settings

Configure how the global overview page displays aggregated data:

- **Data Period** — Number of trailing days for overview reports (Today, 7, 15, or 30 days)
- **Results Per Card** — Maximum entries shown in each overview report card (5, 10, or 25)
- **Show Unique Visitors** — When enabled, the Visitors card in overview shows only unique visitors.

### Dashboard Settings

Configure how individual website dashboards display data independently from the overview:

- **Auto Refresh** — Automatically pull the latest dashboard metrics at regular intervals.
- **Refresh Interval** — Choose how often data is refreshed (Instant to 30 minutes)
- **Data Period** — Number of trailing days for dashboard reports
- **Results Per Card** — How many entries to surface inside each dashboard report card
- **Show Unique Visitors** — Toggle between total visitors and unique visitors for the dashboard.

### Privacy Settings

Control how visitor data is collected and processed:

- **Store Raw IP Addresses** — Enable to store full IP addresses; when disabled, only hashed IDs are stored for privacy.
- **Discard Short Sessions** — When enabled, sessions shorter than 1 second are automatically discarded.

### API Keys & Notifications

Dedicated tabs allow you to manage:

- **External Services** — Configure API keys for Resend (email), Google PageSpeed (SEO), and Chapybara (IP intelligence).
- **Notification Rules** — Create and manage declarative rules for email alerts.

Overview and Dashboard settings are independent — changes to one do not affect the other.

---

## Uptime Monitoring

Per-website uptime monitoring with:

- Configurable check intervals (default: 5 minutes)
- Automatic incident creation and resolution
- Response time tracking
- DNS fallback for reliability
- MTTR/MTBF calculations
- Daily uptime summaries
- Email alerts on status changes

---

## SEO Analysis

On-demand SEO audits include:

- Meta tag validation (title, description, canonical, robots)
- Social meta tags (Open Graph, Twitter Cards)
- Heading structure analysis
- Image alt text coverage
- Internal/external link analysis
- Broken link detection
- Technical SEO checks (SSL, robots.txt, sitemap, structured data, compression)
- Lighthouse performance scores (requires Google PageSpeed API for enhanced results)
- Prioritized recommendations

---

## Deployment

### Reverse Proxy Configuration

When running behind Nginx, Traefik, or similar:

- Forward `X-Forwarded-For` / `X-Real-IP` headers for accurate IP geolocation
- Disable response buffering for `/dashboard/events` (SSE endpoint)
- Terminate TLS at the proxy layer

### Process Management

Use PM2, systemd, or Docker to manage the Node process. Ensure `SIGTERM` is forwarded for graceful shutdown of uptime monitors.

### Backups

All data lives in PocketBase. Schedule regular backups of the `pb_data/` directory.

### Production Checklist

1. Run `npm ci --production`
2. Set `NODE_ENV=production`
3. Use unique `ENCRYPTION_KEY` per environment
4. Import/sync `pb_schema.json` to PocketBase
5. Verify the dashboard loads and test event collection
6. Monitor logs at `logs/` or stdout

---

## PocketBase Collections

The schema includes:

| Collection | Purpose |
| ---------- | ------- |
| `users` | Dashboard user accounts |
| `websites` | Tracked sites and configuration |
| `visitors` | Unique visitor records (identifiable) |
| `sessions` | Individual browsing sessions |
| `events` | Page views, custom events, clicks |
| `js_errors` | Aggregated JavaScript errors |
| `seo_data` | SEO analysis snapshots |
| `uptime_checks` | Individual uptime check results |
| `uptime_incidents` | Downtime incidents |
| `uptime_sum` | Aggregated uptime summaries |
| `notyf_rules` | Notification rule configurations |
| `api_keys` | Encrypted third-party API keys |

---

## License

MIT

---

## Support

- **Issues & Features**: Open a GitHub issue with Node/PocketBase versions and relevant logs
- **Security**: Report vulnerabilities privately; do not file public issues
