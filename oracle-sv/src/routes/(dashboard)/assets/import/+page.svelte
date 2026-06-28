<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';

  const can = (k: string) => authStore.hasPermission(k);

  // ── Types ──────────────────────────────────────────────────────────────────
  interface FieldMapping {
    fileColumn: string;
    systemField: string;
    isMetadata: boolean;
    metadataKey?: string;
    matchMethod?: 'alias' | 'fuzzy' | 'content';
    confidence?: number;
  }

  interface ValidationIssue {
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }

  interface DuplicateInfo {
    isDuplicate: boolean;
    conflictKey?: string;
    existingAssetId?: string;
    existingAssetName?: string;
  }

  interface BranchResolved {
    id: string;
    name: string;
    confidence: number;
  }

  interface PreviewRow {
    rowIndex: number;
    rawData: Record<string, unknown>;
    mappedData: Record<string, unknown>;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    isValid: boolean;
    hasWarnings: boolean;
    duplicateInfo?: DuplicateInfo;
    employeeWillBeCreated?: boolean;
    rowBranchResolved?: BranchResolved;   // fuzzy-matched branch for this row
    rowCategoryNew?: string;              // category that will be auto-created
    // client-side state
    _skip?: boolean;
    _overwrite?: boolean;
    _branchOverride?: string;
    _editedEmpName?: string;
    _editedEmpEmail?: string;
    _sourceSheet?: string;    // OPC: source sheet name for preview filtering
  }

  interface ParseResponse {
    mode?: 'opc-multi-schema';
    fileName: string;
    fileSize: number;
    activeSheet?: string;
    category?: string;
    branchId?: string | null;
    branchName?: string | null;
    confidence?: number;
    signals?: string[];
    mappings?: FieldMapping[];
    unmapped?: string[];
    columnConfidences?: Record<string, number>;
    autoConfidence?: number;
    requiresManualMapping?: boolean;
    contentSignals?: string[];
    zohoEnabled?: boolean;
    rows: PreviewRow[];
    summary?: {
      totalRows: number; validRows: number;
      invalidRows: number; warningRows: number; duplicateRows: number;
    };
    isMatrix?: boolean;
    branchColumns?: string[];
    wasUnpivoted?: boolean;
    mappingErrors?: string[];
    suggestAutoAssetTag?: boolean;
    sheets?: OpcSheet[];
    opcSummary?: {
      totalAssets: number; byCategory: Record<string, number>;
      byBranch: Record<string, number>; duplicateCount: number;
    };
  }

  interface OpcSheet {
    name: string; type: string; skip: boolean; skipReason?: string | null;
    branchName: string | null; branchId: string | null;
    employeeRowCount?: number; assetCount?: number;
    categoryBreakdown?: Record<string, number>;
  }

  interface Branch { id: string; name: string; }
  interface Category { id: string; name: string; }

  type Step = 'upload' | 'mapping' | 'preview' | 'confirm' | 'result';

  // ── State ──────────────────────────────────────────────────────────────────
  let step = $state<Step>('upload');
  let isDragOver = $state(false);
  let uploading = $state(false);
  let executing = $state(false);
  let uploadErr = $state('');
  let executeErr = $state('');

  let file = $state<File | null>(null);
  let parseResult = $state<ParseResponse | null>(null);
  let rows = $state<PreviewRow[]>([]);
  let mappings = $state<FieldMapping[]>([]);
  let unmapped = $state<string[]>([]);

  // Import mode
  let importMode = $state<'single' | 'opc-multi-schema'>('single');
  let opcSheets  = $state<OpcSheet[]>([]);

  // Matrix / cross-tab detection
  let isMatrix       = $state(false);
  let branchColumns  = $state<string[]>([]);
  let unpivotBranches = $state(false);
  let mappingErrors  = $state<string[]>([]);

  // Auto-confidence
  let autoConfidence = $state(0);
  let requiresManualMapping = $state(false);
  let contentSignals = $state<string[]>([]);
  let zohoEnabled    = $state(false);

  // Execute-time options
  let autoGenerateAssetTag = $state(false);
  let autoTagHint = $state('');
  let autoCreateEmployees = $state(true);
  let ingestUnmappedAsMetadata = $state(true);
  let useZohoDirectory = $state(true);

  // Guard: prevents infinite auto-reparse loop when matrix is detected
  let autoReparsedForMatrix = false;

  let selectedCategory = $state('');
  let selectedBranchId = $state('');
  let strictMode = $state(false);

  let branches = $state<Branch[]>([]);
  let categories = $state<Category[]>([]);
  let presets = $state<{ id: string; name: string; mappings: Record<string, string>; categoryHint?: string }[]>([]);

  let importResult = $state<{
    importId: string; importedRows: number; skippedRows: number; failedRows: number;
    duplicatesSkipped: number; overwrittenRows: number; categoriesCreated: number; employeesCreated: number;
  } | null>(null);

  let previewFilter = $state<'all' | 'errors' | 'duplicates' | 'warnings'>('all');
  let activeSheetFilter = $state<string | null>(null);

  onMount(async () => {
    if (!can('import_inventory')) { goto('/assets'); return; }
    const token = authStore.token;
    const headers = { Authorization: `Bearer ${token}` };
    const [b, c, p] = await Promise.all([
      fetch('/api/branches', { headers }).then(r => r.ok ? r.json() : []),
      fetch('/api/categories', { headers }).then(r => r.ok ? r.json() : []),
      fetch('/api/import/presets', { headers }).then(r => r.ok ? r.json() : []),
    ]);
    branches = b;
    categories = c;
    presets = p;
  });

  // ── Derived summary ────────────────────────────────────────────────────────
  const visibleRows = $derived((() => {
    let base = activeSheetFilter
      ? rows.filter(r => r._sourceSheet === activeSheetFilter)
      : rows;
    if (previewFilter === 'errors')     return base.filter(r => r.errors.length > 0);
    if (previewFilter === 'duplicates') return base.filter(r => r.duplicateInfo?.isDuplicate);
    if (previewFilter === 'warnings')   return base.filter(r => r.warnings.length > 0);
    return base;
  })());

  const activeRows    = $derived(rows.filter(r => !r._skip));
  const validCount    = $derived(activeRows.filter(r => r.isValid).length);
  const dupCount      = $derived(rows.filter(r => r.duplicateInfo?.isDuplicate && !r._overwrite).length);
  const overwriteCount = $derived(rows.filter(r => r._overwrite).length);
  const errorCount    = $derived(rows.filter(r => r.errors.length > 0).length);
  const skippedCount  = $derived(rows.filter(r => r._skip).length);

  // ── Confirm step derived ────────────────────────────────────────────────────
  // Branch breakdown: aggregate per-row branch assignments for the confirm card
  const confirmBranchBreakdown = $derived((() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const r of activeRows) {
      const bid = r._branchOverride ?? r.rowBranchResolved?.id ?? null;
      if (!bid) continue;
      const bname = branches.find(b => b.id === bid)?.name ?? bid;
      const cur = map.get(bid) ?? { name: bname, count: 0 };
      map.set(bid, { name: bname, count: cur.count + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })());

  // New categories that will be auto-created
  const confirmNewCategories = $derived(
    [...new Set(activeRows.map(r => r.rowCategoryNew).filter((v): v is string => !!v))]
  );

  // New employee records that will be created
  const confirmNewStaff = $derived(
    activeRows.filter(r => r.employeeWillBeCreated && autoCreateEmployees).length
  );

  // ── Upload handlers ────────────────────────────────────────────────────────
  function onDragOver(e: DragEvent) { e.preventDefault(); isDragOver = true; }
  function onDragLeave() { isDragOver = false; }
  function onDrop(e: DragEvent) {
    e.preventDefault(); isDragOver = false;
    const f = e.dataTransfer?.files[0];
    if (f) handleFile(f);
  }
  function onFileInput(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) handleFile(f);
  }
  function handleFile(f: File) {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      uploadErr = 'Unsupported file type. Use .xlsx, .xls, or .csv'; return;
    }
    if (f.size > 10 * 1024 * 1024) { uploadErr = 'File exceeds 10 MB limit.'; return; }
    uploadErr = '';
    file = f;
  }

  async function parseFile() {
    if (!file) return;
    uploading = true; uploadErr = '';
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('unpivotBranches', String(unpivotBranches));
      formData.append('ingestUnmappedAsMetadata', String(ingestUnmappedAsMetadata));
      formData.append('useZohoDirectory', String(useZohoDirectory));

      const res = await fetch('/api/import/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { uploadErr = data.error ?? 'Parse failed'; return; }
      parseResult = data as ParseResponse;

      // Auto-set _branchOverride from rowBranchResolved (fuzzy-resolved rows)
      // _sourceSheet pulled from rawData._source (set by OPC extractors)
      rows = data.rows.map((r: PreviewRow) => ({
        ...r,
        _skip: false,
        _overwrite: false,
        _branchOverride: r.rowBranchResolved?.id,
        _sourceSheet: (r.rawData as Record<string, unknown>)?._source as string | undefined,
      }));
      activeSheetFilter = null;

      if (data.mode === 'opc-multi-schema') {
        importMode = 'opc-multi-schema';
        opcSheets  = data.sheets ?? [];
        zohoEnabled = data.zohoEnabled ?? false;
        step = 'preview';
      } else {
        importMode = 'single';
        mappings = data.mappings ?? [];
        unmapped = data.unmapped ?? [];
        selectedCategory = data.category ?? '';
        selectedBranchId = data.branchId ?? '';
        isMatrix      = data.isMatrix ?? false;
        branchColumns = data.branchColumns ?? [];
        mappingErrors = data.mappingErrors ?? [];
        autoConfidence = data.autoConfidence ?? 0;
        requiresManualMapping = data.requiresManualMapping ?? false;
        contentSignals = data.contentSignals ?? [];
        zohoEnabled    = data.zohoEnabled ?? false;

        if (data.suggestAutoAssetTag) {
          autoGenerateAssetTag = true;
          autoTagHint = 'Enabled because this file has no unique identifiers. You can turn this off.';
        } else {
          autoTagHint = '';
        }

        if (data.isMatrix && !data.wasUnpivoted && !autoReparsedForMatrix) {
          autoReparsedForMatrix = true;
          unpivotBranches = true;
          await parseFile();
          return;
        }

        step = 'mapping';
      }
    } catch (e) {
      uploadErr = (e as Error).message;
    } finally {
      uploading = false;
    }
  }

  function applyPreset(presetId: string) {
    const p = presets.find(x => x.id === presetId);
    if (!p) return;
    if (p.categoryHint) selectedCategory = p.categoryHint;
    const newMappings: FieldMapping[] = [];
    const newUnmapped: string[] = [];
    for (const col of parseResult?.mappings?.map(m => m.fileColumn) ?? []) {
      const target = (p.mappings as Record<string, string>)[col];
      if (!target) { newUnmapped.push(col); continue; }
      if (target.startsWith('metadata.')) {
        newMappings.push({ fileColumn: col, systemField: 'metadata', isMetadata: true, metadataKey: target.slice(9) });
      } else {
        newMappings.push({ fileColumn: col, systemField: target, isMetadata: false });
      }
    }
    mappings = newMappings;
    unmapped = newUnmapped;
  }

  function removeRow(idx: number) {
    rows = rows.map(r => r.rowIndex === idx ? { ...r, _skip: true } : r);
  }

  function toggleOverwrite(idx: number) {
    rows = rows.map(r => r.rowIndex === idx ? { ...r, _overwrite: !r._overwrite } : r);
  }

  function remapRowBranch(idx: number, branchId: string) {
    rows = rows.map(r => r.rowIndex === idx ? { ...r, _branchOverride: branchId || undefined } : r);
  }

  function updateEmpName(idx: number, name: string) {
    rows = rows.map(r => r.rowIndex === idx ? { ...r, _editedEmpName: name } : r);
  }

  function updateEmpEmail(idx: number, email: string) {
    rows = rows.map(r => r.rowIndex === idx ? { ...r, _editedEmpEmail: email } : r);
  }

  const hasBranchWarning = (row: PreviewRow) => row.warnings.some(w => w.field === 'branch');

  async function executeImport() {
    executing = true; executeErr = '';

    // Apply inline employee edits to mappedData before sending
    const activeR = rows.filter(r => !r._skip).map(r => {
      if (r._editedEmpName !== undefined || r._editedEmpEmail !== undefined) {
        const meta = { ...((r.mappedData.metadata as Record<string, unknown>) ?? {}) };
        if (r._editedEmpEmail !== undefined) meta.email = r._editedEmpEmail;
        return {
          ...r,
          mappedData: {
            ...r.mappedData,
            ...(r._editedEmpName !== undefined ? { employeeRef: r._editedEmpName } : {}),
            metadata: meta,
          },
        };
      }
      return r;
    });

    const overwriteIndices = activeR.filter(r => r._overwrite).map(r => r.rowIndex);
    const editedCount = activeR.filter(r => (r as any).wasEdited || r._editedEmpName !== undefined || r._editedEmpEmail !== undefined).length;

    let categoryId: string | null = null;
    let categoryName: string | null = null;
    if (importMode === 'single') {
      const existingCat = categories.find(c => c.name.toLowerCase() === selectedCategory.toLowerCase());
      if (existingCat) { categoryId = existingCat.id; categoryName = existingCat.name; }
      else { categoryName = selectedCategory || null; }
    }

    const rowCategoryOverrides: Record<number, string> = {};
    const rowBranchOverridesMap: Record<number, string> = {};

    if (importMode === 'opc-multi-schema') {
      for (const r of activeR) {
        const hint = r.mappedData.categoryHint as string | undefined;
        const branchName = r.mappedData.branchName as string | undefined;
        if (hint) {
          const cat = categories.find(c => c.name.toLowerCase() === hint.toLowerCase());
          if (cat) rowCategoryOverrides[r.rowIndex] = cat.id;
        }
        const branchOverride = r._branchOverride ??
          (branchName ? branches.find(b => b.name.toLowerCase() === branchName.toLowerCase())?.id : undefined);
        if (branchOverride) rowBranchOverridesMap[r.rowIndex] = branchOverride;
      }
    }

    try {
      const res = await fetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
        body: JSON.stringify({
          fileName: parseResult?.fileName,
          fileSize: parseResult?.fileSize,
          categoryId,
          categoryName,
          branchId: importMode === 'single' ? (selectedBranchId || null) : null,
          strictMode,
          rows: activeR,
          overwriteIndices,
          rowBranchOverrides: importMode === 'opc-multi-schema'
            ? rowBranchOverridesMap
            : Object.fromEntries(activeR.filter(r => r._branchOverride).map(r => [r.rowIndex, r._branchOverride])),
          rowCategoryOverrides,
          mappingUsed: importMode === 'single' ? mappings : null,
          editedCount,
          autoGenerateAssetTag,
          autoCreateEmployees,
          useZohoDirectory,
        }),
      });
      const data = await res.json();
      if (!res.ok) { executeErr = data.error ?? 'Import failed'; return; }
      importResult = data;
      step = 'result';
    } catch (e) {
      executeErr = (e as Error).message;
    } finally {
      executing = false;
    }
  }

  function reset() {
    step = 'upload'; file = null; parseResult = null; rows = [];
    mappings = []; unmapped = []; importResult = null;
    selectedCategory = ''; selectedBranchId = ''; strictMode = false;
    uploadErr = ''; executeErr = '';
    importMode = 'single'; opcSheets = [];
    isMatrix = false; branchColumns = []; unpivotBranches = false; mappingErrors = [];
    autoGenerateAssetTag = false; autoTagHint = ''; autoReparsedForMatrix = false;
    autoCreateEmployees = true; ingestUnmappedAsMetadata = true; useZohoDirectory = true;
    autoConfidence = 0; requiresManualMapping = false; contentSignals = []; zohoEnabled = false;
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  async function downloadTemplate() {
    const cat = selectedCategory || 'Peripherals';
    const res = await fetch(`/api/import/template/${encodeURIComponent(cat)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${cat.replace(/\s+/g, '_')}_template.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const SYSTEM_FIELD_LABELS: Record<string, string> = {
    name: 'Asset Name', serialNumber: 'Serial Number', assetTag: 'Asset Tag',
    propertyTag: 'Property Tag', warrantyExpiry: 'Warranty Expiry',
    condition: 'Condition', ownership: 'Ownership', branchName: 'Branch',
    employeeRef: 'Assigned Employee', employeeId: 'Employee ID', description: 'Notes',
    categoryHint: 'Category',
  };

  const METHOD_LABELS: Record<string, string> = {
    alias: 'Exact', fuzzy: 'Fuzzy', content: 'Inferred',
  };
</script>

{#if !can('import_inventory')}
  <div class="no-access">You do not have permission to import inventory.</div>
{:else}

<div class="page-wrap">

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/assets')}>Assets</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Import Assets</span>
  </nav>

  <div class="page-head">
    <div>
      <h1 class="page-title">Import Assets</h1>
      <p class="page-sub">Upload Excel or CSV files to bulk-import inventory records</p>
    </div>
    <button class="btn-ghost-sm" onclick={() => goto('/assets/import/history')}>View history</button>
  </div>

  <div class="step-bar">
    {#each (['upload','mapping','preview','confirm','result'] as const) as s, i}
      <div class="step-item" class:active={step === s} class:done={['upload','mapping','preview','confirm','result'].indexOf(step) > i}>
        <span class="step-num">{i + 1}</span>
        <span class="step-label">{['Upload','Mapping','Preview','Confirm','Result'][i]}</span>
      </div>
      {#if i < 4}<div class="step-connector"></div>{/if}
    {/each}
  </div>

  <!-- ── STEP 1: Upload ───────────────────────────────────────────────────── -->
  {#if step === 'upload'}
  <div class="step-body">
    <div
      class="drop-zone"
      class:drag-over={isDragOver}
      class:has-file={!!file}
      ondragover={onDragOver}
      ondragleave={onDragLeave}
      ondrop={onDrop}
      role="button"
      tabindex="0"
      aria-label="Drop file here or click to browse"
    >
      {#if file}
        <div class="file-info">
          <div class="file-icon-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="8" y1="17" x2="12" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <span class="file-name">{file.name}</span>
          <span class="file-size">{formatSize(file.size)}</span>
          <button class="remove-file" onclick={() => { file = null; uploadErr = ''; }} aria-label="Remove file">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      {:else}
        <svg class="drop-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 15V16C3 18.2091 4.79086 20 7 20H17C19.2091 20 21 18.2091 21 16V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <p class="drop-text">Drop your file here, or <label class="browse-link">browse<input type="file" accept=".xlsx,.xls,.csv" onchange={onFileInput} class="hidden-input" /></label></p>
        <p class="drop-hint">.xlsx · .xls · .csv &nbsp;·&nbsp; max 10 MB · 2,000 rows</p>
      {/if}
    </div>

    {#if uploadErr}<p class="err-msg">{uploadErr}</p>{/if}

    <div class="upload-actions">
      <div class="template-row">
        <span class="template-label">Need a template?</span>
        <select class="select-sm" bind:value={selectedCategory}>
          <option value="">Select category</option>
          {#each ['Computers','Laptops','Desktops','Company Phones','Email Accounts','Monitors','Printers','Network Devices','Peripherals','Accessories'] as cat}
            <option value={cat}>{cat}</option>
          {/each}
        </select>
        <button class="btn-ghost-sm" onclick={downloadTemplate}>Download template</button>
      </div>

      {#if presets.length > 0}
        <div class="preset-row">
          <span class="template-label">Apply preset:</span>
          <select class="select-sm" onchange={(e) => applyPreset((e.target as HTMLSelectElement).value)}>
            <option value="">Choose preset</option>
            {#each presets as p}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </div>
      {/if}

      <button class="btn-primary" onclick={parseFile} disabled={!file || uploading}>
        {uploading ? 'Parsing…' : 'Parse file →'}
      </button>
    </div>
  </div>

  <!-- ── STEP 2: Mapping ──────────────────────────────────────────────────── -->
  {:else if step === 'mapping'}
  <div class="step-body">

    {#if mappingErrors.length > 0}
      <div class="map-err-callout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div>
          <div class="map-err-title">Cannot proceed — mapping incomplete</div>
          {#each mappingErrors as e}<div class="map-err-msg">{e}</div>{/each}
        </div>
      </div>
    {/if}

    <!-- Auto-confidence callout -->
    {#if autoConfidence > 0}
      <div class="conf-callout" class:conf-callout-warn={requiresManualMapping}>
        <div class="conf-callout-head">
          <span class="confidence-badge"
            class:conf-high={autoConfidence >= 90}
            class:conf-med={autoConfidence >= 60 && autoConfidence < 90}
            class:conf-low={autoConfidence < 60}
          >{autoConfidence}% auto-detected</span>
          {#if requiresManualMapping}
            <span class="conf-review-needed">Review required — verify mappings below</span>
          {:else}
            <span class="conf-ok">All required fields mapped</span>
          {/if}
        </div>
        {#if contentSignals.length > 0}
          <div class="conf-signals">
            {#each contentSignals as sig}
              <div class="signal-row">⬡ {sig}</div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if isMatrix}
      <div class="matrix-callout" class:matrix-resolved={parseResult?.wasUnpivoted}>
        <div class="matrix-callout-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          {#if parseResult?.wasUnpivoted}Cross-tab detected — Unpivot applied{:else}Cross-tab (matrix) layout detected{/if}
        </div>
        <p class="matrix-callout-sub">
          {#if parseResult?.wasUnpivoted}
            Columns <strong>{branchColumns.join(', ')}</strong> were unpivoted into one row per item per branch.
          {:else}
            Columns <strong>{branchColumns.join(', ')}</strong> are branch names used as quantity pivots.
          {/if}
        </p>
        <div class="matrix-actions">
          <label class="toggle-label">
            <label class="toggle">
              <input type="checkbox" bind:checked={unpivotBranches} />
              <span class="toggle-track"></span>
            </label>
            Unpivot branch columns
          </label>
          <button class="btn-ghost-sm" onclick={parseFile} disabled={uploading}>
            {uploading ? 'Re-parsing…' : 'Apply & Re-parse'}
          </button>
        </div>
        {#if parseResult?.wasUnpivoted}
          <div class="matrix-ok">✓ {rows.length} rows generated (zero-quantity rows dropped)</div>
        {/if}
      </div>
    {/if}

    <div class="mapping-grid">
      <div class="detect-card">
        <div class="detect-header">
          <span class="detect-title">Auto-detection</span>
          <span class="confidence-badge"
            class:conf-high={parseResult && (parseResult.confidence ?? 0) >= 70}
            class:conf-med={(parseResult?.confidence ?? 0) >= 40 && (parseResult?.confidence ?? 0) < 70}
            class:conf-low={(parseResult?.confidence ?? 0) < 40}
          >{parseResult?.confidence ?? 0}% confidence</span>
        </div>
        {#each parseResult?.signals ?? [] as signal}
          <div class="signal-row">✓ {signal}</div>
        {/each}
      </div>

      <div class="mapping-fields">
        {#if can('force_import')}
          <div class="field-row toggle-row">
            <label class="field-label">Transactional import</label>
            <label class="toggle">
              <input type="checkbox" bind:checked={strictMode} />
              <span class="toggle-track"></span>
            </label>
            <span class="toggle-hint">All rows succeed or none (max 200 rows)</span>
          </div>
        {/if}
        <div class="field-row toggle-row">
          <label class="field-label">Auto-generate asset tag</label>
          <label class="toggle">
            <input type="checkbox" bind:checked={autoGenerateAssetTag} />
            <span class="toggle-track"></span>
          </label>
          <span class="toggle-hint">Rows with no identifier get an AUTO-… tag</span>
        </div>
        {#if autoTagHint}
          <div class="autotag-hint">{autoTagHint}</div>
        {/if}
        <div class="field-row toggle-row">
          <label class="field-label">Use Zoho Directory</label>
          <label class="toggle">
            <input type="checkbox" bind:checked={useZohoDirectory} />
            <span class="toggle-track"></span>
          </label>
          <span class="toggle-hint">Enrich employee data (email, ID, dept) from Zoho before auto-creating</span>
        </div>
        {#if useZohoDirectory && !zohoEnabled}
          <div class="zoho-not-configured">Zoho credentials not configured on the server — enrichment will be skipped.</div>
        {/if}
        <div class="field-row toggle-row">
          <label class="field-label">Auto-create missing employees</label>
          <label class="toggle">
            <input type="checkbox" bind:checked={autoCreateEmployees} />
            <span class="toggle-track"></span>
          </label>
          <span class="toggle-hint">Employees not found are created as Employee records (no login)</span>
        </div>
        <div class="field-row toggle-row">
          <label class="field-label">Import unmapped columns as metadata</label>
          <label class="toggle">
            <input type="checkbox" bind:checked={ingestUnmappedAsMetadata} onchange={parseFile} />
            <span class="toggle-track"></span>
          </label>
          <span class="toggle-hint">Unrecognised columns stored under asset metadata with snake_case keys</span>
        </div>
      </div>
    </div>

    <div class="mapping-table-wrap">
      <h3 class="section-title">Column mappings</h3>
      <table class="mapping-table">
        <thead>
          <tr><th>File column</th><th>→ System field</th><th>Method</th><th>Status</th></tr>
        </thead>
        <tbody>
          {#each mappings as m}
            <tr>
              <td class="col-file">{m.fileColumn}</td>
              <td class="col-system">
                {#if m.isMetadata}
                  <span class="badge-meta">metadata.{m.metadataKey}</span>
                {:else}
                  {SYSTEM_FIELD_LABELS[m.systemField] ?? m.systemField}
                {/if}
              </td>
              <td>
                {#if m.matchMethod}
                  <span class="badge-method badge-method-{m.matchMethod}">{METHOD_LABELS[m.matchMethod]}</span>
                {/if}
              </td>
              <td><span class="badge-mapped">Mapped</span></td>
            </tr>
          {/each}
          {#each unmapped as col}
            <tr class="row-unmapped">
              <td class="col-file">{col}</td>
              <td class="col-system"><span class="badge-unmapped">Not mapped</span></td>
              <td></td>
              <td>
                {#if ingestUnmappedAsMetadata}
                  <span class="badge-meta-auto">→ metadata</span>
                {:else}
                  <span class="badge-skip">Will be ignored</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="step-footer">
      <button class="btn-ghost" onclick={() => step = 'upload'}>← Back</button>
      <button class="btn-primary" onclick={() => step = 'preview'} disabled={mappingErrors.length > 0}>
        Continue to preview →
      </button>
    </div>
  </div>

  <!-- ── STEP 3: Preview ──────────────────────────────────────────────────── -->
  {:else if step === 'preview'}
  <div class="step-body">

    {#if importMode === 'opc-multi-schema'}
      <div class="opc-banner">
        <div class="opc-banner-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><path d="M13 21l2-2 4 4"/><circle cx="17" cy="17" r="4"/></svg>
          Multi-Schema Workbook Detected
        </div>
        <p class="opc-banner-sub">Sheets were automatically classified and extracted. No column mapping required.</p>
        <div class="opc-sheet-grid">
          {#each opcSheets as sheet}
            <button
              class="opc-sheet-card"
              class:opc-sheet-skip={sheet.skip}
              class:opc-sheet-active={!sheet.skip && activeSheetFilter === sheet.name}
              onclick={() => { if (!sheet.skip) activeSheetFilter = activeSheetFilter === sheet.name ? null : sheet.name; }}
              title={sheet.skip ? '' : activeSheetFilter === sheet.name ? 'Click to clear filter' : 'Click to filter table'}
              type="button"
            >
              <div class="opc-sheet-name">{sheet.name}</div>
              {#if sheet.skip}
                <div class="opc-sheet-badge opc-badge-skip">{sheet.type === 'zoho' ? 'Email accounts' : 'Skipped'}</div>
                <div class="opc-sheet-reason">{sheet.skipReason}</div>
              {:else}
                <div class="opc-sheet-badge opc-badge-{sheet.type}">{sheet.type}</div>
                {#if sheet.branchName}<div class="opc-sheet-branch">{sheet.branchName}</div>{/if}
                <div class="opc-sheet-counts">
                  <span>{sheet.assetCount} assets</span><span class="opc-dot">·</span><span>{sheet.employeeRowCount} rows</span>
                </div>
                {#if sheet.categoryBreakdown}
                  <div class="opc-breakdown">
                    {#each Object.entries(sheet.categoryBreakdown) as [cat, count]}
                      <span class="opc-cat-chip">{cat}: {count}</span>
                    {/each}
                  </div>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
        <div class="opc-totals">
          <div class="opc-total-item">
            <span class="opc-total-num">{rows.length}</span>
            <span class="opc-total-label">Total assets extracted</span>
          </div>
          <div class="opc-total-item">
            <span class="opc-total-num opc-dup-num">{parseResult?.opcSummary?.duplicateCount ?? dupCount}</span>
            <span class="opc-total-label">Potential duplicates</span>
          </div>
        </div>
      </div>
    {/if}

    {#if zohoEnabled}
      <div class="zoho-active-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        Zoho Directory enrichment active — missing employee emails, IDs, and departments will be filled automatically.
      </div>
    {/if}

    <div class="preview-summary">
      <div class="summary-chip chip-valid">{validCount} valid</div>
      <div class="summary-chip chip-dup">{dupCount} duplicates</div>
      <div class="summary-chip chip-err">{errorCount} errors</div>
      <div class="summary-chip chip-skip">{skippedCount} skipped</div>
    </div>

    <div class="filter-row">
      <span class="filter-label">Show:</span>
      {#each ([['all','All'],['errors','Errors'],['duplicates','Duplicates'],['warnings','Warnings']] as const) as [val, label]}
        <button class="filter-btn" class:active={previewFilter === val} onclick={() => previewFilter = val}>{label}</button>
      {/each}
      {#if activeSheetFilter}
        <span class="sheet-filter-pill">
          Sheet: {activeSheetFilter}
          <button class="sheet-filter-clear" onclick={() => activeSheetFilter = null} title="Clear filter">×</button>
        </span>
      {/if}
    </div>

    <div class="table-scroll">
      <table class="preview-table">
        <thead>
          <tr>
            <th class="th-idx">#</th>
            <th>Status</th>
            <th>Name</th>
            <th>Asset Tag</th>
            <th>Serial</th>
            <th>Employee</th>
            <th>Issues / Badges</th>
            <th class="th-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleRows as row}
            <tr class:row-skip={row._skip} class:row-dup={row.duplicateInfo?.isDuplicate && !row._overwrite} class:row-err={row.errors.length > 0 && !row._skip}>
              <td class="td-idx">{row.rowIndex + 1}</td>
              <td>
                {#if row._skip}
                  <span class="badge-status badge-skip-row">Skipped</span>
                {:else if row.duplicateInfo?.isDuplicate && !row._overwrite}
                  <span class="badge-status badge-dup-row">Duplicate</span>
                {:else if row.errors.length > 0}
                  <span class="badge-status badge-err-row">Error</span>
                {:else if row.hasWarnings}
                  <span class="badge-status badge-warn-row">Warning</span>
                {:else}
                  <span class="badge-status badge-ok-row">Valid</span>
                {/if}
              </td>
              <td class="td-name">{String(row.mappedData.name ?? '—')}</td>
              <td>{String(row.mappedData.assetTag ?? '—')}</td>
              <td>{String(row.mappedData.serialNumber ?? '—')}</td>
              <td class="td-emp">
                <!-- Employee with inline edit for "will be created" rows -->
                {#if row.employeeWillBeCreated && autoCreateEmployees && !row._skip}
                  <div class="emp-new-wrap">
                    <span class="badge-new-emp">New</span>
                    {#if zohoEnabled}
                      <span class="badge-zoho" title="Zoho will try to enrich this employee">[zoho]</span>
                    {:else}
                      <span class="badge-excel" title="Data from Excel only">[excel]</span>
                    {/if}
                    <div class="emp-edit-fields">
                      <input
                        class="emp-edit-input"
                        value={row._editedEmpName ?? String(row.mappedData.employeeRef ?? '')}
                        onchange={(e) => updateEmpName(row.rowIndex, (e.target as HTMLInputElement).value)}
                        placeholder="Employee name"
                        aria-label="Employee name"
                      />
                      <input
                        class="emp-edit-input"
                        value={row._editedEmpEmail ?? String((row.mappedData.metadata as any)?.email ?? '')}
                        onchange={(e) => updateEmpEmail(row.rowIndex, (e.target as HTMLInputElement).value)}
                        placeholder="Email (optional)"
                        aria-label="Employee email"
                      />
                    </div>
                  </div>
                {:else}
                  <span class="emp-ref">{String(row.mappedData.employeeRef ?? '—')}</span>
                  {#if row.mappedData.employeeRef && !row.employeeWillBeCreated}
                    <span class="badge-excel" title="Resolved from Excel data">[excel]</span>
                  {/if}
                {/if}
              </td>
              <td class="td-issues">
                {#each row.errors as e}
                  <div class="issue-err">✗ {e.message}</div>
                {/each}
                {#each row.warnings as w}
                  {#if w.field !== 'branch' || !row.rowBranchResolved}
                    <div class="issue-warn">⚠ {w.message}</div>
                  {/if}
                {/each}
                {#if row.duplicateInfo?.isDuplicate}
                  <div class="issue-dup">Duplicate: {row.duplicateInfo.conflictKey} matches "{row.duplicateInfo.existingAssetName}"</div>
                {/if}
                <!-- Branch resolved badge (fuzzy match) -->
                {#if row.rowBranchResolved}
                  <div class="badge-row-info badge-branch-resolved">
                    Branch → {row.rowBranchResolved.name}
                    <span class="conf-pct">({Math.round(row.rowBranchResolved.confidence * 100)}%)</span>
                  </div>
                {/if}
                <!-- New category badge -->
                {#if row.rowCategoryNew && !row._skip}
                  <div class="badge-row-info badge-cat-new">New category: {row.rowCategoryNew}</div>
                {/if}
                <!-- No unique identifier warning (from validator) -->
                {#each row.warnings.filter(w => w.field === 'identifier') as w}
                  <div class="issue-warn">⚠ {w.message}</div>
                {/each}
              </td>
              <td class="td-actions">
                <div class="td-actions-wrap">
                  {#if !row._skip}
                    {#if hasBranchWarning(row) && !row.rowBranchResolved}
                      <select
                        class="branch-remap-select"
                        value={row._branchOverride ?? ''}
                        onchange={(e) => remapRowBranch(row.rowIndex, (e.target as HTMLSelectElement).value)}
                      >
                        <option value="">Remap branch…</option>
                        {#each branches as b}
                          <option value={b.id}>{b.name}</option>
                        {/each}
                      </select>
                    {/if}
                    {#if row.duplicateInfo?.isDuplicate && can('force_import')}
                      <button class="act-btn act-overwrite" onclick={() => toggleOverwrite(row.rowIndex)}>
                        {row._overwrite ? 'Undo overwrite' : 'Overwrite'}
                      </button>
                    {/if}
                    <button class="act-btn act-skip" onclick={() => removeRow(row.rowIndex)}>Skip</button>
                  {:else}
                    <button class="act-btn" onclick={() => rows = rows.map(r => r.rowIndex === row.rowIndex ? { ...r, _skip: false } : r)}>Restore</button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="step-footer">
      <button class="btn-ghost" onclick={() => step = importMode === 'opc-multi-schema' ? 'upload' : 'mapping'}>← Back</button>
      <button class="btn-primary" onclick={() => step = 'confirm'} disabled={validCount === 0}>Continue →</button>
    </div>
  </div>

  <!-- ── STEP 4: Confirm ──────────────────────────────────────────────────── -->
  {:else if step === 'confirm'}
  <div class="step-body confirm-body">
    <h2 class="confirm-title">Ready to import</h2>

    <div class="confirm-grid">
      <div class="confirm-row">
        <span class="confirm-label">File</span>
        <span class="confirm-val">{parseResult?.fileName}</span>
      </div>
      <div class="confirm-row">
        <span class="confirm-label">Category</span>
        <span class="confirm-val">{selectedCategory || '—'}</span>
      </div>
      {#if confirmNewCategories.length > 0}
        <div class="confirm-row">
          <span class="confirm-label">New Categories</span>
          <span class="confirm-val">
            {#each confirmNewCategories as cat, i}
              <span class="confirm-badge confirm-badge-cat">{cat}</span>{#if i < confirmNewCategories.length - 1}{' '}{/if}
            {/each}
          </span>
        </div>
      {/if}
      <div class="confirm-row">
        <span class="confirm-label">Branch</span>
        <span class="confirm-val">
          {#if confirmBranchBreakdown.length > 0}
            {confirmBranchBreakdown.length} branch{confirmBranchBreakdown.length !== 1 ? 'es' : ''}:
            {#each confirmBranchBreakdown as b, i}
              <span class="confirm-badge confirm-badge-branch">{b.name} ({b.count})</span>{#if i < confirmBranchBreakdown.length - 1}{' '}{/if}
            {/each}
          {:else}
            {branches.find(b => b.id === selectedBranchId)?.name ?? '— unassigned —'}
          {/if}
        </span>
      </div>
      {#if confirmNewStaff > 0}
        <div class="confirm-row">
          <span class="confirm-label">New Staff</span>
          <span class="confirm-val confirm-staff">{confirmNewStaff} employee record{confirmNewStaff !== 1 ? 's' : ''} will be created</span>
        </div>
      {/if}
      <div class="confirm-row">
        <span class="confirm-label">Mode</span>
        <span class="confirm-val">{strictMode ? 'Transactional (all or none)' : 'Partial (best-effort)'}</span>
      </div>
      {#if zohoEnabled}
        <div class="confirm-row">
          <span class="confirm-label">Zoho</span>
          <span class="confirm-val confirm-zoho">Directory enrichment enabled</span>
        </div>
      {/if}
    </div>

    <div class="confirm-summary">
      <div class="cs-item cs-good">
        <span class="cs-num">{validCount}</span>
        <span class="cs-label">rows will be imported</span>
      </div>
      <div class="cs-item cs-dup">
        <span class="cs-num">{dupCount}</span>
        <span class="cs-label">duplicates will be skipped</span>
      </div>
      {#if overwriteCount > 0}
        <div class="cs-item cs-overwrite">
          <span class="cs-num">{overwriteCount}</span>
          <span class="cs-label">records will be overwritten</span>
        </div>
      {/if}
      <div class="cs-item cs-skip">
        <span class="cs-num">{skippedCount}</span>
        <span class="cs-label">rows skipped by you</span>
      </div>
      <div class="cs-item cs-err">
        <span class="cs-num">{errorCount}</span>
        <span class="cs-label">rows have errors (will be skipped)</span>
      </div>
    </div>

    {#if executeErr}<p class="err-msg">{executeErr}</p>{/if}

    <div class="step-footer">
      <button class="btn-ghost" onclick={() => step = 'preview'} disabled={executing}>← Back</button>
      <button class="btn-primary" onclick={executeImport} disabled={executing || validCount === 0}>
        {executing ? 'Importing…' : 'Confirm import'}
      </button>
    </div>
  </div>

  <!-- ── STEP 5: Result ───────────────────────────────────────────────────── -->
  {:else if step === 'result' && importResult}
  <div class="step-body result-body">
    <div class="result-icon">✓</div>
    <h2 class="result-title">Import complete</h2>

    <div class="result-grid">
      <div class="result-card rc-green">
        <span class="rc-num">{importResult.importedRows}</span>
        <span class="rc-label">Imported</span>
      </div>
      <div class="result-card rc-blue">
        <span class="rc-num">{importResult.overwrittenRows}</span>
        <span class="rc-label">Overwritten</span>
      </div>
      <div class="result-card rc-yellow">
        <span class="rc-num">{importResult.duplicatesSkipped}</span>
        <span class="rc-label">Duplicates skipped</span>
      </div>
      <div class="result-card rc-red">
        <span class="rc-num">{importResult.failedRows}</span>
        <span class="rc-label">Failed</span>
      </div>
    </div>

    {#if importResult.categoriesCreated > 0}
      <p class="result-note">✓ {importResult.categoriesCreated} new {importResult.categoriesCreated === 1 ? 'category' : 'categories'} created</p>
    {/if}
    {#if importResult.employeesCreated > 0}
      <p class="result-note">✓ {importResult.employeesCreated} new {importResult.employeesCreated === 1 ? 'employee' : 'employees'} created</p>
    {/if}

    <div class="result-actions">
      <button class="btn-ghost" onclick={() => goto(`/assets/import/history/${importResult!.importId}`)}>View import detail</button>
      <button class="btn-ghost" onclick={() => goto('/assets/import/history')}>View history</button>
      <button class="btn-primary" onclick={reset}>Import another file</button>
    </div>
  </div>
  {/if}
</div>
{/if}

<style>
  .no-access { padding: 48px; text-align: center; color: var(--mute); font-family: var(--font-sans); }

  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .page-wrap { display: flex; flex-direction: column; width: 100%; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
  .page-title { font-size: 22px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.4px; }
  .page-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); margin-top: 2px; }

  /* Step bar */
  .step-bar { display: flex; align-items: center; margin-bottom: 32px; }
  .step-item { display: flex; align-items: center; gap: 8px; }
  .step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--hairline); color: var(--mute); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; font-family: var(--font-sans); flex-shrink: 0; }
  .step-item.active .step-num { background: var(--ink); color: var(--on-primary, #fff); }
  .step-item.done .step-num { background: oklch(60% 0.18 145); color: #fff; }
  .step-label { font-size: 12px; font-weight: 500; color: var(--mute); font-family: var(--font-sans); white-space: nowrap; }
  .step-item.active .step-label { color: var(--ink); }
  .step-connector { flex: 1; height: 1px; background: var(--hairline); margin: 0 10px; min-width: 20px; }

  /* Step body */
  .step-body { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 28px; }

  /* Drop zone */
  .drop-zone {
    border: 1px dashed var(--hairline-strong); border-radius: var(--r-lg);
    padding: 40px 24px; text-align: center; cursor: pointer;
    transition: border-color 150ms, background 150ms; background: var(--canvas-soft);
  }
  .drop-zone.drag-over { border-color: var(--link); background: #f0f7ff; }
  .drop-zone.has-file { border-style: solid; border-color: var(--hairline-strong); background: var(--canvas); cursor: default; }
  .drop-icon { color: var(--mute); margin: 0 auto 10px; display: block; }
  .drop-text { font-size: 13px; color: var(--body); font-family: var(--font-sans); }
  .browse-link { color: var(--link); cursor: pointer; }
  .browse-link:hover { text-decoration: underline; }
  .hidden-input { display: none; }
  .drop-hint { font-size: 11.5px; color: var(--mute); margin-top: 5px; font-family: var(--font-sans); letter-spacing: 0.01em; }
  .file-info { display: flex; align-items: center; gap: 10px; justify-content: center; }
  .file-icon-wrap {
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    border-radius: var(--r-sm); background: var(--canvas-soft-2); border: 1px solid var(--hairline);
    color: var(--body); flex-shrink: 0;
  }
  .file-name { font-size: 13px; font-weight: 500; color: var(--ink); font-family: var(--font-sans); }
  .file-size { font-size: 12px; color: var(--mute); font-family: var(--font-sans); }
  .remove-file {
    background: none; border: none; cursor: pointer; color: var(--mute); padding: 4px;
    border-radius: 4px; display: flex; align-items: center; justify-content: center;
    transition: color 100ms, background 100ms; margin-left: 2px;
  }
  .remove-file:hover { color: var(--error); background: var(--error-soft); }

  /* Upload actions */
  .upload-actions { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
  .template-row, .preset-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .template-label { font-size: 13px; color: var(--mute); font-family: var(--font-sans); }

  /* Mapping errors callout */
  .map-err-callout { display: flex; gap: 10px; align-items: flex-start; background: var(--error-soft); border: 1px solid var(--error); border-radius: var(--r-md); padding: 12px 14px; margin-bottom: 16px; color: var(--error); }
  .map-err-callout svg { flex-shrink: 0; margin-top: 1px; }
  .map-err-title { font-size: 13px; font-weight: 600; font-family: var(--font-sans); }
  .map-err-msg { font-size: 12.5px; font-family: var(--font-sans); margin-top: 2px; }

  /* Auto-confidence callout */
  .conf-callout { background: oklch(97% 0.04 145); border: 1px solid oklch(80% 0.1 145); border-radius: var(--r-md); padding: 12px 16px; margin-bottom: 16px; }
  .conf-callout.conf-callout-warn { background: oklch(97% 0.04 55); border-color: oklch(80% 0.1 55); }
  .conf-callout-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .conf-ok { font-size: 12px; color: oklch(35% 0.15 145); font-family: var(--font-sans); }
  .conf-review-needed { font-size: 12px; color: oklch(40% 0.15 55); font-family: var(--font-sans); font-weight: 600; }
  .conf-signals { display: flex; flex-direction: column; gap: 2px; }
  .zoho-not-configured { font-size: 11.5px; color: oklch(45% 0.1 55); background: oklch(97% 0.04 55); border-radius: var(--r-sm); padding: 5px 10px; font-family: var(--font-sans); }

  /* Matrix callout */
  .matrix-callout { background: oklch(97% 0.04 55); border: 1px solid oklch(85% 0.1 55); border-radius: var(--r-md); padding: 14px 16px; margin-bottom: 16px; }
  .matrix-callout.matrix-resolved { background: oklch(97% 0.04 145); border-color: oklch(80% 0.1 145); }
  .matrix-callout-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: oklch(40% 0.12 55); font-family: var(--font-sans); margin-bottom: 4px; }
  .matrix-callout.matrix-resolved .matrix-callout-head { color: oklch(35% 0.15 145); }
  .matrix-callout-sub { font-size: 12.5px; color: oklch(45% 0.08 55); font-family: var(--font-sans); margin-bottom: 10px; }
  .matrix-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .toggle-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--body); font-family: var(--font-sans); cursor: pointer; }
  .matrix-ok { font-size: 12px; color: oklch(35% 0.15 145); font-family: var(--font-sans); margin-top: 8px; }

  /* Mapping */
  .mapping-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  @media (max-width: 640px) { .mapping-grid { grid-template-columns: 1fr; } }
  .detect-card { background: var(--canvas-soft); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px; }
  .detect-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .detect-title { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .confidence-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; font-family: var(--font-sans); }
  .conf-high { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .conf-med  { background: oklch(92% 0.1 80);  color: oklch(40% 0.15 80); }
  .conf-low  { background: var(--error-soft);   color: var(--error); }
  .signal-row { font-size: 12px; color: var(--body); font-family: var(--font-sans); padding: 3px 0; }
  .mapping-fields { display: flex; flex-direction: column; gap: 12px; }
  .field-row { display: flex; align-items: center; gap: 12px; }
  .field-label { font-size: 13px; color: var(--body); font-family: var(--font-sans); min-width: 180px; }
  .select-field { flex: 1; padding: 6px 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-family: var(--font-sans); font-size: 13px; }
  .toggle-row { align-items: center; gap: 10px; }
  .toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-track { position: absolute; inset: 0; background: var(--hairline); border-radius: 10px; cursor: pointer; transition: background 150ms; }
  .toggle input:checked + .toggle-track { background: var(--ink); }
  .toggle-track::before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: transform 150ms; }
  .toggle input:checked + .toggle-track::before { transform: translateX(16px); }
  .toggle-hint { font-size: 11px; color: var(--mute); font-family: var(--font-sans); }
  .autotag-hint { font-size: 11.5px; color: oklch(40% 0.15 264); background: oklch(95% 0.04 264); border-radius: var(--r-sm); padding: 6px 10px; font-family: var(--font-sans); }
  .section-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); margin-bottom: 12px; }
  .mapping-table-wrap { overflow-x: auto; }
  .mapping-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 13px; }
  .mapping-table th { text-align: left; padding: 8px 12px; background: var(--canvas-soft); border-bottom: 1px solid var(--hairline); color: var(--mute); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .mapping-table td { padding: 8px 12px; border-bottom: 1px solid var(--hairline); color: var(--body); vertical-align: middle; }
  .row-unmapped td { background: oklch(99% 0.01 80); }
  .col-file { font-weight: 500; color: var(--ink); }
  .badge-meta { font-size: 11px; background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); padding: 2px 7px; border-radius: 4px; font-family: monospace; }
  .badge-meta-auto { font-size: 11px; background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); padding: 2px 7px; border-radius: 4px; font-style: italic; }
  .badge-mapped { font-size: 11px; background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); padding: 2px 7px; border-radius: 4px; font-weight: 600; }
  .badge-unmapped { font-size: 11px; background: oklch(92% 0.04 80); color: oklch(45% 0.1 80); padding: 2px 7px; border-radius: 4px; font-weight: 600; }
  .badge-skip { font-size: 11px; color: var(--mute); }
  .badge-method { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-family: var(--font-sans); font-weight: 600; }
  .badge-method-alias   { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .badge-method-fuzzy   { background: oklch(92% 0.08 80); color: oklch(35% 0.15 80); }
  .badge-method-content { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); }

  /* OPC Multi-Schema Banner */
  .opc-banner { background: oklch(97% 0.04 264); border: 1px solid oklch(85% 0.08 264); border-radius: var(--r-lg); padding: 20px 24px; margin-bottom: 20px; }
  .opc-banner-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: oklch(35% 0.15 264); font-family: var(--font-sans); margin-bottom: 4px; }
  .opc-banner-sub { font-size: 12.5px; color: oklch(50% 0.1 264); font-family: var(--font-sans); margin-bottom: 16px; }
  .opc-sheet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .opc-sheet-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 12px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; text-align: left; transition: border-color 0.15s, box-shadow 0.15s; }
  .opc-sheet-card:not(.opc-sheet-skip):hover { border-color: var(--accent); }
  .opc-sheet-active { border-color: var(--accent) !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent); }
  .opc-sheet-skip { opacity: 0.55; background: var(--canvas-soft); cursor: default; }
  .opc-sheet-name { font-size: 12px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .opc-sheet-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px; width: fit-content; font-family: var(--font-sans); }
  .opc-badge-skip     { background: var(--canvas-soft-2); color: var(--mute); }
  .opc-badge-computer { background: oklch(90% 0.1 264); color: oklch(35% 0.15 264); }
  .opc-badge-phone    { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .opc-badge-zoho     { background: oklch(92% 0.06 80); color: oklch(40% 0.12 80); }
  .opc-badge-summary  { background: var(--canvas-soft-2); color: var(--mute); }
  .opc-badge-generic  { background: var(--canvas-soft-2); color: var(--mute); }
  .opc-sheet-branch { font-size: 11px; color: var(--mute); font-family: var(--font-sans); }
  .opc-sheet-reason { font-size: 11px; color: var(--mute); font-family: var(--font-sans); font-style: italic; }
  .opc-sheet-counts { font-size: 11px; color: var(--body); font-family: var(--font-sans); display: flex; align-items: center; gap: 4px; }
  .opc-dot { color: var(--hairline-strong); }
  .opc-breakdown { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .opc-cat-chip { font-size: 10px; padding: 1px 6px; background: var(--canvas-soft); border: 1px solid var(--hairline); border-radius: 999px; color: var(--body); font-family: var(--font-sans); }
  .opc-totals { display: flex; gap: 24px; padding-top: 12px; border-top: 1px solid oklch(85% 0.06 264); flex-wrap: wrap; }
  .opc-total-item { display: flex; flex-direction: column; }
  .opc-total-num { font-size: 24px; font-weight: 700; color: oklch(35% 0.15 264); font-family: var(--font-sans); line-height: 1; }
  .opc-dup-num { color: oklch(45% 0.1 80); }
  .opc-total-label { font-size: 11px; color: var(--mute); font-family: var(--font-sans); margin-top: 2px; }

  /* Zoho banners */
  .zoho-active-banner {
    display: flex; align-items: center; gap: 8px;
    background: oklch(96% 0.06 145); border: 1px solid oklch(80% 0.12 145);
    border-radius: var(--r-md); padding: 8px 14px; margin-bottom: 16px;
    font-size: 12.5px; color: oklch(35% 0.15 145); font-family: var(--font-sans);
  }

  /* Preview */
  .preview-summary { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .summary-chip { font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px; font-family: var(--font-sans); }
  .chip-valid { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .chip-dup   { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); }
  .chip-err   { background: var(--error-soft); color: var(--error); }
  .chip-skip  { background: var(--canvas-soft-2); color: var(--mute); }
  .filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .filter-label { font-size: 12px; color: var(--mute); font-family: var(--font-sans); }
  .filter-btn { font-size: 12px; padding: 4px 12px; border: 1px solid var(--hairline); border-radius: 999px; background: none; cursor: pointer; color: var(--body); font-family: var(--font-sans); transition: background 120ms, color 120ms; }
  .filter-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .sheet-filter-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 3px 8px 3px 10px; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid var(--accent); border-radius: 999px; color: var(--accent); font-family: var(--font-sans); }
  .sheet-filter-clear { background: none; border: none; cursor: pointer; color: var(--accent); font-size: 14px; line-height: 1; padding: 0 2px; }

  .table-scroll { overflow-x: auto; border: 1px solid var(--hairline); border-radius: var(--r-md); }
  .preview-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 13px; }
  .preview-table th { text-align: left; padding: 8px 12px; background: var(--canvas-soft); border-bottom: 1px solid var(--hairline); color: var(--mute); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .preview-table td { padding: 7px 12px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  .preview-table tr:last-child td { border-bottom: none; }
  .row-skip { opacity: 0.4; }
  .row-dup { background: oklch(98% 0.04 264); }
  .row-err { background: oklch(99% 0.02 28); }
  .th-idx, .td-idx { width: 40px; text-align: center; color: var(--mute); }
  .th-actions { width: 160px; text-align: right; }
  .td-actions { width: 160px; text-align: right; vertical-align: middle; }
  .td-actions-wrap { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
  .td-name { font-weight: 500; color: var(--ink); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .td-emp { max-width: 200px; vertical-align: top; }
  .emp-ref { color: var(--body); }
  .emp-new-wrap { display: flex; flex-direction: column; gap: 4px; }
  .emp-edit-fields { display: flex; flex-direction: column; gap: 3px; }
  .emp-edit-input {
    font-size: 11.5px; padding: 3px 7px; border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm); background: var(--canvas); color: var(--ink);
    font-family: var(--font-sans); width: 100%; min-width: 120px; max-width: 180px;
  }
  .emp-edit-input:focus { outline: none; border-color: var(--link); }

  .badge-status { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; font-family: var(--font-sans); white-space: nowrap; }
  .badge-ok-row      { background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); }
  .badge-dup-row     { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); }
  .badge-err-row     { background: var(--error-soft); color: var(--error); }
  .badge-warn-row    { background: oklch(92% 0.1 80); color: oklch(40% 0.15 80); }
  .badge-skip-row    { background: var(--canvas-soft-2); color: var(--mute); }
  .badge-new-emp { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: oklch(90% 0.1 80); color: oklch(35% 0.18 80); white-space: nowrap; align-self: flex-start; }
  .badge-zoho  { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: oklch(90% 0.1 145); color: oklch(35% 0.15 145); font-family: monospace; align-self: flex-start; }
  .badge-excel { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--canvas-soft-2); color: var(--mute); font-family: monospace; }

  .td-issues { font-size: 12px; max-width: 240px; }
  .issue-err  { color: var(--error); }
  .issue-warn { color: oklch(45% 0.15 80); }
  .issue-dup  { color: oklch(40% 0.15 264); }

  /* Row info badges */
  .badge-row-info { font-size: 11px; padding: 1px 6px; border-radius: 4px; margin-top: 3px; font-family: var(--font-sans); display: inline-flex; align-items: center; gap: 4px; }
  .badge-branch-resolved { background: oklch(92% 0.06 264); color: oklch(40% 0.15 264); }
  .badge-cat-new { background: oklch(92% 0.1 80); color: oklch(35% 0.18 80); }
  .conf-pct { font-size: 10px; opacity: 0.7; }

  .act-btn { font-size: 11px; padding: 3px 9px; border: 1px solid var(--hairline); border-radius: 4px; background: var(--canvas); cursor: pointer; color: var(--body); font-family: var(--font-sans); white-space: nowrap; }
  .branch-remap-select { font-size: 11px; padding: 3px 6px; border: 1px solid oklch(75% 0.1 55); border-radius: 4px; background: oklch(99% 0.01 55); color: var(--ink); font-family: var(--font-sans); cursor: pointer; max-width: 160px; }
  .act-skip { border-color: var(--error); color: var(--error); }
  .act-skip:hover { background: var(--error-soft); }
  .act-overwrite { border-color: oklch(50% 0.15 264); color: oklch(40% 0.15 264); }
  .act-overwrite:hover { background: oklch(92% 0.06 264); }

  /* Confirm */
  .confirm-body { max-width: 560px; margin: 0 auto; text-align: center; }
  .confirm-title { font-size: 20px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); margin-bottom: 24px; }
  .confirm-grid { display: flex; flex-direction: column; gap: 8px; text-align: left; margin-bottom: 24px; background: var(--canvas-soft); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px; }
  .confirm-row { display: flex; gap: 12px; font-family: var(--font-sans); font-size: 13px; }
  .confirm-label { color: var(--mute); min-width: 100px; }
  .confirm-val { color: var(--ink); font-weight: 500; }
  .confirm-zoho { color: oklch(35% 0.15 145); }
  .confirm-staff { color: oklch(35% 0.15 250); }
  .confirm-badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; margin-right: 3px; }
  .confirm-badge-cat { background: oklch(94% 0.05 145); color: oklch(35% 0.15 145); }
  .confirm-badge-branch { background: oklch(94% 0.05 250); color: oklch(35% 0.15 250); }
  .confirm-summary { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; text-align: left; }
  .cs-item { display: flex; align-items: center; gap: 12px; font-family: var(--font-sans); font-size: 13px; }
  .cs-num { font-size: 20px; font-weight: 700; min-width: 40px; text-align: right; }
  .cs-label { color: var(--body); }
  .cs-good .cs-num      { color: oklch(40% 0.18 145); }
  .cs-dup .cs-num       { color: oklch(40% 0.15 264); }
  .cs-overwrite .cs-num { color: oklch(40% 0.15 80); }
  .cs-skip .cs-num      { color: var(--mute); }
  .cs-err .cs-num       { color: var(--error); }

  /* Result */
  .result-body { text-align: center; }
  .result-icon { font-size: 48px; margin-bottom: 12px; color: oklch(50% 0.2 145); }
  .result-title { font-size: 22px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); margin-bottom: 28px; }
  .result-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 640px) { .result-grid { grid-template-columns: repeat(2, 1fr); } }
  .result-card { background: var(--canvas-soft); border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 16px; }
  .rc-num { display: block; font-size: 28px; font-weight: 700; font-family: var(--font-sans); }
  .rc-label { display: block; font-size: 12px; color: var(--mute); font-family: var(--font-sans); margin-top: 4px; }
  .rc-green .rc-num { color: oklch(40% 0.18 145); }
  .rc-blue .rc-num  { color: oklch(40% 0.15 264); }
  .rc-yellow .rc-num{ color: oklch(40% 0.15 80); }
  .rc-red .rc-num   { color: var(--error); }
  .result-note { font-size: 13px; color: oklch(40% 0.18 145); font-family: var(--font-sans); margin-bottom: 20px; }
  .result-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

  /* Shared */
  .step-footer { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--hairline); }
  .err-msg { font-size: 13px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 8px 12px; margin-top: 10px; font-family: var(--font-sans); }
  .btn-primary { background: var(--ink); color: #fff; border: none; border-radius: var(--r-md); padding: 9px 20px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-sans); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: none; border: 1px solid var(--hairline); border-radius: var(--r-md); padding: 9px 18px; font-size: 13px; cursor: pointer; color: var(--body); font-family: var(--font-sans); }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-ghost-sm { background: none; border: 1px solid var(--hairline); border-radius: var(--r-sm); padding: 6px 14px; font-size: 12px; cursor: pointer; color: var(--body); font-family: var(--font-sans); }
  .select-sm { padding: 5px 8px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-family: var(--font-sans); font-size: 12px; }
</style>
