import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { initSocket } from "./socket";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import chatsRoutes from "./routes/chats";
import adminRoutes from "./routes/admin";
import { prisma } from "./lib/prisma";

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = parseInt(process.env.PORT || "4000", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/chats", chatsRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`✓ Cloud Chat backend running on http://localhost:${PORT}`);
    console.log(`  Frontend allowed: ${FRONTEND_URL}`);
  });
}

start().catch(console.error);
