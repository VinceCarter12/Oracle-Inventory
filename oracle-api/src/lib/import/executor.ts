import { prisma } from "../prisma";
import { ValidatedRow } from "./validator";
import { DuplicateInfo } from "./duplicateChecker";
import { logActivity } from "../activity";

const CHUNK_SIZE = 50;

export interface ExecuteOptions {
  importHistoryId: string;
  categoryId: string | null;
  branchId: string | null;
  strictMode: boolean;
  userId: string;
  duplicates: Map<number, DuplicateInfo>;
  overwriteIndices: Set<number>;          // row indices the user chose to overwrite
  resolvedEmployees: Map<number, string>; // rowIndex → employeeId
  rowBranchOverrides?: Map<number, string>;    // per-row branch remaps from preview UI
  rowCategoryOverrides?: Map<number, string>;  // per-row category overrides (OPC multi-schema)
}

export interface ExecuteResult {
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  duplicatesSkipped: number;
  overwrittenRows: number;
  assignmentsCreated: number;
  categoriesCreated: number;
  employeesCreated: number;
  employeesUpdated: number;
}

async function processRow(
  row: ValidatedRow,
  opts: ExecuteOptions,
  result: ExecuteResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any
): Promise<void> {
  const { mappedData, rowIndex } = row;
  const dupInfo = opts.duplicates.get(rowIndex) ?? { isDuplicate: false };
  const shouldOverwrite = opts.overwriteIndices.has(rowIndex);

  if (dupInfo.isDuplicate && !shouldOverwrite) {
    result.duplicatesSkipped++;
    await tx.importRow.updateMany({
      where: { importId: opts.importHistoryId, rowIndex },
      data: { outcome: "duplicate", conflictKey: dupInfo.conflictKey, isDuplicate: true },
    });
    return;
  }

  const assetData = {
    name:               String(mappedData.name ?? "Unnamed Asset"),
    serialNumber:       mappedData.serialNumber  ? String(mappedData.serialNumber)  : null,
    assetTag:           mappedData.assetTag       ? String(mappedData.assetTag)       : null,
    computerName:       mappedData.computerName   ? String(mappedData.computerName)   : null,
    imeiNumber:         mappedData.imeiNumber     ? String(mappedData.imeiNumber)     : null,
    propertyTag:        mappedData.propertyTag    ? String(mappedData.propertyTag)    : null,
    macAddress:         mappedData.macAddress     ? String(mappedData.macAddress)     : null,
    metadata:           mappedData.metadata ?? null,
    condition:          (mappedData.condition  as string)  ?? "usable",
    ownership:          (mappedData.ownership  as string)  ?? "company",
    description:        mappedData.description  ? String(mappedData.description)  : null,
    warrantyExpiry:     mappedData.warrantyExpiry     ? new Date(String(mappedData.warrantyExpiry))     : null,
    nextMaintenanceDate:mappedData.nextMaintenanceDate ? new Date(String(mappedData.nextMaintenanceDate)): null,
    categoryId:         opts.rowCategoryOverrides?.get(rowIndex) ?? opts.categoryId,
    branchId:           opts.rowBranchOverrides?.get(rowIndex) ?? opts.branchId,
    importId:           opts.importHistoryId,
  };

  let assetId: string;

  if (shouldOverwrite && dupInfo.existingAssetId) {
    // PATCH-style overwrite: only non-null values
    const updateData = Object.fromEntries(
      Object.entries(assetData).filter(([, v]) => v !== null && v !== undefined)
    );
    delete updateData.importId; // don't overwrite importId on existing records
    const updated = await tx.asset.update({ where: { id: dupInfo.existingAssetId }, data: updateData });
    assetId = updated.id;
    result.overwrittenRows++;
    await tx.importRow.updateMany({
      where: { importId: opts.importHistoryId, rowIndex },
      data: { outcome: "overwritten", assetId, conflictKey: dupInfo.conflictKey },
    });
  } else {
    const asset = await tx.asset.create({ data: assetData });
    assetId = asset.id;
    result.importedRows++;
    await tx.importRow.updateMany({
      where: { importId: opts.importHistoryId, rowIndex },
      data: { outcome: "imported", assetId },
    });
  }

  // Employee linking
  const employeeId = opts.resolvedEmployees.get(rowIndex);
  if (employeeId) {
    if (!shouldOverwrite) {
      // New asset — create assignment unconditionally
      await tx.assetAssignment.create({
        data: { assetId, employeeId, status: "active", notes: "Created via import" },
      });
      await tx.movementLog.create({
        data: { assetId, employeeId, type: "assignment", notes: "Imported via Excel/CSV upload" },
      });
      result.assignmentsCreated++;
    } else {
      // Overwritten asset — sync assignment: close any active assignment to a different
      // employee, then create (or keep) one for the current resolved employee.
      const existing = await tx.assetAssignment.findFirst({
        where: { assetId, status: "active" },
        select: { id: true, employeeId: true },
      });
      if (!existing) {
        // No active assignment — create one
        await tx.assetAssignment.create({
          data: { assetId, employeeId, status: "active", notes: "Reassigned via import overwrite" },
        });
        await tx.movementLog.create({
          data: { assetId, employeeId, type: "assignment", notes: "Assignment synced via import overwrite" },
        });
        result.assignmentsCreated++;
      } else if (existing.employeeId !== employeeId) {
        // Different employee — close old, open new
        await tx.assetAssignment.update({
          where: { id: existing.id },
          data: { status: "returned", returnedAt: new Date() },
        });
        await tx.assetAssignment.create({
          data: { assetId, employeeId, status: "active", notes: "Reassigned via import overwrite" },
        });
        await tx.movementLog.create({
          data: { assetId, employeeId, type: "transfer", notes: "Employee changed via import overwrite" },
        });
        result.assignmentsCreated++;
      }
      // else: same employee already assigned — no change needed
    }
  }
}

