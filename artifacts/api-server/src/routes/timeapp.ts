import { Router, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { breaks, companies, employees, leaveRequests, monthlyWorkPlans, weeklySchedules, workSessions } from "@workspace/db/schema";
import type {
  ClockStatus,
  Company,
  CompanyReport,
} from "@workspace/api-zod";
import { stripeService } from "../stripeService";
import {
  companyTrialEndsAt,
  hasTeamAccess,
  isDevelopmentMode,
  isActiveSubscriptionStatus,
  reconcileSubscriptionState,
} from "../billingState";
import {
  employeeLoginIdentifier,
  normalizeEmployeeLoginPart,
} from "../employeeLogin";
import {
  canResetManagedEmployeePassword,
  createTemporaryPassword,
} from "../managedEmployeePassword";
import { createManagedEmployeePasswordResetHandler } from "../managedEmployeePasswordReset";
import { provisionManagedEmployee } from "../managedEmployeeProvisioning";
import { canManageWeeklySchedule, emptyScheduleDays, normalizeWeekStart, validateScheduleDays } from "../weeklySchedule";
import {
  applyApprovedLeave,
  canReviewLeave,
  validateLeaveDecision,
  validateLeaveRequest,
  workingDaysOnLeave,
} from "../leaveRequests";
import {
  applyApprovedAbsences,
  emptyMonthlyPlan,
  monthEnd,
  normalizeMonthStart,
  plannedWorkMinutes,
  validateMonthlyPlanDays,
  workingDaysOnApprovedAbsence,
} from "../monthlyWorkPlan";

const router = Router();
const TIME_ZONE = "Europe/Berlin";
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

  const reconciledState = reconcileSubscriptionState(membership.company, subscription);

  if (
    membership.company.stripeSubscriptionId !== reconciledState.stripeSubscriptionId ||
    membership.company.subscriptionStatus !== reconciledState.subscriptionStatus
  ) {
    const [company] = await db
      .update(companies)
      .set({
        stripeSubscriptionId: reconciledState.stripeSubscriptionId,
        subscriptionStatus: reconciledState.subscriptionStatus,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, membership.company.id))
      .returning();
    return { employee: membership.employee, company };
  }

  return membership;
}

function hasActiveSubscription(company: typeof companies.$inferSelect) {
  return isActiveSubscriptionStatus(company.subscriptionStatus);
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
  if (!hasTeamAccess(membership.company) && !ownerBillingAccess) {
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
    hasTeamAccess: hasTeamAccess(company),
    isDevelopmentMode: isDevelopmentMode(),
    trialEndsAt: companyTrialEndsAt(company.createdAt),
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

router.post("/timeapp/auth/employee-identifier", async (req, res) => {
  const companyInput =
    typeof req.body?.companyCode === "string"
      ? normalizeEmployeeLoginPart(req.body.companyCode)
      : "";
  const employeeId =
    typeof req.body?.employeeId === "string"
      ? normalizeEmployeeLoginPart(req.body.employeeId)
      : "";

  if (!companyInput || !/^EMP-[A-Z2-9]{6}$/.test(employeeId)) {
    res.status(400).json({ error: "Bitte Firmen-Code oder Firmenname und Mitarbeiter-ID prüfen." });
    return;
  }

  const matches = await db
    .select({ employee: employees, company: companies })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(
      and(
        eq(employees.employeeId, employeeId),
        eq(employees.isActive, true),
        eq(employees.status, "active"),
        inArray(employees.role, ["manager", "employee"]),
        sql`(
          upper(${companies.companyCode}) = ${companyInput}
          OR upper(${companies.name}) = ${companyInput}
        )`,
      ),
    )
    .limit(2);

  if (matches.length !== 1) {
    res.status(404).json({ error: "Keine passenden Zugangsdaten gefunden." });
    return;
  }

  const match = matches[0];
  const username = employeeLoginIdentifier(match.company.companyCode, match.employee.employeeId);
  const clerkUser = await clerkClient.users.getUser(match.employee.userId);

  if (!isManagedEmployeeAccount(clerkUser)) {
    res.status(404).json({ error: "Keine passenden Zugangsdaten gefunden." });
    return;
  }

  if (clerkUser.username !== username) {
    await clerkClient.users.updateUser(match.employee.userId, { username });
  }
  const identifier = clerkUser.primaryEmailAddress?.emailAddress;
  if (!identifier) {
    res.status(404).json({ error: "Keine passenden Zugangsdaten gefunden." });
    return;
  }

  res.json({ identifier });
});

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
  const loginName = employeeLoginIdentifier(membership.company.companyCode, employeeId);
  const { firstName, lastName } = splitName(displayName);
  const result = await provisionManagedEmployee(
    membership.company.companyCode,
    {
      createTemporaryPassword,
      createClerkUser: (password) => clerkClient.users.createUser({
        emailAddress: [email],
        username: loginName,
        password,
        firstName,
        lastName,
        publicMetadata: { zeitappAccountType: "managed_employee" },
      }),
      insertMember: async (clerkUserId) => {
        const [created] = await db
          .insert(employees)
          .values({
            userId: clerkUserId,
            companyId: membership.company.id,
            employeeId,
            email,
            displayName,
            role: requestedRole,
            hourlyRateCents: Math.max(0, hourlyRateCents),
          })
          .returning();
        return memberResponse(created);
      },
      deleteClerkUser: (clerkUserId) => clerkClient.users.deleteUser(clerkUserId),
    },
  );
  res.status(201).json(result);
});

