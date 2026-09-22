import { Permission } from '@madart/domain';
import { REALTIME_NAMESPACE, RealtimeEventType, roomNames } from '@madart/types';
import { Logger, type OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { type Actor, isGlobalUser } from '../auth/actor';
import { AuthService } from '../auth/auth.service';
import { type DomainEvent, EventBus, makeEvent } from '../common/events/event-bus';
import { PrismaService } from '../common/prisma/prisma.service';
import { getEnv } from '../config/env';
import { DisplayService } from '../display/display.module';

type AuthedSocket = Socket & { data: { actor?: Actor } };

/** Events that change what the customer display shows. */
const DISPLAY_RELEVANT = new Set<RealtimeEventType>([
  RealtimeEventType.ORDER_CONFIRMED,
  RealtimeEventType.ORDER_STATUS_CHANGED,
  RealtimeEventType.ORDER_READY_FOR_PICKUP,
  RealtimeEventType.ORDER_COMPLETED,
  RealtimeEventType.ORDER_CANCELLED,
]);

/**
 * Socket.IO fan-out (docs/REALTIME_EVENTS.md). Rooms are scoped by branch,
 * station, display and order; the token decides what a socket may join.
 */
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: { origin: getEnv().CORS_ORIGINS.length ? getEnv().CORS_ORIGINS : true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly displayTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly auth: AuthService,
    private readonly bus: EventBus,
    private readonly display: DisplayService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.bus.subscribe((event) => this.route(event));
  }

  async handleConnection(socket: AuthedSocket) {
    const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.query?.token as string | undefined);
    if (!token) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'token required' });
      socket.disconnect(true);
      return;
    }
    try {
      const actor = await this.auth.verifyToken(token);
      socket.data.actor = actor;
      for (const room of this.defaultRooms(actor)) await socket.join(room);
      socket.emit('ready', { serverTime: new Date().toISOString(), rooms: [...socket.rooms].filter((r) => r !== socket.id) });
      if (actor.kind === 'device') {
        await this.bus.publish(makeEvent(RealtimeEventType.DEVICE_STATUS, actor.branchId, { deviceId: actor.id, online: true }));
      }
    } catch (err) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: (err as Error).message });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthedSocket) {
    const actor = socket.data.actor;
    if (actor?.kind === 'device') {
      await this.bus.publish(makeEvent(RealtimeEventType.DEVICE_STATUS, actor.branchId, { deviceId: actor.id, online: false }));
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { rooms?: string[] }) {
    const actor = socket.data.actor;
    if (!actor) return { ok: false };
    const joined: string[] = [];
    for (const room of body?.rooms ?? []) {
      if (await this.mayJoin(actor, room)) {
        await socket.join(room);
        joined.push(room);
      }
    }
    return { ok: true, joined };
  }

  @SubscribeMessage('ping')
  ping() {
    return { serverTime: new Date().toISOString() };
  }

  private defaultRooms(actor: Actor): string[] {
    if (actor.kind === 'device') {
      switch (actor.deviceType) {
        case 'PRODUCTION':
          return actor.stationId ? [roomNames.station(actor.branchId, actor.stationId)] : [roomNames.branch(actor.branchId)];
        case 'CUSTOMER_DISPLAY':
          return [roomNames.display(actor.branchId)];
        case 'POS':
          return [roomNames.branch(actor.branchId)];
        case 'KIOSK':
          return []; // kiosks subscribe to their own order rooms
      }
    }
    const rooms: string[] = [];
    if (actor.branchId) rooms.push(roomNames.branch(actor.branchId));
    if (actor.branchId && actor.permissions.includes(Permission.DISPATCH_READ)) rooms.push(roomNames.dispatch(actor.branchId));
    return rooms;
  }

  private async mayJoin(actor: Actor, room: string): Promise<boolean> {
    const branchMatch = /^branch:([0-9a-f-]{36})(?::(station:[0-9a-f-]{36}|display|dispatch))?$/.exec(room);
    if (branchMatch) {
      const branchId = branchMatch[1]!;
      if (isGlobalUser(actor)) return true;
      if (actor.branchId !== branchId) return false;
      if (actor.kind === 'device' && actor.deviceType === 'KIOSK') return false;
      return true;
    }
    const orderMatch = /^order:([0-9a-f-]{36})$/.exec(room);
    if (orderMatch) {
      const order = await this.prisma.client.order.findUnique({ where: { id: orderMatch[1]! }, select: { branchId: true, deviceId: true } });
      if (!order) return false;
      if (isGlobalUser(actor)) return true;
      return order.branchId === actor.branchId;
    }
    return false;
  }

  private route(event: DomainEvent) {
    if (!this.server) return;
    const rooms = new Set<string>([roomNames.branch(event.branchId), roomNames.dispatch(event.branchId)]);
    if (event.stationId) rooms.add(roomNames.station(event.branchId, event.stationId));
    if (event.orderId) rooms.add(roomNames.order(event.orderId));
    if (event.type === RealtimeEventType.DISPLAY_BOARD) {
      this.server.to(roomNames.display(event.branchId)).emit('event', event);
      return;
    }
    for (const room of rooms) this.server.to(room).emit('event', event);
    if (DISPLAY_RELEVANT.has(event.type)) this.scheduleDisplayRefresh(event.branchId);
  }

  /** Debounced snapshot for the display room – it never has to compute state itself. */
  private scheduleDisplayRefresh(branchId: string) {
    const existing = this.displayTimers.get(branchId);
    if (existing) clearTimeout(existing);
    this.displayTimers.set(
      branchId,
      setTimeout(async () => {
        this.displayTimers.delete(branchId);
        try {
          const board = await this.display.board(branchId);
          const ev = makeEvent(RealtimeEventType.DISPLAY_BOARD, branchId, board);
          this.server.to(roomNames.display(branchId)).emit('event', ev);
        } catch (err) {
          this.logger.error(`display refresh failed: ${(err as Error).message}`);
        }
      }, 150),
    );
  }
}
