import { Router, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { breaks, companies, employees, workSessions } from "@workspace/db/schema";
import type {
  ClockStatus,
  Company,
  CompanyReport,
} from "@workspace/api-zod";
import { stripeService } from "../stripeService";

const router = Router();
const TIME_ZONE = "Europe/Berlin";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const ROLE_ORDER = ["owner", "manager", "employee"] as const;
type Role = (typeof ROLE_ORDER)[number];

type Membership = {
  employee: typeof employees.$inferSelect;
  company: typeof companies.$inferSelect;
};

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

async function membershipFromRequest(req: Parameters<RequestHandler>[0]) {
  const userId = userIdFromRequest(req);
  const result = await db
    .select({ employee: employees, company: companies })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(eq(employees.userId, userId))
    .limit(1);
  const membership = result[0] as Membership | undefined;
  if (!membership?.company.stripeCustomerId) return membership;

  const subscriptionResult = await db.execute(sql`
    SELECT id, status
    FROM stripe.subscriptions
    WHERE customer = ${membership.company.stripeCustomerId}
      AND status IN ('active', 'trialing')
    ORDER BY created DESC
    LIMIT 1
  `);
  const subscription = subscriptionResult.rows[0] as { id?: string; status?: string } | undefined;
  if (!subscription?.id || !subscription.status) return membership;

  const subscriptionId = subscription?.id ?? null;
  const subscriptionStatus = subscription?.status ?? "inactive";

  if (
    membership.company.stripeSubscriptionId !== subscriptionId ||
    membership.company.subscriptionStatus !== subscriptionStatus
  ) {
    const [company] = await db
      .update(companies)
      .set({
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, membership.company.id))
      .returning();
    return { employee: membership.employee, company };
  }

  return membership;
}

function hasActiveSubscription(company: typeof companies.$inferSelect) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(company.subscriptionStatus);
}

const requireMembership: RequestHandler = async (req, res, next) => {
  const membership = await membershipFromRequest(req);
  if (!membership || !membership.employee.isActive || membership.employee.status !== "active") {
    res.status(403).json({ error: "Dieses Konto ist keiner aktiven Firmenmitgliedschaft zugeordnet." });
    return;
  }

  const ownerBillingAccess =
    membership.employee.role === "owner" &&
    (req.path === "/timeapp/me" || req.path.startsWith("/timeapp/billing/"));
  if (!hasActiveSubscription(membership.company) && !ownerBillingAccess) {
    res.status(402).json({
      error: "Für diese Firma ist kein aktives Abonnement vorhanden.",
      code: "SUBSCRIPTION_REQUIRED",
    });
    return;
  }
  next();
};

function requireRoles(...roles: Role[]): RequestHandler {
  return async (req, res, next) => {
    const membership = await membershipFromRequest(req);
    if (!membership || !membership.employee.isActive || membership.employee.status !== "active") {
      res.status(403).json({ error: "Keine aktive Firmenmitgliedschaft." });
      return;
    }
    if (!roles.includes(membership.employee.role as Role)) {
      res.status(403).json({ error: "Für diese Aktion fehlen die erforderlichen Rechte." });
      return;
    }
    next();
  };
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

async function getSessions(userId: string, companyId: number, from: string, to: string): Promise<SessionWithBreaks[]> {
  const sessions = await db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.userId, userId),
        eq(workSessions.companyId, companyId),
        gte(workSessions.workDate, from),
        lte(workSessions.workDate, to),
      ),
    )
    .orderBy(desc(workSessions.startedAt));

  if (sessions.length === 0) return [];
  const sessionBreaks = await Promise.all(
    sessions.map((session) => db.select().from(breaks).where(eq(breaks.sessionId, session.id))),
  );
  return sessions.map((session, index) => ({ session, breaks: sessionBreaks[index] ?? [] }));
}

