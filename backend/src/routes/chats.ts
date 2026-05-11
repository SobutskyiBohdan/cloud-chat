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

// PATCH /api/chats/:id — update group info (owner only)
router.patch("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    avatarUrl: z.string().url().nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
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

// POST /api/chats/:id/members — add member to group (owner only)
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

// DELETE /api/chats/:id/members/:userId — remove member (owner) or leave (self)
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
    where: { chatId, deletedAt: null },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  res.json({ messages: messages.reverse(), nextCursor: messages.length === limit ? messages[0]?.id : null });
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
  }).refine((d) => d.content.trim().length > 0 || d.mediaUrl, { message: "Message must have content or media" });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const message = await prisma.message.create({
    data: {
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl,
      mediaType: parsed.data.mediaType,
      mediaName: parsed.data.mediaName,
      userId: req.user!.userId,
      chatId,
      replyToId: parsed.data.replyToId,
    },
    include: MESSAGE_INCLUDE,
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  const redis = getRedis();
  redis.incr(REDIS_KEYS.messagesCount).catch(() => {});

  res.status(201).json({ message });
});

// POST /api/chats/:id/upload — upload media file
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
    else if (mimeType.startsWith("video/")) resourceType = "video";
    else resourceType = "raw";

    const result = await uploadFile(buffer, "cloud-chat/messages", resourceType, name);
    res.json({ url: result.url, mediaType: result.resourceType, mediaName: name || null });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

// PATCH /api/chats/:chatId/messages/:messageId — edit own message
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

// DELETE /api/chats/:chatId/messages/:messageId — soft delete own message
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

// POST /api/chats/:chatId/messages/:messageId/react — toggle emoji reaction
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
    res.json({ action: "removed", emoji });
  } else {
    const reaction = await prisma.reaction.create({
      data: { messageId, userId, emoji },
    });
    res.json({ action: "added", reaction });
  }
});

// PATCH /api/chats/:chatId/read — mark chat as read
router.patch("/:chatId/read", authMiddleware, async (req: AuthRequest, res: Response) => {
  const chatId = req.params.chatId as string;
  await prisma.chatMember.update({
    where: { userId_chatId: { userId: req.user!.userId, chatId } },
    data: { lastReadAt: new Date() },
  });
  res.json({ success: true });
});

export default router;
