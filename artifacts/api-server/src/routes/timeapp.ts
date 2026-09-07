import { Router, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { breaks, employees, workSessions } from "@workspace/db/schema";
import type { ClockStatus, EmployeeProfile, Summary } from "@workspace/api-zod";

const router = Router();
const TIME_ZONE = "Europe/Berlin";

const requireAuth: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function userIdFromRequest(req: Parameters<RequestHandler>[0]) {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Missing authenticated user");
  return userId;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateAtUtc(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: string, amount: number) {
  const result = dateAtUtc(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

function periodRange(period: "week" | "month") {
  const today = dateKey(new Date());
  const todayDate = dateAtUtc(today);
  if (period === "month") {
    const from = `${today.slice(0, 7)}-01`;
    const nextMonth = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, 1));
    return { from, to: addDays(nextMonth.toISOString().slice(0, 10), -1) };
  }

  const day = todayDate.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return { from: addDays(today, mondayOffset), to: addDays(today, 6 + mondayOffset) };
}

function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

type SessionWithBreaks = {
  session: typeof workSessions.$inferSelect;
  breaks: (typeof breaks.$inferSelect)[];
};

async function getSessions(
  userId: string,
  from: string,
  to: string,
): Promise<SessionWithBreaks[]> {
  const sessions = await db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.userId, userId),
        gte(workSessions.workDate, from),
        lte(workSessions.workDate, to),
      ),
    )
    .orderBy(desc(workSessions.startedAt));

  if (sessions.length === 0) return [];

  const sessionBreaks = await Promise.all(
    sessions.map((session) =>
      db.select().from(breaks).where(eq(breaks.sessionId, session.id)),
    ),
  );

  return sessions.map((session, index) => ({
    session,
    breaks: sessionBreaks[index] ?? [],
  }));
}

