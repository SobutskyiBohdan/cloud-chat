import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { uploadImage } from "../lib/cloudinary";
import { getRedis, REDIS_KEYS } from "../lib/redis";

const router = Router();

// GET /api/users?q= — search (nickname priority, fallback to name)
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const query = (req.query.q as string)?.trim();
  if (!query || query.length < 2) {
    res.json({ users: [] });
    return;
  }

  const isNickname = query.startsWith("@");
  const term = isNickname ? query.slice(1) : query;

  if (isNickname) {
    const users = await prisma.user.findMany({
      where: { nickname: { contains: term, mode: "insensitive" }, isBlocked: false, id: { not: req.user!.userId } },
      select: { id: true, name: true, nickname: true, avatarUrl: true },
      take: 20,
    });
    res.json({ users });
    return;
  }

  // Non-@ search: nickname first, then name
  const byNickname = await prisma.user.findMany({
    where: { nickname: { contains: term, mode: "insensitive" }, isBlocked: false, id: { not: req.user!.userId } },
    select: { id: true, name: true, nickname: true, avatarUrl: true },
    take: 10,
  });

  const nickIds = new Set(byNickname.map((u) => u.id));

  const byName = await prisma.user.findMany({
    where: { name: { contains: term, mode: "insensitive" }, isBlocked: false, id: { notIn: [req.user!.userId, ...nickIds] } },
    select: { id: true, name: true, nickname: true, avatarUrl: true },
    take: 20 - byNickname.length,
  });

  res.json({ users: [...byNickname, ...byName] });
});

// PATCH /api/users/profile
router.patch("/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(50).optional(),
    nickname: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { nickname } = parsed.data;
  if (nickname) {
    const existing = await prisma.user.findUnique({ where: { nickname } });
    if (existing && existing.id !== req.user!.userId) {
      res.status(409).json({ error: "Nickname already taken" });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: parsed.data,
    select: { id: true, name: true, email: true, nickname: true, avatarUrl: true, role: true },
  });

  res.json({ user });
});

// POST /api/users/avatar — upload avatar to Cloudinary, returns URL
router.post("/avatar", authMiddleware, async (req: AuthRequest, res: Response) => {
  const parsed = z.object({ data: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Missing image data" }); return; }

  try {
    const buffer = Buffer.from(parsed.data.data, "base64");
    const url = await uploadImage(buffer, "cloud-chat/avatars");
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

// GET /api/users/online — check which user IDs are currently online
router.get("/online", authMiddleware, async (req: AuthRequest, res: Response) => {
  const ids = ((req.query.ids as string) || "").split(",").filter(Boolean);
  if (!ids.length) { res.json({ onlineIds: [] }); return; }

  const redis = getRedis();
  const results = await Promise.all(ids.map((id) => redis.hexists(REDIS_KEYS.activeSockets, id)));
  const onlineIds = ids.filter((_, i) => results[i]);
  res.json({ onlineIds });
});

// GET /api/users/:userId — public profile
router.get("/:userId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.params.userId as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, nickname: true, avatarUrl: true, createdAt: true },
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ user });
});

export default router;
