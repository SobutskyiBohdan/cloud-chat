import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JWTPayload } from "../lib/jwt";
import { getRedis, REDIS_KEYS } from "../lib/redis";

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const redis = getRedis();
  const blocked = await redis.get(REDIS_KEYS.blocked(payload.userId));
  if (blocked) {
    res.status(403).json({ error: "Account is blocked" });
    return;
  }

  req.user = payload;
  next();
}

export async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
