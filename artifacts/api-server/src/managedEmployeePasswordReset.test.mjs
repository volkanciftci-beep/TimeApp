import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";
import express from "express";
import { employees } from "@workspace/db/schema";
import { serializeHttpRequest } from "./httpLogging.ts";
import { createManagedEmployeePasswordResetHandler } from "./managedEmployeePasswordReset.ts";

const FIXED_PASSWORD = "Zeit-integration-test!7";

function member(userId, companyId, role) {
  return {
    userId,
    companyId,
    employeeId: `EMP-${userId}`,
    email: `${userId}@example.test`,
    displayName: userId,
    role,
    status: "active",
    isActive: true,
    hourlyRateCents: 1500,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

async function createHarness(actor, members) {
  const clerkUpdates = [];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const authenticatedUserId = req.get("authorization")?.replace(/^Bearer /, "");
    if (!authenticatedUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.authenticatedUserId = authenticatedUserId;
    next();
  });
  app.post(
    "/timeapp/company/members/:userId/temporary-password",
    createManagedEmployeePasswordResetHandler({
      membershipFromRequest: async (req) =>
        req.authenticatedUserId === actor.userId
          ? { employee: actor, company: { id: actor.companyId, companyCode: `ZA-${actor.companyId}` } }
          : undefined,
      // Deliberately unscoped: the production handler must independently reject
      // a foreign-company row even if a repository query regresses.
      findTarget: async (userId) =>
        members.find((candidate) => candidate.userId === userId),
      getClerkUser: async () => ({
        username: "ZA-ABC123-EMP-ABC123",
        publicMetadata: { zeitappAccountType: "managed_employee" },
      }),
      updateClerkPassword: async (userId, password) => {
        clerkUpdates.push({ userId, password });
      },
      createTemporaryPassword: () => FIXED_PASSWORD,
      canResetPassword: (actorRole, targetRole) =>
        actorRole === "owner"
          ? targetRole === "manager" || targetRole === "employee"
          : targetRole === "employee",
      isManagedEmployeeAccount: (user) => user.publicMetadata?.zeitappAccountType === "managed_employee",
    }),
  );
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  return {
    clerkUpdates,
    request: (targetUserId) =>
      fetch(`http://127.0.0.1:${port}/timeapp/company/members/${targetUserId}/temporary-password`, {
        method: "POST",
        headers: { authorization: `Bearer ${actor.userId}`, "content-type": "application/json" },
        body: "{}",
      }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("authenticated owner resets employees and managers in the same company", async (t) => {
  const owner = member("owner-a", 1, "owner");
  const employee = member("employee-a", 1, "employee");
  const manager = member("manager-a", 1, "manager");
  const harness = await createHarness(owner, [owner, employee, manager]);
  t.after(harness.close);

  for (const target of [employee, manager]) {
    const response = await harness.request(target.userId);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).temporaryPassword, FIXED_PASSWORD);
  }
  assert.deepEqual(harness.clerkUpdates.map(({ userId }) => userId), ["employee-a", "manager-a"]);
});

test("authenticated manager resets an employee but cannot reset a manager", async (t) => {
  const actor = member("manager-a", 1, "manager");
  const employee = member("employee-a", 1, "employee");
  const manager = member("manager-b", 1, "manager");
  const harness = await createHarness(actor, [actor, employee, manager]);
  t.after(harness.close);

  assert.equal((await harness.request(employee.userId)).status, 200);
  assert.equal((await harness.request(manager.userId)).status, 403);
  assert.deepEqual(harness.clerkUpdates.map(({ userId }) => userId), ["employee-a"]);
});

test("cross-company targets are rejected even if the target lookup returns a foreign row", async (t) => {
  const owner = member("owner-a", 1, "owner");
  const foreignEmployee = member("employee-b", 2, "employee");
  const harness = await createHarness(owner, [owner, foreignEmployee]);
  t.after(harness.close);

  const response = await harness.request(foreignEmployee.userId);
  assert.equal(response.status, 404);
  assert.deepEqual(harness.clerkUpdates, []);
});

test("successful reset returns the password only in the response", async (t) => {
  const owner = member("owner-a", 1, "owner");
  const employee = member("employee-a", 1, "employee");
  const harness = await createHarness(owner, [owner, employee]);
  t.after(harness.close);

  const response = await harness.request(employee.userId);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).temporaryPassword, FIXED_PASSWORD);
});

test("HTTP request logs omit temporary password bodies and authorization headers", () => {
  const serialized = serializeHttpRequest({
    id: 1,
    method: "POST",
    url: "/timeapp/company/members/employee-a/temporary-password?trace=true",
    headers: { authorization: "Bearer owner-a" },
    body: { temporaryPassword: FIXED_PASSWORD },
  });

  const logValue = JSON.stringify(serialized);
  assert.equal(logValue.includes(FIXED_PASSWORD), false);
  assert.equal(logValue.includes("Bearer owner-a"), false);
  assert.equal(serialized.url, "/timeapp/company/members/employee-a/temporary-password");
});

test("employee database records have no password storage field", () => {
  const columnNames = Object.keys(getTableColumns(employees));
  assert.equal(columnNames.some((name) => name.toLowerCase().includes("password")), false);
});