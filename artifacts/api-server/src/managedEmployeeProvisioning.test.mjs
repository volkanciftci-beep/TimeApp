import assert from "node:assert/strict";
import test from "node:test";
import { provisionManagedEmployee } from "./managedEmployeeProvisioning.ts";

test("a new employee receives one generated password that is stored by Clerk and returned once", async () => {
  const generatedPassword = "Zeit-new-employee-password!7";
  const clerkPasswords = [];

  const result = await provisionManagedEmployee("ZA-TEST01", {
    createTemporaryPassword: () => generatedPassword,
    createClerkUser: async (password) => {
      clerkPasswords.push(password);
      return { id: "clerk-employee-1" };
    },
    insertMember: async (clerkUserId) => ({
      userId: clerkUserId,
      employeeId: "EMP-TEST01",
    }),
    deleteClerkUser: async () => undefined,
  });

  assert.deepEqual(clerkPasswords, [generatedPassword]);
  assert.equal(result.member.userId, "clerk-employee-1");
  assert.equal(result.member.employeeId, "EMP-TEST01");
  assert.equal(result.companyCode, "ZA-TEST01");
  assert.equal(result.temporaryPassword, generatedPassword);
});

test("each newly provisioned employee receives a separately generated password", async () => {
  let sequence = 0;
  const storedPasswords = [];
  const dependencies = {
    createTemporaryPassword: () => `Zeit-employee-${++sequence}!7`,
    createClerkUser: async (password) => {
      storedPasswords.push(password);
      return { id: `clerk-${sequence}` };
    },
    insertMember: async (clerkUserId) => ({ userId: clerkUserId }),
    deleteClerkUser: async () => undefined,
  };

  const first = await provisionManagedEmployee("ZA-TEST01", dependencies);
  const second = await provisionManagedEmployee("ZA-TEST01", dependencies);

  assert.notEqual(first.temporaryPassword, second.temporaryPassword);
  assert.deepEqual(storedPasswords, [
    first.temporaryPassword,
    second.temporaryPassword,
  ]);
});

test("a failed database insert removes the already-created Clerk account", async () => {
  const deletedUsers = [];

  await assert.rejects(
    provisionManagedEmployee("ZA-TEST01", {
      createTemporaryPassword: () => "Zeit-rollback-password!7",
      createClerkUser: async () => ({ id: "clerk-orphan" }),
      insertMember: async () => {
        throw new Error("database unavailable");
      },
      deleteClerkUser: async (userId) => {
        deletedUsers.push(userId);
      },
    }),
    /database unavailable/,
  );

  assert.deepEqual(deletedUsers, ["clerk-orphan"]);
});