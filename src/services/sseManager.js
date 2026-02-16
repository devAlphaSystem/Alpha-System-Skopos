import logger from "../utils/logger.js";

const MAX_SSE_CLIENTS = 100;
const DEBOUNCE_MS = 2000;
const clients = new Set();

const pendingBroadcasts = new Map();

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

export function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  logger.debug("Broadcasting SSE message to %d clients: %o", clients.size, data);
  for (const client of clients) {
    client.write(message);
  }
}

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
