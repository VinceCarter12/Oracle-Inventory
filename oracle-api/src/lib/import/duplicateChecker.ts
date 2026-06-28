import { prisma } from "../prisma";
import { ValidatedRow } from "./validator";

export interface DuplicateInfo {
  isDuplicate: boolean;
  conflictKey?: string;   // which field triggered match
  existingAssetId?: string;
  existingAssetName?: string;
}

/** Batch-check all rows against the database. Returns a Map<rowIndex, DuplicateInfo>. */
export async function checkDuplicates(
  rows: ValidatedRow[]
): Promise<Map<number, DuplicateInfo>> {
  const results = new Map<number, DuplicateInfo>();

  // Collect candidate values per key
  const assetTags    = rows.map((r) => String(r.mappedData.assetTag   ?? "")).filter(Boolean);
  const serials      = rows.map((r) => String(r.mappedData.serialNumber ?? "")).filter(Boolean);
  const propertyTags = rows.map((r) => String(r.mappedData.propertyTag ?? "")).filter(Boolean);
  const metas        = rows.map((r) => (r.mappedData.metadata as Record<string, unknown> | null) ?? {});
  const computerNames = metas.map((m) => String(m.computerName ?? "")).filter(Boolean);
  const imeis         = metas.map((m) => String(m.imeiNumber   ?? "")).filter(Boolean);
  const macAddresses  = metas.map((m) => String(m.macAddress   ?? "")).filter(Boolean);

  // Batch queries
  const [byTag, bySerial, byPropertyTag, byComputerName, byImei, byMac] = await Promise.all([
    assetTags.length
      ? prisma.asset.findMany({ where: { assetTag:     { in: assetTags    } }, select: { id: true, name: true, assetTag: true } })
      : [],
    serials.length
      ? prisma.asset.findMany({ where: { serialNumber: { in: serials      } }, select: { id: true, name: true, serialNumber: true } })
      : [],
    propertyTags.length
      ? prisma.asset.findMany({ where: { propertyTag:  { in: propertyTags } }, select: { id: true, name: true, propertyTag: true } })
      : [],
    computerNames.length
      ? prisma.asset.findMany({ where: { computerName: { in: computerNames } }, select: { id: true, name: true, computerName: true } })
      : [],
    imeis.length
      ? prisma.asset.findMany({ where: { imeiNumber:   { in: imeis        } }, select: { id: true, name: true, imeiNumber: true } })
      : [],
    macAddresses.length
      ? prisma.asset.findMany({ where: { macAddress:   { in: macAddresses } }, select: { id: true, name: true, macAddress: true } })
      : [],
  ]);

  const tagMap          = new Map(byTag.map((a)          => [a.assetTag!,     { id: a.id, name: a.name }]));
  const serialMap       = new Map(bySerial.map((a)       => [a.serialNumber!, { id: a.id, name: a.name }]));
  const propertyTagMap  = new Map(byPropertyTag.map((a)  => [a.propertyTag!,  { id: a.id, name: a.name }]));
  const computerNameMap = new Map(byComputerName.map((a) => [a.computerName!, { id: a.id, name: a.name }]));
  const imeiMap         = new Map(byImei.map((a)         => [a.imeiNumber!,   { id: a.id, name: a.name }]));
  const macMap          = new Map(byMac.map((a)          => [a.macAddress!,   { id: a.id, name: a.name }]));

  for (const row of rows) {
    const { mappedData, rowIndex } = row;
    const meta = (mappedData.metadata as Record<string, unknown> | null) ?? {};

    // Priority: assetTag > serialNumber > imeiNumber > propertyTag > computerName > macAddress
    const checks: [string, Map<string, { id: string; name: string }>, string][] = [
      [String(mappedData.assetTag    ?? ""), tagMap,          "assetTag"],
      [String(mappedData.serialNumber ?? ""), serialMap,     "serialNumber"],
      [String(meta.imeiNumber        ?? ""), imeiMap,        "imeiNumber"],
      [String(mappedData.propertyTag ?? ""), propertyTagMap, "propertyTag"],
      [String(meta.computerName      ?? ""), computerNameMap,"computerName"],
      [String(meta.macAddress        ?? ""), macMap,         "macAddress"],
    ];

    let found = false;
    for (const [val, map, key] of checks) {
      if (val && map.has(val)) {
        const existing = map.get(val)!;
        results.set(rowIndex, {
          isDuplicate: true,
          conflictKey: key,
          existingAssetId: existing.id,
          existingAssetName: existing.name,
        });
        found = true;
        break;
      }
    }
    if (!found) results.set(rowIndex, { isDuplicate: false });
  }

  return results;
}
