const clients = new Map(); // userId -> Map(sessionToken -> Set(res))

export function addClient(userId, sessionToken, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Map());
  }
  const userTokens = clients.get(userId);
  if (!userTokens.has(sessionToken)) {
    userTokens.set(sessionToken, new Set());
  }
  userTokens.get(sessionToken).add(res);

  // Setup keep-alive ping setiap 30 detik agar koneksi browser tidak terputus
  const timer = setInterval(() => {
    res.write(':\n\n'); 
  }, 30000);

  res.on('close', () => {
    clearInterval(timer);
    if (clients.has(userId)) {
      const tokens = clients.get(userId);
      if (tokens.has(sessionToken)) {
        tokens.get(sessionToken).delete(res);
        if (tokens.get(sessionToken).size === 0) {
          tokens.delete(sessionToken);
        }
      }
      if (tokens.size === 0) {
        clients.delete(userId);
      }
    }
  });
}

export function broadcastToUser(userId, event, data) {
  const userTokens = clients.get(userId);
  if (userTokens) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const resSet of userTokens.values()) {
      resSet.forEach(res => res.write(payload));
    }
  }
}

export function broadcastToSession(userId, sessionToken, event, data) {
  const userTokens = clients.get(userId);
  if (userTokens && userTokens.has(sessionToken)) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    userTokens.get(sessionToken).forEach(res => res.write(payload));
  }
}