function profileResponse(employee: typeof employees.$inferSelect) {
  return {
    userId: employee.userId,
    employeeId: employee.employeeId,
    email: employee.email,
    displayName: employee.displayName,
    role: ROLE_ORDER.includes(employee.role as Role) ? (employee.role as Role) : "employee",
    hourlyRateCents: employee.hourlyRateCents,
  };
}

function companyResponse(company: typeof companies.$inferSelect): Company {
  return {
    id: company.id,
    name: company.name,
    companyCode: company.companyCode,
    subscriptionStatus: company.subscriptionStatus,
    plan: company.plan,
    hasActiveSubscription: hasActiveSubscription(company),
  };
}

function memberResponse(employee: typeof employees.$inferSelect) {
  return {
    userId: employee.userId,
    employeeId: employee.employeeId,
    email: employee.email,
    displayName: employee.displayName,
    role: ROLE_ORDER.includes(employee.role as Role) ? (employee.role as Role) : "employee",
    status: employee.status === "active" && employee.isActive ? "active" : "inactive",
    hourlyRateCents: employee.hourlyRateCents,
    createdAt: employee.createdAt.toISOString(),
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

async function clockStatus(userId: string, companyId: number, now = new Date()): Promise<ClockStatus> {
  const today = dateKey(now);
  const todayEntries = historyResponse(await getSessions(userId, companyId, today, today), now);
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

async function summary(userId: string, companyId: number, period: "week" | "month", hourlyRateCents: number) {
  const range = periodRange(period);
  const entries = historyResponse(await getSessions(userId, companyId, range.from, range.to), new Date());
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

async function currentSession(userId: string, companyId: number) {
  const result = await db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), eq(workSessions.companyId, companyId), isNull(workSessions.endedAt)))
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

function randomCode(prefix: string, length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = prefix;
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function randomPassword() {
  return `Zeit-${randomCode("", 8)}!`;
}

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Mitarbeiter", lastName: parts.slice(1).join(" ") || undefined };
}

function isManagedEmployeeAccount(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  if (user.publicMetadata?.zeitappAccountType === "managed_employee") return true;
  return /^ZA-[A-Z2-9]{6}-(?:EMP|OWN)-[A-Z2-9]{6}$/.test(user.username ?? "");
}

async function uniqueCompanyCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode("ZA-", 6);
    const existing = await db.select({ id: companies.id }).from(companies).where(eq(companies.companyCode, code)).limit(1);
    if (!existing[0]) return code;
  }
  throw new Error("Could not allocate a company code");
}

async function uniqueEmployeeCode(prefix = "EMP-") {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode(prefix, 6);
    const existing = await db.select({ userId: employees.userId }).from(employees).where(eq(employees.employeeId, code)).limit(1);
    if (!existing[0]) return code;
  }
  throw new Error("Could not allocate an employee code");
}

async function ownerEmail(userId: string) {
  const clerkUser = await clerkClient.users.getUser(userId);
  return clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? `${userId}@zeitapp.local`;
}

async function mutationResponse(userId: string, companyId: number, message: string) {
  return { message, clock: await clockStatus(userId, companyId) };
}

router.use(requireAuth);

