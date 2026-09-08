import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyCode: text("company_code").notNull().unique(),
  ownerUserId: text("owner_user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").notNull().default("inactive"),
  plan: text("plan").notNull().default("team"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  userId: text("user_id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  employeeId: text("employee_id").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("employee"),
  status: text("status").notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(1500),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workSessions = pgTable("work_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => employees.userId),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  workDate: date("work_date").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const breaks = pgTable("breaks", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => workSessions.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WeeklyScheduleDay = {
  weekday: number;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
};

export const weeklySchedules = pgTable("weekly_schedules", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => employees.userId, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  days: jsonb("days").$type<WeeklyScheduleDay[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("weekly_schedules_company_user_week_idx").on(
    table.companyId,
    table.userId,
    table.weekStart,
  ),
]);

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => employees.userId, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: text("type").notNull().default("vacation"),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => employees.userId, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("leave_requests_company_status_idx").on(table.companyId, table.status),
  index("leave_requests_company_user_dates_idx").on(
    table.companyId,
    table.userId,
    table.startDate,
    table.endDate,
  ),
]);

export type MonthlyPlanDay = {
  date: string;
  status: "work" | "free" | "vacation" | "sick";
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
};

export const monthlyWorkPlans = pgTable("monthly_work_plans", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => employees.userId, { onDelete: "cascade" }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  monthStart: date("month_start").notNull(),
  days: jsonb("days").$type<MonthlyPlanDay[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("monthly_work_plans_company_user_month_idx").on(
    table.companyId,
    table.userId,
    table.monthStart,
  ),
]);