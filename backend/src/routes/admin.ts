import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { getRedis, getPubClient, REDIS_KEYS, REDIS_CHANNELS } from "../lib/redis";
import { authMiddleware, adminMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware, adminMiddleware);

// ─── Users ────────────────────────────────────────────────────────────────────

router.get("/users", async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || "1");
  const limit = parseInt((req.query.limit as string) || "20");
  const search = (req.query.search as string) || "";
  const skip = (page - 1) * limit;

  const where = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }, { nickname: { contains: search, mode: "insensitive" as const } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, nickname: true, role: true, isBlocked: true, avatarUrl: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

router.post("/users/:id/block", async (req: AuthRequest, res: Response) => {
  const targetId = req.params.id as string;
  const block: boolean = req.body.block ?? true;

  if (targetId === req.user!.userId) {
    res.status(400).json({ error: "Cannot block yourself" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  await prisma.user.update({ where: { id: targetId }, data: { isBlocked: block } });

  await prisma.adminLog.create({
    data: {
      adminId: req.user!.userId,
      targetId,
      action: block ? "BLOCK_USER" : "UNBLOCK_USER",
      details: `${block ? "Blocked" : "Unblocked"} user ${target.email}`,
    },
  });

  const redis = getRedis();
  const pub = getPubClient();

  if (block) {
    await redis.set(REDIS_KEYS.blocked(targetId), "1");
    pub.publish(REDIS_CHANNELS.blockUser, JSON.stringify({ userId: targetId })).catch(() => {});
  } else {
    await redis.del(REDIS_KEYS.blocked(targetId));
    pub.publish(REDIS_CHANNELS.unblockUser, JSON.stringify({ userId: targetId })).catch(() => {});
  }

  res.json({ success: true, isBlocked: block });
});

// ─── Groups ───────────────────────────────────────────────────────────────────

router.get("/groups", async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || "1");
  const limit = parseInt((req.query.limit as string) || "20");
  const search = (req.query.search as string) || "";
  const skip = (page - 1) * limit;

  const where = { isGroup: true, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) };

  const [groups, total] = await Promise.all([
    prisma.chat.findMany({ where, include: { _count: { select: { members: true, messages: true } } }, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.chat.count({ where }),
  ]);

  res.json({ groups, total, page, pages: Math.ceil(total / limit) });
});

router.patch("/groups/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { isBlocked } = req.body;

  const chat = await prisma.chat.update({ where: { id }, data: { isBlocked } });

  await prisma.adminLog.create({
    data: { adminId: req.user!.userId, action: isBlocked ? "BLOCK_GROUP" : "UNBLOCK_GROUP", details: `Group: ${chat.name || id}` },
  });

  res.json({ chat });
});

router.delete("/groups/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const chat = await prisma.chat.findUnique({ where: { id } });
  if (!chat) { res.status(404).json({ error: "Not found" }); return; }

  await prisma.chat.delete({ where: { id } });

  await prisma.adminLog.create({
    data: { adminId: req.user!.userId, action: "DELETE_GROUP", details: `Deleted group: ${chat.name || id}` },
  });

  res.json({ success: true });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/settings", async (_req: AuthRequest, res: Response) => {
  const settings = await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, registrationEnabled: true, maintenanceMode: false },
  });
  res.json({ settings });
});

router.patch("/settings", async (req: AuthRequest, res: Response) => {
  const { registrationEnabled, maintenanceMode } = req.body;

  const settings = await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: {
      ...(typeof registrationEnabled === "boolean" ? { registrationEnabled } : {}),
      ...(typeof maintenanceMode === "boolean" ? { maintenanceMode } : {}),
    },
    create: { id: 1, registrationEnabled: true, maintenanceMode: false },
  });

  const pub = getPubClient();
  pub.publish(REDIS_CHANNELS.globalSettings, JSON.stringify(settings)).catch(() => {});

  await prisma.adminLog.create({
    data: { adminId: req.user!.userId, action: "UPDATE_SETTINGS", details: JSON.stringify({ registrationEnabled, maintenanceMode }) },
  });

  res.json({ settings });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get("/stats", async (_req: AuthRequest, res: Response) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalUsers, newUsersToday, totalMessages, messagesLast24h, totalGroups, blockedUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since24h } } }),
    prisma.message.count(),
    prisma.message.count({ where: { createdAt: { gte: since24h } } }),
    prisma.chat.count({ where: { isGroup: true } }),
    prisma.user.count({ where: { isBlocked: true } }),
  ]);

  const redis = getRedis();
  const activeConnections = parseInt((await redis.get(REDIS_KEYS.activeConnections)) || "0");

  const hourlyMessages = await Promise.all(
    Array.from({ length: 24 }, async (_, i) => {
      const start = new Date(now.getTime() - (23 - i) * 3600000);
      const end = new Date(now.getTime() - (22 - i) * 3600000);
      const count = await prisma.message.count({ where: { createdAt: { gte: start, lt: end } } });
      return { hour: start.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }), messages: count };
    })
  );

  const hourlyUsers = await Promise.all(
    Array.from({ length: 24 }, async (_, i) => {
      const start = new Date(now.getTime() - (23 - i) * 3600000);
      const end = new Date(now.getTime() - (22 - i) * 3600000);
      const count = await prisma.user.count({ where: { createdAt: { gte: start, lt: end } } });
      return { hour: start.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }), users: count };
    })
  );

  res.json({ stats: { totalUsers, newUsersToday, totalMessages, messagesLast24h, totalGroups, blockedUsers, activeConnections }, charts: { hourlyMessages, hourlyUsers } });
});

// ─── Logs ─────────────────────────────────────────────────────────────────────

router.get("/logs", async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || "1");
  const limit = 30;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({
      include: { admin: { select: { id: true, name: true, email: true } }, target: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.adminLog.count(),
  ]);

  res.json({ logs, total, pages: Math.ceil(total / limit) });
});

export default router;