router.post("/timeapp/onboarding/company", async (req, res) => {
  const userId = userIdFromRequest(req);
  const existing = await membershipFromRequest(req);
  if (existing) {
    res.status(409).json({ error: "Dieses Konto ist bereits einer Firma zugeordnet." });
    return;
  }
  const prospectiveOwner = await clerkClient.users.getUser(userId);
  if (isManagedEmployeeAccount(prospectiveOwner)) {
    res.status(403).json({ error: "Verwaltete Mitarbeiterkonten dürfen keine Firma anlegen." });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (name.length < 2 || name.length > 120) {
    res.status(400).json({ error: "Bitte einen gültigen Firmennamen angeben." });
    return;
  }

  const companyCode = await uniqueCompanyCode();
  const employeeId = await uniqueEmployeeCode("OWN-");
  const email = await ownerEmail(userId);
  const company = await db.transaction(async (tx) => {
    const [createdCompany] = await tx
      .insert(companies)
      .values({ name, companyCode, ownerUserId: userId })
      .returning();
    await tx.insert(employees).values({
      userId,
      companyId: createdCompany.id,
      employeeId,
      email,
      displayName: name,
      role: "owner",
    });
    return createdCompany;
  });
  res.status(201).json({ company: companyResponse(company), employeeId });
});

router.use(requireMembership);

router.get("/timeapp/me", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const { employee, company } = membership;
  const data = {
    employee: profileResponse(employee),
    company: companyResponse(company),
    clock: await clockStatus(employee.userId, company.id),
    week: await summary(employee.userId, company.id, "week", employee.hourlyRateCents),
    month: await summary(employee.userId, company.id, "month", employee.hourlyRateCents),
  };
  res.json(data);
});

router.post("/timeapp/clock/start", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const { employee, company } = membership;
  if (await currentSession(employee.userId, company.id)) {
    res.status(409).json({ error: "A work session is already active" });
    return;
  }
  const now = new Date();
  await db.insert(workSessions).values({
    userId: employee.userId,
    companyId: company.id,
    workDate: dateKey(now),
    startedAt: now,
  });
  res.json(await mutationResponse(employee.userId, company.id, "Arbeitszeit gestartet"));
});

router.post("/timeapp/clock/stop", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const { employee, company } = membership;
  const session = await currentSession(employee.userId, company.id);
  if (!session) {
    res.status(409).json({ error: "No work session is active" });
    return;
  }
  const now = new Date();
  const openBreak = await activeBreak(session.id);
  if (openBreak) await db.update(breaks).set({ endedAt: now }).where(eq(breaks.id, openBreak.id));
  await db.update(workSessions).set({ endedAt: now, updatedAt: now }).where(eq(workSessions.id, session.id));
  res.json(await mutationResponse(employee.userId, company.id, "Arbeitszeit beendet"));
});

router.post("/timeapp/breaks/start", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const session = await currentSession(membership.employee.userId, membership.company.id);
  if (!session || (await activeBreak(session.id))) {
    res.status(409).json({ error: "A break cannot be started right now" });
    return;
  }
  await db.insert(breaks).values({ sessionId: session.id, startedAt: new Date() });
  res.json(await mutationResponse(membership.employee.userId, membership.company.id, "Pause gestartet"));
});

router.post("/timeapp/breaks/stop", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const session = await currentSession(membership.employee.userId, membership.company.id);
  const openBreak = session ? await activeBreak(session.id) : undefined;
  if (!openBreak) {
    res.status(409).json({ error: "No break is active" });
    return;
  }
  await db.update(breaks).set({ endedAt: new Date() }).where(eq(breaks.id, openBreak.id));
  res.json(await mutationResponse(membership.employee.userId, membership.company.id, "Pause beendet"));
});

router.get("/timeapp/history", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const today = dateKey(new Date());
  const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : addDays(today, -30);
  const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : today;
  res.json({ entries: historyResponse(await getSessions(membership.employee.userId, membership.company.id, from, to), new Date()) });
});

router.get("/timeapp/summary", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const period = req.query.period === "month" ? "month" : "week";
  res.json(await summary(membership.employee.userId, membership.company.id, period, membership.employee.hourlyRateCents));
});

router.get("/timeapp/company", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  res.json({ company: companyResponse(membership.company), currentUser: memberResponse(membership.employee) });
});

router.get("/timeapp/company/members", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const members = await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, membership.company.id))
    .orderBy(desc(employees.createdAt));
  res.json({ members: members.map(memberResponse) });
});

