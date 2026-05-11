import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mailer";

const router = Router();
const IS_PROD = process.env.COOKIE_SECURE !== "false";
const REQUIRE_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  const opts = { httpOnly: true, secure: IS_PROD, sameSite: "lax" as const, path: "/" };
  res.cookie("access_token", accessToken, { ...opts, maxAge: 15 * 60 * 1000 });
  res.cookie("refresh_token", refreshToken, { ...opts, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { name, email, password, nickname } = parsed.data;

  try {
    const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
    if (settings && !settings.registrationEnabled) {
      res.status(403).json({ error: "Registration is currently disabled" }); return;
    }

    if (await prisma.user.findUnique({ where: { email } })) {
      res.status(409).json({ error: "Email already in use" }); return;
    }
    if (nickname && await prisma.user.findUnique({ where: { nickname } })) {
      res.status(409).json({ error: "Nickname already taken" }); return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, nickname, emailVerified: false },
    });

    const token = randomToken();
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    await sendVerificationEmail(email, token);

    res.status(201).json({ pendingVerification: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify-email
router.post("/verify-email", async (req: Request, res: Response) => {
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

  const record = await prisma.emailVerificationToken.findUnique({ where: { token }, include: { user: true } });
  if (!record || record.expiresAt < new Date()) {
    res.status(400).json({ error: "Invalid or expired verification link" }); return;
  }

  await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
  await prisma.emailVerificationToken.delete({ where: { id: record.id } });

  const user = record.user;
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ userId: user.id, email: user.email, role: user.role }),
    signRefreshToken({ userId: user.id, email: user.email, role: user.role }),
  ]);
  setTokenCookies(res, accessToken, refreshToken);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, nickname: user.nickname, avatarUrl: user.avatarUrl } });
});

// POST /api/auth/resend-verification
router.post("/resend-verification", async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) { res.json({ sent: true }); return; }

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  const token = randomToken();
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  await sendVerificationEmail(email, token);
  res.json({ sent: true });
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const schema = z.object({ login: z.string().min(1), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid credentials" }); return; }

  const { login, password } = parsed.data;

  try {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: login } })
      : await prisma.user.findUnique({ where: { nickname: login.startsWith("@") ? login.slice(1) : login } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    if (user.isBlocked) { res.status(403).json({ error: "Account is blocked" }); return; }
    if (REQUIRE_VERIFICATION && !user.emailVerified) {
      res.status(403).json({ error: "Please verify your email first", code: "EMAIL_NOT_VERIFIED", email: user.email }); return;
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ userId: user.id, email: user.email, role: user.role }),
      signRefreshToken({ userId: user.id, email: user.email, role: user.role }),
    ]);
    setTokenCookies(res, accessToken, refreshToken);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, nickname: user.nickname, avatarUrl: user.avatarUrl } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req: Request, res: Response) => {
  const { login } = z.object({ login: z.string().min(1) }).parse(req.body);

  try {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: login } })
      : await prisma.user.findUnique({ where: { nickname: login.startsWith("@") ? login.slice(1) : login } });

    if (user) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      const token = randomToken();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await sendPasswordResetEmail(user.email, token);
    }
  } catch (err) {
    console.error(err);
  }
  // Always 200 to avoid email enumeration
  res.json({ sent: true });
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req: Request, res: Response) => {
  const { token, password } = z.object({ token: z.string().min(1), password: z.string().min(8) }).parse(req.body);

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    res.status(400).json({ error: "Invalid or expired reset link" }); return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });
  await prisma.passwordResetToken.delete({ where: { id: record.id } });
  res.json({ success: true });
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
  if (!refreshToken) { res.status(401).json({ error: "No refresh token" }); return; }

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) { res.status(401).json({ error: "Invalid refresh token" }); return; }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.isBlocked) { res.status(401).json({ error: "User not found or blocked" }); return; }

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
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ user });
});

export default router;
