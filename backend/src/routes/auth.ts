import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

const IS_PROD = process.env.NODE_ENV === "production";

function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "lax" : "lax",
    maxAge: 15 * 60 * 1000,
    path: "/",
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "lax" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(50),
    email: z.string().email(),
    password: z.string().min(8),
    nickname: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, email, password, nickname } = parsed.data;

  try {
    const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
    if (settings && !settings.registrationEnabled) {
      res.status(403).json({ error: "Registration is currently disabled" });
      return;
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    if (nickname) {
      const existingNick = await prisma.user.findUnique({ where: { nickname } });
      if (existingNick) {
        res.status(409).json({ error: "Nickname already taken" });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, nickname },
    });

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ userId: user.id, email: user.email, role: user.role }),
      signRefreshToken({ userId: user.id, email: user.email, role: user.role }),
    ]);

    setTokenCookies(res, accessToken, refreshToken);
    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, nickname: user.nickname },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid credentials" });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ error: "Account is blocked" });
      return;
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ userId: user.id, email: user.email, role: user.role }),
      signRefreshToken({ userId: user.id, email: user.email, role: user.role }),
    ]);

    setTokenCookies(res, accessToken, refreshToken);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, nickname: user.nickname, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.json({ success: true });
});

// POST /api/auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.isBlocked) {
    res.status(401).json({ error: "User not found or blocked" });
    return;
  }

  const [newAccess, newRefresh] = await Promise.all([
    signAccessToken({ userId: user.id, email: user.email, role: user.role }),
    signRefreshToken({ userId: user.id, email: user.email, role: user.role }),
  ]);

  setTokenCookies(res, newAccess, newRefresh);
  res.json({ success: true });
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, nickname: true, role: true, avatarUrl: true, createdAt: true },
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ user });
});

export default router;
