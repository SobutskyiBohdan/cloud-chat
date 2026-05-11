import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getRedis, REDIS_KEYS } from "../lib/redis";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { uploadFile } from "../lib/cloudinary";
import { getIo } from "../lib/io";

const router = Router();

const MESSAGE_INCLUDE = {
  user: { select: { id: true, name: true, nickname: true, avatarUrl: true } },
  reactions: { select: { id: true, userId: true, emoji: true } },
  mentions: { select: { userId: true } },
  poll: {
    include: {
      options: { include: { votes: { select: { userId: true } } } },
    },
  },
  replyTo: {
    include: { user: { select: { id: true, name: true, nickname: true } } },
  },
} as const;

// GET /api/chats
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  const chats = await prisma.chat.findMany({
    where: { members: { some: { userId } }, isBlocked: false },
    include: {
      members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, where: { deletedAt: null }, include: { user: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const chatsWithUnread = await Promise.all(chats.map(async (chat) => {
    const membership = chat.members.find((m) => m.userId === userId);
    const lastReadAt = membership?.lastReadAt;
    const unreadCount = await prisma.message.count({
      where: {
        chatId: chat.id,
        userId: { not: userId },
        deletedAt: null,
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
    return { ...chat, unreadCount };
  }));

  res.json({ chats: chatsWithUnread });
});

// POST /api/chats
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    memberIds: z.array(z.string()).min(1).max(100),
    isGroup: z.boolean().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { name, memberIds, isGroup } = parsed.data;
  const allIds = [...new Set([req.user!.userId, ...memberIds])];

  if (!isGroup && allIds.length === 2) {
    const existing = await prisma.chat.findFirst({
      where: { isGroup: false, AND: allIds.map((id) => ({ members: { some: { userId: id } } })) },
    });
    if (existing) { res.json({ chat: existing }); return; }
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
    res.status(503).json({ error: "App is in maintenance mode" }); return;
  }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId: id } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const chat = await prisma.chat.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } } },
  });

  if (!chat) { res.status(404).json({ error: "Not found" }); return; }
  if (chat.isBlocked && req.user!.role !== "ADMIN") { res.status(403).json({ error: "Chat is blocked" }); return; }

  res.json({ chat });
});

// PATCH /api/chats/:id
router.patch("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const parsed = z.object({
    name: z.string().min(1).max(100).optional(),
    avatarUrl: z.string().url().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId: id } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }
  if (member.role !== "OWNER") { res.status(403).json({ error: "Only group owner can edit this" }); return; }

  const chat = await prisma.chat.update({
    where: { id },
    data: parsed.data,
    include: { members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } } },
  });
  res.json({ chat });
});

// POST /api/chats/:id/members
router.post("/:id/members", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const { userId: targetUserId } = z.object({ userId: z.string() }).parse(req.body);

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member || member.role !== "OWNER") { res.status(403).json({ error: "Only group owner can add members" }); return; }

  const existing = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: targetUserId, chatId } },
  });
  if (existing) { res.status(409).json({ error: "Already a member" }); return; }

  await prisma.chatMember.create({ data: { userId: targetUserId, chatId, role: "MEMBER" } });
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      members: { include: { user: { select: { id: true, name: true, nickname: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, where: { deletedAt: null }, include: { user: { select: { name: true } } } },
    },
  });
  getIo()?.to(`user:${targetUserId}`).emit("chat:added", { chat: { ...chat, unreadCount: 0 } });
  res.json({ chat });
});

// DELETE /api/chats/:id/members/:userId
router.delete("/:id/members/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const isSelf = targetUserId === req.user!.userId;

  if (!isSelf) {
    const member = await prisma.chatMember.findUnique({
      where: { userId_chatId: { userId: req.user!.userId, chatId } },
    });
    if (!member || member.role !== "OWNER") { res.status(403).json({ error: "Only group owner can remove members" }); return; }
  }

  await prisma.chatMember.deleteMany({ where: { userId: targetUserId, chatId } });
  res.json({ success: true });
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
    where: {
      chatId,
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  res.json({ messages: messages.reverse(), nextCursor: messages.length === limit ? messages[0]?.id : null });
});

// GET /api/chats/:id/messages/search
router.get("/:id/messages/search", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const q = (req.query.q as string || "").trim();
  if (!q) { res.json({ messages: [] }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const messages = await prisma.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      content: { contains: q, mode: "insensitive" },
    },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  res.json({ messages: messages.reverse() });
});

// GET /api/chats/:id/pinned
router.get("/:id/pinned", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const messages = await prisma.message.findMany({
    where: { chatId, deletedAt: null, pinnedAt: { not: null } },
    include: MESSAGE_INCLUDE,
    orderBy: { pinnedAt: "desc" },
  });

  res.json({ messages });
});

// POST /api/chats/:id/messages
router.post("/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const schema = z.object({
    content: z.string().max(4000).default(""),
    mediaUrl: z.string().url().optional(),
    mediaType: z.string().optional(),
    mediaName: z.string().max(255).optional(),
    replyToId: z.string().optional(),
    expiresIn: z.number().int().min(5).max(86400).optional(),
  }).refine((d) => d.content.trim().length > 0 || d.mediaUrl, { message: "Message must have content or media" });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const expiresAt = parsed.data.expiresIn
    ? new Date(Date.now() + parsed.data.expiresIn * 1000)
    : undefined;

  const message = await prisma.message.create({
    data: {
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl,
      mediaType: parsed.data.mediaType,
      mediaName: parsed.data.mediaName,
      userId: req.user!.userId,
      chatId,
      replyToId: parsed.data.replyToId,
      expiresAt,
    },
    include: MESSAGE_INCLUDE,
  });

  // Handle @mentions
  const mentionMatches = [...parsed.data.content.matchAll(/@([\w._-]+)/g)];
  if (mentionMatches.length > 0) {
    const nicknames = mentionMatches.map((m) => m[1]);
    const mentionedUsers = await prisma.user.findMany({
      where: {
        nickname: { in: nicknames },
        memberships: { some: { chatId } },
        id: { not: req.user!.userId },
      },
      select: { id: true },
    });

    if (mentionedUsers.length > 0) {
      await prisma.mention.createMany({
        data: mentionedUsers.map((u) => ({ messageId: message.id, userId: u.id })),
        skipDuplicates: true,
      });
      const io = getIo();
      for (const u of mentionedUsers) {
        io?.to(`user:${u.id}`).emit("user:mentioned", {
          chatId,
          messageId: message.id,
          fromName: req.user!.email,
        });
      }
    }
  }

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  const redis = getRedis();
  redis.incr(REDIS_KEYS.messagesCount).catch(() => {});

  res.status(201).json({ message });
});

