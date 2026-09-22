import { DEVICE_PERMISSIONS, type DeviceType, type Permission, type RoleCode } from '@madart/domain';
import type { DeviceProfile, LoginResponse, UserProfile } from '@madart/types';
import { Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { getEnv } from '../config/env';
import type { Actor } from './actor';

interface UserClaims {
  kind: 'user';
  sub: string;
  branchId: string | null;
  roles: RoleCode[];
  permissions: Permission[];
}
interface DeviceClaims {
  kind: 'device';
  sub: string;
  deviceType: DeviceType;
  branchId: string;
  stationId: string | null;
  jti: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = getEnv();
  /** device lastSeenAt is written at most once per minute per device */
  private readonly lastSeenWritten = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────── employees ─────────────────────────────

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid credentials');
    }
    const profile = this.toProfile(user);
    const claims: UserClaims = { kind: 'user', sub: user.id, branchId: user.branchId, roles: profile.roles, permissions: profile.permissions };
    const accessToken = jwt.sign(claims, this.env.JWT_SECRET, { expiresIn: this.env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });
    const decoded = jwt.decode(accessToken) as { exp: number };
    return { accessToken, expiresAt: new Date(decoded.exp * 1000).toISOString(), user: profile };
  }

  async profileFor(userId: string): Promise<UserProfile> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || !user.active) throw new UnauthorizedError();
    return this.toProfile(user);
  }

  private toProfile(user: {
    id: string;
    email: string;
    displayName: string;
    branchId: string | null;
    roles: { role: { code: string; permissions: { permission: { code: string } }[] } }[];
  }): UserProfile {
    const roles = user.roles.map((r) => r.role.code as RoleCode);
    const permissions = [...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code as Permission)))];
    return { id: user.id, email: user.email, displayName: user.displayName, branchId: user.branchId, roles, permissions };
  }

  // ───────────────────────────── devices ───────────────────────────────

  /** Issues a new device token and stores its hash. Returns the raw token once. */
  async issueDeviceToken(deviceId: string): Promise<string> {
    const device = await this.prisma.client.device.findUniqueOrThrow({ where: { id: deviceId } });
    const claims: DeviceClaims = {
      kind: 'device',
      sub: device.id,
      deviceType: device.type,
      branchId: device.branchId,
      stationId: device.stationId,
      jti: randomUUID(),
    };
    const token = jwt.sign(claims, this.env.JWT_SECRET, { expiresIn: this.env.DEVICE_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
    await this.prisma.client.device.update({ where: { id: device.id }, data: { tokenHash: hashToken(token) } });
    return token;
  }

  async deviceProfile(actor: Actor): Promise<DeviceProfile> {
    if (actor.kind !== 'device') throw new UnauthorizedError('Not a device token');
    const device = await this.prisma.client.device.findUniqueOrThrow({
      where: { id: actor.id },
      include: { branch: true, station: true },
    });
    return {
      id: device.id,
      name: device.name,
      type: device.type,
      branchId: device.branchId,
      branchName: device.branch.name,
      stationId: device.stationId,
      stationCode: device.station?.code ?? null,
      permissions: actor.permissions,
      settings: (device.settings as Record<string, unknown>) ?? {},
    };
  }

  // ───────────────────────────── verification ──────────────────────────

  /** Verifies a bearer token (user or device) and resolves the Actor. */
  async verifyToken(token: string): Promise<Actor> {
    let claims: UserClaims | DeviceClaims;
    try {
      claims = jwt.verify(token, this.env.JWT_SECRET) as UserClaims | DeviceClaims;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    if (claims.kind === 'user') {
      // Re-read permissions so role changes apply without waiting for expiry.
      const profile = await this.profileFor(claims.sub);
      return {
        kind: 'user',
        id: profile.id,
        displayName: profile.displayName,
        branchId: profile.branchId,
        roles: profile.roles,
        permissions: profile.permissions,
      };
    }

    if (claims.kind === 'device') {
      const device = await this.prisma.client.device.findUnique({ where: { id: claims.sub } });
      if (!device || !device.active) throw new UnauthorizedError('Device disabled');
      if (device.tokenHash !== hashToken(token)) throw new UnauthorizedError('Device token revoked');
      this.touchDevice(device.id);
      return {
        kind: 'device',
        id: device.id,
        displayName: device.name,
        deviceType: device.type,
        branchId: device.branchId,
        stationId: device.stationId,
        permissions: [...DEVICE_PERMISSIONS[device.type]],
      };
    }
    throw new UnauthorizedError('Unknown token kind');
  }

  private touchDevice(deviceId: string) {
    const last = this.lastSeenWritten.get(deviceId) ?? 0;
    if (Date.now() - last < 60_000) return;
    this.lastSeenWritten.set(deviceId, Date.now());
    this.prisma.client.device
      .update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } })
      .catch((err) => this.logger.warn(`lastSeenAt update failed: ${(err as Error).message}`));
  }
}