router.post("/timeapp/company/members", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const requestedRole = typeof req.body?.role === "string" ? req.body.role : "employee";
  const hourlyRateCents = Number.isInteger(req.body?.hourlyRateCents) ? req.body.hourlyRateCents : 1500;
  const provisionableRoles: Role[] = ["manager", "employee"];
  if (displayName.length < 2 || !email.includes("@") || !provisionableRoles.includes(requestedRole as Role)) {
    res.status(400).json({ error: "Bitte Name, gültige E-Mail und Rolle angeben." });
    return;
  }
  if (membership.employee.role !== "owner" && requestedRole !== "employee") {
    res.status(403).json({ error: "Manager dürfen nur Mitarbeitende anlegen." });
    return;
  }
  const employeeId = await uniqueEmployeeCode();
  const loginName = `${membership.company.companyCode}-${employeeId}`;
  const temporaryPassword = randomPassword();
  const { firstName, lastName } = splitName(displayName);
  let clerkUser: Awaited<ReturnType<typeof clerkClient.users.createUser>> | undefined;
  try {
    clerkUser = await clerkClient.users.createUser({
      emailAddress: [email],
      username: loginName,
      password: temporaryPassword,
      firstName,
      lastName,
      publicMetadata: { zeitappAccountType: "managed_employee" },
    });
    const [created] = await db
      .insert(employees)
      .values({
        userId: clerkUser.id,
        companyId: membership.company.id,
        employeeId,
        email,
        displayName,
        role: requestedRole,
        hourlyRateCents: Math.max(0, hourlyRateCents),
      })
      .returning();
    res.status(201).json({ member: memberResponse(created), companyCode: membership.company.companyCode, temporaryPassword });
  } catch (error) {
    if (clerkUser) await clerkClient.users.deleteUser(clerkUser.id).catch(() => undefined);
    throw error;
  }
});

router.patch("/timeapp/company/members/:userId/status", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const userId = String(req.params.userId);
  if (userId === membership.employee.userId) {
    res.status(400).json({ error: "Das eigene Konto kann nicht deaktiviert werden." });
    return;
  }
  const target = (await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.companyId, membership.company.id))).limit(1))[0];
  if (!target) {
    res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (membership.employee.role !== "owner" && target.role !== "employee") {
    res.status(403).json({ error: "Manager dürfen nur Mitarbeitende ändern." });
    return;
  }
  const active = req.body?.active === true;
  const [updated] = await db
    .update(employees)
    .set({ isActive: active, status: active ? "active" : "inactive", updatedAt: new Date() })
    .where(eq(employees.userId, userId))
    .returning();
  res.json({ member: memberResponse(updated) });
});

router.delete("/timeapp/company/members/:userId", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const userId = String(req.params.userId);
  if (userId === membership.employee.userId || userId === membership.company.ownerUserId) {
    res.status(400).json({ error: "Dieses Konto kann nicht gelöscht werden." });
    return;
  }
  const target = (await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.companyId, membership.company.id))).limit(1))[0];
  if (!target) {
    res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (membership.employee.role !== "owner" && target.role !== "employee") {
    res.status(403).json({ error: "Manager dürfen nur Mitarbeitende löschen." });
    return;
  }
  const sessions = await db.select({ id: workSessions.id }).from(workSessions).where(eq(workSessions.userId, userId));
  if (sessions.length) await db.delete(breaks).where(inArray(breaks.sessionId, sessions.map((session) => session.id)));
  await db.delete(workSessions).where(eq(workSessions.userId, userId));
  await db.delete(employees).where(eq(employees.userId, userId));
  await clerkClient.users.deleteUser(userId);
  res.status(204).send();
});

router.get("/timeapp/company/reports", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const period = req.query.period === "month" ? "month" : "week";
  const range = periodRange(period);
  const members = await db.select().from(employees).where(eq(employees.companyId, membership.company.id));
  const reports: CompanyReport[] = [];
  for (const member of members) {
    const entries = historyResponse(await getSessions(member.userId, membership.company.id, range.from, range.to), new Date());
    const totalWorkSeconds = entries.reduce((total, entry) => total + entry.netSeconds, 0);
    reports.push({
      userId: member.userId,
      employeeId: member.employeeId,
      displayName: member.displayName,
      totalWorkSeconds,
      totalBreakSeconds: entries.reduce((total, entry) => total + entry.breakSeconds, 0),
      workingDays: new Set(entries.map((entry) => entry.date)).size,
    });
  }
  res.json({ period, from: range.from, to: range.to, reports });
});

