import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { asyncHandler } from "../../utils/asyncHandler";
import { notFound } from "../../utils/httpError";

const router = Router();

// A user sees notifications addressed directly to them, plus broadcasts to
// their role. A broadcast's read state is per-recipient (NotificationRead),
// since one manager reading it must not mark it read for every other
// manager who received the same broadcast.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const unreadOnly = z.coerce.boolean().optional().parse(req.query.unreadOnly);
    const [notifications, myReads] = await Promise.all([
      prisma.notification.findMany({
        where: { OR: [{ userId: req.user!.id }, { userId: null, role: req.user!.role }] },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.notificationRead.findMany({ where: { userId: req.user!.id }, select: { notificationId: true } }),
    ]);
    const readBroadcastIds = new Set(myReads.map((r) => r.notificationId));
    const withReadState = notifications
      .map((n) => ({ ...n, isRead: n.userId ? n.isRead : readBroadcastIds.has(n.id) }))
      .filter((n) => !unreadOnly || !n.isRead);
    res.json(withReadState);
  })
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const [unreadTargeted, broadcasts, myReads] = await Promise.all([
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
      prisma.notification.findMany({ where: { userId: null, role: req.user!.role }, select: { id: true } }),
      prisma.notificationRead.findMany({ where: { userId: req.user!.id }, select: { notificationId: true } }),
    ]);
    const readBroadcastIds = new Set(myReads.map((r) => r.notificationId));
    const unreadBroadcasts = broadcasts.filter((b) => !readBroadcastIds.has(b.id)).length;
    res.json({ count: unreadTargeted + unreadBroadcasts });
  })
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n) throw notFound("Notification not found");

    if (n.userId === null) {
      await prisma.notificationRead.upsert({
        where: { notificationId_userId: { notificationId: n.id, userId: req.user!.id } },
        create: { notificationId: n.id, userId: req.user!.id },
        update: {},
      });
      res.json({ ...n, isRead: true });
      return;
    }
    if (n.userId !== req.user!.id) throw notFound("Notification not found");
    const updated = await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
    res.json(updated);
  })
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const broadcasts = await prisma.notification.findMany({
      where: { userId: null, role: req.user!.role },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.notification.updateMany({
        where: { userId: req.user!.id, isRead: false },
        data: { isRead: true },
      }),
      ...broadcasts.map((b) =>
        prisma.notificationRead.upsert({
          where: { notificationId_userId: { notificationId: b.id, userId: req.user!.id } },
          create: { notificationId: b.id, userId: req.user!.id },
          update: {},
        })
      ),
    ]);
    res.json({ ok: true });
  })
);

export default router;
