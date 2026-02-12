import type { WSContext } from "hono/ws";
import pino from "pino";

const logger = pino({ name: "ws-feed" });

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const MAX_MISSED_PONGS = 2;

interface ConnectedClient {
  ws: WSContext;
  agentId: string;
  username: string;
  missedPongs: number;
  pingTimer?: ReturnType<typeof setInterval>;
  pongTimer?: ReturnType<typeof setTimeout>;
}

const clients = new Map<WSContext, ConnectedClient>();

export function getConnectedClientCount(): number {
  return clients.size;
}

export function addClient(
  ws: WSContext,
  agentId: string,
  username: string,
): void {
  const client: ConnectedClient = {
    ws,
    agentId,
    username,
    missedPongs: 0,
  };

  clients.set(ws, client);

  // Send connected event
  sendToClient(ws, {
    type: "connected",
    data: { agentId, connectedClients: clients.size },
    timestamp: new Date().toISOString(),
  });

  // Start ping/pong heartbeat
  client.pingTimer = setInterval(() => {
    sendToClient(ws, {
      type: "ping",
      data: {},
      timestamp: new Date().toISOString(),
    });

    // Start pong timeout
    client.pongTimer = setTimeout(() => {
      client.missedPongs++;
      if (client.missedPongs >= MAX_MISSED_PONGS) {
        logger.info({ agentId, username }, "Client removed after missed pongs");
        removeClient(ws);
        try {
          ws.close(1001, "Missed pong responses");
        } catch {
          // Already closed
        }
      }
    }, PONG_TIMEOUT_MS);
  }, PING_INTERVAL_MS);

  logger.info({ agentId, username, connectedClients: clients.size }, "Client connected");
}

export function removeClient(ws: WSContext): void {
  const client = clients.get(ws);
  if (client) {
    if (client.pingTimer) clearInterval(client.pingTimer);
    if (client.pongTimer) clearTimeout(client.pongTimer);
    clients.delete(ws);
    logger.info(
      { agentId: client.agentId, connectedClients: clients.size },
      "Client disconnected",
    );
  }
}

export function handleMessage(ws: WSContext, raw: string): void {
  try {
    const message = JSON.parse(raw);
    if (message.type === "pong") {
      const client = clients.get(ws);
      if (client) {
        client.missedPongs = 0;
        if (client.pongTimer) {
          clearTimeout(client.pongTimer);
          client.pongTimer = undefined;
        }
      }
    }
    // Ignore other message types for now
  } catch {
    // Ignore malformed messages
  }
}

/**
 * Send an event to a specific agent by agentId.
 * Iterates connected clients and sends to matching agentId.
 */
export function sendToAgent(agentId: string, event: { type: string; data: unknown }): void {
  const message = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });

  for (const [ws, client] of clients) {
    if (client.agentId === agentId) {
      try {
        ws.send(message);
      } catch {
        removeClient(ws);
      }
    }
  }
}

export function broadcast(event: { type: string; data: unknown }): void {
  const message = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });

  for (const [ws] of clients) {
    try {
      ws.send(message);
    } catch {
      removeClient(ws);
    }
  }
}

function sendToClient(ws: WSContext, message: unknown): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    removeClient(ws);
  }
}