router.get("/timeapp/billing/plans", requireRoles("owner"), async (_req, res) => {
  const result = await db.execute(sql`
    SELECT p.id, p.name, p.description, pr.id AS price_id, pr.unit_amount, pr.currency, pr.recurring
    FROM stripe.products p
    INNER JOIN stripe.prices pr ON pr.product = p.id
    WHERE p.active = true
      AND pr.active = true
      AND pr.type = 'recurring'
      AND p.metadata->>'product_key' = 'zeitapp_business'
    ORDER BY pr.unit_amount ASC
  `);
  res.json({
    plans: result.rows.map((row) => {
      const plan = row as {
        id: string;
        name: string | null;
        description: string | null;
        price_id: string;
        unit_amount: number | null;
        currency: string;
        recurring: { interval?: string } | null;
      };
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceId: plan.price_id,
        unitAmount: plan.unit_amount,
        currency: plan.currency,
        interval: plan.recurring?.interval ?? null,
      };
    }),
  });
});

router.post("/timeapp/billing/checkout", requireRoles("owner"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) {
    res.status(403).json({ error: "Kein Firmenkonto gefunden." });
    return;
  }
  const priceId = typeof req.body?.priceId === "string" ? req.body.priceId.trim() : "";
  if (!priceId) {
    res.status(400).json({ error: "Eine Stripe-Preis-ID ist erforderlich." });
    return;
  }
  const price = await db.execute(sql`
    SELECT price.id, product.metadata
    FROM stripe.prices price
    JOIN stripe.products product ON product.id = price.product
    WHERE price.id = ${priceId} AND price.active = true AND product.active = true
    LIMIT 1
  `);
  if (price.rows.length === 0) {
    res.status(400).json({ error: "Der gewählte Tarif ist nicht verfügbar." });
    return;
  }
  const productMetadata = (price.rows[0] as { metadata?: { trial_days?: string } }).metadata;
  const parsedTrialDays = Number.parseInt(productMetadata?.trial_days ?? "0", 10);
  const trialDays = Number.isFinite(parsedTrialDays) ? Math.min(Math.max(parsedTrialDays, 0), 90) : 0;
  try {
    let customerId = membership.company.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(await ownerEmail(membership.company.ownerUserId), membership.company.id);
      customerId = customer.id;
      await db.update(companies).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(companies.id, membership.company.id));
    }
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      typeof req.body?.successUrl === "string" ? req.body.successUrl : `${baseUrl}/billing/success`,
      typeof req.body?.cancelUrl === "string" ? req.body.cancelUrl : `${baseUrl}/billing/cancel`,
      membership.company.id,
      trialDays,
    );
    res.json({ url: session.url });
  } catch (error) {
    req.log.error({ err: error }, "Stripe checkout unavailable");
    res.status(503).json({ error: "Stripe ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut." });
  }
});

router.post("/timeapp/billing/portal", requireRoles("owner"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership?.company.stripeCustomerId) {
    res.status(409).json({ error: "Für diese Firma wurde noch kein Stripe-Konto angelegt." });
    return;
  }
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const session = await stripeService.createCustomerPortalSession(
      membership.company.stripeCustomerId,
      typeof req.body?.returnUrl === "string" ? req.body.returnUrl : `${baseUrl}/billing`,
    );
    res.json({ url: session.url });
  } catch (error) {
    req.log.error({ err: error }, "Stripe customer portal unavailable");
    res.status(503).json({ error: "Stripe ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut." });
  }
});

export default router;