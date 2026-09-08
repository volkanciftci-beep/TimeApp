import type { RequestHandler } from "express";

type Role = "owner" | "manager" | "employee";

export type PasswordResetMember = {
  userId: string;
  companyId: number;
  employeeId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  isActive: boolean;
  hourlyRateCents: number;
  createdAt: Date;
};

type PasswordResetMembership = {
  employee: PasswordResetMember;
  company: { id: number; companyCode: string };
};

type ManagedClerkUser = {
  username?: string | null;
  publicMetadata?: Record<string, unknown> | null;
};

type PasswordResetDependencies = {
  membershipFromRequest: (req: Parameters<RequestHandler>[0]) => Promise<PasswordResetMembership | undefined>;
  findTarget: (userId: string, companyId: number) => Promise<PasswordResetMember | undefined>;
  getClerkUser: (userId: string) => Promise<ManagedClerkUser>;
  updateClerkPassword: (userId: string, password: string) => Promise<unknown>;
  createTemporaryPassword: () => string;
  canResetPassword: (actorRole: "owner" | "manager", targetRole: string) => boolean;
  isManagedEmployeeAccount: (user: ManagedClerkUser) => boolean;
};

function memberResponse(employee: PasswordResetMember) {
  return {
    userId: employee.userId,
    employeeId: employee.employeeId,
    email: employee.email,
    displayName: employee.displayName,
    role: (["owner", "manager", "employee"].includes(employee.role) ? employee.role : "employee") as Role,
    status: employee.status === "active" && employee.isActive ? "active" : "inactive",
    hourlyRateCents: employee.hourlyRateCents,
    createdAt: employee.createdAt.toISOString(),
  };
}

export function createManagedEmployeePasswordResetHandler(
  dependencies: PasswordResetDependencies,
): RequestHandler {
  return async (req, res) => {
    const membership = await dependencies.membershipFromRequest(req);
    if (!membership) {
      res.status(403).json({ error: "Kein Firmenkonto gefunden." });
      return;
    }

    const actorRole = membership.employee.role as Role;
    if (actorRole !== "owner" && actorRole !== "manager") {
      res.status(403).json({ error: "Für diese Aktion fehlen die erforderlichen Rechte." });
      return;
    }

    const userId = String(req.params.userId);
    const target = await dependencies.findTarget(userId, membership.company.id);
    if (!target || target.companyId !== membership.company.id) {
      res.status(404).json({ error: "Mitarbeiter nicht gefunden." });
      return;
    }
    if (!dependencies.canResetPassword(actorRole, target.role)) {
      res.status(403).json({ error: "Manager dürfen nur Passwörter von Mitarbeitenden zurücksetzen." });
      return;
    }

    const clerkUser = await dependencies.getClerkUser(target.userId);
    if (!dependencies.isManagedEmployeeAccount(clerkUser)) {
      res.status(409).json({ error: "Dieses Konto kann nicht über ZEITAPP zurückgesetzt werden." });
      return;
    }

    const temporaryPassword = dependencies.createTemporaryPassword();
    await dependencies.updateClerkPassword(target.userId, temporaryPassword);
    res.json({
      member: memberResponse(target),
      companyCode: membership.company.companyCode,
      temporaryPassword,
    });
  };
}