import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { Task, UserRole } from '@prisma/client';
import { JwtPayload, toAuthenticatedUser } from '../auth/jwt-payload';

/**
 * `@WebSocketGateway`'s options object is evaluated once, when this class is
 * *defined* (module load time) — which, because of how `AppModule`'s own
 * imports are required, happens BEFORE `ConfigModule.forRoot()` has loaded
 * `.env` into `process.env`. A plain `new ConfigService().get('FRONTEND_ORIGIN')`
 * called right here would therefore read an empty/undefined env. Instead,
 * `cors.origin` is given as a function: Socket.io only *calls* it once a
 * real connection comes in (i.e. long after the app has fully bootstrapped),
 * and `ConfigService.get()` always reads `process.env` live on every call
 * (see `getFromProcessEnv` in `@nestjs/config`) rather than caching a value
 * from construction time — so by the time this function actually runs,
 * `FRONTEND_ORIGIN` is reliably populated.
 */
const corsOriginConfigService = new ConfigService();

/**
 * Pushes `task.created` / `task.updated` / `task.deleted` into role/owner
 * scoped Socket.io rooms (KAD-05) so no client ever receives a task it
 * isn't entitled to see over the realtime channel.
 *
 * This gateway never receives client-to-server messages (no
 * `@SubscribeMessage` handlers) — it only emits, and clients can never
 * request to join an arbitrary room. Room membership is decided exactly
 * once, at connect time, from the verified JWT.
 */
@WebSocketGateway({
  cors: {
    origin: (
      _origin: string,
      callback: (err: Error | null, allow?: string) => void,
    ) => {
      callback(
        null,
        corsOriginConfigService.get<string>(
          'FRONTEND_ORIGIN',
          'http://localhost:3001',
        ),
      );
    },
    credentials: false,
  },
})
export class TasksGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  private static readonly EVENTS = {
    CREATED: 'task.created',
    UPDATED: 'task.updated',
    DELETED: 'task.deleted',
  } as const;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Mirrors the REST `JwtAuthGuard`/`JwtStrategy`'s verification exactly:
   * same secret, same expiry enforcement (no `ignoreExpiration`). The token
   * is read ONLY from `handshake.auth.token` — never a query param or
   * header fallback — and room joins happen ONLY after verification
   * succeeds.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      client.disconnect(true);
      return;
    }

    const user = toAuthenticatedUser(payload);

    void client.join(`user:${user.userId}`);
    if (user.role === UserRole.admin) {
      void client.join('admin');
    }
  }

  private roomsForTask(ownerId: string): string[] {
    return ['admin', `user:${ownerId}`];
  }

  emitTaskCreated(task: Task): void {
    this.server
      .to(this.roomsForTask(task.ownerId))
      .emit(TasksGateway.EVENTS.CREATED, task);
  }

  emitTaskUpdated(task: Task): void {
    this.server
      .to(this.roomsForTask(task.ownerId))
      .emit(TasksGateway.EVENTS.UPDATED, task);
  }

  emitTaskDeleted(id: string, ownerId: string): void {
    this.server
      .to(this.roomsForTask(ownerId))
      .emit(TasksGateway.EVENTS.DELETED, { id });
  }
}
