import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getIo } from "../lib/io";

const router = Router();

const POLL_INCLUDE = {
  options: { include: { votes: { select: { userId: true } } } },
} as const;

// GET /api/polls/:pollId
router.get("/:pollId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const poll = await prisma.poll.findUnique({
    where: { id: req.params.pollId as string },
    include: POLL_INCLUDE,
  });
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const message = await prisma.message.findUnique({ where: { id: poll.messageId } });
  if (!message) { res.status(404).json({ error: "Poll not found" }); return; }

  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId: req.user!.userId, chatId: message.chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  res.json({ poll });
});

// POST /api/polls/:pollId/vote
router.post("/:pollId/vote", authMiddleware, async (req: AuthRequest, res: Response) => {
  const pollId = req.params.pollId as string;
  const { optionId } = z.object({ optionId: z.string() }).parse(req.body);
  const userId = req.user!.userId;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: POLL_INCLUDE,
  });
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
  if (poll.expiresAt && poll.expiresAt < new Date()) {
    res.status(400).json({ error: "Poll has expired" }); return;
  }

  const option = poll.options.find((o) => o.id === optionId);
  if (!option) { res.status(400).json({ error: "Invalid option" }); return; }

  const message = await prisma.message.findUnique({ where: { id: poll.messageId } });
  const member = await prisma.chatMember.findUnique({
    where: { userId_chatId: { userId, chatId: message!.chatId } },
  });
  if (!member) { res.status(403).json({ error: "Not a member" }); return; }

  const existing = await prisma.pollVote.findUnique({
    where: { optionId_userId: { optionId, userId } },
  });

  if (existing) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
  } else {
    if (!poll.multipleChoice) {
      const currentVote = await prisma.pollVote.findFirst({
        where: { userId, option: { pollId } },
      });
      if (currentVote) {
        await prisma.pollVote.delete({ where: { id: currentVote.id } });
      }
    }
    await prisma.pollVote.create({ data: { optionId, userId } });
  }

  const updated = await prisma.poll.findUnique({
    where: { id: pollId },
    include: POLL_INCLUDE,
  });

  getIo()?.to(`chat:${message!.chatId}`).emit("poll:updated", {
    messageId: poll.messageId,
    poll: updated,
  });

  res.json({ poll: updated });
});

export default router;
