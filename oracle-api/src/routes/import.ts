import { Router, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import path from "path";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthRequest } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { parseBuffer } from "../lib/import/parser";
import { detectCategoryAndBranch } from "../lib/import/detector";
import { mapColumns, mapColumnsEnhanced, applyPreset, validateMappingCompleteness } from "../lib/import/mapper";
import { validateRows, ValidatedRow } from "../lib/import/validator";
import { checkDuplicates } from "../lib/import/duplicateChecker";
import { executeImport } from "../lib/import/executor";
import { classifyWorkbook, isOpcWorkbook } from "../lib/import/workbook-analyzer";
import { extractComputerAssets } from "../lib/import/extractors/computer-extractor";
import { extractPhoneAssets } from "../lib/import/extractors/phone-extractor";
import { extractZohoAssets } from "../lib/import/extractors/zoho-extractor";
import type { NormalizedAsset } from "../lib/import/extractors/types";
import { unpivotSheet } from "../lib/import/unpivot";
import { stringSimilarity } from "../lib/import/mapper";
import { isZohoConfigured, enrichEmployee } from "../lib/integrations/zoho";

const router = Router();
router.use(requireAuth);

// ── Upload rate limit: 5 per 15 min per user ──────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req: AuthRequest) => req.user?.id ?? "anon",
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Too many uploads. Try again in 15 minutes." },
});

// ── Multer: memory storage, 10 MB limit, extension guard ─────────────────────
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    }
    cb(null, true);
  },
});

// ── 90-day ImportRow retention cleanup ───────────────────────────────────────
function cleanupOldImportRows(): void {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  prisma.importRow
    .deleteMany({ where: { import: { createdAt: { lt: cutoff } } } })
    .catch(() => {});
}

// ── Row limits per role ───────────────────────────────────────────────────────
async function getRowLimit(userId: string): Promise<number> {
  const user = await prisma.systemUser.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return user?.role?.name === "super_admin" ? 5000 : 2000;
}

// ── Fuzzy branch resolution (≥0.85) ─────────────────────────────────────────
function fuzzyResolveBranch(
  rawName: string,
  branches: { id: string; name: string }[]
): { id: string; name: string; confidence: number } | null {
  // Exact match first
  const exact = branches.find((b) => b.name.toLowerCase() === rawName.toLowerCase());
  if (exact) return { id: exact.id, name: exact.name, confidence: 1.0 };

  // Fuzzy match ≥0.85
  const best = branches
    .map((b) => ({ ...b, sim: stringSimilarity(b.name, rawName) }))
    .filter((b) => b.sim >= 0.85)
    .sort((a, b) => b.sim - a.sim)[0];

  return best ? { id: best.id, name: best.name, confidence: best.sim } : null;
}

