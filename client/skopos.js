/**
 * Skopos Analytics Script v0.1.1
 *
 * A lightweight client-side analytics utility for tracking pageviews and custom events
 * using the `navigator.sendBeacon` API (when available) or `fetch` as a fallback.
 *
 * Usage:
 *  - Include this script via <script src="..."></script>
 *      - `data-endpoint`: optional, sets the analytics endpoint (default `/api/event`)
 *      - `data-auto-track-pageviews`: optional, automatically track URL changes (default: true)
 *  - Add tracking attributes on elements:
 *      - `skopos-event="EventName"`
 *      - `skopos-data='{ "key": "value" }'` (optional JSON data)
 *      - `skopos-data-from="key:.selector"` (extract data from DOM elements)
 *
 * Supports automatic page view tracking and SPA navigation via `history.pushState`.
 */

((window, document) => {
  const scriptElement = document.currentScript;
  if (!scriptElement) return;

  const endpoint = scriptElement.getAttribute("data-endpoint") || "/api/event";
  const autoTrackPageviews = scriptElement.getAttribute("data-auto-track-pageviews") !== "false";
  const observeDom = scriptElement.getAttribute("data-observe-dom") !== "false";

  /**
   * Extracts UTM parameters from the current URL.
   *
   * @param {URLSearchParams} params - The URL search parameters.
   * @returns {Record<string, string>} - An object mapping UTM parameter names to their values.
   */
  function getUtmParams(params) {
    const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    const utm = {};
    for (const key of utmKeys) {
      if (params.has(key)) {
        utm[key] = params.get(key);
      }
    }
    return utm;
  }

  /**
   * Sends data to the analytics endpoint using sendBeacon (preferred) or fetch.
   *
   * @param {Record<string, any>} payload - The analytics data to send.
   * @returns {void}
   */
  function sendData(payload) {
    const data = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([data], { type: "application/json" }));
      } else {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: data,
          keepalive: true,
        });
      }
    } catch (e) {
      console.error("Skopos:", e);
    }
  }

  /**
   * Tracks an event and sends it to the analytics server.
   *
   * @param {string} eventName - The name of the event (e.g., "signup_button_click").
   * @param {"custom"|"pageView"} [eventType="custom"] - The event type.
   * @param {Record<string, any>} [customData={}] - Additional event-specific data.
   * @returns {void}
   */
  function track(eventName, eventType = "custom", customData = {}) {
    const url = new URL(window.location.href);
    const utm = getUtmParams(url.searchParams);

    const payload = {
      type: eventType,
      name: eventName,
      url: url.href,
      referrer: document.referrer,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      ...utm,
      customData: customData,
    };

    sendData(payload);
  }

  let lastPath = "";

  /**
   * Tracks a page view if the URL path has changed.
   *
   * @returns {void}
   */
  function trackPageView() {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      track(currentPath, "pageView");
    }
  }

  /**
   * Finds and binds event listeners to elements with the `skopos-event` attribute.
   *
   * @param {HTMLElement|Document} rootElement - The root element to scan within.
   * @returns {void}
   */
  function scanAndBindEvents(rootElement) {
    const elements = rootElement.querySelectorAll("[skopos-event]");
    for (const element of elements) {
      if (element.hasAttribute("skopos-bound")) continue;

      const eventName = element.getAttribute("skopos-event");
      const eventType = element.getAttribute("skopos-event-on") || "click";

      element.addEventListener(eventType, () => {
        let customData = {};

        // Parse static JSON data if provided
        const eventDataJSON = element.getAttribute("skopos-data");
        if (eventDataJSON) {
          try {
            customData = JSON.parse(eventDataJSON);
          } catch (e) {
            console.error("Skopos: Invalid JSON in skopos-data.", e, element);
          }
        }

        // Extract dynamic data from DOM using selectors
        const eventDataFromAttr = element.getAttribute("skopos-data-from");
        if (eventDataFromAttr) {
          const definitions = eventDataFromAttr.split(",");
          for (const def of definitions) {
            const parts = def.split(":");
            if (parts.length !== 2) {
              console.warn(`Skopos: Malformed 'skopos-data-from' part: "${def}"`);
              continue;
            }
            const key = parts[0].trim();
            const selector = parts[1].trim();
            const targetElement = document.querySelector(selector);

            if (targetElement) {
              const value = "value" in targetElement ? targetElement.value : targetElement.textContent;
              customData[key] = value.trim();
            } else {
              console.warn(`Skopos: Element not found for selector in 'skopos-data-from': "${selector}"`);
            }
          }
        }

        track(eventName, "custom", customData);
      });

      element.setAttribute("skopos-bound", "true");
    }
  }

  /**
   * The initial `window.skopos` function placeholder that queues commands before initialization.
   * @param {...any[]} args - The command arguments to queue.
   */
  const globalSkopos = (...args) => {
    window.skopos.q = window.skopos.q || [];
    window.skopos.q.push(args);
  };
  window.skopos = globalSkopos;

  /**
   * Processes queued or incoming Skopos commands.
   *
   * @param {string} command - Command type ("event" or "pageview").
   * @param {...any} rest - Additional command parameters.
   * @returns {void}
   */
  function processCommand(...args) {
    const [command, ...rest] = args;
    if (command === "event") {
      const [eventName, customData] = rest;
      if (typeof eventName === "string") {
        track(eventName, "custom", customData || {});
      }
    } else if (command === "pageview") {
      trackPageView();
    }
  }

  // Replace the placeholder with actual implementation
  window.skopos = processCommand;

  // Process queued commands
  if (window.skopos.q) {
    for (const args of window.skopos.q) {
      processCommand(...args);
    }
  }

  // Enable automatic pageview tracking and SPA route detection
  if (autoTrackPageviews) {
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(trackPageView, 50);
    };

    window.addEventListener("popstate", trackPageView);

    if (document.readyState === "complete") {
      trackPageView();
    } else {
      window.addEventListener("load", trackPageView, { once: true });
    }
  }

  // Bind event listeners on DOM ready and on dynamically added elements
  document.addEventListener("DOMContentLoaded", () => {
    scanAndBindEvents(document.body);
    if (observeDom) {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              scanAndBindEvents(node);
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
})(window, document);
