interface ChangeEvent {
  type: 'change';
  entity: string;
  action: string;
  entityId?: string | null;
  branchId?: string | null;
}

type Listener = (event: ChangeEvent) => void;

let socket: WebSocket | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentToken: string | null = null;
const listeners = new Set<Listener>();

function scheduleReconnect() {
  if (reconnectTimer || !currentToken) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    if (currentToken) connectWs(currentToken);
  }, delay);
}

export function connectWs(token: string) {
  currentToken = token;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

  socket.onopen = () => { reconnectAttempt = 0; };
  socket.onclose = () => { socket = null; scheduleReconnect(); };
  socket.onerror = () => { socket?.close(); };
  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as ChangeEvent;
      if (data.type !== 'change') return;
      for (const listener of listeners) listener(data);
    } catch {
      // ignore malformed messages
    }
  };
}

export function disconnectWs() {
  currentToken = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  socket?.close();
  socket = null;
}

/**
 * Subscribe to live-update pings for one or more entity names (matching the
 * `entity` string used by `logActivity` on the backend, e.g. "Asset"), or
 * pass `'*'` to fire on every change regardless of entity.
 * Call the returned function to unsubscribe (e.g. in onDestroy).
 */
export function onChange(entities: string[] | '*', callback: () => void): () => void {
  const set = entities === '*' ? null : new Set(entities);
  const listener: Listener = (event) => { if (!set || set.has(event.entity)) callback(); };
  listeners.add(listener);
  return () => listeners.delete(listener);
}