// ── Category fuzzy check (≥0.8) ──────────────────────────────────────────────
function fuzzyFindCategory(
  hint: string,
  categories: { id: string; name: string }[]
): { id: string; name: string } | null {
  const exact = categories.find((c) => c.name.toLowerCase() === hint.toLowerCase());
  if (exact) return exact;
  const best = categories
    .map((c) => ({ ...c, sim: stringSimilarity(c.name, hint) }))
    .filter((c) => c.sim >= 0.8)
    .sort((a, b) => b.sim - a.sim)[0];
  return best ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/parse
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/parse",
  uploadLimiter,
  requirePermission("import_inventory"),
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    cleanupOldImportRows();

    const { buffer, originalname, size } = req.file;
    const rowLimit = await getRowLimit(req.user!.id);

    const headerRowOffset        = Math.max(0, parseInt(String(req.body?.headerRowOffset ?? "0"), 10) || 0);
    const unpivotBranches        = req.body?.unpivotBranches === "true";
    const ingestUnmappedAsMetadata = req.body?.ingestUnmappedAsMetadata !== "false"; // default true
    const useZohoDirectory       = req.body?.useZohoDirectory !== "false";           // default true

    let parsed;
    try {
      parsed = parseBuffer(buffer, originalname, { headerRowOffset });
    } catch (err) {
      res.status(422).json({ error: `Cannot parse file: ${(err as Error).message}` });
      return;
    }

    if (parsed.totalRows > rowLimit) {
      res.status(422).json({
        error: `File contains ${parsed.totalRows} rows, which exceeds the ${rowLimit}-row limit.`,
      });
      return;
    }

    const [branches, existingCategories] = await Promise.all([
      prisma.branch.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
      prisma.category.findMany({ select: { id: true, name: true } }),
    ]);

    // ── Classify workbook ─────────────────────────────────────────────────────
    const classifications = classifyWorkbook(parsed.sheets.map((s) => s.name));
    const isOpc = isOpcWorkbook(classifications);

    if (isOpc) {
      // ── OPC multi-schema path ───────────────────────────────────────────────
      const branchMap = new Map(branches.map((b) => [b.name.toLowerCase(), b.id]));
      const sheetSummaries: object[] = [];
      const allNormalized: NormalizedAsset[] = [];

      for (const cls of classifications) {
        const sheet = parsed.sheets.find((s) => s.name === cls.name);

        if (cls.skip || !sheet) {
          sheetSummaries.push({
            name: cls.name, type: cls.type, skip: true,
            skipReason: cls.skipReason, branchName: cls.branchName,
            branchId: null, assetCount: 0, employeeRowCount: 0,
          });
          continue;
        }

        const branchId = cls.branchName ? (branchMap.get(cls.branchName.toLowerCase()) ?? null) : null;
        let extracted: NormalizedAsset[] = [];

        if (cls.type === "computer") {
          extracted = extractComputerAssets(sheet.rows, cls.branchName, cls.name);
        } else if (cls.type === "phone") {
          extracted = extractPhoneAssets(sheet.rows, cls.branchName, cls.name);
        } else if (cls.type === "zoho") {
          extracted = extractZohoAssets(sheet.rows, cls.branchName, cls.name);
        }

        allNormalized.push(...extracted);

        const categoryBreakdown: Record<string, number> = {};
        for (const a of extracted) {
          categoryBreakdown[a.categoryHint] = (categoryBreakdown[a.categoryHint] ?? 0) + 1;
        }

        sheetSummaries.push({
          name: cls.name, type: cls.type, skip: false,
          branchName: cls.branchName, branchId,
          employeeRowCount: sheet.rows.length,
          assetCount: extracted.length,
          categoryBreakdown,
        });
      }

      let globalIndex = 0;
      const validatedRows = allNormalized.map((asset): ValidatedRow => {
        const idx = globalIndex++;
        const mappedData: Record<string, unknown> = {
          name: asset.name, serialNumber: asset.serialNumber,
          assetTag: asset.assetTag, computerName: asset.computerName,
          imeiNumber: asset.imeiNumber, propertyTag: asset.propertyTag,
          macAddress: asset.macAddress, brand: asset.brand,
          model: asset.model, condition: asset.condition,
          ownership: asset.ownership, warrantyExpiry: asset.warrantyExpiry,
          purchaseDate: asset.purchaseDate, description: asset.description,
          metadata: asset.metadata, branchName: asset.branchName,
          employeeRef: asset.employeeRef, employeeId: asset.employeeId,
          employeePhone: asset.employeePhone, employeeDeptName: asset.employeeDeptName,
          employeePosition: asset.employeePosition,
          categoryHint: asset.categoryHint, deviceType: asset.deviceType,
        };
        Object.keys(mappedData).forEach((k) => { if (mappedData[k] === null) delete mappedData[k]; });

        return {
          rowIndex: idx,
          rawData: { _source: asset.sourceSheet, _row: asset.sourceRowIndex },
          mappedData,
          errors: [], warnings: [],
          isValid: !!asset.name,
          hasWarnings: false,
        };
      });

      const duplicates = await checkDuplicates(validatedRows);

      const categoryTotals: Record<string, number> = {};
      const branchTotals: Record<string, number> = {};
      for (const a of allNormalized) {
        categoryTotals[a.categoryHint] = (categoryTotals[a.categoryHint] ?? 0) + 1;
        if (a.branchName) branchTotals[a.branchName] = (branchTotals[a.branchName] ?? 0) + 1;
      }

      const dupCount = [...duplicates.values()].filter((d) => d.isDuplicate).length;

      // Annotate each row with category/branch badges
      const rowsWithDupInfo = validatedRows.map((r) => {
        const hint = r.mappedData.categoryHint as string | undefined;
        const branchName = r.mappedData.branchName as string | undefined;

        const rowCategoryNew = hint && !fuzzyFindCategory(hint, existingCategories) ? hint : undefined;
        const rowBranchResolved = branchName ? fuzzyResolveBranch(branchName, branches) : undefined;

        return {
          ...r,
          duplicateInfo: duplicates.get(r.rowIndex),
          rowCategoryNew,
          rowBranchResolved: rowBranchResolved?.confidence === 1.0 ? undefined : rowBranchResolved,
        };
      });

      await logActivity({
        userId: req.user!.id,
        action: "import_parsed",
        entity: "Import",
        metadata: {
          fileName: originalname, fileSize: size,
          mode: "opc-multi-schema",
          totalAssets: allNormalized.length,
          duplicates: dupCount,
        },
      });

      res.json({
        mode: "opc-multi-schema",
        fileName: originalname,
        fileSize: size,
        sheets: sheetSummaries,
        zohoEnabled: useZohoDirectory && isZohoConfigured(),
        summary: {
          totalAssets: allNormalized.length,
          byCategory: categoryTotals,
          byBranch: branchTotals,
          duplicateCount: dupCount,
        },
        rows: rowsWithDupInfo,
      });
      return;
    }

    // ── Single-schema path ────────────────────────────────────────────────────
    const sheetResults = parsed.sheets.map((sheet) => {
      const detection = detectCategoryAndBranch(
        sheet.name, sheet.headers, sheet.rows.slice(0, 5), branches
      );
      return { sheet, detection };
    });

    const primary = sheetResults[0];
    if (!primary) {
      res.status(422).json({ error: "No data found in file." });
      return;
    }

    let activeSheet = primary.sheet;
    if (primary.detection.isMatrix && unpivotBranches && primary.detection.branchColumns.length >= 2) {
      activeSheet = unpivotSheet(primary.sheet, primary.detection.branchColumns);
    }

    // ── Enhanced mapping with fuzzy + content inference ───────────────────────
    const sampleRows = activeSheet.rows.slice(0, 10);
    const enhancedMapping = mapColumnsEnhanced(activeSheet.headers, sampleRows, branches);
    const mappingResult = enhancedMapping;
    const mappingErrors = validateMappingCompleteness(mappingResult.mappings);

    const category = primary.detection.category ?? "Peripherals";

    let validatedRows: ValidatedRow[] = [];
    let duplicates = new Map<number, { isDuplicate: boolean; conflictKey?: string; existingAssetId?: string; existingAssetName?: string }>();

    // Always run validateRows so mappedData is populated for the preview,
    // even when required columns are missing. Mapping errors are injected below.
    validatedRows = validateRows(activeSheet.rows, mappingResult.mappings, category, ingestUnmappedAsMetadata);
    duplicates = await checkDuplicates(validatedRows);

    if (mappingErrors.length > 0) {
      const injected = mappingErrors.map(msg => ({ field: "name", message: msg, severity: "error" as const }));
      validatedRows = validatedRows.map(r => ({
        ...r,
        errors: [...injected, ...r.errors],
        isValid: false,
      }));
    }

    // ── Per-row branch fuzzy resolution ───────────────────────────────────────
    // Resolve each row's branchName via fuzzy match (≥0.85).
    // Rows that resolve get rowBranchResolved; exact matches don't need a badge.
    // Rows that don't resolve at all keep the "unknown branch" warning.
    const rowsWithDupInfo = validatedRows.map((r) => ({
      ...r,
      duplicateInfo: duplicates.get(r.rowIndex),
    }));

    const rowsWithBranchInfo = rowsWithDupInfo.map((r) => {
      const rawBranch = r.mappedData.branchName ? String(r.mappedData.branchName) : null;
      if (!rawBranch) return r;

      const resolved = fuzzyResolveBranch(rawBranch, branches);

      if (!resolved) {
        // Truly unresolved → add warning (same as before)
        return {
          ...r,
          warnings: [
            ...r.warnings,
            {
              field: "branch",
              message: `Unknown branch "${rawBranch}" — remap to an existing branch or it will be left unassigned.`,
              severity: "warning" as const,
            },
          ],
          hasWarnings: true,
        };
      }

      if (resolved.confidence === 1.0) {
        // Exact match — no badge needed, just silently resolved
        return r;
      }

      // Fuzzy match — return rowBranchResolved badge so UI can show "Branch → <name>"
      return { ...r, rowBranchResolved: resolved };
    });

    // ── Batch-check employee refs ─────────────────────────────────────────────
    const resolvedEmpRowIndices = new Set<number>();
    {
      const empCandidates = rowsWithBranchInfo
        .filter((r) => r.mappedData.employeeRef || r.mappedData.employeeId || (r.mappedData.metadata as Record<string, unknown> | undefined)?.email)
        .map((r) => ({
          rowIndex: r.rowIndex,
          ref:   r.mappedData.employeeRef ? String(r.mappedData.employeeRef) : null,
          empId: r.mappedData.employeeId  ? String(r.mappedData.employeeId)  : null,
          email: (r.mappedData.metadata as Record<string, unknown> | undefined)?.email
            ? String((r.mappedData.metadata as Record<string, unknown>).email) : null,
        }));

      if (empCandidates.length > 0) {
        const refNames = [...new Set(empCandidates.map((e) => e.ref).filter(Boolean) as string[])];
        const empIds   = [...new Set(empCandidates.map((e) => e.empId).filter(Boolean) as string[])];
        const emails   = [...new Set([
          ...empCandidates.map((e) => e.email),
          ...empCandidates.map((e) => (e.ref?.includes("@") ? e.ref : null)),
        ].filter(Boolean) as string[])];

        const existingEmps = await prisma.employee.findMany({
          where: {
            OR: [
              ...(refNames.length ? [{ name: { in: refNames, mode: "insensitive" as const } }] : []),
              ...(empIds.length   ? [{ employeeId: { in: empIds } }] : []),
              ...(emails.length   ? [{ email: { in: emails } }] : []),
            ],
          },
          select: { id: true, name: true, email: true, employeeId: true },
        });

        for (const e of empCandidates) {
          const found = existingEmps.some((emp) =>
            (e.ref   && (emp.name?.toLowerCase() === e.ref.toLowerCase() || emp.email === e.ref)) ||
            (e.empId && emp.employeeId === e.empId) ||
            (e.email && emp.email === e.email)
          );
          if (found) resolvedEmpRowIndices.add(e.rowIndex);
        }
      }
    }

    // ── Per-row category badge ────────────────────────────────────────────────
    const rowsWithEmpAndCatInfo = rowsWithBranchInfo.map((r) => {
      const hasEmpRef = !!(r.mappedData.employeeRef || r.mappedData.employeeId || (r.mappedData.metadata as Record<string, unknown> | undefined)?.email);
      const newEmpBadge = hasEmpRef && !resolvedEmpRowIndices.has(r.rowIndex)
        ? { employeeWillBeCreated: true }
        : {};

      // Category badge: if categoryHint not found in DB (fuzzy ≥0.8), flag as "will create"
      const hint = r.mappedData.categoryHint as string | undefined;
      const catBadge = hint && !fuzzyFindCategory(hint, existingCategories)
        ? { rowCategoryNew: hint }
        : {};

      return { ...r, ...newEmpBadge, ...catBadge };
    });

    // ── Suggest auto asset tag ────────────────────────────────────────────────
    const suggestAutoAssetTag =
      mappingErrors.length === 0 &&
      validatedRows.length > 0 &&
      validatedRows.every((r) => {
        const md = r.mappedData as Record<string, unknown>;
        const meta = md.metadata as Record<string, unknown> | undefined;
        return (
          !["assetTag", "serialNumber", "propertyTag"].some((f) => md[f]) &&
          !["imeiNumber", "computerName"].some((k) => meta?.[k])
        );
      });

    const summary = {
      totalRows:     validatedRows.length,
      validRows:     validatedRows.filter((r) => r.isValid).length,
      invalidRows:   validatedRows.filter((r) => !r.isValid).length,
      warningRows:   validatedRows.filter((r) => r.hasWarnings).length,
      duplicateRows: [...duplicates.values()].filter((d) => d.isDuplicate).length,
    };

    await logActivity({
      userId: req.user!.id,
      action: "import_parsed",
      entity: "Import",
      metadata: {
        fileName: originalname, fileSize: size, headerRowOffset, unpivotBranches,
        isMatrix: primary.detection.isMatrix,
        autoConfidence: enhancedMapping.autoConfidence,
        requiresManualMapping: enhancedMapping.requiresManualMapping,
        ...summary,
      },
    });

    res.json({
      fileName: originalname,
      fileSize: size,
      sheets: sheetResults.map((sr) => ({
        name: sr.sheet.name,
        rowCount: sr.sheet.rows.length,
        detection: sr.detection,
        mappings: mapColumns(sr.sheet.headers).mappings,
        unmapped: mapColumns(sr.sheet.headers).unmapped,
      })),
      activeSheet: activeSheet.name,
      category,
      branchId:    primary.detection.branchId,
      branchName:  primary.detection.branchName,
      confidence:  primary.detection.confidence,
      signals:     primary.detection.signals,
      isMatrix:    primary.detection.isMatrix,
      branchColumns: primary.detection.branchColumns,
      wasUnpivoted: primary.detection.isMatrix && unpivotBranches,
      mappingErrors,
      suggestAutoAssetTag,
      mappings:           mappingResult.mappings,
      unmapped:           mappingResult.unmapped,
      columnConfidences:  enhancedMapping.columnConfidences,
      autoConfidence:     enhancedMapping.autoConfidence,
      requiresManualMapping: enhancedMapping.requiresManualMapping,
      contentSignals:     enhancedMapping.contentSignals,
      zohoEnabled:        useZohoDirectory && isZohoConfigured(),
      rows: rowsWithEmpAndCatInfo,
      summary,
    });
  }
);

