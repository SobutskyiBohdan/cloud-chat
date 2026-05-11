import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getRedis, REDIS_KEYS } from "../lib/redis";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/chats
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chats = await prisma.chat.findMany({
    where: { members: { some: { userId: req.user!.userId } }, isBlocked: false },
    include: {
      members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { user: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ chats });
});

// POST /api/chats
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    memberIds: z.array(z.string()).min(1).max(100),
    isGroup: z.boolean().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, memberIds, isGroup } = parsed.data;
  const allIds = [...new Set([req.user!.userId, ...memberIds])];

  if (!isGroup && allIds.length === 2) {
    const existing = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: allIds.map((id) => ({ members: { some: { userId: id } } })),
      },
    });
    if (existing) {
      res.json({ chat: existing });
      return;
    }
  }

  const chat = await prisma.chat.create({
    data: {
      name: isGroup ? name : undefined,
      isGroup,
      members: { create: allIds.map((userId) => ({ userId, role: userId === req.user!.userId ? "OWNER" : "MEMBER" })) },
    },
    include: { members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } } },
  });

  res.status(201).json({ chat });
});

// GET /api/chats/:id
router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
  if (settings?.maintenanceMode && req.user!.role !== "ADMIN") {
    res.status(503).json({ error: "App is in maintenance mode" });
    return;
  }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId: id } },
  });
  if (!member) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const chat = await prisma.chat.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } } },
  });

  if (!chat) { res.status(404).json({ error: "Not found" }); return; }
  if (chat.isBlocked && req.user!.role !== "ADMIN") { res.status(403).json({ error: "Chat is blocked" }); return; }

  res.json({ chat });
});

// GET /api/chats/:id/messages
router.get("/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const cursor = req.query.cursor as string | undefined;
  const limit = 50;

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const messages = await prisma.message.findMany({
    where: { chatId },
    include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  res.json({ messages: messages.reverse(), nextCursor: messages.length === limit ? messages[0]?.id : null });
});

// POST /api/chats/:id/messages
router.post("/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const schema = z.object({ content: z.string().min(1).max(4000), mediaUrl: z.string().url().optional() });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const message = await prisma.message.create({
    data: { content: parsed.data.content, mediaUrl: parsed.data.mediaUrl, userId: req.user!.userId, chatId },
    include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } },
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  const redis = getRedis();
  redis.incr(REDIS_KEYS.messagesCount).catch(() => {});

  res.status(201).json({ message });
});

export default router;
