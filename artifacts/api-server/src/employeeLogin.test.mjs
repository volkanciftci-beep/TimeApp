import assert from "node:assert/strict";
import test from "node:test";
import {
  employeeLoginIdentifier,
  normalizeEmployeeLoginPart,
} from "./employeeLogin.ts";

test("normalizes employee login inputs consistently", () => {
  assert.equal(normalizeEmployeeLoginPart("  vobusoft "), "VOBUSOFT");
  assert.equal(normalizeEmployeeLoginPart(" emp-8an9v2 "), "EMP-8AN9V2");
});

test("builds the canonical Clerk identifier from company and employee codes", () => {
  assert.equal(
    employeeLoginIdentifier("za-j92qrx", "emp-8an9v2"),
    "ZA-J92QRX-EMP-8AN9V2",
  );
});