router.post(
  "/timeapp/company/members/:userId/temporary-password",
  requireRoles("owner", "manager"),
  createManagedEmployeePasswordResetHandler({
    membershipFromRequest,
    findTarget: async (userId, companyId) =>
      (
        await db
          .select()
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.companyId, companyId)))
          .limit(1)
      )[0],
    getClerkUser: (userId) => clerkClient.users.getUser(userId),
    updateClerkPassword: (userId, password) => clerkClient.users.updateUser(userId, { password }),
    createTemporaryPassword,
    canResetPassword: canResetManagedEmployeePassword,
    isManagedEmployeeAccount,
  }),
);

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

router.get("/timeapp/schedule", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const weekStart = normalizeWeekStart(req.query.weekStart);
  const [schedule] = await db.select().from(weeklySchedules).where(and(
    eq(weeklySchedules.companyId, membership.company.id),
    eq(weeklySchedules.userId, membership.employee.userId),
    eq(weeklySchedules.weekStart, weekStart),
  )).limit(1);
  const weekEnd = dateAtUtc(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const approvedLeaves = await db.select({
    startDate: leaveRequests.startDate,
    endDate: leaveRequests.endDate,
    type: leaveRequests.type,
  }).from(leaveRequests).where(and(
    eq(leaveRequests.companyId, membership.company.id),
    eq(leaveRequests.userId, membership.employee.userId),
    eq(leaveRequests.status, "approved"),
    lte(leaveRequests.startDate, weekEnd.toISOString().slice(0, 10)),
    gte(leaveRequests.endDate, weekStart),
  ));
  res.json({
    userId: membership.employee.userId,
    weekStart,
    days: applyApprovedLeave(schedule?.days ?? emptyScheduleDays(), weekStart, approvedLeaves),
  });
});

router.get("/timeapp/company/members/:userId/schedule", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [target] = await db.select().from(employees).where(and(
    eq(employees.companyId, membership.company.id),
    eq(employees.userId, targetUserId),
  )).limit(1);
  if (!target || !canManageWeeklySchedule(membership.employee.role, target.role)) {
    return void res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
  }
  const weekStart = normalizeWeekStart(req.query.weekStart);
  const [schedule] = await db.select().from(weeklySchedules).where(and(
    eq(weeklySchedules.companyId, membership.company.id),
    eq(weeklySchedules.userId, target.userId),
    eq(weeklySchedules.weekStart, weekStart),
  )).limit(1);
  const weekEnd = dateAtUtc(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const approvedLeaves = await db.select({
    startDate: leaveRequests.startDate,
    endDate: leaveRequests.endDate,
    type: leaveRequests.type,
  }).from(leaveRequests).where(and(
    eq(leaveRequests.companyId, membership.company.id),
    eq(leaveRequests.userId, target.userId),
    eq(leaveRequests.status, "approved"),
    lte(leaveRequests.startDate, weekEnd.toISOString().slice(0, 10)),
    gte(leaveRequests.endDate, weekStart),
  ));
  res.json({
    userId: target.userId,
    weekStart,
    days: applyApprovedLeave(schedule?.days ?? emptyScheduleDays(), weekStart, approvedLeaves),
  });
});

