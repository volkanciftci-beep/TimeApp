import assert from "node:assert/strict";
import test from "node:test";
import {
  canResetManagedEmployeePassword,
  createTemporaryPassword,
} from "./managedEmployeePassword.ts";

test("creates strong temporary passwords using the managed account policy", () => {
  const passwords = new Set(Array.from({ length: 100 }, createTemporaryPassword));

  assert.equal(passwords.size, 100);
  for (const password of passwords) {
    assert.match(password, /^Zeit-[A-Za-z0-9_-]{16}!7$/);
    assert.ok(password.length >= 15);
  }
});

test("preserves owner and manager password-reset role boundaries", () => {
  assert.equal(canResetManagedEmployeePassword("owner", "manager"), true);
  assert.equal(canResetManagedEmployeePassword("owner", "employee"), true);
  assert.equal(canResetManagedEmployeePassword("owner", "owner"), false);
  assert.equal(canResetManagedEmployeePassword("manager", "employee"), true);
  assert.equal(canResetManagedEmployeePassword("manager", "manager"), false);
  assert.equal(canResetManagedEmployeePassword("manager", "owner"), false);
});