import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getPubClient, getSubClient, getRedis, REDIS_KEYS, REDIS_CHANNELS } from "./lib/redis";
import { verifyAccessToken } from "./lib/jwt";
import { prisma } from "./lib/prisma";

export async function initSocket(httpServer: ReturnType<typeof import("http").createServer>) {
  const pubClient = getPubClient();
  const subClient = getSubClient();

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  io.adapter(createAdapter(pubClient, subClient));

  const redis = getRedis();

  // Auth middleware for Socket.io
  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.cookie
        ?.split(";")
        .find((c) => c.trim().startsWith("access_token="))
        ?.split("=")[1];

    if (!token) return next(new Error("Unauthorized"));

    const payload = await verifyAccessToken(token);
    if (!payload) return next(new Error("Invalid token"));

    const blocked = await redis.get(REDIS_KEYS.blocked(payload.userId));
    if (blocked) return next(new Error("Account blocked"));

    socket.data.userId = payload.userId;
    socket.data.role = payload.role;
    next();
  });

  io.on("connection", async (socket) => {
    const userId: string = socket.data.userId;

    await redis.hset(REDIS_KEYS.activeSockets, userId, socket.id);
    const count = await redis.incr(REDIS_KEYS.activeConnections);
    io.emit("stats:connections", count);

    socket.join(`user:${userId}`);

    socket.on("join:chat", (chatId: string) => socket.join(`chat:${chatId}`));
    socket.on("leave:chat", (chatId: string) => socket.leave(`chat:${chatId}`));

    socket.on("message:send", async (data: { chatId: string; content: string; mediaUrl?: string; id?: string }) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, nickname: true, avatarUrl: true },
      });
      io.to(`chat:${data.chatId}`).emit("message:new", { ...data, userId, user, createdAt: new Date().toISOString() });
    });

    socket.on("typing:start", (chatId: string) => socket.to(`chat:${chatId}`).emit("typing:user", { userId, chatId }));
    socket.on("typing:stop", (chatId: string) => socket.to(`chat:${chatId}`).emit("typing:stopped", { userId, chatId }));

    socket.on("disconnect", async () => {
      await redis.hdel(REDIS_KEYS.activeSockets, userId);
      const n = await redis.decr(REDIS_KEYS.activeConnections);
      if (n < 0) await redis.set(REDIS_KEYS.activeConnections, 0);
      io.emit("stats:connections", Math.max(0, n));
    });
  });

  // Admin pub/sub actions — force disconnect blocked users
  const adminSub = getSubClient();
  adminSub.subscribe(REDIS_CHANNELS.blockUser, REDIS_CHANNELS.unblockUser);

  adminSub.on("message", async (channel, message) => {
    const { userId } = JSON.parse(message) as { userId: string };
    if (channel === REDIS_CHANNELS.blockUser) {
      await redis.set(REDIS_KEYS.blocked(userId), "1");
      io.to(`user:${userId}`).emit("force:disconnect", { reason: "Account blocked by admin" });
      io.in(`user:${userId}`).disconnectSockets(true);
    } else if (channel === REDIS_CHANNELS.unblockUser) {
      await redis.del(REDIS_KEYS.blocked(userId));
    }
  });

  return io;
}
