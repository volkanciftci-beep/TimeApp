type ProvisioningDependencies<TMember> = {
  createTemporaryPassword: () => string;
  createClerkUser: (temporaryPassword: string) => Promise<{ id: string }>;
  insertMember: (clerkUserId: string) => Promise<TMember>;
  deleteClerkUser: (clerkUserId: string) => Promise<unknown>;
};

export async function provisionManagedEmployee<TMember>(
  companyCode: string,
  dependencies: ProvisioningDependencies<TMember>,
) {
  const temporaryPassword = dependencies.createTemporaryPassword();
  const clerkUser = await dependencies.createClerkUser(temporaryPassword);

  try {
    const member = await dependencies.insertMember(clerkUser.id);
    return { member, companyCode, temporaryPassword };
  } catch (error) {
    await dependencies.deleteClerkUser(clerkUser.id).catch(() => undefined);
    throw error;
  }
}