// ── Auto asset-tag generator ─────────────────────────────────────────────────
function generateAutoAssetTag(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AUTO-${ts}-${rand}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/execute
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/execute",
  requirePermission("import_inventory"),
  async (req: AuthRequest, res: Response) => {
    const {
      fileName,
      fileSize,
      categoryId,
      categoryName,
      branchId,
      strictMode = false,
      rows: clientRows,
      overwriteIndices = [],
      rowBranchOverrides = {},
      rowCategoryOverrides = {},
      mappingUsed,
      editedCount = 0,
      autoGenerateAssetTag = false,
      autoCreateEmployees = true,
      useZohoDirectory = true,
    } = req.body as {
      fileName: string;
      fileSize: number;
      categoryId: string | null;
      categoryName: string | null;
      branchId: string | null;
      strictMode?: boolean;
      rows: (ValidatedRow & { duplicateInfo?: { isDuplicate: boolean; conflictKey?: string; existingAssetId?: string } })[];
      overwriteIndices?: number[];
      rowBranchOverrides?: Record<number, string>;
      rowCategoryOverrides?: Record<number, string>;
      mappingUsed?: unknown;
      editedCount?: number;
      autoGenerateAssetTag?: boolean;
      autoCreateEmployees?: boolean;
      useZohoDirectory?: boolean;
    };

    if (!clientRows?.length) {
      res.status(400).json({ error: "No rows to import." });
      return;
    }

    if (strictMode && clientRows.filter((r) => r.isValid).length > 200) {
      res.status(400).json({ error: "Strict Mode supports a maximum of 200 rows per import." });
      return;
    }

    if (autoGenerateAssetTag) {
      for (const row of clientRows) {
        const md = row.mappedData as Record<string, unknown>;
        const meta = md.metadata as Record<string, unknown> | undefined;
        const hasId = md.assetTag || md.serialNumber || md.propertyTag || meta?.imeiNumber || meta?.computerName;
        if (!hasId) md.assetTag = generateAutoAssetTag();
      }
    }

    // Require force_import permission for overwrites
    if (overwriteIndices.length > 0) {
      const hasForce = await prisma.systemUser.findUnique({
        where: { id: req.user!.id },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          permissionOverrides: { include: { permission: true } },
        },
      });
      const rolePerms = hasForce?.role?.permissions.map((rp) => rp.permission.key) ?? [];
      const granted = hasForce?.permissionOverrides.filter((up) => up.granted).map((up) => up.permission.key) ?? [];
      const revoked = new Set(hasForce?.permissionOverrides.filter((up) => !up.granted).map((up) => up.permission.key) ?? []);
      const allPerms = [...new Set([...rolePerms, ...granted])].filter((k) => !revoked.has(k));
      if (!allPerms.includes("force_import")) {
        res.status(403).json({ error: "You do not have permission to overwrite existing records." });
        return;
      }
    }

    // Auto-create or fuzzy-reuse category from categoryName
    let resolvedCategoryId = categoryId;
    let categoriesCreated = 0;
    if (!resolvedCategoryId && categoryName) {
      const allCategories = await prisma.category.findMany({ select: { id: true, name: true } });
      const best = allCategories
        .map((c) => ({ ...c, sim: stringSimilarity(c.name, categoryName) }))
        .filter((c) => c.sim >= 0.8)
        .sort((a, b) => b.sim - a.sim)[0];

      if (best) {
        resolvedCategoryId = best.id;
      } else {
        const created = await prisma.category.create({ data: { name: categoryName } });
        resolvedCategoryId = created.id;
        categoriesCreated = 1;
      }
    }

    // Per-row category: fuzzy-reuse or auto-create
    {
      const catAll = await prisma.category.findMany({ select: { id: true, name: true } });
      const catCache = new Map<string, string>(catAll.map((c) => [c.name.toLowerCase(), c.id]));

      for (const r of clientRows) {
        const hint = (r.mappedData as Record<string, unknown>).categoryHint as string | undefined;
        if (!hint) continue;
        const key = hint.toLowerCase();

        if (!catCache.has(key)) {
          const fuzzy = catAll
            .map((c) => ({ ...c, sim: stringSimilarity(c.name, hint) }))
            .filter((c) => c.sim >= 0.8)
            .sort((a, b) => b.sim - a.sim)[0];
          if (fuzzy) {
            catCache.set(key, fuzzy.id);
          } else {
            const created = await prisma.category.create({ data: { name: hint } });
            catCache.set(key, created.id);
            catAll.push(created);
            categoriesCreated++;
          }
        }

        if (!(r.rowIndex in rowCategoryOverrides)) {
          rowCategoryOverrides[r.rowIndex] = catCache.get(key)!;
        }
      }
    }

    // Server-side branch name resolution: fill in branchId for rows that have
    // branchName in mappedData but no user-supplied rowBranchOverride.
    // Auto-creates branches that don't exist (same as category/department auto-create).
    {
      const allBranches = await prisma.branch.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
      const branchAutoCreated = new Map<string, string>(); // normalised name → id

      for (const row of clientRows) {
        if (rowBranchOverrides[row.rowIndex]) continue; // user already set an override
        const bName = ((row.mappedData as Record<string, unknown>).branchName as string | undefined)?.trim();
        if (!bName) continue;

        const resolved = fuzzyResolveBranch(bName, allBranches);
        if (resolved) {
          rowBranchOverrides[row.rowIndex] = resolved.id;
        } else {
          // Branch not found — auto-create once per unique name
          const key = bName.toLowerCase();
          let newId = branchAutoCreated.get(key);
          if (!newId) {
            const created = await prisma.branch.create({ data: { name: bName } });
            newId = created.id;
            branchAutoCreated.set(key, newId);
            allBranches.push({ id: newId, name: bName }); // cache so next rows find it
          }
          rowBranchOverrides[row.rowIndex] = newId;
        }
      }
    }

    // Create ImportHistory record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const importCreateData: any = {
      uploadedById:      req.user!.id,
      fileName,
      fileSize:          fileSize ?? 0,
      totalRows:         clientRows.length,
      strictMode,
      editedBeforeImport: editedCount,
      mappingUsed:       mappingUsed ?? null,
      status:            "processing",
    };
    const importHistory = await prisma.importHistory.create({ data: importCreateData });

    // Create ImportRow stubs
    await prisma.importRow.createMany({
      data: clientRows.map((r) => ({
        importId: importHistory.id,
        rowIndex: r.rowIndex,
        rawData: r.rawData as object,
        mappedData: r.mappedData as object,
        isDuplicate: r.duplicateInfo?.isDuplicate ?? false,
        conflictKey: r.duplicateInfo?.conflictKey ?? null,
        wasEdited: false,
        employeeHint: (r.mappedData.employeeRef ? String(r.mappedData.employeeRef) : null),
      })),
    });

    // ── Employee resolution with optional Zoho enrichment ─────────────────────
    const resolvedEmployees = new Map<number, string>();
    let employeesCreated = 0;
    let employeesUpdated = 0;
    let zohoMatched = 0;

    // Fetch branch names for Zoho enrichment hints (only if Zoho is enabled)
    const branchNameMap = new Map<string, string>();
    if (useZohoDirectory && isZohoConfigured()) {
      const branchList = await prisma.branch.findMany({ select: { id: true, name: true } });
      for (const b of branchList) branchNameMap.set(b.id, b.name);
    }

    const isEmailAddr = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const deriveNameFromEmail = (emailStr: string) => {
      const local = emailStr.split("@")[0];
      return local.split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    };

    // Pre-build department cache to avoid N DB lookups in the employee loop
    const deptCache = new Map<string, string>(); // name.toLowerCase() → departmentId
    {
      const allDepts = await prisma.department.findMany({ select: { id: true, name: true } });
      for (const d of allDepts) deptCache.set(d.name.toLowerCase(), d.id);
    }
    // Departments now require a branch. Fall back to the import's own branch (or the
    // earliest-created active branch) when a row doesn't resolve to one.
    let fallbackBranchId: string | null = null;

    async function resolveDepartment(name: string, rowBranchId: string | null): Promise<string> {
      const key = name.toLowerCase();
      if (deptCache.has(key)) return deptCache.get(key)!;
      let deptBranchId = rowBranchId;
      if (!deptBranchId) {
        if (!fallbackBranchId) {
          const defaultBranch = await prisma.branch.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
          if (!defaultBranch) throw new Error("Cannot create a department without an active branch to assign it to.");
          fallbackBranchId = defaultBranch.id;
        }
        deptBranchId = fallbackBranchId;
      }
      const created = await prisma.department.create({ data: { name, branchId: deptBranchId } });
      deptCache.set(key, created.id);
      return created.id;
    }

    for (const row of clientRows) {
      const md    = row.mappedData as Record<string, unknown>;
      const ref   = md.employeeRef ? String(md.employeeRef) : null;
      const empId = md.employeeId  ? String(md.employeeId)  : null;
      // Email can come from the dedicated metadata.email field (e.g. Zoho rows) or as ref
      const email = (md.metadata as Record<string, unknown> | undefined)?.email
        ? String((md.metadata as Record<string, unknown>).email)
        : (ref && isEmailAddr(ref) ? ref : null);

      // Employee enrichment data from workbook row
      const empPhone    = md.employeePhone    ? String(md.employeePhone)    : null;
      const empDeptName = md.employeeDeptName ? String(md.employeeDeptName) : null;
      const empPosition = md.employeePosition ? String(md.employeePosition) : null;

      if (!ref && !empId && !email) continue;

      // Resolution order: exact email > exact employeeId > case-insensitive name > ref-as-email
      const orClauses: object[] = [];
      if (email)  orClauses.push({ email });
      if (empId)  orClauses.push({ employeeId: empId });
      if (ref && !isEmailAddr(ref)) {
        orClauses.push({ name: { equals: ref, mode: "insensitive" as const } });
        // Also match "First Last" when ref is a single token (first name only)
        if (!ref.includes(" ")) {
          orClauses.push({ name: { startsWith: ref + " ", mode: "insensitive" as const } });
        }
      }

      let emp = orClauses.length
        ? await prisma.employee.findFirst({
            where: { OR: orClauses },
            select: { id: true, phone: true, departmentId: true, branchId: true, position: true },
          })
        : null;

      if (emp) {
        resolvedEmployees.set(row.rowIndex, emp.id);
        // Non-destructive upsert: fill in any fields that are currently null
        const rowBranchId    = rowBranchOverrides[row.rowIndex] ?? branchId ?? null;
        const resolvedDeptId = empDeptName ? await resolveDepartment(empDeptName, rowBranchId) : null;
        const upsertData: Record<string, unknown> = {};
        if (!emp.phone        && empPhone)       upsertData.phone        = empPhone;
        if (!emp.departmentId && resolvedDeptId) upsertData.departmentId = resolvedDeptId;
        if (!emp.branchId     && rowBranchId)    upsertData.branchId     = rowBranchId;
        if (!emp.position     && empPosition)    upsertData.position     = empPosition;
        if (Object.keys(upsertData).length > 0) {
          await prisma.employee.update({ where: { id: emp.id }, data: upsertData });
          employeesUpdated++;
        }
        continue;
      }

      // Not found in DB → try Zoho enrichment before auto-creating
      let resolvedName  = ref && !isEmailAddr(ref) ? ref : email ? deriveNameFromEmail(email) : ref ? deriveNameFromEmail(ref) : "Unknown";
      let resolvedEmail = email ?? null;
      let resolvedEmpId = empId;
      let rowEmpSource  = "imported";  // default for Excel imports; overridden to "zoho" if enriched

      if (autoCreateEmployees && useZohoDirectory && isZohoConfigured()) {
        const rowBranchId = rowBranchOverrides[row.rowIndex] ?? branchId ?? null;
        const branchHint  = rowBranchId ? (branchNameMap.get(rowBranchId) ?? null) : null;

        const enriched = await enrichEmployee({
          name:       resolvedName !== "Unknown" ? resolvedName : null,
          email:      resolvedEmail,
          employeeId: resolvedEmpId,
          branchHint,
        });

        if (enriched.source === "zoho") {
          zohoMatched++;
          rowEmpSource  = "zoho";
          resolvedName  = enriched.name  ?? resolvedName;
          resolvedEmail = enriched.email ?? resolvedEmail;
          resolvedEmpId = enriched.employeeId ?? resolvedEmpId;

          // Re-attempt DB lookup with Zoho-enriched email (may now find the employee)
          if (enriched.email) {
            emp = await prisma.employee.findFirst({
              where: { email: enriched.email },
              select: { id: true, phone: true, departmentId: true, branchId: true, position: true },
            });
            if (emp) {
              resolvedEmployees.set(row.rowIndex, emp.id);
              const rowBranchId2    = rowBranchOverrides[row.rowIndex] ?? branchId ?? null;
              const resolvedDeptId2 = empDeptName ? await resolveDepartment(empDeptName, rowBranchId2) : null;
              const upsertData2: Record<string, unknown> = {};
              if (!emp.phone        && empPhone)        upsertData2.phone        = empPhone;
              if (!emp.departmentId && resolvedDeptId2) upsertData2.departmentId = resolvedDeptId2;
              if (!emp.branchId     && rowBranchId2)    upsertData2.branchId     = rowBranchId2;
              if (!emp.position     && empPosition)     upsertData2.position     = empPosition;
              if (Object.keys(upsertData2).length > 0) {
                await prisma.employee.update({ where: { id: emp.id }, data: upsertData2 });
                employeesUpdated++;
              }
              continue;
            }
          }
        }
      }

      // Auto-create employee (record only — no SystemUser, no mailbox)
      if (autoCreateEmployees && (ref || email)) {
        const rowBranchId    = rowBranchOverrides[row.rowIndex] ?? branchId ?? null;
        const resolvedDeptId = empDeptName ? await resolveDepartment(empDeptName, rowBranchId) : null;
        const created = await prisma.employee.create({
          data: {
            name:         resolvedName,
            email:        resolvedEmail,
            phone:        empPhone,
            employeeId:   resolvedEmpId ?? null,
            branchId:     rowBranchId,
            departmentId: resolvedDeptId,
            position:     empPosition,
            source:       rowEmpSource,
          },
          select: { id: true },
        });
        resolvedEmployees.set(row.rowIndex, created.id);
        employeesCreated++;
      }
    }

    if (zohoMatched > 0) {
      // Log outcome (not PII)
      console.log(`[import] Zoho enrichment: ${zohoMatched} employee(s) matched/enriched`);
    }

    // Build duplicate map from client data
    const duplicates = new Map(
      clientRows.map((r) => [
        r.rowIndex,
        {
          isDuplicate:     r.duplicateInfo?.isDuplicate ?? false,
          conflictKey:     r.duplicateInfo?.conflictKey,
          existingAssetId: r.duplicateInfo?.existingAssetId,
        },
      ])
    );

    // Run import
    const result = await executeImport(clientRows as ValidatedRow[], {
      importHistoryId:   importHistory.id,
      categoryId:        resolvedCategoryId,
      branchId:          branchId ?? null,
      strictMode,
      userId:            req.user!.id,
      duplicates,
      overwriteIndices:  new Set(overwriteIndices),
      resolvedEmployees,
      rowBranchOverrides:   new Map(Object.entries(rowBranchOverrides).map(([k, v]) => [Number(k), v])),
      rowCategoryOverrides: new Map(Object.entries(rowCategoryOverrides).map(([k, v]) => [Number(k), v])),
    });

    result.categoriesCreated = categoriesCreated;
    result.employeesCreated  = employeesCreated;
    result.employeesUpdated  = employeesUpdated;

    // Write all entity-level counters to ImportHistory in one update
    await prisma.importHistory.update({
      where: { id: importHistory.id },
      data: {
        assetsCreated:      result.importedRows,
        assetsUpdated:      result.overwrittenRows,
        assetsDuplicate:    result.duplicatesSkipped,
        employeesCreated,
        employeesUpdated,
        assignmentsCreated: result.assignmentsCreated,
        categoriesCreated,
        // keep legacy fields in sync
        importedRows:       result.importedRows,
        overwrittenRows:    result.overwrittenRows,
        duplicatesSkipped:  result.duplicatesSkipped,
        failedRows:         result.failedRows,
        skippedRows:        result.skippedRows,
      },
    });

    res.json({ importId: importHistory.id, ...result });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/import/history
