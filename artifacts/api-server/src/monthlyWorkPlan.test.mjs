import assert from "node:assert/strict";
import test from "node:test";
import {
  applyApprovedAbsences,
  emptyMonthlyPlan,
  monthEnd,
  normalizeMonthStart,
  plannedWorkMinutes,
  validateMonthlyPlanDays,
  workingDaysOnApprovedAbsence,
} from "./monthlyWorkPlan.ts";

test("normalizes a month and includes every calendar day", () => {
  assert.equal(normalizeMonthStart("2026-09-01"), "2026-09-01");
  assert.equal(monthEnd("2026-02-01"), "2026-02-28");
  assert.equal(emptyMonthlyPlan("2028-02-01").length, 29);
  assert.throws(() => normalizeMonthStart("2026-09-02"), /Kalendertag/);
});

test("validates and totals a monthly work plan", () => {
  const days = emptyMonthlyPlan("2026-09-01");
  days[0] = { date: "2026-09-01", status: "work", startTime: "08:00", endTime: "16:30", breakMinutes: 30 };
  const result = validateMonthlyPlanDays(days, "2026-09-01");
  assert.equal(plannedWorkMinutes(result), 480);
  assert.throws(() => validateMonthlyPlanDays(result.slice(1), "2026-09-01"), /jeden Kalendertag/);
});

test("approved vacation and sickness overlay the monthly plan", () => {
  const days = emptyMonthlyPlan("2026-09-01");
  days[1] = { date: "2026-09-02", status: "work", startTime: "08:00", endTime: "16:00", breakMinutes: 30 };
  days[2] = { date: "2026-09-03", status: "work", startTime: "08:00", endTime: "16:00", breakMinutes: 30 };
  const absences = [
    { startDate: "2026-09-02", endDate: "2026-09-02", type: "vacation" },
    { startDate: "2026-09-03", endDate: "2026-09-03", type: "sick" },
  ];
  assert.deepEqual(workingDaysOnApprovedAbsence(days, absences), ["2026-09-02", "2026-09-03"]);
  const effective = applyApprovedAbsences(days, absences);
  assert.equal(effective[1].status, "vacation");
  assert.equal(effective[2].status, "sick");
  assert.equal(plannedWorkMinutes(effective), 0);
});