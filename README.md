# Skopos Dashboard

A self-hosted, privacy-focused web analytics dashboard. Skopos collects visitor data directly on your own infrastructure — no third-party tracking, no data sharing.

## Features

- **Web Analytics** — page views, sessions, visitors, bounce rate, session duration, referrers, devices, browsers, countries, and custom events
- **Uptime Monitoring** — scheduled HTTP checks with incident tracking and notifications
- **SEO Analysis** — on-page SEO scoring, meta tag inspection, PageSpeed integration
- **Advertising Management** — banner ad creation, impression/click tracking, and embed code generation
- **Session Replay (metadata)** — session-level detail view with event timelines and visitor fingerprinting
- **Notification Rules** — daily email digests and uptime alerts via Resend
- **Real-time Updates** — live dashboard refresh via Server-Sent Events (SSE)
- **Data Retention** — configurable per-website and global raw-data pruning via daily cron jobs
- **Embedded or External PocketBase** — run the bundled PocketBase binary or connect to your own instance

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 (ESM) |
| Web framework | Express.js 5 |
| Templating | EJS |
| Database | PocketBase (embedded or external) |
| Logging | Winston + daily-rotate-file |
| Scheduling | node-cron |
| Email | Resend |
| Geo IP | geoip-lite |
| User-Agent parsing | ua-parser-js |
| HTTP (uptime checks) | nlcurl |

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- PocketBase (see [Setup Guide](docs/setup.md))

### 1. Clone and install

```sh
git clone https://github.com/devAlphaSystem/alpha-system-skopos.git
cd alpha-system-skopos
npm install
```

### 2. Configure environment

```sh
cp .env.example .env
# Edit .env — set POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, ENCRYPTION_KEY at minimum
```

### 3. Start the server

```sh
node server.js
```

Open [http://localhost:3000](http://localhost:3000), complete account registration, then add your first website.

### 4. Embed the tracking script

```html
<script
  src="https://cdn.alphasystem.dev/skopos/latest/skopos.min.js"
  data-site-id="YOUR_TRACKING_ID"
  data-host="https://your-skopos-domain.com"
  defer
></script>
```

The tracking ID is shown in the Skopos Dashboard on each website card.

## Project Structure

```
server.js               Entry point — Express setup, middleware, route mounting, startup sequence
nodemon.json            Development watcher config
.env.example            Environment variable template
db_schema.json          PocketBase schema definition (for embedded mode provisioning)
skopos/                 Client-side tracking script (skopos.min.js)
src/
  controllers/          Request handlers — thin layer that reads input and calls services
  routes/               Express Router definitions — maps HTTP verbs/paths to controllers
  services/             Business logic — analytics computation, uptime monitoring, notifications, etc.
  lib/                  pb-embedded.js — self-contained PocketBase lifecycle manager
  utils/                Shared helpers — logger, encryption, device detection, country codes
views/                  EJS templates (server-rendered HTML)
public/                 Static assets (CSS, JS, images)
data/pocketbase/        PocketBase binary, data, and migration files (embedded mode)
docs/                   Extended documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Setup & Installation](docs/setup.md) | Full prerequisites, environment config, and first-run guide |
| [Architecture Overview](docs/architecture.md) | System design, component responsibilities, data flow diagrams |
| [API Reference](docs/api.md) | All HTTP endpoints with request/response shapes |
| [Configuration Reference](docs/configuration.md) | Every environment variable and its effect |
| [Contributing Guide](docs/contributing.md) | Branching, code style, PR process |
| [Changelog](CHANGELOG.md) | Release history |
| [ADRs](docs/adr/) | Architecture Decision Records |

## Developer Onboarding Checklist

- [ ] Clone the repository
- [ ] Install prerequisites: Node.js ≥ 18, npm ≥ 9
- [ ] `npm install`
- [ ] Copy `.env.example` to `.env` and set required variables (see [Configuration](docs/configuration.md))
- [ ] Start the server: `node server.js`
- [ ] Complete first-time registration at `/register`
- [ ] Add a website and copy the tracking ID
- [ ] Embed `skopos.min.js` on a test page
- [ ] Review the [Architecture Overview](docs/architecture.md)

## License

MIT — see [LICENSE](LICENSE).
