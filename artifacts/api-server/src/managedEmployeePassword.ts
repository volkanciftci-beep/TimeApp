import { randomBytes } from "node:crypto";

export function createTemporaryPassword() {
  return `Zeit-${randomBytes(12).toString("base64url")}!7`;
}

export function canResetManagedEmployeePassword(
  actorRole: "owner" | "manager",
  targetRole: string,
) {
  if (targetRole === "employee") return true;
  return actorRole === "owner" && targetRole === "manager";
}