router.put("/timeapp/company/members/:userId/schedule", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [target] = await db.select().from(employees).where(and(
    eq(employees.companyId, membership.company.id),
    eq(employees.userId, targetUserId),
  )).limit(1);
  if (!target || !canManageWeeklySchedule(membership.employee.role, target.role)) {
    return void res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
  }
  try {
    const weekStart = normalizeWeekStart(req.body?.weekStart);
    const days = validateScheduleDays(req.body?.days);
    const weekEnd = dateAtUtc(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const approvedLeaves = await db.select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
    }).from(leaveRequests).where(and(
      eq(leaveRequests.companyId, membership.company.id),
      eq(leaveRequests.userId, target.userId),
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, weekEnd.toISOString().slice(0, 10)),
      gte(leaveRequests.endDate, weekStart),
    ));
    const conflicts = workingDaysOnLeave(days, weekStart, approvedLeaves);
    if (conflicts.length) {
      return void res.status(409).json({
        error: `An genehmigten Urlaubstagen kann keine Arbeitsschicht geplant werden: ${conflicts.join(", ")}`,
      });
    }
    const [schedule] = await db.insert(weeklySchedules).values({
      companyId: membership.company.id,
      userId: target.userId,
      weekStart,
      days,
    }).onConflictDoUpdate({
      target: [weeklySchedules.companyId, weeklySchedules.userId, weeklySchedules.weekStart],
      set: { days, updatedAt: new Date() },
    }).returning();
    res.json({
      userId: schedule.userId,
      weekStart: schedule.weekStart,
      days: applyApprovedLeave(schedule.days, weekStart, approvedLeaves),
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ungültiger Wochenplan." });
  }
});

router.get("/timeapp/monthly-work-plans/:monthStart", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  try {
    const monthStart = normalizeMonthStart(Array.isArray(req.params.monthStart) ? req.params.monthStart[0] : req.params.monthStart);
    const [plan] = await db.select().from(monthlyWorkPlans).where(and(
      eq(monthlyWorkPlans.companyId, membership.company.id),
      eq(monthlyWorkPlans.userId, membership.employee.userId),
      eq(monthlyWorkPlans.monthStart, monthStart),
    )).limit(1);
    const approvedAbsences = await db.select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
    }).from(leaveRequests).where(and(
      eq(leaveRequests.companyId, membership.company.id),
      eq(leaveRequests.userId, membership.employee.userId),
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, monthEnd(monthStart)),
      gte(leaveRequests.endDate, monthStart),
    ));
    const days = applyApprovedAbsences(plan?.days ?? emptyMonthlyPlan(monthStart), approvedAbsences);
    res.json({ userId: membership.employee.userId, monthStart, days, plannedWorkMinutes: plannedWorkMinutes(days) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ungültiger Monat." });
  }
});

router.get("/timeapp/company/members/:userId/monthly-work-plans/:monthStart", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [target] = await db.select().from(employees).where(and(
    eq(employees.companyId, membership.company.id),
    eq(employees.userId, targetUserId),
  )).limit(1);
  if (!target || !canManageWeeklySchedule(membership.employee.role, target.role)) {
    return void res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
  }
  try {
    const monthStart = normalizeMonthStart(Array.isArray(req.params.monthStart) ? req.params.monthStart[0] : req.params.monthStart);
    const [plan] = await db.select().from(monthlyWorkPlans).where(and(
      eq(monthlyWorkPlans.companyId, membership.company.id),
      eq(monthlyWorkPlans.userId, target.userId),
      eq(monthlyWorkPlans.monthStart, monthStart),
    )).limit(1);
    const approvedAbsences = await db.select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
    }).from(leaveRequests).where(and(
      eq(leaveRequests.companyId, membership.company.id),
      eq(leaveRequests.userId, target.userId),
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, monthEnd(monthStart)),
      gte(leaveRequests.endDate, monthStart),
    ));
    const days = applyApprovedAbsences(plan?.days ?? emptyMonthlyPlan(monthStart), approvedAbsences);
    res.json({ userId: target.userId, monthStart, days, plannedWorkMinutes: plannedWorkMinutes(days) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ungültiger Monat." });
  }
});

