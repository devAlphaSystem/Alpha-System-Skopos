let clients = [];

export function addClient(client) {
  clients.push(client);
  client.on("close", () => {
    clients = clients.filter((c) => c !== client);
  });
}

export function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(message);
  }
}