// POST /api/chats/:id/upload
router.post("/:id/upload", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.id as string;
  const parsed = z.object({
    data: z.string().min(1),
    mimeType: z.string().min(1),
    name: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  try {
    const buffer = Buffer.from(parsed.data.data, "base64");
    const { mimeType, name } = parsed.data;

    let resourceType: "image" | "video" | "raw" | "auto" = "auto";
    if (mimeType.startsWith("image/")) resourceType = "image";
    else if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) resourceType = "video";
    else resourceType = "raw";

    const result = await uploadFile(buffer, "cloud-chat/messages", resourceType, name);
    const mediaType = mimeType.startsWith("audio/") ? "audio" : result.resourceType;
    res.json({ url: result.url, mediaType, mediaName: name || null });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

// PATCH /api/chats/:chatId/messages/:messageId
router.patch("/:chatId/messages/:messageId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  const messageId = req.params.messageId as string;

  const parsed = z.object({ content: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid content" }); return; }

  const message = await prisma.message.findFirst({
    where: { id: messageId, chatId, userId: req.user!.userId, deletedAt: null },
  });
  if (!message) { res.status(404).json({ error: "Message not found" }); return; }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: parsed.data.content, editedAt: new Date() },
    include: MESSAGE_INCLUDE,
  });
  res.json({ message: updated });
});

// DELETE /api/chats/:chatId/messages/:messageId
router.delete("/:chatId/messages/:messageId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  const messageId = req.params.messageId as string;

  const message = await prisma.message.findFirst({
    where: { id: messageId, chatId, userId: req.user!.userId, deletedAt: null },
  });
  if (!message) { res.status(404).json({ error: "Message not found" }); return; }

  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  res.json({ success: true });
});

// POST /api/chats/:chatId/messages/:messageId/pin — toggle pin
router.post("/:chatId/messages/:messageId/pin", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  const messageId = req.params.messageId as string;

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const message = await prisma.message.findFirst({
    where: { id: messageId, chatId, deletedAt: null },
  });
  if (!message) { res.status(404).json({ error: "Message not found" }); return; }

  const pinnedAt = message.pinnedAt ? null : new Date();
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { pinnedAt },
    include: MESSAGE_INCLUDE,
  });

  const action = pinnedAt ? "pinned" : "unpinned";
  getIo()?.to(`chat:${chatId}`).emit(`message:${action}`, { messageId, chatId, pinnedAt });
  res.json({ message: updated, action });
});

// POST /api/chats/:chatId/messages/:messageId/react
router.post("/:chatId/messages/:messageId/react", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  const messageId = req.params.messageId as string;
  const { emoji } = z.object({ emoji: z.string().min(1).max(8) }).parse(req.body);
  const userId = req.user!.userId;

  const member = await prisma.chatMember.findUnique({ where: { userId_chatId: { userId, chatId } } });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    getIo()?.to(`chat:${chatId}`).emit("message:reaction", { messageId, userId, emoji, action: "removed" });
    res.json({ action: "removed", emoji });
  } else {
    const reaction = await prisma.reaction.create({ data: { messageId, userId, emoji } });
    getIo()?.to(`chat:${chatId}`).emit("message:reaction", { messageId, userId, emoji, action: "added", reactionId: reaction.id });
    res.json({ action: "added", reaction });
  }
});

// PATCH /api/chats/:chatId/read
router.patch("/:chatId/read", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  const userId = req.user!.userId;
  const lastReadAt = new Date();

  await prisma.chatMember.update({
    where: { userId_chatId: { userId, chatId } },
    data: { lastReadAt },
  });

  getIo()?.to(`chat:${chatId}`).emit("chat:read", { chatId, userId, lastReadAt });
  res.json({ success: true });
});

// POST /api/chats/:chatId/polls
router.post("/:chatId/polls", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  const schema = z.object({
    question: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(10),
    multipleChoice: z.boolean().default(false),
    expiresIn: z.number().int().min(60).max(604800).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const pollExpiresAt = parsed.data.expiresIn
    ? new Date(Date.now() + parsed.data.expiresIn * 1000)
    : undefined;

  const message = await prisma.message.create({
    data: {
      content: parsed.data.question,
      mediaType: "poll",
      userId: req.user!.userId,
      chatId,
      poll: {
        create: {
          question: parsed.data.question,
          multipleChoice: parsed.data.multipleChoice,
          expiresAt: pollExpiresAt,
          options: { create: parsed.data.options.map((text) => ({ text })) },
        },
      },
    },
    include: MESSAGE_INCLUDE,
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  const io = getIo();
  io?.to(`chat:${chatId}`).emit("message:new", {
    ...message,
    reactions: [],
    replyTo: null,
    createdAt: message.createdAt.toISOString(),
  });

  res.status(201).json({ message });
});

export default router;
