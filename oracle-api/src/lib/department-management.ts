export type EmployeeResolution = "reassign" | "clear";

export function hasValidEmployeeResolution(resolution: unknown, targetDepartmentId: unknown, employeeCount: number): boolean {
  if (employeeCount === 0) return true;
  if (resolution === "clear") return true;
  return resolution === "reassign" && typeof targetDepartmentId === "string" && targetDepartmentId.length > 0;
}
