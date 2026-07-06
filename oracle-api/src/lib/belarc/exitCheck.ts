import { prisma } from "../prisma";

/**
 * Hardware Audit Phase E — exit check.
 *
 * An asset is audit-enrolled once it has a baseline scan. Enrolled assets can
 * only be returned (direct return, return approval, or resignation turnover)
 * when their latest non-baseline, non-archived scan has been reviewed by an
 * admin. Assets without a baseline (phones, monitors, ...) are unaffected.
 */

export type ExitCheckState =
  | "not_required" // no baseline — asset not enrolled in hardware audit
  | "missing"      // enrolled, but no scan submitted since enrollment
  | "pending"      // latest scan awaiting admin review
  | "flagged"      // latest scan flagged for action — must be resolved
  | "cleared";     // latest scan reviewed — return may proceed

export function isExitCheckBlocked(state: ExitCheckState): boolean {
  return state === "missing" || state === "pending" || state === "flagged";
}

/** Pure classification — kept separate from the DB lookup so it is testable. */
export function classifyExitCheck(
  hasBaseline: boolean,
  latestScanStatus: "pending" | "reviewed" | "flagged" | null,
): ExitCheckState {
  if (!hasBaseline) return "not_required";
  if (latestScanStatus === null) return "missing";
  if (latestScanStatus === "reviewed") return "cleared";
  return latestScanStatus; // pending | flagged
}

export function exitCheckMessage(assetName: string, state: ExitCheckState): string {
  switch (state) {
    case "missing":
      return `"${assetName}" requires a hardware exit scan. Upload a Belarc report and have it reviewed before returning.`;
    case "pending":
      return `"${assetName}" has a hardware scan awaiting admin review. Review it in Hardware Audit before returning.`;
    case "flagged":
      return `"${assetName}" has a flagged hardware scan. Resolve the flag in Hardware Audit before returning.`;
    default:
      return "";
  }
}

/** State per asset id, computed in two queries regardless of asset count. */
export async function getExitCheckStates(assetIds: string[]): Promise<Map<string, ExitCheckState>> {
  const states = new Map<string, ExitCheckState>();
  if (assetIds.length === 0) return states;

  const [baselines, scans] = await Promise.all([
    prisma.hardwareScan.findMany({
      where: { assetId: { in: assetIds }, isBaseline: true },
      select: { assetId: true },
    }),
    // Newest first; the first non-archived scan per asset is the one that counts
    prisma.hardwareScan.findMany({
      where: { assetId: { in: assetIds }, isBaseline: false, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      select: { assetId: true, status: true },
    }),
  ]);

  const enrolled = new Set(baselines.map((b) => b.assetId));
  const latest = new Map<string, "pending" | "reviewed" | "flagged">();
  for (const scan of scans) {
    if (!latest.has(scan.assetId)) latest.set(scan.assetId, scan.status as "pending" | "reviewed" | "flagged");
  }

  for (const id of assetIds) {
    states.set(id, classifyExitCheck(enrolled.has(id), latest.get(id) ?? null));
  }
  return states;
}

/** Convenience for single-asset call sites (return approval, direct return). */
export async function getExitCheckState(assetId: string): Promise<ExitCheckState> {
  const states = await getExitCheckStates([assetId]);
  return states.get(assetId) ?? "not_required";
}