// ─────────────────────────────────────────────────────────────────────────────
router.get("/history", requirePermission("import_inventory"), async (req: AuthRequest, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? "20"), 10));
  const skip  = (page - 1) * limit;

  const [records, total] = await Promise.all([
    prisma.importHistory.findMany({
      orderBy: { createdAt: "desc" },
      skip, take: limit,
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.importHistory.count(),
  ]);

  res.json({ records, total, page, limit });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/import/history/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/history/:id", requirePermission("import_inventory"), async (req: AuthRequest, res: Response) => {
  const record = await prisma.importHistory.findUnique({
    where: { id: req.params.id },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      rows: { orderBy: { rowIndex: "asc" }, take: 500 },
    },
  });
  if (!record) { res.status(404).json({ error: "Import not found" }); return; }
  res.json(record);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/import/history/:id/failed
// ─────────────────────────────────────────────────────────────────────────────
router.get("/history/:id/failed", requirePermission("import_inventory"), async (req: AuthRequest, res: Response) => {
  const rows = await prisma.importRow.findMany({
    where: { importId: req.params.id, outcome: { in: ["failed", "skipped"] } },
    orderBy: { rowIndex: "asc" },
  });
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/import/presets
// ─────────────────────────────────────────────────────────────────────────────
router.get("/presets", requirePermission("import_inventory"), async (req: AuthRequest, res: Response) => {
  const presets = await prisma.columnMappingPreset.findMany({
    where: { OR: [{ createdById: req.user!.id }, { isShared: true }] },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(presets);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import/presets
// ─────────────────────────────────────────────────────────────────────────────
router.post("/presets", requirePermission("import_inventory"), async (req: AuthRequest, res: Response) => {
  const { name, categoryHint, mappings, isShared = false } = req.body as {
    name?: string; categoryHint?: string; mappings?: Record<string, string>; isShared?: boolean;
  };
  if (!name?.trim()) { res.status(400).json({ error: "Preset name is required." }); return; }
  if (!mappings || typeof mappings !== "object") { res.status(400).json({ error: "Mappings are required." }); return; }

  const preset = await prisma.columnMappingPreset.create({
    data: { name: name.trim(), categoryHint: categoryHint ?? null, mappings, isShared, createdById: req.user!.id },
  });
  res.status(201).json(preset);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/import/presets/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/presets/:id", requirePermission("import_inventory"), async (req: AuthRequest, res: Response) => {
  const preset = await prisma.columnMappingPreset.findUnique({ where: { id: req.params.id } });
  if (!preset) { res.status(404).json({ error: "Preset not found" }); return; }
  if (preset.createdById !== req.user!.id) {
    res.status(403).json({ error: "You can only delete your own presets." }); return;
  }
  await prisma.columnMappingPreset.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/import/template/:category
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_TEMPLATES: Record<string, string[]> = {
  "Computers":       ["Asset Tag Number", "Computer Name", "Brand", "Model", "Serial Number", "MAC Address", "Operating System", "RAM", "Storage", "Device Type", "Condition", "Assigned User", "Branch", "Warranty Expiry", "Notes"],
  "Laptops":         ["Asset Tag Number", "Computer Name", "Brand", "Model", "Serial Number", "MAC Address", "Operating System", "RAM", "Storage", "Condition", "Assigned User", "Branch", "Warranty Expiry", "Notes"],
  "Desktops":        ["Asset Tag Number", "Computer Name", "Brand", "Model", "Serial Number", "MAC Address", "Operating System", "RAM", "Storage", "Condition", "Assigned User", "Branch", "Warranty Expiry", "Notes"],
  "Company Phones":  ["IMEI Number", "Brand", "Model", "Serial Number", "Property Tag", "SIM Info", "Condition", "Assigned User", "Branch", "Notes"],
  "Email Accounts":  ["Email Address", "Assigned User", "Storage", "Branch", "Notes"],
  "Monitors":        ["Asset Tag Number", "Brand", "Model", "Serial Number", "Condition", "Assigned User", "Branch", "Warranty Expiry", "Notes"],
  "Printers":        ["Asset Tag Number", "Brand", "Model", "Serial Number", "Condition", "Assigned User", "Branch", "Warranty Expiry", "Notes"],
  "Network Devices": ["Asset Tag Number", "Brand", "Model", "Serial Number", "MAC Address", "Condition", "Branch", "Notes"],
  "Peripherals":     ["Asset Name", "Brand", "Model", "Serial Number", "Condition", "Assigned User", "Branch", "Notes"],
  "Accessories":     ["Asset Name", "Brand", "Model", "Serial Number", "Condition", "Assigned User", "Branch", "Notes"],
};

router.get("/template/:category", requirePermission("import_inventory"), (req: AuthRequest, res: Response) => {
  const cat = decodeURIComponent(req.params.category);
  const headers = CATEGORY_TEMPLATES[cat] ?? CATEGORY_TEMPLATES["Peripherals"];
  const csv = headers.join(",") + "\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${cat.replace(/\s+/g, "_")}_template.csv"`);
  res.send(csv);
});

export default router;