async function ensureEmployee(userId: string) {
  const existing = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const clerkUser = await clerkClient.users.getUser(userId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${userId}@timeapp.local`;
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "Mitarbeiter";
  const employeeId = `EMP-${userId.slice(-8).toUpperCase()}`;

  const inserted = await db
    .insert(employees)
    .values({
      userId,
      employeeId,
      email,
      displayName,
    })
    .onConflictDoNothing({ target: employees.userId })
    .returning();

  const result =
    inserted[0] ??
    (
      await db
        .select()
        .from(employees)
        .where(eq(employees.userId, userId))
        .limit(1)
    )[0];
  if (!result) throw new Error("Employee profile could not be created");
  return result;
}

function profileResponse(employee: NonNullable<Awaited<ReturnType<typeof ensureEmployee>>>): EmployeeProfile {
  return {
    userId: employee.userId,
    employeeId: employee.employeeId,
    email: employee.email,
    displayName: employee.displayName,
    role: employee.role === "admin" ? "admin" : "employee",
    hourlyRateCents: employee.hourlyRateCents,
  };
}

function historyResponse(sessions: SessionWithBreaks[], now: Date) {
  return sessions.map(({ session, breaks: sessionBreaks }) => {
    const end = session.endedAt ?? now;
    const grossSeconds = secondsBetween(session.startedAt, end);
    const breakEntries = sessionBreaks.map((item) => ({
      id: item.id,
      startedAt: item.startedAt.toISOString(),
      endedAt: item.endedAt?.toISOString() ?? null,
      durationSeconds: secondsBetween(item.startedAt, item.endedAt ?? now),
    }));
    const breakSeconds = breakEntries.reduce((total, item) => total + item.durationSeconds, 0);

    return {
      id: session.id,
      date: session.workDate,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      grossSeconds,
      breakSeconds,
      netSeconds: Math.max(0, grossSeconds - breakSeconds),
      breaks: breakEntries,
    };
  });
}

async function clockStatus(userId: string, now = new Date()): Promise<ClockStatus> {
  const today = dateKey(now);
  const todayEntries = historyResponse(await getSessions(userId, today, today), now);
  const active = todayEntries.find((item) => item.endedAt === null);
  const currentBreak = active?.breaks.find((item) => item.endedAt === null);

  return {
    status: currentBreak ? "on_break" : active ? "on_duty" : "off_duty",
    currentSessionId: active?.id ?? null,
    startedAt: active?.startedAt ? new Date(active.startedAt) : null,
    activeSeconds: active?.grossSeconds ?? 0,
    breakSeconds: active?.breakSeconds ?? 0,
    todayNetSeconds: todayEntries.reduce((total, item) => total + item.netSeconds, 0),
  };
}

async function summary(
  userId: string,
  period: "week" | "month",
  hourlyRateCents: number,
) {
  const range = periodRange(period);
  const entries = historyResponse(await getSessions(userId, range.from, range.to), new Date());
  const totalWorkSeconds = entries.reduce((total, item) => total + item.netSeconds, 0);
  const totalBreakSeconds = entries.reduce((total, item) => total + item.breakSeconds, 0);
  const workingDays = new Set(entries.map((item) => item.date)).size;

  return {
    period,
    from: range.from,
    to: range.to,
    totalWorkSeconds,
    totalBreakSeconds,
    workingDays,
    averageWorkSeconds: workingDays ? Math.round(totalWorkSeconds / workingDays) : 0,
    estimatedGrossCents: Math.round((totalWorkSeconds / 3600) * hourlyRateCents),
  };
}

async function currentSession(userId: string) {
  const result = await db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), isNull(workSessions.endedAt)))
    .orderBy(desc(workSessions.startedAt))
    .limit(1);
  return result[0];
}

async function activeBreak(sessionId: number) {
  const result = await db
    .select()
    .from(breaks)
    .where(and(eq(breaks.sessionId, sessionId), isNull(breaks.endedAt)))
    .orderBy(desc(breaks.startedAt))
    .limit(1);
  return result[0];
}

async function mutationResponse(userId: string, message: string) {
  return { message, clock: await clockStatus(userId) };
}

router.use(requireAuth);

router.get("/timeapp/me", async (req, res) => {
  const userId = userIdFromRequest(req);
  const employee = await ensureEmployee(userId);
  const data = {
    employee: profileResponse(employee),
    clock: await clockStatus(userId),
    week: await summary(userId, "week", employee.hourlyRateCents),
    month: await summary(userId, "month", employee.hourlyRateCents),
  };
  res.json(data);
});

router.post("/timeapp/clock/start", async (req, res) => {
  const userId = userIdFromRequest(req);
  await ensureEmployee(userId);
  if (await currentSession(userId)) {
    res.status(409).json({ error: "A work session is already active" });
    return;
  }
  const now = new Date();
  await db.insert(workSessions).values({
    userId,
    workDate: dateKey(now),
    startedAt: now,
  });
  res.json(await mutationResponse(userId, "Arbeitszeit gestartet"));
});

router.post("/timeapp/clock/stop", async (req, res) => {
  const userId = userIdFromRequest(req);
  const session = await currentSession(userId);
  if (!session) {
    res.status(409).json({ error: "No work session is active" });
    return;
  }
  const now = new Date();
  const openBreak = await activeBreak(session.id);
  if (openBreak) {
    await db
      .update(breaks)
      .set({ endedAt: now })
      .where(eq(breaks.id, openBreak.id));
  }
  await db
    .update(workSessions)
    .set({ endedAt: now, updatedAt: now })
    .where(eq(workSessions.id, session.id));
  res.json(await mutationResponse(userId, "Arbeitszeit beendet"));
});

router.post("/timeapp/breaks/start", async (req, res) => {
  const userId = userIdFromRequest(req);
  const session = await currentSession(userId);
  if (!session || (await activeBreak(session.id))) {
    res.status(409).json({ error: "A break cannot be started right now" });
    return;
  }
  await db.insert(breaks).values({ sessionId: session.id, startedAt: new Date() });
  res.json(await mutationResponse(userId, "Pause gestartet"));
});

router.post("/timeapp/breaks/stop", async (req, res) => {
  const userId = userIdFromRequest(req);
  const session = await currentSession(userId);
  const openBreak = session ? await activeBreak(session.id) : undefined;
  if (!openBreak) {
    res.status(409).json({ error: "No break is active" });
    return;
  }
  await db
    .update(breaks)
    .set({ endedAt: new Date() })
    .where(eq(breaks.id, openBreak.id));
  res.json(await mutationResponse(userId, "Pause beendet"));
});

router.get("/timeapp/history", async (req, res) => {
  const userId = userIdFromRequest(req);
  const today = dateKey(new Date());
  const from = typeof req.query.from === "string" ? req.query.from : addDays(today, -30);
  const to = typeof req.query.to === "string" ? req.query.to : today;
  const data = {
    entries: historyResponse(await getSessions(userId, from, to), new Date()),
  };
  res.json(data);
});

router.get("/timeapp/summary", async (req, res) => {
  const userId = userIdFromRequest(req);
  const employee = await ensureEmployee(userId);
  const period = req.query.period === "month" ? "month" : "week";
  res.json(await summary(userId, period, employee.hourlyRateCents));
});

export default router;