router.put("/timeapp/company/members/:userId/monthly-work-plans/:monthStart", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [target] = await db.select().from(employees).where(and(
    eq(employees.companyId, membership.company.id),
    eq(employees.userId, targetUserId),
  )).limit(1);
  if (!target || !canManageWeeklySchedule(membership.employee.role, target.role)) {
    return void res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
  }
  try {
    const monthStart = normalizeMonthStart(Array.isArray(req.params.monthStart) ? req.params.monthStart[0] : req.params.monthStart);
    const days = validateMonthlyPlanDays(req.body?.days, monthStart);
    const approvedAbsences = await db.select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
    }).from(leaveRequests).where(and(
      eq(leaveRequests.companyId, membership.company.id),
      eq(leaveRequests.userId, target.userId),
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, monthEnd(monthStart)),
      gte(leaveRequests.endDate, monthStart),
    ));
    const conflicts = workingDaysOnApprovedAbsence(days, approvedAbsences);
    if (conflicts.length) {
      return void res.status(409).json({
        error: `An genehmigten Abwesenheitstagen kann keine Arbeit geplant werden: ${conflicts.join(", ")}`,
      });
    }
    const [plan] = await db.insert(monthlyWorkPlans).values({
      companyId: membership.company.id,
      userId: target.userId,
      monthStart,
      days,
    }).onConflictDoUpdate({
      target: [monthlyWorkPlans.companyId, monthlyWorkPlans.userId, monthlyWorkPlans.monthStart],
      set: { days, updatedAt: new Date() },
    }).returning();
    const effectiveDays = applyApprovedAbsences(plan.days, approvedAbsences);
    res.json({ userId: target.userId, monthStart, days: effectiveDays, plannedWorkMinutes: plannedWorkMinutes(effectiveDays) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ungültiger Monatsplan." });
  }
});

router.get("/timeapp/leave-requests", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const requests = await db.select().from(leaveRequests).where(and(
    eq(leaveRequests.companyId, membership.company.id),
    eq(leaveRequests.userId, membership.employee.userId),
  )).orderBy(desc(leaveRequests.createdAt));
  res.json({ requests });
});

router.post("/timeapp/leave-requests", async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  try {
    const input = validateLeaveRequest(req.body);
    const [conflict] = await db.select({ id: leaveRequests.id }).from(leaveRequests).where(and(
      eq(leaveRequests.companyId, membership.company.id),
      eq(leaveRequests.userId, membership.employee.userId),
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, input.endDate),
      gte(leaveRequests.endDate, input.startDate),
    )).limit(1);
    if (conflict) return void res.status(409).json({ error: "Für diesen Zeitraum besteht bereits genehmigter Urlaub." });
    const [request] = await db.insert(leaveRequests).values({
      companyId: membership.company.id,
      userId: membership.employee.userId,
      ...input,
    }).returning();
    res.status(201).json({ request });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ungültiger Urlaubsantrag." });
  }
});

router.get("/timeapp/company/leave-requests", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const rows = await db.select({
    request: leaveRequests,
    displayName: employees.displayName,
    employeeId: employees.employeeId,
    memberRole: employees.role,
  }).from(leaveRequests).innerJoin(employees, and(
    eq(employees.userId, leaveRequests.userId),
    eq(employees.companyId, membership.company.id),
  )).where(eq(leaveRequests.companyId, membership.company.id)).orderBy(desc(leaveRequests.createdAt));
  res.json({
    requests: rows
      .filter((row) => canReviewLeave(membership.employee.role, row.memberRole))
      .map((row) => ({ ...row.request, displayName: row.displayName, employeeId: row.employeeId })),
  });
});

router.patch("/timeapp/company/leave-requests/:requestId", requireRoles("owner", "manager"), async (req, res) => {
  const membership = await membershipFromRequest(req);
  if (!membership) return void res.status(403).json({ error: "Kein Firmenkonto gefunden." });
  const requestId = Number(Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId);
  if (!Number.isInteger(requestId)) return void res.status(400).json({ error: "Ungültiger Antrag." });
  try {
    const status = validateLeaveDecision(req.body);
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.select({
        request: leaveRequests,
        memberRole: employees.role,
      }).from(leaveRequests).innerJoin(employees, and(
        eq(employees.userId, leaveRequests.userId),
        eq(employees.companyId, membership.company.id),
      )).where(and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.companyId, membership.company.id),
      )).limit(1);
      if (!row || !canReviewLeave(membership.employee.role, row.memberRole)) return null;
      if (row.request.status !== "pending") throw new Error("Über diesen Antrag wurde bereits entschieden.");
      if (status === "approved") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.request.userId}))`);
        const [conflict] = await tx.select({ id: leaveRequests.id }).from(leaveRequests).where(and(
          eq(leaveRequests.companyId, membership.company.id),
          eq(leaveRequests.userId, row.request.userId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, row.request.endDate),
          gte(leaveRequests.endDate, row.request.startDate),
        )).limit(1);
        if (conflict) throw new Error("Für diesen Zeitraum besteht bereits genehmigter Urlaub.");
      }
      const [request] = await tx.update(leaveRequests).set({
        status,
        reviewedBy: membership.employee.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(leaveRequests.id, requestId),
        eq(leaveRequests.companyId, membership.company.id),
      )).returning();
      return request;
    });
    if (!updated) return void res.status(404).json({ error: "Urlaubsantrag nicht gefunden." });
    res.json({ request: updated });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Entscheidung nicht möglich." });
  }
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