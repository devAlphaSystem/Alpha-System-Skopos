import logger from "./logger.js";

let clients = [];

export function addClient(client) {
  clients.push(client);
  logger.info("SSE client connected. Total clients: %d", clients.length);
  client.on("close", () => {
    clients = clients.filter((c) => c !== client);
    logger.info("SSE client disconnected. Total clients: %d", clients.length);
  });
}

export function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  logger.debug("Broadcasting SSE message to %d clients: %o", clients.length, data);
  for (const client of clients) {
    client.write(message);
  }
}
