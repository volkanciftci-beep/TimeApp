import assert from "node:assert/strict";
import test from "node:test";
import { canManageWeeklySchedule, currentWeekStart, emptyScheduleDays, normalizeWeekStart, validateScheduleDays } from "./weeklySchedule.ts";

test("computes and validates Monday week anchors", () => {
  assert.equal(currentWeekStart(new Date("2026-09-09T10:00:00Z")), "2026-09-07");
  assert.equal(normalizeWeekStart("2026-09-07"), "2026-09-07");
  assert.throws(() => normalizeWeekStart("2026-09-08"), /Montag/);
});

test("accepts work days and normalizes free days", () => {
  const days = emptyScheduleDays();
  days[0] = { weekday: 1, isWorking: true, startTime: "08:00", endTime: "16:30", breakMinutes: 30 };
  const result = validateScheduleDays(days);
  assert.deepEqual(result[0], days[0]);
  assert.deepEqual(result[1], { weekday: 2, isWorking: false, startTime: null, endTime: null, breakMinutes: 0 });
});

test("rejects invalid schedules", () => {
  assert.throws(() => validateScheduleDays([]), /sieben Tage/);
  const days = emptyScheduleDays();
  days[0] = { weekday: 1, isWorking: true, startTime: "17:00", endTime: "08:00", breakMinutes: 0 };
  assert.throws(() => validateScheduleDays(days), /Endzeit/);
});

test("enforces owner and manager schedule boundaries", () => {
  assert.equal(canManageWeeklySchedule("owner", "employee"), true);
  assert.equal(canManageWeeklySchedule("owner", "manager"), true);
  assert.equal(canManageWeeklySchedule("manager", "employee"), true);
  assert.equal(canManageWeeklySchedule("manager", "manager"), false);
  assert.equal(canManageWeeklySchedule("employee", "employee"), false);
  assert.equal(canManageWeeklySchedule("owner", "owner"), false);
});