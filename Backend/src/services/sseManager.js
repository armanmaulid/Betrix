const clients = new Map();

export function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);

  // Setup keep-alive ping setiap 30 detik agar koneksi browser tidak terputus
  const timer = setInterval(() => {
    // Ping event to keep the connection alive
    res.write(':\n\n'); 
  }, 30000);

  res.on('close', () => {
    clearInterval(timer);
    if (clients.has(userId)) {
      clients.get(userId).delete(res);
      if (clients.get(userId).size === 0) {
        clients.delete(userId);
      }
    }
  });
}

export function broadcastToUser(userId, event, data) {
  const userClients = clients.get(userId);
  if (userClients) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    userClients.forEach(res => res.write(payload));
  }
}
