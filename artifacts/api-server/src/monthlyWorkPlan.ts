import type { LeaveRange } from "./leaveRequests";

export type MonthlyPlanStatus = "work" | "free" | "vacation" | "sick";
export type MonthlyPlanDay = {
  date: string;
  status: MonthlyPlanStatus;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function currentMonthStart(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function normalizeMonthStart(value: unknown, now = new Date()) {
  if (value === undefined) return currentMonthStart(now);
  if (typeof value !== "string" || !MONTH.test(value)) {
    throw new Error("Der Monat muss als erster Kalendertag angegeben werden.");
  }
  return value;
}

export function monthEnd(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function emptyMonthlyPlan(monthStart: string): MonthlyPlanDay[] {
  const count = Number(monthEnd(monthStart).slice(8, 10));
  return Array.from({ length: count }, (_, index) => ({
    date: `${monthStart.slice(0, 8)}${String(index + 1).padStart(2, "0")}`,
    status: "free",
    startTime: null,
    endTime: null,
    breakMinutes: 0,
  }));
}

export function validateMonthlyPlanDays(value: unknown, monthStart: string): MonthlyPlanDay[] {
  if (!Array.isArray(value) || value.length !== emptyMonthlyPlan(monthStart).length) {
    throw new Error("Der Monatsplan muss jeden Kalendertag genau einmal enthalten.");
  }
  return value.map((raw, index) => {
    const day = raw as Partial<MonthlyPlanDay>;
    const expectedDate = `${monthStart.slice(0, 8)}${String(index + 1).padStart(2, "0")}`;
    if (day.date !== expectedDate || !["work", "free", "vacation", "sick"].includes(day.status ?? "")) {
      throw new Error("Der Monatsplan enthält einen ungültigen Kalendertag.");
    }
    if (day.status !== "work") {
      return { date: expectedDate, status: day.status!, startTime: null, endTime: null, breakMinutes: 0 };
    }
    if (!TIME.test(day.startTime ?? "") || !TIME.test(day.endTime ?? "") || day.startTime! >= day.endTime!) {
      throw new Error("Arbeitszeiten müssen gültig sein und die Endzeit muss nach der Startzeit liegen.");
    }
    const breakMinutes = Number(day.breakMinutes ?? 0);
    const grossMinutes = timeMinutes(day.endTime!) - timeMinutes(day.startTime!);
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes >= grossMinutes) {
      throw new Error("Die Pausenzeit ist für diesen Arbeitstag ungültig.");
    }
    return { date: expectedDate, status: "work" as const, startTime: day.startTime!, endTime: day.endTime!, breakMinutes };
  });
}

export function applyApprovedAbsences(days: MonthlyPlanDay[], absences: LeaveRange[]) {
  return days.map((day) => {
    const absence = absences.find((item) => day.date >= item.startDate && day.date <= item.endDate);
    return absence
      ? { ...day, status: absence.type === "sick" ? "sick" as const : "vacation" as const, startTime: null, endTime: null, breakMinutes: 0 }
      : day;
  });
}

export function workingDaysOnApprovedAbsence(days: MonthlyPlanDay[], absences: LeaveRange[]) {
  return days.filter((day) => day.status === "work" && absences.some(
    (absence) => day.date >= absence.startDate && day.date <= absence.endDate,
  )).map((day) => day.date);
}

export function plannedWorkMinutes(days: MonthlyPlanDay[]) {
  return days.reduce((total, day) => day.status === "work"
    ? total + timeMinutes(day.endTime!) - timeMinutes(day.startTime!) - day.breakMinutes
    : total, 0);
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}