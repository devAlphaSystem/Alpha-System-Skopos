# Skopos Client Script

A lightweight, privacy-focused analytics script that communicates directly with your Skopos Dashboard instance.

## Features

- **Lightweight**: ~9KB minified, ~7KB gzipped
- **No cookies by default**: Uses localStorage/sessionStorage
- **Privacy-focused**: No third-party tracking, data stays on your server
- **Auto page view tracking**: Supports SPAs with History API and hash-based routing
- **Custom event tracking**: Both declarative (HTML attributes) and programmatic
- **User identification**: Track authenticated users
- **Error tracking**: Capture JavaScript errors automatically
- **Outbound link tracking**: Track clicks to external sites
- **Download tracking**: Track file downloads
- **Offline support**: Queues failed requests for retry
- **Bot filtering**: Client-side bot detection
- **Do Not Track support**: Optional DNT respect
- **Secure**: Obfuscated production build

## Installation

### CDN (Recommended)

Use the following script tag and add to your site:

```html
<script
  src="https://cdn.alphasystem.dev/skopos/latest/skopos.min.js"
  data-site-id="YOUR_TRACKING_ID"
  data-host="https://your-skopos-dashboard.com"
  defer
></script>
```

### Self-hosted

Copy `dist/skopos.min.js` to your server and reference it:

```html
<script
  src="/js/skopos.min.js"
  data-site-id="YOUR_TRACKING_ID"
  data-host="https://your-skopos-dashboard.com"
  defer
></script>
```

## Configuration Options

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-site-id` | *required* | Your tracking ID from Skopos Dashboard |
| `data-host` | *required* | URL of your Skopos Dashboard instance |
| `data-auto-track` | `true` | Auto-track page views |
| `data-track-errors` | `true` | Track JavaScript errors |
| `data-track-outbound` | `true` | Track outbound link clicks |
| `data-track-downloads` | `true` | Track file downloads |
| `data-hash-mode` | `false` | Enable hash-based routing mode |
| `data-respect-dnt` | `false` | Respect Do Not Track browser setting |
| `data-debug` | `false` | Enable console logging |
| `data-batch-interval` | `5000` | Event batch interval (ms) |
| `data-max-batch-size` | `10` | Max events per batch |
| `data-session-timeout` | `1800000` | Session timeout (ms, default 30 min) |

## Programmatic API

### Track Custom Events

```javascript
skopos('event', 'button_click', { buttonId: 'cta', value: 100 });
skopos('event', 'form_submit', { formName: 'contact' });
```

### Track Page Views (Manual)

```javascript
skopos('pageview');
```

### Identify Users

```javascript
skopos('identify', 'user123', {
  name: 'John Doe',
  email: 'john@example.com',
  metadata: {
    plan: 'pro',
    company: 'Acme Inc'
  }
});
```

### Opt-Out / Opt-In (GDPR)

```javascript
// Disable tracking
skopos('opt-out');

// Re-enable tracking
skopos('opt-in');
```

### Enable Debug Mode

```javascript
skopos('debug', true);
```

## Declarative Event Tracking

Add attributes to HTML elements:

### Basic Click Tracking

```html
<button skopos-event="signup_click">Sign Up</button>
```

### With Custom Data

```html
<button 
  skopos-event="add_to_cart" 
  skopos-data='{"productId":"123","price":29.99}'
>
  Add to Cart
</button>
```

### Different Trigger Events

```html
<input 
  type="text"
  skopos-event="search"
  skopos-event-on="input"
/>
```

### Extract Data from DOM

```html
<input type="text" id="search-input" />
<button 
  skopos-event="search_submit"
  skopos-data-from="query:#search-input"
>
  Search
</button>
```

Multiple extractions (comma-separated):
```html
<button skopos-data-from="name:#name-input,email:#email-input">
```

## File Downloads Tracked

The following file extensions are automatically tracked as downloads:

`.pdf`, `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.dmg`, `.exe`, `.msi`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.csv`, `.mp3`, `.mp4`, `.avi`, `.mov`, `.webm`

## Browser Support

- Chrome 49+
- Firefox 52+
- Safari 10+
- Edge 14+
- Opera 36+

Requires:
- ES2015 support
- `fetch` API
- `crypto.getRandomValues`
- `MutationObserver`

## License

MIT
