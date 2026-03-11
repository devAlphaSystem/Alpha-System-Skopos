# API Reference

All JSON API endpoints require authentication unless noted. Authentication is validated via the `pb_auth` cookie set on login. Unauthenticated requests to JSON endpoints return `401 Unauthorized`.

All responses with a body use `Content-Type: application/json`.

---

## Error Response Format

All error responses share a common shape:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid parameters |
| `401` | Not authenticated |
| `403` | Forbidden — mobile device blocked, CORS denied, or resource belongs to another user |
| `404` | Resource not found |
| `500` | Internal server error |

---

## Analytics Collection

### `POST /collect`

Receives analytics events from the `skopos.min.js` browser script.

**Authentication:** None (public endpoint). CORS is enforced — only origins matching a registered, non-archived website domain are accepted.

**Rate limit:** 100 requests per 60 seconds per IP address.

**Request body:** A single field `d` containing a base64-encoded, XOR-obfuscated JSON payload. The obfuscation is handled automatically by `skopos.min.js`.

Decoded payload shape:

```json
{
  "s": "TRACKING_ID",
  "e": [
    {
      "type": "pageview",
      "path": "/about",
      "referrer": "https://google.com",
      "title": "About Us"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `s` | string | Website tracking ID |
| `e` | array | Array of event objects |
| `e[].type` | string | `pageview`, `custom`, `identify`, or `error` |
| `e[].path` | string | URL path of the page |
| `e[].referrer` | string | Referring URL |
| `e[].eventName` | string | Custom event name (for `type: custom`) |
| `e[].eventData` | object | Arbitrary metadata (for `type: custom`) |

**Responses:**

| Status | Body | Description |
|--------|------|-------------|
| `200` | `{"ok": true}` | Events accepted |
| `403` | `{"error": "Origin not allowed"}` | CORS rejection |
| `429` | `{"error": "Rate limit exceeded"}` | Too many requests from this IP |

### `OPTIONS /collect`

CORS preflight. Returns `204 No Content` for allowed origins.

---

## Server-Sent Events

### `GET /dashboard/events`

Opens a persistent SSE connection. The server pushes real-time update notifications when new analytics data arrives.

**Authentication:** Required.

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Event stream messages:**

```
data: {"type":"connected"}\n\n
```

Sent immediately on connection.

```
data: {"type":"update","websiteId":"abc123"}\n\n
```

Sent (debounced, 2 s per website) when new sessions or events are recorded.

```
:heartbeat 1741392000000\n\n
```

SSE comment sent every 30 seconds to keep the connection alive through proxies.

---

## Overview Data

### `GET /overview/data`

Returns aggregated metrics across all active websites for the authenticated user.

**Authentication:** Required.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | integer | `7` | Number of days to include |
| `limit` | integer | `10` | Maximum items in each breakdown list |
| `sections` | string | all | Comma-separated subset of sections to compute: `metrics`, `trends`, `topPages`, `topReferrers`, `devices`, `browsers`, `countries` |

**Response:**

```json
{
  "metrics": {
    "pageViews": 1234,
    "sessions": 890,
    "visitors": 456,
    "newVisitors": 200,
    "bounceRate": 42.5,
    "avgSessionDuration": { "raw": 95, "formatted": "01:35" }
  },
  "reports": {
    "topPages": [{ "key": "/home", "count": 400, "percentage": 32 }],
    "topReferrers": [{ "key": "google.com", "count": 120, "percentage": 10 }],
    "devices": [{ "key": "desktop", "count": 600, "percentage": 67 }],
    "browsers": [{ "key": "Chrome", "count": 500, "percentage": 56 }],
    "countries": [{ "key": "US", "count": 300, "percentage": 34 }]
  }
}
```

---

## Dashboard Data

### `GET /dashboard/data/:websiteId`

Returns metrics for a single website.

**Authentication:** Required.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `websiteId` | PocketBase record ID of the website |

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | integer | `7` | Days to include. Maximum 365. |
| `compare` | boolean | `false` | Include comparison metrics for previous period |
| `sections` | string | all | Comma-separated sections to return |

**Response:** Same structure as `/overview/data` but scoped to one website. When `compare=true`, each metric includes a `change` field (percentage point difference vs. previous period).

### `GET /dashboard/report/:websiteId/:reportType`

Returns a detailed breakdown report.

**Authentication:** Required.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `websiteId` | Website record ID |
| `reportType` | One of: `topPages`, `entryPages`, `exitPages`, `topReferrers`, `devices`, `browsers`, `os`, `countries`, `states`, `languages` |

**Query parameters:** `period` (integer, default 7), `limit` (integer, default 100).

**Response:**

```json
[
  { "key": "/pricing", "count": 234, "percentage": 18 }
]
```

### `GET /dashboard/report/:websiteId/custom-event-details`

Returns a list of all distinct custom event names and their counts.

**Authentication:** Required.

**Query parameters:** `period` (integer, default 7).

**Response:**

```json
[
  { "key": "button_click", "count": 88, "percentage": 45 }
]
```

### `GET /dashboard/report/:websiteId/state-breakdown`

Returns region/state breakdown for a given country.

**Authentication:** Required.

**Query parameters:** `period` (integer, default 7), `country` (ISO 3166-1 alpha-2 code, required).

---

## Sessions

### `GET /sessions/:websiteId`

Renders the session explorer page (HTML). Returns `403` on mobile.

### `GET /sessions/:websiteId/session/:sessionId`

Renders the session detail page (HTML).

### `GET /api/sessions/:websiteId/session/:sessionId/ip-intelligence`

Returns IP intelligence data for the session's visitor IP.

**Authentication:** Required.

**Response:**

```json
{
  "ip": "1.2.3.4",
  "country": "United States",
  "region": "California",
  "city": "San Francisco",
  "org": "AS0000 Example ISP"
}
```

### `POST /sessions/:websiteId/session/:sessionId/delete`

Deletes a single session and all its associated events.

**Authentication:** Required.

**Response:** Redirects to `/sessions/:websiteId`.

### `POST /sessions/:websiteId/visitor/:visitorId/delete`

Deletes all sessions belonging to a visitor.

**Authentication:** Required.

**Response:** Redirects to `/sessions/:websiteId`.

---

## Websites

### `GET /websites`

Renders the websites management page (HTML, desktop only).

### `POST /websites`

Creates a new website.

**Authentication:** Required. Desktop only.

**Request body (form-encoded):**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name |
| `domain` | Yes | Root domain of the site (e.g. `example.com`) |

**Response:** Redirects to `/websites` on success.

### `POST /websites/archive/:id`

Archives a website (soft delete). Archived websites stop receiving data.

**Authentication:** Required. Desktop only.

### `POST /websites/restore/:id`

Restores an archived website.

**Authentication:** Required. Desktop only.

### `POST /websites/delete/:id`

Permanently deletes a website and all its data (sessions, events, uptime records, daily stats, SEO data, ads).

**Authentication:** Required. Desktop only.

### `GET /dashboard/settings/:websiteId`

Renders the website settings panel (HTML, desktop only).

### `POST /dashboard/settings/:websiteId`

Updates website settings.

**Authentication:** Required. Desktop only.

**Request body (form-encoded):**

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `domain` | Domain |
| `dataRetentionDays` | Raw data retention in days (`0` = use global default) |
| `disableLocalhostTracking` | `"on"` to ignore `localhost` events |
| `uptimeMonitoring` | `"on"` to enable uptime checks |
| `uptimeCheckInterval` | Check interval in minutes |

### `POST /dashboard/blacklist/:websiteId/add`

Adds an IP address to the website's tracking blacklist.

**Authentication:** Required.

**Request body:** `{ "ip": "1.2.3.4" }`

### `POST /dashboard/blacklist/:websiteId/remove`

Removes an IP from the blacklist.

**Authentication:** Required.

**Request body:** `{ "ip": "1.2.3.4" }`

### `POST /dashboard/cleanup/:websiteId`

Triggers an immediate data cleanup for the website (deletes sessions/events outside the retention window).

**Authentication:** Required. Desktop only.

---

## Uptime Monitoring

### `GET /uptime/:websiteId`

Renders the uptime monitoring page (HTML, desktop only).

### `GET /uptime/:websiteId/data`

Returns uptime check history and summary statistics.

**Authentication:** Required.

**Query parameters:** `days` (integer, default 30).

**Response:**

```json
{
  "checks": [
    {
      "id": "abc",
      "isUp": true,
      "statusCode": 200,
      "responseTime": 142,
      "created": "2026-03-11T10:00:00Z"
    }
  ],
  "summary": {
    "uptime": 99.8,
    "avgResponseTime": 145,
    "totalChecks": 1440,
    "incidents": 2
  }
}
```

### `POST /uptime/:websiteId/check`

Triggers an immediate uptime check outside the scheduled interval.

**Authentication:** Required. Desktop only.

**Response:** `{ "result": { "isUp": true, "statusCode": 200, "responseTime": 98 } }`

### `POST /uptime/:websiteId/toggle`

Enables or disables uptime monitoring for the website.

**Authentication:** Required. Desktop only.

**Response:** `{ "monitoring": true }`

### `POST /uptime/:websiteId/interval`

Updates the check interval.

**Authentication:** Required. Desktop only.

**Request body:** `{ "interval": 5 }` (minutes, 1–60)

### `POST /uptime/:websiteId/incidents/:incidentId/resolve`

Marks an open incident as resolved.

**Authentication:** Required. Desktop only.

---

## SEO Analysis

### `GET /dashboard/seo/:websiteId`

Renders the SEO analytics page (HTML, desktop only).

### `POST /dashboard/seo/:websiteId/analyze`

Triggers an SEO analysis crawl of the website's domain. Results are stored in `seo_data`.

**Authentication:** Required. Desktop only.

**Response:** Redirects to the SEO analytics page on completion.

### `GET /dashboard/seo/:websiteId/export`

Downloads a CSV file of the SEO analysis results.

**Authentication:** Required. Desktop only.

**Response:** `Content-Type: text/csv` attachment.

---

## Advertisements

### `GET /dashboard/ads/:websiteId`

Renders the advertisements management page (HTML, desktop only).

### `POST /dashboard/ads/:websiteId/create`

Creates a new advertisement.

**Authentication:** Required.

### `PUT /dashboard/ads/:websiteId/:adId`

Updates an existing advertisement.

**Authentication:** Required.

### `DELETE /dashboard/ads/:websiteId/:adId`

Deletes an advertisement.

**Authentication:** Required.

**Response:** `{ "success": true }`

### `GET /dashboard/ads/:websiteId/:adId/metrics`

Returns impression and click metrics for an ad.

**Authentication:** Required.

**Response:**

```json
{
  "impressions": 1500,
  "clicks": 42,
  "ctr": 2.8,
  "clicksByCountry": [{ "key": "US", "count": 20 }],
  "clicksByBrowser": [{ "key": "Chrome", "count": 30 }],
  "clicksByDevice": [{ "key": "desktop", "count": 35 }]
}
```

### `POST /dashboard/ads/:websiteId/generate`

Generates ad copy from SEO data using AI (requires Chapybara API key).

**Authentication:** Required.

### `POST /dashboard/ads/preview`

Returns an HTML preview of the ad banner using submitted creative data. Used by the dashboard's inline preview iframe.

**Authentication:** Required.

### `GET /ads/banner/:adId`

Serves the embeddable ad banner HTML. Publicly accessible.

**Response:** Full HTML page rendering the ad creative.

### `GET /dashboard/ads/:websiteId/:adId/embed`

Returns the embed code snippet for placing the ad on external sites.

**Authentication:** Required.

### `POST /dashboard/ads/:websiteId/:adId/toggle`

Toggles the active state of an ad.

**Authentication:** Required.

### `GET /ads/click/:adId`

Records an ad click (country, browser, device) and redirects the visitor to the ad's target URL. Publicly accessible.

---

## Settings

### `GET /settings`

Renders the settings page (HTML).

### `POST /settings/app`

Updates application-level settings.

**Authentication:** Required.

**Request body (form-encoded):** Application settings key/value pairs. Stored in `app_settings`.

### `POST /settings/api-keys`

Saves a new third-party API key (Resend, Google PageSpeed, or Chapybara). The key is encrypted before storage.

**Authentication:** Required.

**Request body:** `{ "service": "resend", "apiKey": "re_xxx", "label": "" }`

### `DELETE /settings/api-keys/:keyId`

Removes an API key.

**Authentication:** Required.

**Response:** `{ "success": true }`

### `GET /settings/notifications`

Returns all notification rules for the authenticated user.

**Authentication:** Required.

**Response:** Array of notification rule objects.

### `POST /settings/notifications`

Creates a new notification rule.

**Authentication:** Required.

### `PATCH /settings/notifications/:ruleId`

Enables or disables a notification rule.

**Authentication:** Required.

**Request body:** `{ "isActive": true }`

### `DELETE /settings/notifications/:ruleId`

Deletes a notification rule.

**Authentication:** Required.

### `POST /settings/notifications/:ruleId/send`

Immediately triggers the notification rule (sending the email now, outside the scheduled time).

**Authentication:** Required.

### `POST /settings/test-api/pagespeed`

Tests connectivity with the Google PageSpeed API using the stored key.

**Authentication:** Required.

**Response:** `{ "success": true }` or `{ "success": false, "error": "..." }`

### `POST /settings/test-api/chapybara`

Tests the Chapybara API key.

**Authentication:** Required.

### `POST /settings/test-api/resend`

Sends a test email using the stored Resend API key.

**Authentication:** Required.

---

## Authentication

### `GET /register`

Renders the registration page. Redirects to `/login` if a user account already exists.

### `POST /register`

Creates the first (and only) user account.

**Request body (form-encoded):**

| Field | Required | Description |
|-------|----------|-------------|
| `email` | Yes | User email address |
| `password` | Yes | Password (min 8 chars) |
| `passwordConfirm` | Yes | Must match `password` |

**Response:** Redirects to `/` on success.

### `GET /login`

Renders the login page.

### `POST /login`

Authenticates the user. Sets the `pb_auth` cookie on success.

**Request body (form-encoded):**

| Field | Required |
|-------|----------|
| `email` | Yes |
| `password` | Yes |

**Response:** Redirects to `/` on success, re-renders login with error on failure.

### `GET /logout`

Clears the `pb_auth` cookie and redirects to `/login`.

---

## Utility

### `GET /api/user-ip`

Returns the current user's detected public IP address.

**Authentication:** Required.

**Response:** `{ "ip": "1.2.3.4" }`

### `GET /api/proxy-image`

Proxies an external image URL to avoid mixed-content warnings. Publicly accessible.

**Query parameters:** `url` (URL-encoded image URL).

**Response:** The proxied image bytes with appropriate `Content-Type`.

### `GET /collect/health`

Basic health check endpoint (served by the collect route module).

**Authentication:** None.

**Response:** `{ "status": "ok" }`
