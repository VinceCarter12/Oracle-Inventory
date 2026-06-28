import cron from "node-cron";
import { prisma } from "./prisma";
import { sendMaintenanceReminderEmail, sendMaintenanceDueEmail, type MaintenanceAsset } from "./mailer";

// How many days before due date to send the reminder (configurable via env)
const REMINDER_DAYS = parseInt(process.env.MAINTENANCE_REMINDER_DAYS ?? "7", 10);

/** Return a Date at midnight UTC for a given offset from today */
function utcDay(offsetDays: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** Return a Date at end-of-day UTC (23:59:59.999) for a given offset from today */
function utcDayEnd(offsetDays: number): Date {
  const d = utcDay(offsetDays);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

async function getAdminEmails(): Promise<{ email: string; name: string }[]> {
  const users = await prisma.systemUser.findMany({
    where: {
      status: "active",
      role: { name: { in: ["Super Admin", "Admin"] } },
    },
    select: { email: true, name: true },
  });
  return users;
}

function toMaintenanceAsset(a: {
  id: string;
  name: string;
  serialNumber: string | null;
  nextMaintenanceDate: Date | null;
  category: { name: string } | null;
  branch: { name: string } | null;
}): MaintenanceAsset {
  return {
    id: a.id,
    name: a.name,
    serialNumber: a.serialNumber,
    category: a.category?.name ?? null,
    branch: a.branch?.name ?? null,
    nextMaintenanceDate: a.nextMaintenanceDate!,
  };
}

export async function runMaintenanceCheck() {
  const today      = utcDay(0);
  const todayEnd   = utcDayEnd(0);
  const reminderAt = utcDay(REMINDER_DAYS);
  const reminderEnd = utcDayEnd(REMINDER_DAYS);

  const [admins, reminderAssets, dueAssets] = await Promise.all([
    getAdminEmails(),

    // Assets due in exactly REMINDER_DAYS days where reminder hasn't been sent for this date yet
    prisma.asset.findMany({
      where: {
        nextMaintenanceDate: { gte: reminderAt, lte: reminderEnd },
        status: "active",
        OR: [
          { notifiedReminder: null },
          { notifiedReminder: { not: { gte: reminderAt, lte: reminderEnd } } },
        ],
      },
      select: {
        id: true, name: true, serialNumber: true, nextMaintenanceDate: true,
        category: { select: { name: true } },
        branch:   { select: { name: true } },
      },
    }),

    // Assets due today where due notification hasn't been sent for this date yet
    prisma.asset.findMany({
      where: {
        nextMaintenanceDate: { gte: today, lte: todayEnd },
        status: "active",
        OR: [
          { notifiedDue: null },
          { notifiedDue: { not: { gte: today, lte: todayEnd } } },
        ],
      },
      select: {
        id: true, name: true, serialNumber: true, nextMaintenanceDate: true,
        category: { select: { name: true } },
        branch:   { select: { name: true } },
      },
    }),
  ]);

  const result = {
    recipients: admins.length,
    remindersSent: 0,
    dueSent: 0,
    errors: [] as string[],
  };

  if (!admins.length) {
    console.log("[maintenance] No active admin recipients found — skipping.");
    return result;
  }

  // ── Send reminder emails ───────────────────────────────────────────────────
  for (const raw of reminderAssets) {
    const asset = toMaintenanceAsset(raw);
    for (const admin of admins) {
      try {
        await sendMaintenanceReminderEmail({ to: admin.email, recipientName: admin.name, asset, daysUntil: REMINDER_DAYS });
        result.remindersSent++;
      } catch (err) {
        const msg = `Reminder for "${raw.name}" to ${admin.email}: ${(err as Error).message}`;
        console.error(`[maintenance] ${msg}`);
        result.errors.push(msg);
      }
    }
    await prisma.asset.update({
      where: { id: raw.id },
      data: { notifiedReminder: raw.nextMaintenanceDate },
    });
    console.log(`[maintenance] Reminder sent for asset "${raw.name}" (due ${raw.nextMaintenanceDate?.toDateString()})`);
  }

  // ── Send due-today emails ──────────────────────────────────────────────────
  for (const raw of dueAssets) {
    const asset = toMaintenanceAsset(raw);
    for (const admin of admins) {
      try {
        await sendMaintenanceDueEmail({ to: admin.email, recipientName: admin.name, asset });
        result.dueSent++;
      } catch (err) {
        const msg = `Due-today for "${raw.name}" to ${admin.email}: ${(err as Error).message}`;
        console.error(`[maintenance] ${msg}`);
        result.errors.push(msg);
      }
    }
    await prisma.asset.update({
      where: { id: raw.id },
      data: { notifiedDue: raw.nextMaintenanceDate },
    });
    console.log(`[maintenance] Due-today email sent for asset "${raw.name}"`);
  }

  return result;
}

/** Start the daily maintenance notification cron (runs every day at 08:00 server time) */
export function startMaintenanceCron() {
  cron.schedule("0 8 * * *", () => {
    console.log("[maintenance] Running daily maintenance check…");
    runMaintenanceCheck().catch((err) => {
      console.error("[maintenance] Cron error:", err);
    });
  });
  console.log(`[maintenance] Cron scheduled — daily at 08:00 (reminder window: ${REMINDER_DAYS} days)`);
}
