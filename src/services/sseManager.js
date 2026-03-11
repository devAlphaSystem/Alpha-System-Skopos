import logger from "../utils/logger.js";

const MAX_SSE_CLIENTS = 100;
const DEBOUNCE_MS = 2000;
const clients = new Set();

const pendingBroadcasts = new Map();

/**
 * Registers a new SSE client response stream.
 * Rejects the connection if the maximum number of clients (100) has been reached.
 *
 * @param {import('http').ServerResponse} client - Express response object with `write()` and `end()` methods.
 * @returns {boolean} True if the client was accepted, false if rejected.
 */
export function addClient(client) {
  if (clients.size >= MAX_SSE_CLIENTS) {
    logger.warn("SSE max clients (%d) reached, rejecting new connection", MAX_SSE_CLIENTS);
    client.end();
    return false;
  }
  clients.add(client);
  logger.info("SSE client connected. Total clients: %d", clients.size);
  client.on("close", () => {
    clients.delete(client);
    logger.info("SSE client disconnected. Total clients: %d", clients.size);
  });
  return true;
}

/**
 * Broadcasts a JSON message immediately to all connected SSE clients.
 *
 * @param {object} data - Serialisable object. Published as `data: <JSON>\n\n`.
 * @returns {void}
 */
export function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  logger.debug("Broadcasting SSE message to %d clients: %o", clients.size, data);
  for (const client of clients) {
    client.write(message);
  }
}

/**
 * Schedules a broadcast with a 2-second debounce, keyed by `data.websiteId`.
 * Multiple calls within the debounce window for the same website coalesce into one broadcast.
 * Used for collection event notifications to avoid high-frequency dashboard flicker.
 *
 * @param {{ websiteId?: string, [key: string]: unknown }} data - Payload to broadcast.
 * @returns {void}
 */
export function broadcastDebounced(data) {
  const key = data?.websiteId ?? "__global__";

  const existing = pendingBroadcasts.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pendingBroadcasts.delete(key);
    broadcast(data);
  }, DEBOUNCE_MS);

  pendingBroadcasts.set(key, { timer, data });
}

export function getClientCount() {
  return clients.size;
}

export function disconnectAll() {
  for (const [, { timer }] of pendingBroadcasts) {
    clearTimeout(timer);
  }
  pendingBroadcasts.clear();

  for (const client of clients) {
    try {
      client.end();
    } catch (_) {}
  }
  clients.clear();
  logger.info("All SSE clients disconnected");
}
