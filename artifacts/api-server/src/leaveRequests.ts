import type { ScheduleDay } from "./weeklySchedule";

export type LeaveStatus = "pending" | "approved" | "rejected";
export type AbsenceType = "vacation" | "sick";
export type LeaveRange = { startDate: string; endDate: string; type?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateLeaveRequest(value: unknown) {
  const input = value as { startDate?: unknown; endDate?: unknown; description?: unknown; type?: unknown };
  const startDate = normalizeDate(input?.startDate);
  const endDate = normalizeDate(input?.endDate);
  if (startDate > endDate) throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (description.length > 500) throw new Error("Die Beschreibung darf höchstens 500 Zeichen enthalten.");
  const type = input?.type;
  if (type !== "vacation" && type !== "sick") throw new Error("Bitte wählen Sie Urlaub oder Krankmeldung.");
  return { startDate, endDate, description: description || null, type };
}

export function validateLeaveDecision(value: unknown): Exclude<LeaveStatus, "pending"> {
  const status = (value as { status?: unknown })?.status;
  if (status !== "approved" && status !== "rejected") {
    throw new Error("Die Entscheidung muss Genehmigt oder Abgelehnt sein.");
  }
  return status;
}

export function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !DATE.test(value)) throw new Error("Bitte geben Sie ein gültiges Datum ein.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Bitte geben Sie ein gültiges Datum ein.");
  }
  return value;
}

export function rangesOverlap(a: LeaveRange, b: LeaveRange) {
  return a.startDate <= b.endDate && a.endDate >= b.startDate;
}

export function canReviewLeave(actorRole: string, targetRole: string) {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return targetRole === "manager" || targetRole === "employee";
  return actorRole === "manager" && targetRole === "employee";
}

export function weekDate(weekStart: string, weekday: number) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weekday - 1);
  return date.toISOString().slice(0, 10);
}

export function applyApprovedLeave(days: ScheduleDay[], weekStart: string, leaves: LeaveRange[]) {
  return days.map((day) => {
    const date = weekDate(weekStart, day.weekday);
    const absence = leaves.find((leave) => date >= leave.startDate && date <= leave.endDate);
    return absence
      ? {
          ...day,
          isVacation: absence.type !== "sick",
          absenceType: absence.type ?? "vacation",
          isWorking: false,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
        }
      : { ...day, isVacation: false, absenceType: null };
  });
}

export function workingDaysOnLeave(days: ScheduleDay[], weekStart: string, leaves: LeaveRange[]) {
  return days
    .filter((day) => day.isWorking && leaves.some((leave) => {
      const date = weekDate(weekStart, day.weekday);
      return date >= leave.startDate && date <= leave.endDate;
    }))
    .map((day) => weekDate(weekStart, day.weekday));
}