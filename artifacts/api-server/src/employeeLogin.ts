export function normalizeEmployeeLoginPart(value: string) {
  return value.trim().toUpperCase();
}

export function employeeLoginIdentifier(companyCode: string, employeeId: string) {
  return `${normalizeEmployeeLoginPart(companyCode)}-${normalizeEmployeeLoginPart(employeeId)}`;
}