The Skopos client-side script is a lightweight, privacy-focused utility that you add to your website. It automatically captures essential analytics data and provides simple tools for tracking custom user interactions.

**Note:** The client-side script focuses purely on analytics tracking. SEO analysis is handled entirely by the dashboard - no additional configuration or scripts are needed on your website. When you add a site to Skopos, it automatically analyzes your public pages and provides recommendations.

## Setup

To get started, add the following script tag to the `<head>` section of your HTML pages.

```html
<script defer src="/path/to/skopos.js" data-endpoint="/api/event"></script>
```

-   `defer`: Ensures the script doesn't block page rendering.
-   `src`: The path to the `skopos.js` file you are hosting.
-   `data-endpoint`: The API endpoint on your server where the script will send analytics data.

## Configuration

You can configure the script's behavior by adding `data-*` attributes to the `<script>` tag:

| Attribute                 | Description                                                                                               | Default      |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| `data-endpoint`           | The URL of your server-side API endpoint that will receive the tracking data.                             | `/api/event` |
| `data-auto-track-pageviews` | Set to `"false"` to disable automatic page view tracking (useful for SPAs with custom routing).            | `true`       |
| `data-observe-dom`        | Set to `"false"` to disable automatic event binding for dynamically added DOM elements. When enabled, the script uses a MutationObserver to watch for new elements with `skopos-*` attributes. | `true` |

**Example with custom configuration:**

```html
<script 
  defer 
  src="/path/to/skopos.js" 
  data-endpoint="/analytics/track"
  data-auto-track-pageviews="true"
  data-observe-dom="true">
</script>
```

## How it Works

The script is designed to be as unobtrusive as possible. It uses the `navigator.sendBeacon` API to send data to your server, which allows analytics requests to be completed even if the user navigates away from the page. If `sendBeacon` is not available, it falls back to the `fetch` API with `keepalive: true`.

## Automatic Tracking

### Page Views

By default, the script automatically tracks page views when:
1.  The page initially loads (after the `DOMContentLoaded` or `load` event).
2.  The URL changes in a Single Page Application (SPA) via `history.pushState()` or `history.replaceState()`.
3.  The browser's back/forward buttons are used (`popstate` event).

**SPA Framework Compatibility:**
The script works seamlessly with modern SPA frameworks and routers:
- **React Router**: Automatic tracking via `history.pushState` interception
- **Vue Router**: Works in both hash and history modes
- **Next.js**: Tracks client-side navigation automatically
- **SvelteKit**: Tracks route changes out of the box
- **Nuxt**: Compatible with both universal and SPA modes

**Custom Timing:** The script waits 50ms after a `pushState` call before tracking the page view, allowing your framework to update the DOM and document title.

### JavaScript Errors

The script automatically captures and reports frontend JavaScript errors, including:
-   **Uncaught exceptions**: Global errors caught via `window.addEventListener('error')`.
-   **Unhandled promise rejections**: Caught via `window.addEventListener('unhandledrejection')`.
-   **Console errors and warnings**: Intercepts `console.error()` and `console.warn()` calls.

**Error Data Captured:**
- Error message
- Full stack trace
- URL where the error occurred
- User context (screen size, language, etc.)

**Deduplication:** The SDK automatically deduplicates identical errors on the server side, grouping them by error message and stack trace signature. You'll see a count of how many times each unique error occurred.

**Viewing Errors:** All captured errors appear in the "Top JS Errors" report on your dashboard, where you can drill down to see the full stack trace for debugging.

**Privacy Note:** Stack traces may contain file paths and line numbers from your bundled JavaScript. Ensure your deployment process uses source maps appropriately if you need to debug minified code.

## Declarative Tracking (via HTML Attributes)

The easiest way to track custom events is by adding `skopos-*` attributes directly to your HTML elements.

### Basic Event Tracking

Add the `skopos-event` attribute to any element to track a `click` event on it.

```html
<button skopos-event="cta_click">Download Now</button>
<!-- Clicking this button sends a custom event named "cta_click" -->
```

### Tracking with Static Data

Use `skopos-data` to include a static JSON object with your event.

```html
<button skopos-event="add_to_cart" skopos-data='{ "productId": "abc-123", "price": 19.99 }'>
  Add to Cart
</button>
```

### Tracking with Dynamic Data from the DOM

Use `skopos-data-from` to extract content or values from other elements on the page at the time of the event.

The format is `key:.css-selector`, with multiple definitions separated by a comma.

**Example:** Tracking a newsletter signup form.

```html
<div>
  <label for="email-input">Email:</label>
  <input type="email" id="email-input" placeholder="you@example.com" />

  <label for="tier-select">Select Tier:</label>
  <select id="tier-select">
    <option value="free">Free</option>
    <option value="pro">Pro</option>
  </select>

  <button skopos-event="newsletter_signup" skopos-data-from="email:#email-input, tier:#tier-select">
    Subscribe
  </button>
</div>
<!-- This will send an event with customData: { "email": "user's email", "tier": "selected_tier" } -->
```

