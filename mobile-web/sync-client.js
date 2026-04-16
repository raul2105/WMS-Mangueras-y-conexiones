/**
 * WebSocket sync client for WMS Mobile PWA.
 * Connects to the AWS WebSocket API to receive real-time updates
 * for inventory, catalog, and order changes.
 *
 * Usage:
 *   import { SyncClient } from './sync-client.js';
 *   const sync = new SyncClient({ wsUrl: 'wss://...' });
 *   sync.on('inventory-update', (data) => { ... });
 *   sync.connect();
 */

export class SyncClient {
  /** @param {{ wsUrl: string }} config */
  constructor(config) {
    this._wsUrl = config.wsUrl;
    this._ws = null;
    this._listeners = {};
    this._reconnectDelay = 1000;
    this._maxReconnectDelay = 30000;
    this._shouldReconnect = false;
    this._reconnectTimer = null;
  }

  /**
   * Register an event listener.
   * @param {string} type - Event type (e.g., 'inventory-update', 'product-update', 'order-update')
   * @param {(data: unknown) => void} callback
   */
  on(type, callback) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(callback);
    return this;
  }

  /**
   * Remove an event listener.
   * @param {string} type
   * @param {(data: unknown) => void} callback
   */
  off(type, callback) {
    const arr = this._listeners[type];
    if (!arr) return this;
    this._listeners[type] = arr.filter((cb) => cb !== callback);
    return this;
  }

  /** Open the WebSocket connection. */
  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this._shouldReconnect = true;
    this._reconnectDelay = 1000;
    this._open();
  }

  /** Close the WebSocket connection. */
  disconnect() {
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close(1000, "Client disconnect");
      this._ws = null;
    }
  }

  /** @returns {boolean} */
  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _open() {
    try {
      this._ws = new WebSocket(this._wsUrl);
    } catch (err) {
      console.error("[sync-client] WebSocket creation failed:", err);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      console.log("[sync-client] connected");
      this._reconnectDelay = 1000;
      this._emit("connected", null);
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, data, timestamp } = msg;
        if (type) {
          this._emit(type, { data, timestamp });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this._ws.onerror = (err) => {
      console.error("[sync-client] error:", err);
    };

    this._ws.onclose = (event) => {
      console.log("[sync-client] disconnected:", event.code, event.reason);
      this._ws = null;
      this._emit("disconnected", { code: event.code, reason: event.reason });
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    if (!this._shouldReconnect) return;

    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);

    console.log(`[sync-client] reconnecting in ${delay}ms`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._open();
    }, delay);
  }

  _emit(type, payload) {
    const callbacks = this._listeners[type] || [];
    for (const cb of callbacks) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[sync-client] listener error for "${type}":`, err);
      }
    }
  }
}