export async function executeImport(
  validatedRows: ValidatedRow[],
  opts: ExecuteOptions
): Promise<ExecuteResult> {
  const result: ExecuteResult = {
    importedRows: 0, skippedRows: 0, failedRows: 0,
    duplicatesSkipped: 0, overwrittenRows: 0, assignmentsCreated: 0,
    categoriesCreated: 0, employeesCreated: 0, employeesUpdated: 0,
  };

  const validRows   = validatedRows.filter((r) => r.isValid);
  const invalidRows = validatedRows.filter((r) => !r.isValid);

  // Mark invalid rows as failed
  for (const row of invalidRows) {
    result.failedRows++;
    await prisma.importRow.updateMany({
      where: { importId: opts.importHistoryId, rowIndex: row.rowIndex },
      data: {
        outcome: "failed",
        errorMessage: row.errors.map((e) => e.message).join("; "),
      },
    });
  }

  if (opts.strictMode) {
    // All-or-nothing — single transaction with extended timeout
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        await processRow(row, opts, result, tx);
      }
    }, { timeout: 120_000 });
  } else {
    // Chunked partial import — each chunk gets its own transaction with extended timeout
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      try {
        await prisma.$transaction(async (tx) => {
          for (const row of chunk) {
            await processRow(row, opts, result, tx);
          }
        }, { timeout: 60_000 });
      } catch (err) {
        for (const row of chunk) {
          result.failedRows++;
          await prisma.importRow.updateMany({
            where: { importId: opts.importHistoryId, rowIndex: row.rowIndex },
            data: { outcome: "failed", errorMessage: (err as Error).message },
          }).catch(() => {});
        }
      }
    }
  }

  // Update ImportHistory status (entity counters are written by the route after this returns)
  await prisma.importHistory.update({
    where: { id: opts.importHistoryId },
    data: {
      status:
        result.failedRows > 0 && result.importedRows === 0 && result.overwrittenRows === 0
          ? "failed"
          : result.failedRows > 0
          ? "partial"
          : "completed",
    },
  });

  await logActivity({
    userId: opts.userId,
    action: "import_completed",
    entity: "ImportHistory",
    entityId: opts.importHistoryId,
    metadata: { ...result },
  });

  return result;
}
