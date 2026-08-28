import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "./prisma";

interface Client {
  socket: WebSocket;
  userId: string;
  branchId: string | null;
  isSuperAdmin: boolean;
}

export interface ChangeEvent {
  entity: string;
  action: string;
  entityId?: string | null;
  branchId?: string | null;
}

const clients = new Set<Client>();
let heartbeat: ReturnType<typeof setInterval> | null = null;

export function initWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (socket, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) { socket.close(4001, "Missing token"); return; }

    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch {
      socket.close(4001, "Invalid token");
      return;
    }

    const user = await prisma.systemUser.findUnique({
      where: { id: payload.id },
      select: { branchId: true, role: { select: { name: true } } },
    }).catch(() => null);
    if (!user) { socket.close(4001, "User not found"); return; }

    const client: Client = {
      socket,
      userId: payload.id,
      branchId: user.branchId,
      isSuperAdmin: user.role?.name?.trim().toLowerCase() === "super_admin",
    };
    clients.add(client);
    (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
    socket.on("pong", () => { (socket as WebSocket & { isAlive?: boolean }).isAlive = true; });
    socket.on("close", () => clients.delete(client));
    socket.on("error", () => clients.delete(client));
  });

  // Drop dead connections (e.g. laptop sleep, network drop) every 30s.
  heartbeat = setInterval(() => {
    for (const client of clients) {
      const socket = client.socket as WebSocket & { isAlive?: boolean };
      if (socket.isAlive === false) { socket.terminate(); clients.delete(client); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  wss.on("close", () => { if (heartbeat) clearInterval(heartbeat); });

  return wss;
}

/** Notify connected clients that something changed, so pages can quietly refetch. */
export function broadcastChange(event: ChangeEvent) {
  const payload = JSON.stringify({ type: "change", ...event });
  for (const client of clients) {
    if (client.socket.readyState !== WebSocket.OPEN) continue;
    // Branch-scoped entities only reach super admins and users in that branch;
    // entities with no branchId (roles, categories, feature flags, sessions) reach everyone.
    if (event.branchId && !client.isSuperAdmin && client.branchId !== event.branchId) continue;
    client.socket.send(payload);
  }
}
