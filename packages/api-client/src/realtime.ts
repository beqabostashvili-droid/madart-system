import type { AnyRealtimeEnvelope, ConnectionState, RealtimeEventType, RealtimeEnvelope } from '@madart/types';
import { REALTIME_NAMESPACE } from '@madart/types';
import { io, type Socket } from 'socket.io-client';

export interface RealtimeOptions {
  baseUrl: string;
  getToken: () => string | null | undefined;
  /** Extra rooms to request after connecting (server validates). */
  rooms?: string[];
}

type Listener = (event: AnyRealtimeEnvelope) => void;
type StateListener = (state: ConnectionState) => void;

/**
 * Socket.IO wrapper with connection-state reporting (ONLINE / RECONNECTING /
 * OFFLINE), event de-duplication by envelope id and a server clock offset so
 * derived production statuses match the API even on drifted devices.
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private rooms = new Set<string>();
  private _state: ConnectionState = 'OFFLINE';
  /** serverTime − clientTime in ms */
  clockOffsetMs = 0;

  constructor(private readonly options: RealtimeOptions) {
    for (const r of options.rooms ?? []) this.rooms.add(r);
  }

  get state() {
    return this._state;
  }

  connect() {
    if (this.socket) return;
    const url = this.options.baseUrl.replace(/\/$/, '') + REALTIME_NAMESPACE;
    this.socket = io(url, {
      auth: (cb) => cb({ token: this.options.getToken() ?? '' }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    this.socket.on('connect', () => this.setState('ONLINE'));
    this.socket.on('ready', (payload: { serverTime: string }) => {
      this.clockOffsetMs = new Date(payload.serverTime).getTime() - Date.now();
      if (this.rooms.size) this.socket?.emit('subscribe', { rooms: [...this.rooms] });
    });
    this.socket.on('disconnect', () => this.setState('RECONNECTING'));
    this.socket.io.on('reconnect_attempt', () => this.setState('RECONNECTING'));
    this.socket.io.on('reconnect_failed', () => this.setState('OFFLINE'));
    this.socket.on('connect_error', () => this.setState(this._state === 'ONLINE' ? 'RECONNECTING' : 'OFFLINE'));
    this.socket.on('event', (event: AnyRealtimeEnvelope) => {
      if (this.seen.has(event.id)) return;
      this.remember(event.id);
      for (const l of this.listeners) l(event);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.setState('OFFLINE');
  }

  subscribe(rooms: string[]) {
    for (const r of rooms) this.rooms.add(r);
    if (this.socket?.connected) this.socket.emit('subscribe', { rooms });
  }

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  on<T extends RealtimeEventType>(type: T, listener: (event: RealtimeEnvelope<T>) => void): () => void {
    return this.onEvent((e) => {
      if (e.type === type) listener(e as RealtimeEnvelope<T>);
    });
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this._state);
    return () => this.stateListeners.delete(listener);
  }

  /** Server-aligned "now". */
  now(): Date {
    return new Date(Date.now() + this.clockOffsetMs);
  }

  private setState(s: ConnectionState) {
    if (s === this._state) return;
    this._state = s;
    for (const l of this.stateListeners) l(s);
  }

  private remember(id: string) {
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > 2000) {
      const drop = this.seenOrder.splice(0, 1000);
      for (const d of drop) this.seen.delete(d);
    }
  }
}
