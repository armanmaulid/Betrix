const clients = new Set();

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

export function clientCount() {
  return clients.size;
}

export function broadcastNews(articles) {
  if (articles.length === 0) return;

  const payload = `event: news\ndata: ${JSON.stringify(articles)}\n\n`;

  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function sendHeartbeat() {
  for (const res of clients) {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}