### Using Different Event Triggers

By default, events are tracked on `click`. You can specify a different browser event using the `skopos-event-on` attribute.

```html
<div skopos-event="feature_hover" skopos-event-on="mouseover" style="padding: 2rem; border: 1px solid #ccc;">
  Hover over me to track an event!
</div>
```

## Programmatic Tracking (via JavaScript)

For more complex scenarios, you can use the global `window.skopos` function.

### Tracking a Custom Event

Call `window.skopos()` with the `'event'` command.

```javascript
// Syntax: skopos('event', eventName, customDataObject)

// Simple event
window.skopos("event", "video_played");

// Event with custom data
function onPurchaseComplete(details) {
  window.skopos("event", "purchase_complete", {
    orderId: details.orderId,
    total: details.total,
    currency: "USD",
  });
}
```

### Manually Tracking a Page View

If you have disabled automatic page view tracking (`data-auto-track-pageviews="false"`), you can trigger it manually. This is useful in SPAs with complex routing or custom navigation logic.

```javascript
// Syntax: skopos('pageview')

// Example with a custom router
myRouter.on("routeChanged", () => {
  window.skopos("pageview");
});

// Example with a custom event system
window.addEventListener("myapp:navigation", () => {
  window.skopos("pageview");
});
```

## Advanced Usage

### Integration with Modern Frameworks

#### React (with React Router)

```jsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function Analytics() {
  const location = useLocation();
  
  useEffect(() => {
    // Track page views on route change
    if (window.skopos) {
      window.skopos('pageview');
    }
  }, [location]);
  
  return null;
}

// Add to your app root
function App() {
  return (
    <>
      <Analytics />
      {/* Your app components */}
    </>
  );
}
```

#### Vue 3 (with Vue Router)

```javascript
import { watch } from 'vue';
import { useRoute } from 'vue-router';

export function useAnalytics() {
  const route = useRoute();
  
  watch(() => route.path, () => {
    if (window.skopos) {
      window.skopos('pageview');
    }
  });
}
```

### Tracking Form Submissions

```html
<form skopos-event="newsletter_signup" skopos-event-on="submit" skopos-data-from="email:#email-input">
  <input type="email" id="email-input" required />
  <button type="submit">Subscribe</button>
</form>
```

### Tracking File Downloads

```html
<a href="/downloads/whitepaper.pdf" 
   skopos-event="whitepaper_download" 
   skopos-data='{"fileType": "pdf", "fileName": "whitepaper.pdf"}'>
  Download Whitepaper
</a>
```

### Tracking Video Interactions

```html
<video id="promo-video" src="/videos/promo.mp4"></video>

<script>
  const video = document.getElementById('promo-video');
  
  video.addEventListener('play', () => {
    window.skopos('event', 'video_play', { videoId: 'promo-video' });
  });
  
  video.addEventListener('ended', () => {
    window.skopos('event', 'video_complete', { videoId: 'promo-video' });
  });
</script>
```

## Performance Considerations

The Skopos script is designed to have minimal impact on page performance:

- **Deferred Loading**: Using the `defer` attribute ensures the script doesn't block HTML parsing.
- **sendBeacon API**: Prioritizes `navigator.sendBeacon()`, which runs asynchronously and doesn't block page unload.
- **Fire-and-Forget**: All tracking calls return immediately without waiting for server responses.
- **Lightweight**: The minified script is under 3KB gzipped.

## Browser Support

The script supports all modern browsers:
- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Opera 67+

For older browsers, the script will gracefully degrade, falling back from `sendBeacon` to `fetch` with `keepalive`.

## Troubleshooting

### Events Not Appearing in Dashboard

1. **Check the Network Tab**: Open your browser's DevTools and look for POST requests to your analytics endpoint.
2. **Verify the Endpoint**: Ensure `data-endpoint` points to the correct URL and the server is responding with a 2xx status code.
3. **Check Domain Configuration**: In the Skopos dashboard, verify that your website's domain is correctly configured to match the origin sending events.
4. **Look for Console Errors**: The script will log errors to `console.error()` if something goes wrong.

### Automatic Event Binding Not Working

- If using `data-observe-dom="false"`, elements added after page load won't be automatically tracked.
- Ensure your `skopos-event` attributes are properly formatted without typos.
- Check that the script has fully loaded before dynamically adding tracked elements.

### Page Views Not Tracking in SPA

- Verify that `data-auto-track-pageviews` is set to `"true"` (or omitted, as it's the default).
- Some routing libraries may use methods other than `pushState`. In these cases, use manual tracking with `window.skopos('pageview')`.

## Security Considerations

- **No Cookies**: The script doesn't use cookies, making it GDPR-friendly by default.
- **Server-Side Validation**: The SDK validates all incoming data against your configured domain, rejecting spoofed events.
- **No PII Collection**: The script doesn't automatically collect personally identifiable information. Custom data is only sent if you explicitly configure it.
- **Content Security Policy**: If you use CSP, ensure your policy allows the script source and connections to your analytics endpoint.