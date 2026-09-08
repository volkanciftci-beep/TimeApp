import assert from "node:assert/strict";
import test from "node:test";
import {
  applyApprovedLeave,
  canReviewLeave,
  rangesOverlap,
  validateLeaveDecision,
  validateLeaveRequest,
  workingDaysOnLeave,
} from "./leaveRequests.ts";
import { emptyScheduleDays } from "./weeklySchedule.ts";

test("validates an employee leave request", () => {
  assert.deepEqual(validateLeaveRequest({
    startDate: "2026-09-09",
    endDate: "2026-09-11",
    description: " Familienreise ",
  }), { startDate: "2026-09-09", endDate: "2026-09-11", description: "Familienreise" });
  assert.throws(() => validateLeaveRequest({ startDate: "2026-09-12", endDate: "2026-09-11" }), /Enddatum/);
});

test("recognizes date conflicts including boundary days", () => {
  assert.equal(rangesOverlap(
    { startDate: "2026-09-09", endDate: "2026-09-11" },
    { startDate: "2026-09-11", endDate: "2026-09-13" },
  ), true);
  assert.equal(rangesOverlap(
    { startDate: "2026-09-09", endDate: "2026-09-10" },
    { startDate: "2026-09-11", endDate: "2026-09-13" },
  ), false);
});

test("enforces review roles and decisions", () => {
  assert.equal(canReviewLeave("owner", "manager"), true);
  assert.equal(canReviewLeave("manager", "employee"), true);
  assert.equal(canReviewLeave("manager", "manager"), false);
  assert.equal(canReviewLeave("employee", "employee"), false);
  assert.equal(validateLeaveDecision({ status: "approved" }), "approved");
  assert.throws(() => validateLeaveDecision({ status: "pending" }), /Entscheidung/);
});

test("approved leave replaces work hours with Urlaub in a weekly plan", () => {
  const days = emptyScheduleDays();
  days[2] = { weekday: 3, isWorking: true, startTime: "08:00", endTime: "16:00", breakMinutes: 30 };
  const leaves = [{ startDate: "2026-09-09", endDate: "2026-09-09" }];
  assert.deepEqual(workingDaysOnLeave(days, "2026-09-07", leaves), ["2026-09-09"]);
  const result = applyApprovedLeave(days, "2026-09-07", leaves);
  assert.equal(result[2].isVacation, true);
  assert.equal(result[2].isWorking, false);
  assert.equal(result[2].startTime, null);
});