The Skopos client-side script is a lightweight, privacy-focused utility that you add to your website. It automatically captures essential analytics data and provides simple tools for tracking custom user interactions.

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
| `data-auto-track-pageviews` | Set to `"false"` to disable automatic page view tracking (e.g., for Single Page Applications).            | `true`       |
| `data-observe-dom`        | Set to `"false"` to disable automatic event binding for elements that are dynamically added to the page.    | `true`       |

## How it Works

The script is designed to be as unobtrusive as possible. It uses the `navigator.sendBeacon` API to send data to your server, which allows analytics requests to be completed even if the user navigates away from the page. If `sendBeacon` is not available, it falls back to the `fetch` API with `keepalive: true`.

## Automatic Tracking

### Page Views

By default, the script automatically tracks page views when:
1.  The page initially loads.
2.  The URL changes in a Single Page Application (SPA) via `history.pushState`. This works out-of-the-box with frameworks like Next.js, SvelteKit, and Nuxt.

### JavaScript Errors

The script automatically captures and reports frontend JavaScript errors, including:
-   Uncaught exceptions (`window.addEventListener('error')`).
-   Unhandled promise rejections (`window.addEventListener('unhandledrejection')`).
-   Calls to `console.error()` and `console.warn()`.

This allows you to see real-world errors that your users are encountering, directly in the Skopos dashboard.

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

If you have disabled automatic page view tracking, you can trigger it manually. This is useful in SPAs with complex routing.

```javascript
// Syntax: skopos('pageview')

// Example with a custom router
myRouter.on("routeChanged", () => {
  window.skopos("pageview");
});
```