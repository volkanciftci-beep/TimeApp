export type ScheduleDay = {
  weekday: number;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function currentWeekStart(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function normalizeWeekStart(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return currentWeekStart(now);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || currentWeekStart(date) !== value) {
    throw new Error("Der Wochenbeginn muss ein Montag sein.");
  }
  return value;
}

export function validateScheduleDays(value: unknown): ScheduleDay[] {
  if (!Array.isArray(value) || value.length !== 7) {
    throw new Error("Der Wochenplan muss genau sieben Tage enthalten.");
  }
  return value.map((raw, index) => {
    const day = raw as Partial<ScheduleDay>;
    if (day.weekday !== index + 1 || typeof day.isWorking !== "boolean") {
      throw new Error("Ungültiger Wochentag.");
    }
    if (!day.isWorking) {
      return { weekday: index + 1, isWorking: false, startTime: null, endTime: null, breakMinutes: 0 };
    }
    if (!TIME.test(day.startTime ?? "") || !TIME.test(day.endTime ?? "") || day.startTime! >= day.endTime!) {
      throw new Error("Arbeitszeiten müssen gültig sein und die Endzeit muss nach der Startzeit liegen.");
    }
    const breakMinutes = Number(day.breakMinutes ?? 0);
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
      throw new Error("Die Pausenzeit ist ungültig.");
    }
    return { weekday: index + 1, isWorking: true, startTime: day.startTime!, endTime: day.endTime!, breakMinutes };
  });
}

export function emptyScheduleDays(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    weekday: index + 1,
    isWorking: false,
    startTime: null,
    endTime: null,
    breakMinutes: 0,
  }));
}

export function canManageWeeklySchedule(actorRole: string, targetRole: string) {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return targetRole === "manager" || targetRole === "employee";
  return actorRole === "manager" && targetRole === "employee";
}