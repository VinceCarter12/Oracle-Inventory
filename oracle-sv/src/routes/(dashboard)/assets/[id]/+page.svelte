<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';
  import { can } from '$lib/utils/permissions';

  // ── API types ─────────────────────────────────────────────────────────────
  interface ApiAsset {
    id: string; name: string; serialNumber: string | null; assetTag: string | null; computerName: string | null; purchaseDate: string | null;
    status: 'active' | 'lost' | 'stolen';
    condition: 'usable' | 'for_repair' | 'for_disposal';
    ownership: 'company' | 'personal';
    description: string | null;
    warrantyExpiry: string | null;
    nextMaintenanceDate: string | null;
    lostAt: string | null;
    lostStolenNotes: string | null;
    deviceProfile: { brand: string | null; model: string | null; deviceSerial: string | null; processor: string | null; motherboard: string | null; operatingSystem: string | null; osVersion: string | null; source: string; components: { id: string; type: 'ram' | 'storage'; slotOrBay: string | null; brand: string | null; model: string | null; serialNumber: string | null; capacity: string | null; source: string }[] } | null;
    createdAt: string; updatedAt: string;
    category: { id: string; name: string } | null;
    branch:   { id: string; name: string } | null;
    assignments: {
      id: string; assignedAt: string;
      employee: { id: string; name: string; employeeId: string; department: { id: string; name: string } | null };
    }[];
    movementLogs: {
      id: string; type: string; notes: string | null; createdAt: string;
      employee: { id: string; name: string } | null;
    }[];
  }

  interface Category { id: string; name: string; }
  interface Branch   { id: string; name: string; }

  // ── Label maps ────────────────────────────────────────────────────────────
  type Condition = 'usable' | 'for_repair' | 'for_disposal';
  const COND_LABEL: Record<Condition, string> = { usable: 'Usable', for_repair: 'For Repair', for_disposal: 'For Disposal' };
  const COND_STYLE: Record<Condition, string> = { usable: 'badge-blue', for_repair: 'badge-orange', for_disposal: 'badge-red' };

  // ── Barcode decoration ────────────────────────────────────────────────────
  const BAR_HEIGHTS = [85,40,70,85,30,85,50,85,65,85,35,85,75,40,85,55,85,45,85,60,30,85,70,85,40,85,55,30,85,65,85,50,85,35];
  const BAR_WIDTHS  = [3,2,3,3,1,3,2,3,2,3,1,3,3,2,3,2,3,1,3,2,1,3,2,3,2,3,2,1,3,2,3,2,3,1];

  // ── State ─────────────────────────────────────────────────────────────────
  let loading  = $state(true);
  let loadErr  = $state('');
  let asset    = $state<ApiAsset | null>(null);
  let cats     = $state<Category[]>([]);
  let branches = $state<Branch[]>([]);

  // Edit modal
  let showEdit   = $state(false);
  let editSaving = $state(false);
  let editErr    = $state('');
  let editForm   = $state({ name: '', serialNumber: '', categoryId: '', branchId: '', condition: 'usable', ownership: 'company', description: '', warrantyExpiry: '' });

  // Delete confirm
  let showDel  = $state(false);
  let deleting = $state(false);

  // Hardware audit (Belarc scans)
  interface HwSpecField { key: string; label: string; value: string; tier: string; }
  interface HwScan {
    id: string; fileName: string; isBaseline: boolean;
    overallStatus: 'match' | 'warning' | 'mismatch' | null;
    status: 'pending' | 'reviewed' | 'flagged' | 'archived';
    createdAt: string;
    submittedBy: { id: string; name: string } | null;
  }
  interface HwBaseline extends HwScan {
    parsedSpecs: {
      sections: Record<string, { key: string; name: string; fields: HwSpecField[] }>;
      meta: { computerName?: string; profileDate?: string };
    } | null;
  }
  let hwBaseline  = $state<HwBaseline | null>(null);
  let hwScans     = $state<HwScan[]>([]);
  let hwAccepting = $state('');
  let hwErr       = $state('');

  const assetId      = $derived($page.params.id);
  const assignee     = $derived(asset?.assignments?.[0]?.employee?.name ?? '—');
  const assigneeDept = $derived(asset?.assignments?.[0]?.employee?.department?.name ?? '—');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return iso; }
  }

  function logLabel(type: string): string {
    const map: Record<string, string> = {
      assignment: 'Assigned', transfer: 'Transferred', site_transfer: 'Branch transfer',
      resignation: 'Returned – resignation', new_hire: 'Issued – new hire',
      repair_send: 'Sent for repair', repair_return: 'Returned from repair', disposal: 'Disposed',
      lost_report: 'Reported Lost', stolen_report: 'Reported Stolen', recovery: 'Recovered',
      return_requested: 'Return Requested', return_approved: 'Return Approved', return_rejected: 'Return Rejected',
    };
    return map[type] ?? type;
  }

  function logIconStyle(type: string): string {
    if (type === 'assignment' || type === 'new_hire' || type === 'recovery' || type === 'return_approved') return 'act-green';
    if (type === 'repair_send' || type === 'disposal' || type === 'lost_report' || type === 'stolen_report' || type === 'return_rejected') return 'act-red';
    if (type === 'transfer' || type === 'site_transfer') return 'act-blue';
    return 'act-muted';
  }

  function logBadge(type: string): string {
    if (type === 'assignment' || type === 'new_hire' || type === 'recovery' || type === 'return_approved') return 'badge-green';
    if (type === 'repair_send' || type === 'disposal' || type === 'lost_report' || type === 'stolen_report' || type === 'return_rejected') return 'badge-red';
    if (type === 'transfer' || type === 'site_transfer') return 'badge-blue';
    return 'badge-muted';
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      const [assetData, catData, branchData] = await Promise.all([
        api.get<ApiAsset>(`/api/assets/${$page.params.id}`),
        api.get<Category[]>('/api/categories'),
        api.get<Branch[]>('/api/branches'),
      ]);
      asset    = assetData;
      cats     = catData;
      branches = branchData;
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
    // Hardware audit data loads independently — a failure here never blanks the page
    void loadHardware();
  });

  async function loadHardware() {
    const id = $page.params.id;
    hwBaseline = await api.get<HwBaseline | null>(`/api/hardware-audit/baseline/${id}`).catch(() => null);
    hwScans    = await api.get<{ scans: HwScan[] }>(`/api/hardware-audit/scans?assetId=${id}&pageSize=50`)
      .then((r) => r.scans)
      .catch(() => []);
  }

  const hwHeadline = $derived.by((): { label: string; value: string }[] => {
    const specs = hwBaseline?.parsedSpecs;
    if (!specs) return [];
    const rows: { label: string; value: string }[] = [];
    const get = (section: string, key: string) =>
      specs.sections[section]?.fields.find((f) => f.key === key)?.value;
    const os = get('operatingSystem', 'operatingSystem.description');
    if (os) rows.push({ label: 'OS', value: os });
    const model = get('systemModel', 'systemModel.model');
    if (model) rows.push({ label: 'Model', value: model });
    const cpu = get('processor', 'processor.name');
    if (cpu) rows.push({ label: 'CPU', value: cpu });
    const ram = get('memory', 'memory.total');
    if (ram) rows.push({ label: 'RAM', value: ram });
    const gpus = specs.sections.display?.fields.filter((f) => f.key.startsWith('display.adapter')) ?? [];
    if (gpus.length) rows.push({ label: 'GPU', value: gpus.map((g) => g.value).join(' · ') });
    const drives = specs.sections.localStorage?.fields.filter((f) => f.key.endsWith('.model')) ?? [];
    if (drives.length) rows.push({ label: 'Drives', value: drives.map((d) => d.value).join(' · ') });
    const board = get('mainBoard', 'mainBoard.board');
    if (board) rows.push({ label: 'Motherboard', value: board });
    return rows;
  });

  // Exit check (Phase E): enrolled assets can only be returned once their
  // latest scan is reviewed — mirror the server rule for visibility
  const hwExitCheck = $derived.by(() => {
    if (!hwBaseline) return null;
    const latest = hwScans
      .filter((s) => !s.isBaseline && s.status !== 'archived')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return { label: 'Exit check: scan required', cls: 'badge-red' };
    if (latest.status === 'reviewed') return { label: 'Exit check: cleared', cls: 'badge-green' };
    if (latest.status === 'flagged') return { label: 'Exit check: flagged', cls: 'badge-red' };
    return { label: 'Exit check: awaiting review', cls: 'badge-orange' };
  });

  async function hwAcceptBaseline(scanId: string) {
    hwAccepting = scanId;
    hwErr = '';
    try {
      await api.put(`/api/hardware-audit/scans/${scanId}/baseline`, {});
      await loadHardware();
    } catch (e) {
      hwErr = (e as Error).message;
    } finally {
      hwAccepting = '';
    }
  }

  // Uploaded HTML is untrusted — render it only inside a fully sandboxed iframe
  // (no scripts, no same-origin), never as a top-level document in our origin.
  let hwRawUrl = $state('');
  async function hwViewRaw(scanId: string) {
    try {
      const res = await api.raw(`/api/hardware-audit/scans/${scanId}/raw`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      hwRawUrl = URL.createObjectURL(await res.blob());
    } catch (e) {
      hwErr = (e as Error).message;
    }
  }
  function hwCloseRaw() {
    if (hwRawUrl) URL.revokeObjectURL(hwRawUrl);
    hwRawUrl = '';
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function openEdit() {
    if (!asset) return;
    editForm = {
      name: asset.name,
      serialNumber: asset.serialNumber ?? '',
      categoryId: asset.category?.id ?? '',
      branchId: asset.branch?.id ?? '',
      condition: asset.condition,
      ownership: asset.ownership,
      description: asset.description ?? '',
      warrantyExpiry: asset.warrantyExpiry ? asset.warrantyExpiry.slice(0, 10) : '',
    };
    editErr = '';
    showEdit = true;
  }

  async function saveEdit() {
    if (!editForm.name.trim()) { editErr = 'Asset name is required.'; return; }
    editSaving = true; editErr = '';
    try {
      asset = await api.put<ApiAsset>(`/api/assets/${assetId}`, {
        name: editForm.name.trim(),
        serialNumber: editForm.serialNumber.trim() || null,
        categoryId: editForm.categoryId || null,
        branchId: editForm.branchId || null,
        condition: editForm.condition,
        ownership: editForm.ownership,
        description: editForm.description.trim() || null,
        warrantyExpiry: editForm.warrantyExpiry || null,
      });
      showEdit = false;
    } catch (e) { editErr = (e as Error).message; }
    finally { editSaving = false; }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function confirmDelete() {
    deleting = true;
    try {
      await api.delete(`/api/assets/${assetId}`);
      goto('/assets');
    } catch { deleting = false; }
  }

  // ── Report Lost / Stolen ──────────────────────────────────────────────────
  let showLostModal   = $state(false);
  let lostModalType   = $state<'lost' | 'stolen'>('lost');
  let lostModalNotes  = $state('');
  let lostModalBusy   = $state(false);
  let lostModalErr    = $state('');

  function openLostModal(type: 'lost' | 'stolen') {
    lostModalType = type; lostModalNotes = ''; lostModalErr = ''; showLostModal = true;
  }

  async function confirmLostStolen() {
    lostModalBusy = true; lostModalErr = '';
    const endpoint = lostModalType === 'lost' ? 'report-lost' : 'report-stolen';
    try {
      asset = await api.post<ApiAsset>(`/api/assets/${assetId}/${endpoint}`, { notes: lostModalNotes || undefined });
      showLostModal = false; lostModalNotes = '';
    } catch (e) { lostModalErr = (e as Error).message; }
    finally { lostModalBusy = false; }
  }

  // ── Return ────────────────────────────────────────────────────────────────
  let showReturnModal = $state(false);
  let returnNotes     = $state('');
  let returnBusy      = $state(false);
  let returnErr       = $state('');

  const activeAssignmentId = $derived(
    asset?.assignments?.find ? asset.assignments[0]?.id ?? null : null
  );

  async function confirmReturn() {
    if (!activeAssignmentId) return;
    returnBusy = true; returnErr = '';
    try {
      await api.post(`/api/assignments/${activeAssignmentId}/return`, { notes: returnNotes || undefined });
      asset = await api.get<ApiAsset>(`/api/assets/${assetId}`);
      showReturnModal = false; returnNotes = '';
    } catch (e) { returnErr = (e as Error).message; }
    finally { returnBusy = false; }
  }

  // ── Recover ───────────────────────────────────────────────────────────────
  let showRecoverModal   = $state(false);
  let recoverCondition   = $state('usable');
  let recoverNotes       = $state('');
  let recoverInspector   = $state('');
  let recoverBusy        = $state(false);
  let recoverErr         = $state('');

  function openRecoverModal() {
    recoverCondition = 'usable'; recoverNotes = ''; recoverInspector = ''; recoverErr = ''; showRecoverModal = true;
  }

  async function confirmRecover(skip = false) {
    recoverBusy = true; recoverErr = '';
    try {
      asset = await api.post<ApiAsset>(`/api/assets/${assetId}/recover`, {
        skip,
        condition: recoverCondition,
        notes: recoverNotes || undefined,
        inspector: recoverInspector || undefined,
      });
      showRecoverModal = false;
    } catch (e) { recoverErr = (e as Error).message; }
    finally { recoverBusy = false; }
  }
</script>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->
<div class="page">

  {#if loading}
    <div class="pg-loading">Loading asset…</div>

  {:else if loadErr}
    <div class="load-err">{loadErr}</div>

  {:else if asset}

    <!-- ── Top strip: breadcrumb + buttons ──────────────────────────────── -->
    <div class="top-strip">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
        <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        <button class="crumb-link" onclick={() => goto('/assets')}>Assets</button>
        <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="crumb-current">{asset.name}</span>
      </nav>
      <div class="action-btns">
        {#if can('delete_inventory')}
          <button class="btn-danger" onclick={() => showDel = true}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Delete
          </button>
        {/if}
        {#if can('edit_inventory')}
          <button class="btn-outline" onclick={openEdit}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Asset
          </button>
        {/if}
        {#if can('approve_transactions') && asset.status === 'active' && activeAssignmentId}
          <button class="btn-outline btn-return" onclick={() => { returnNotes = ''; returnErr = ''; showReturnModal = true; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
            Return
          </button>
        {/if}
        {#if can('edit_inventory') && asset.status === 'active'}
          <button class="btn-outline btn-warn" onclick={() => openLostModal('lost')}>Report Lost</button>
          <button class="btn-danger" onclick={() => openLostModal('stolen')}>Report Stolen</button>
        {/if}
        {#if can('edit_inventory') && (asset.status === 'lost' || asset.status === 'stolen')}
          <button class="btn-recover" onclick={openRecoverModal}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
            Recover Asset
          </button>
        {/if}
        {#if asset.status === 'active'}
          <button class="btn-primary" onclick={() => goto('/assignments/assign')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Assign Asset
          </button>
        {/if}
      </div>
    </div>

    <!-- ── Title row ─────────────────────────────────────────────────────── -->
    <div class="title-row">
      <h1 class="page-title">{asset.name}</h1>
      <span class="id-badge">{asset.id.slice(0, 8).toUpperCase()}</span>
      {#if asset.status === 'lost'}
        <span class="status-pill pill-lost">Lost</span>
      {:else if asset.status === 'stolen'}
        <span class="status-pill pill-stolen">Stolen</span>
      {/if}
    </div>

    <!-- ── Lost/Stolen banner ─────────────────────────────────────────────── -->
    {#if asset.status !== 'active'}
      <div class="status-banner banner-{asset.status}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>This asset is marked as <strong>{asset.status}</strong>{asset.lostAt ? ` since ${new Date(asset.lostAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.{asset.lostStolenNotes ? ` Notes: ${asset.lostStolenNotes}` : ''}</span>
      </div>
    {/if}

    <!-- ── Main card: left panel | right panel ───────────────────────────── -->
    <div class="main-card">

      <!-- Left panel: image + asset code -->
      <div class="left-panel">

        <!-- Image area -->
        <div class="img-area">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="img-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span class="img-label">{asset.category?.name?.toUpperCase() ?? 'ASSET'}</span>
        </div>

        <!-- Nav: arrows + dots (decorative) -->
        <div class="img-nav">
          <button class="nav-arrow" aria-label="Previous image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="dot dot-on"></span>
          <span class="dot"></span>
          <span class="dot"></span>
          <button class="nav-arrow" aria-label="Next image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <!-- Asset code section -->
        <div class="asset-code">
          <div class="ac-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="3" height="16"/><rect x="7" y="4" width="1" height="16"/><rect x="10" y="4" width="4" height="16"/><rect x="16" y="4" width="1" height="16"/><rect x="19" y="4" width="3" height="16"/></svg>
            <span class="ac-title">Asset Code</span>
          </div>

          <div class="barcode-wrap" aria-hidden="true">
            {#each BAR_HEIGHTS as h, i}
              <div class="bar" style="height:{h}%; width:{BAR_WIDTHS[i]}px;"></div>
            {/each}
          </div>
          <span class="barcode-serial">{asset.serialNumber ?? '—'}</span>

          <div class="ac-divider"></div>

          <div class="ac-fields">
            <div class="ac-field">
              <span class="field-label">Asset ID</span>
              <span class="field-value mono">{asset.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div class="ac-field">
              <span class="field-label">Ownership</span>
              <span class="field-value">{asset.ownership === 'company' ? 'Company' : 'Personal'}</span>
            </div>
          </div>
        </div>

      </div><!-- /left-panel -->

      <!-- Right panel: basic info + acquisition + recent activity -->
      <div class="right-panel">

        <!-- Basic info fields -->
        <div class="field-grid">
          <div class="field">
            <span class="field-label">Asset Name</span>
            <span class="field-value">{asset.name}</span>
          </div>
          <div class="field">
            <span class="field-label">Branch</span>
            <span class="field-value">{asset.branch?.name ?? '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Category</span>
            <span class="field-value">{asset.category?.name ?? '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Serial No.</span>
            <span class="field-value mono">{asset.serialNumber ?? '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Assigned To</span>
            <span class="field-value">{assignee}</span>
          </div>
          <div class="field">
            <span class="field-label">Department</span>
            <span class="field-value">{assigneeDept}</span>
          </div>
          <div class="field">
            <span class="field-label">Condition</span>
            <span class="badge {COND_STYLE[asset.condition]}">{COND_LABEL[asset.condition]}</span>
          </div>
        </div>

        <!-- Acquisition / details section -->
        <div class="rp-section">
          <div class="section-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            <span class="section-title">Details</span>
          </div>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Warranty Expiry</span>
              <span class="field-value">{fmtDate(asset.warrantyExpiry)}</span>
            </div>
            <div class="field"><span class="field-label">Asset tag</span><span class="field-value">{asset.assetTag || '—'}</span></div>
            <div class="field"><span class="field-label">Computer name</span><span class="field-value">{asset.computerName || '—'}</span></div>
            <div class="field"><span class="field-label">Purchase date</span><span class="field-value">{fmtDate(asset.purchaseDate)}</span></div>
            <div class="field">
              <span class="field-label">Next Maintenance</span>
              <span class="field-value">{fmtDate(asset.nextMaintenanceDate)}</span>
            </div>
            <div class="field">
              <span class="field-label">Added</span>
              <span class="field-value">{fmtDate(asset.createdAt)}</span>
            </div>
            <div class="field">
              <span class="field-label">Last Updated</span>
              <span class="field-value">{fmtDate(asset.updatedAt)}</span>
            </div>
            {#if asset.description}
              <div class="field field-wide">
                <span class="field-label">Description</span>
                <span class="field-value">{asset.description}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Computer specifications section -->
        {#if asset.deviceProfile}
          <div class="rp-section">
            <div class="section-head"><span class="section-title">Specifications</span><span class="badge badge-muted">{asset.deviceProfile.source === 'manual' ? 'Manual' : asset.deviceProfile.source}</span></div>
            <div class="field-grid">
              <div class="field"><span class="field-label">Brand / Model</span><span class="field-value">{[asset.deviceProfile.brand, asset.deviceProfile.model].filter(Boolean).join(' ') || '—'}</span></div>
              <div class="field"><span class="field-label">Processor</span><span class="field-value">{asset.deviceProfile.processor || '—'}</span></div>
              <div class="field"><span class="field-label">Motherboard</span><span class="field-value">{asset.deviceProfile.motherboard || '—'}</span></div>
              <div class="field"><span class="field-label">Operating system</span><span class="field-value">{[asset.deviceProfile.operatingSystem, asset.deviceProfile.osVersion].filter(Boolean).join(' ') || '—'}</span></div>
            </div>
            {#if asset.deviceProfile.components.length > 0}
              <div class="component-list">{#each asset.deviceProfile.components as component}<div class="component-summary"><strong>{component.type === 'ram' ? 'RAM' : 'Storage'}</strong><span>{[component.brand, component.model, component.capacity].filter(Boolean).join(' ') || 'Unspecified'}</span><small>{component.serialNumber || component.slotOrBay || '—'}</small></div>{/each}</div>
            {/if}
          </div>
        {/if}

        <!-- Recent Activity section -->
        <div class="rp-section">
          <div class="section-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span class="section-title">Recent Activity</span>
          </div>
          <div class="activity-list">
            {#if asset.movementLogs.length === 0}
              <div class="act-empty">No activity recorded yet.</div>
            {:else}
              {#each asset.movementLogs.slice(0, 6) as log}
                <div class="activity-item">
                  <span class="act-icon {logIconStyle(log.type)}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      {#if log.type === 'assignment' || log.type === 'new_hire'}
                        <polyline points="20 6 9 17 4 12"/>
                      {:else if log.type === 'repair_send'}
                        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
                      {:else}
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      {/if}
                    </svg>
                  </span>
                  <div class="act-body">
                    <span class="act-desc">{logLabel(log.type)}{log.employee ? ` — ${log.employee.name}` : ''}</span>
                    <span class="act-date">{fmtDate(log.createdAt)}</span>
                  </div>
                  <span class="badge {logBadge(log.type)}">{logLabel(log.type)}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Hardware section (Belarc audit) -->
        <div class="rp-section">
          <div class="section-head hw-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            <span class="section-title">Hardware</span>
            <button class="hw-upload-btn" onclick={() => goto(`/hardware-audit/upload?asset=${asset!.id}`)}>Upload New Scan</button>
          </div>

          {#if hwErr}<div class="hw-err">{hwErr}</div>{/if}

          {#if hwBaseline}
            <div class="hw-baseline-meta">
              Baseline accepted {fmtDate(hwBaseline.createdAt)}{hwBaseline.submittedBy ? ` · uploaded by ${hwBaseline.submittedBy.name}` : ''}
              <button class="hw-link" onclick={() => hwViewRaw(hwBaseline!.id)}>View original Belarc report</button>
              {#if hwExitCheck}
                <span class="badge {hwExitCheck.cls}" title="Audit-enrolled assets can only be returned after their latest scan is reviewed">{hwExitCheck.label}</span>
              {/if}
            </div>
            <div class="field-grid">
              {#each hwHeadline as row}
                <div class="field" class:field-wide={row.value.length > 60}>
                  <span class="field-label">{row.label}</span>
                  <span class="field-value">{row.value}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="act-empty">No baseline hardware specs yet. Upload a Belarc scan and accept it as the baseline.</div>
          {/if}

          {#if hwScans.length > 0}
            <div class="hw-history-title">Scan History</div>
            <div class="hw-history">
              {#each hwScans as scan (scan.id)}
                <div class="hw-row">
                  <div class="hw-row-main">
                    <span class="hw-row-file">{scan.fileName}</span>
                    <span class="hw-row-meta">{fmtDate(scan.createdAt)}{scan.submittedBy ? ` · ${scan.submittedBy.name}` : ''}</span>
                  </div>
                  <div class="hw-row-side">
                    {#if scan.isBaseline}
                      <span class="badge badge-blue">Baseline</span>
                    {:else if scan.overallStatus === 'mismatch'}
                      <span class="badge badge-red">Mismatch</span>
                    {:else if scan.overallStatus === 'warning'}
                      <span class="badge badge-orange">Warning</span>
                    {:else if scan.overallStatus === 'match'}
                      <span class="badge badge-green">Match</span>
                    {:else}
                      <span class="badge badge-muted">{scan.status}</span>
                    {/if}
                    {#if !scan.isBaseline && can('edit_inventory')}
                      <button class="hw-link" disabled={hwAccepting === scan.id} onclick={() => hwAcceptBaseline(scan.id)}>
                        {hwAccepting === scan.id ? 'Accepting…' : hwBaseline ? 'Make baseline' : 'Accept as baseline'}
                      </button>
                    {/if}
                    <button class="hw-link" onclick={() => hwViewRaw(scan.id)}>View report</button>
                    <button class="hw-link" onclick={() => goto(`/hardware-audit/${scan.id}`)}>Details</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

      </div><!-- /right-panel -->
    </div><!-- /main-card -->

  {:else}

    <!-- ── Not found ─────────────────────────────────────────────────────── -->
    <div class="not-found">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--hairline-strong)"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      <h2 class="nf-title">Asset not found</h2>
      <p class="nf-sub">No asset with ID <span class="mono">{assetId}</span> exists in this inventory.</p>
      <button class="btn-primary" onclick={() => goto('/assets')}>Back to Assets</button>
    </div>

  {/if}

  <!-- ── Edit modal ──────────────────────────────────────────────────────── -->
  {#if showEdit}
    <div class="modal-overlay" onclick={() => showEdit = false} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit asset">
        <div class="modal-head">
          <span class="modal-title">Edit asset</span>
          <button class="modal-close" onclick={() => showEdit = false} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label" for="e-name">Asset Name *</label>
            <input id="e-name" class="form-input" type="text" bind:value={editForm.name} />
          </div>
          <div class="form-row">
            <label class="form-label" for="e-serial">Serial Number</label>
            <input id="e-serial" class="form-input" type="text" bind:value={editForm.serialNumber} placeholder="e.g. SN-12345" />
          </div>
          <div class="form-2col">
            <div class="form-row">
              <label class="form-label" for="e-cat">Category</label>
              <select id="e-cat" class="form-select" bind:value={editForm.categoryId}>
                <option value="">— None —</option>
                {#each cats as c}<option value={c.id}>{c.name}</option>{/each}
              </select>
            </div>
            <div class="form-row">
              <label class="form-label" for="e-branch">Branch</label>
              <select id="e-branch" class="form-select" bind:value={editForm.branchId}>
                <option value="">— None —</option>
                {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
              </select>
            </div>
          </div>
          <div class="form-2col">
            <div class="form-row">
              <label class="form-label" for="e-cond">Condition</label>
              <select id="e-cond" class="form-select" bind:value={editForm.condition}>
                <option value="usable">Usable</option>
                <option value="for_repair">For Repair</option>
                <option value="for_disposal">For Disposal</option>
              </select>
            </div>
            <div class="form-row">
              <label class="form-label" for="e-own">Ownership</label>
              <select id="e-own" class="form-select" bind:value={editForm.ownership}>
                <option value="company">Company</option>
                <option value="personal">Personal</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label" for="e-warranty">Warranty Expiry</label>
            <input id="e-warranty" class="form-input" type="date" bind:value={editForm.warrantyExpiry} />
          </div>
          <div class="form-row">
            <label class="form-label" for="e-desc">Description</label>
            <textarea id="e-desc" class="form-ta" bind:value={editForm.description} rows="3" placeholder="Optional notes…"></textarea>
          </div>
          {#if editErr}
            <div class="form-err">{editErr}</div>
          {/if}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick={() => showEdit = false}>Cancel</button>
          <button class="btn-primary" onclick={saveEdit} disabled={editSaving}>
            {editSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Report Lost / Stolen modal ─────────────────────────────────────── -->
  {#if showLostModal}
    <div class="modal-overlay" onclick={() => showLostModal = false} role="presentation">
      <div class="modal modal-sm" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Report asset">
        <div class="modal-head">
          <span class="modal-title">Report as {lostModalType}</span>
          <button class="modal-close" onclick={() => showLostModal = false} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="del-msg">Mark <strong>{asset?.name}</strong> as {lostModalType}? Active assignments will be suspended.</p>
          <div class="form-row">
            <label class="form-label" for="lost-notes">Notes (optional)</label>
            <textarea id="lost-notes" class="form-ta" rows="3" placeholder="Circumstances, location last seen…" bind:value={lostModalNotes}></textarea>
          </div>
          {#if lostModalErr}
            <div class="form-err">{lostModalErr}</div>
          {/if}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick={() => showLostModal = false}>Cancel</button>
          <button class="btn-danger" onclick={confirmLostStolen} disabled={lostModalBusy}>
            {lostModalBusy ? 'Saving…' : `Report as ${lostModalType}`}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Recover modal ────────────────────────────────────────────────────── -->
  {#if showRecoverModal}
    <div class="modal-overlay" onclick={() => showRecoverModal = false} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Recover asset">
        <div class="modal-head">
          <span class="modal-title">Recover asset</span>
          <button class="modal-close" onclick={() => showRecoverModal = false} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="del-msg">Record recovery of <strong>{asset?.name}</strong>.</p>
          <div class="form-2col">
            <div class="form-row">
              <label class="form-label" for="rec-cond">Condition after recovery</label>
              <select id="rec-cond" class="form-select" bind:value={recoverCondition}>
                <option value="usable">Usable</option>
                <option value="for_repair">For Repair</option>
                <option value="for_disposal">For Disposal</option>
              </select>
            </div>
            <div class="form-row">
              <label class="form-label" for="rec-inspector">Inspector (optional)</label>
              <input id="rec-inspector" class="form-input" type="text" placeholder="Name of inspector" bind:value={recoverInspector} />
            </div>
          </div>
          <div class="form-row">
            <label class="form-label" for="rec-notes">Notes (optional)</label>
            <textarea id="rec-notes" class="form-ta" rows="3" placeholder="Where and how it was recovered…" bind:value={recoverNotes}></textarea>
          </div>
          {#if recoverErr}
            <div class="form-err">{recoverErr}</div>
          {/if}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick={() => confirmRecover(true)} disabled={recoverBusy} title="Mark recovered without inspection">Skip verification</button>
          <button class="btn-ghost" onclick={() => showRecoverModal = false}>Cancel</button>
          <button class="btn-primary" onclick={() => confirmRecover(false)} disabled={recoverBusy}>
            {recoverBusy ? 'Saving…' : 'Confirm recovery'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Return modal ────────────────────────────────────────────────────── -->
  {#if showReturnModal}
    <div class="modal-overlay" onclick={() => showReturnModal = false} role="presentation">
      <div class="modal modal-sm" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Return asset">
        <div class="modal-head">
          <span class="modal-title">Return asset</span>
          <button class="modal-close" onclick={() => showReturnModal = false} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="del-msg">Mark <strong>{asset?.name}</strong> as returned from <strong>{assignee}</strong>?</p>
          <div class="form-row">
            <label class="form-label" for="ret-notes">Notes (optional)</label>
            <textarea id="ret-notes" class="form-ta" rows="2" placeholder="Reason for return…" bind:value={returnNotes}></textarea>
          </div>
          {#if returnErr}
            <div class="form-err">{returnErr}</div>
          {/if}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick={() => showReturnModal = false}>Cancel</button>
          <button class="btn-primary" onclick={confirmReturn} disabled={returnBusy}>
            {returnBusy ? 'Marking…' : 'Mark as Returned'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Delete confirmation ─────────────────────────────────────────────── -->
  {#if showDel}
    <div class="modal-overlay" onclick={() => showDel = false} role="presentation">
      <div class="modal modal-sm" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete asset">
        <div class="modal-head">
          <span class="modal-title">Delete asset</span>
          <button class="modal-close" onclick={() => showDel = false} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="del-msg">Are you sure you want to delete <strong>{asset?.name}</strong>? This action cannot be undone.</p>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick={() => showDel = false}>Cancel</button>
          <button class="btn-danger" onclick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete asset'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Belarc raw report viewer (sandboxed) ────────────────────────────── -->
  {#if hwRawUrl}
    <div class="modal-overlay" onclick={hwCloseRaw} role="presentation">
      <div class="modal hw-raw-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Original Belarc report">
        <div class="modal-head">
          <span class="modal-title">Original Belarc Report</span>
          <button class="modal-close" onclick={hwCloseRaw} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <!-- sandbox="" = no scripts, no same-origin — uploaded HTML stays inert -->
        <iframe class="hw-raw-frame" sandbox="" src={hwRawUrl} title="Belarc report"></iframe>
      </div>
    </div>
  {/if}

</div>

<style>
  /* ── Page shell ──────────────────────────────────────────────────────────── */
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    min-width: 0;
  }

  .pg-loading {
    padding: 60px;
    text-align: center;
    font-size: 13px;
    color: var(--mute);
  }

  .load-err {
    padding: 12px 16px;
    background: var(--error-soft);
    color: var(--error);
    border-radius: var(--r-md);
    font-size: 13px;
  }

  /* ── Top strip ───────────────────────────────────────────────────────────── */
  .top-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .crumb-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 12.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: color 120ms ease;
  }

  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .action-btns {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  /* ── Title row ───────────────────────────────────────────────────────────── */
  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .page-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.4px;
    line-height: 1.2;
  }

  .id-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--hairline);
    background: var(--canvas-soft);
    font-size: 12px;
    font-weight: 500;
    color: var(--mute);
    font-family: var(--font-mono);
    letter-spacing: 0.3px;
  }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn-ghost {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    height: 32px;
    border-radius: var(--r-md);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--body);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms ease;
    box-shadow: var(--shadow-l1);
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }

  .btn-outline {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 32px;
    border-radius: var(--r-md);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--ink);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 120ms ease;
  }
  .btn-outline:hover { background: var(--canvas-soft); }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 32px;
    border-radius: var(--r-md);
    border: none;
    background: var(--ink);
    color: var(--on-primary);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 120ms ease;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-danger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 32px;
    border-radius: var(--r-md);
    border: 1px solid var(--error);
    background: var(--error-soft);
    color: var(--error);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 120ms ease;
  }
  .btn-danger:hover:not(:disabled) { background: oklch(90% 0.06 28); }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Main card ───────────────────────────────────────────────────────────── */
  .main-card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l1);
    display: grid;
    grid-template-columns: 2fr 3fr;
    overflow: hidden;
    min-height: 520px;
  }

  /* ── Left panel ──────────────────────────────────────────────────────────── */
  .left-panel {
    border-right: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
  }

  .img-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: var(--canvas-soft-2);
    color: var(--hairline-strong);
    padding: 24px;
    min-height: 280px;
  }

  .img-icon { flex-shrink: 0; }

  .img-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--mute);
    font-family: var(--font-sans);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .img-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
    background: var(--canvas);
  }

  .nav-arrow {
    width: 24px;
    height: 24px;
    border-radius: var(--r-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--body);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 120ms ease;
    flex-shrink: 0;
  }
  .nav-arrow:hover { background: var(--canvas-soft-2); }

  .dot { width: 7px; height: 7px; border-radius: 999px; background: var(--hairline); flex-shrink: 0; }
  .dot-on { background: var(--ink); }

  .asset-code { padding: 20px; display: flex; flex-direction: column; gap: 12px; }

  .ac-head { display: flex; align-items: center; gap: 7px; color: var(--body); }
  .ac-title { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }

  .barcode-wrap {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1.5px;
    height: 72px;
  }

  .bar { background: var(--ink); border-radius: 0.5px; flex-shrink: 0; }

  .barcode-serial {
    font-size: 11.5px;
    font-family: var(--font-mono);
    color: var(--mute);
    letter-spacing: 1.5px;
    text-align: center;
  }

  .ac-divider { height: 1px; background: var(--hairline); }

  .ac-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .ac-field { display: flex; flex-direction: column; gap: 4px; }

  /* ── Right panel ─────────────────────────────────────────────────────────── */
  .right-panel { display: flex; flex-direction: column; gap: 0; padding: 24px; }

  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 32px; padding-bottom: 24px; }

  .field { display: flex; flex-direction: column; gap: 5px; }

  .field-wide { grid-column: span 2; }

  .field-label {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--mute);
    font-family: var(--font-sans);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .field-value { font-size: 14px; color: var(--ink); font-family: var(--font-sans); font-weight: 500; }

  .rp-section {
    border-top: 1px solid var(--hairline);
    padding-top: 20px;
    padding-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .rp-section:last-child { padding-bottom: 0; }

  .section-head { display: flex; align-items: center; gap: 7px; color: var(--body); }
  .section-title { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }

  /* ── Activity list ───────────────────────────────────────────────────────── */
  .activity-list { display: flex; flex-direction: column; }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .activity-item:last-child { border-bottom: none; }

  .act-icon {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .act-green { background: oklch(93% 0.06 152); color: oklch(38% 0.18 152); }
  .act-blue  { background: oklch(92% 0.05 264); color: oklch(42% 0.18 264); }
  .act-red   { background: oklch(93% 0.05 28);  color: oklch(42% 0.22 28); }
  .act-muted { background: var(--canvas-soft-2); color: var(--mute); }

  .act-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .act-desc { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .act-date { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); }
  .act-empty { font-size: 13px; color: var(--mute); padding: 8px 0; }

  /* ── Hardware section ─────────────────────────────────────────────────── */
  .hw-head { justify-content: flex-start; }
  .component-list { display: flex; flex-direction: column; border-top: 1px solid var(--hairline); }
  .component-summary { display: grid; grid-template-columns: 90px 1fr auto; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--hairline); font-size: 12px; align-items: center; }
  .component-summary small { color: var(--mute); font-family: var(--font-mono); }
  .hw-upload-btn {
    margin-left: auto; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
    padding: 4px 10px; border-radius: var(--r-sm, 6px);
    background: var(--canvas); color: var(--ink); border: 1px solid var(--hairline-strong);
  }
  .hw-upload-btn:hover { background: var(--canvas-soft); }
  .hw-err { font-size: 12px; color: var(--error); margin-bottom: 8px; }
  .hw-baseline-meta { font-size: 12px; color: var(--mute); margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  .hw-link {
    font: inherit; font-size: 12px; color: var(--link); background: none; border: none;
    cursor: pointer; padding: 0; text-decoration: underline;
  }
  .hw-link:disabled { color: var(--mute); cursor: default; }
  .hw-history-title { font-size: 12px; font-weight: 600; color: var(--body); margin: 14px 0 6px; }
  .hw-history { display: flex; flex-direction: column; }
  .hw-row {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 0; border-top: 1px solid var(--hairline);
  }
  .hw-row-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .hw-row-file { font-size: 12.5px; color: var(--ink); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hw-row-meta { font-size: 12px; color: var(--mute); }
  .hw-row-side { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .hw-raw-modal { width: min(920px, 94vw); height: min(80vh, 800px); display: flex; flex-direction: column; }
  .hw-raw-frame { flex: 1; width: 100%; border: none; border-radius: 0 0 var(--r-md, 8px) var(--r-md, 8px); background: #fff; }

  /* ── Badges ──────────────────────────────────────────────────────────────── */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 500;
    font-family: var(--font-sans);
    white-space: nowrap;
    width: fit-content;
  }

  .badge-green  { background: oklch(93% 0.06 152); color: oklch(38% 0.18 152); }
  .badge-blue   { background: oklch(92% 0.05 264); color: oklch(42% 0.18 264); }
  .badge-orange { background: oklch(93% 0.07 60);  color: oklch(48% 0.18 50); }
  .badge-red    { background: oklch(93% 0.05 28);  color: oklch(42% 0.22 28); }
  .badge-muted  { background: var(--canvas-soft-2); color: var(--mute); }

  /* ── Status pill ──────────────────────────────────────────────────────────── */
  .status-pill {
    display: inline-flex; align-items: center;
    padding: 2px 10px; border-radius: 999px;
    font-size: 11.5px; font-weight: 600; font-family: var(--font-sans);
  }
  .pill-lost   { background: oklch(93% 0.07 60); color: oklch(40% 0.18 55); border: 1px solid oklch(82% 0.12 60); }
  .pill-stolen { background: oklch(93% 0.05 28); color: oklch(40% 0.22 28); border: 1px solid oklch(80% 0.10 28); }

  /* ── Status banner ────────────────────────────────────────────────────────── */
  .status-banner {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 11px 16px; border-radius: var(--r-md);
    font-size: 13px; line-height: 1.5; font-family: var(--font-sans);
  }
  .banner-lost   { background: oklch(94% 0.06 60); border: 1px solid oklch(82% 0.12 60); color: oklch(38% 0.18 55); }
  .banner-stolen { background: oklch(93% 0.05 28); border: 1px solid oklch(80% 0.10 28); color: oklch(38% 0.22 28); }

  /* ── Recover button ───────────────────────────────────────────────────────── */
  .btn-recover {
    display: flex; align-items: center; gap: 6px;
    padding: 0 12px; height: 32px;
    border-radius: var(--r-md); border: 1px solid oklch(78% 0.10 152);
    background: oklch(93% 0.06 152); color: oklch(35% 0.15 152);
    font-family: var(--font-sans); font-size: 13px; font-weight: 500;
    cursor: pointer; white-space: nowrap; transition: background 120ms ease;
  }
  .btn-recover:hover { background: oklch(89% 0.08 152); }

  /* ── Return button ────────────────────────────────────────────────────────── */
  .btn-return {
    border-color: oklch(75% 0.10 264) !important;
    color: oklch(40% 0.18 264) !important;
    background: oklch(94% 0.04 264) !important;
  }
  .btn-return:hover { background: oklch(90% 0.06 264) !important; }

  /* ── Warn button (Report Lost) ────────────────────────────────────────────── */
  .btn-warn {
    border-color: oklch(78% 0.12 60) !important;
    color: oklch(40% 0.18 55) !important;
    background: oklch(94% 0.06 60) !important;
  }
  .btn-warn:hover { background: oklch(90% 0.08 60) !important; }

  /* ── Form helpers (for modals) ────────────────────────────────────────────── */
  .form-row { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: 12px; font-weight: 500; color: var(--body); }

  /* ── Utility ─────────────────────────────────────────────────────────────── */
  .mono { font-family: var(--font-mono); font-size: 12.5px; letter-spacing: 0.4px; }

  /* ── Not found ───────────────────────────────────────────────────────────── */
  .not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px 24px;
    text-align: center;
  }

  .nf-title { font-size: 18px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .nf-sub { font-size: 13.5px; color: var(--mute); font-family: var(--font-sans); max-width: 320px; }

  /* ── Modal ───────────────────────────────────────────────────────────────── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: oklch(0% 0 0 / 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 20px;
  }

  .modal {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l3);
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-sm { max-width: 400px; }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--hairline);
    flex-shrink: 0;
  }

  .modal-title { font-size: 14px; font-weight: 600; color: var(--ink); }

  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--mute);
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: var(--r-xs);
    transition: color 100ms ease;
  }
  .modal-close:hover { color: var(--ink); }

  .modal-body { padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }

  .modal-foot {
    padding: 12px 18px;
    border-top: 1px solid var(--hairline);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }

  .form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  .form-row { display: flex; flex-direction: column; gap: 5px; }

  .form-label { font-size: 12px; font-weight: 500; color: var(--body); }

  .form-input, .form-select {
    padding: 7px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    width: 100%;
  }
  .form-input:focus, .form-select:focus { outline: none; border-color: var(--link); }

  .form-ta {
    padding: 7px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    resize: vertical;
    width: 100%;
    line-height: 1.5;
  }
  .form-ta:focus { outline: none; border-color: var(--link); }

  .form-err {
    font-size: 12px;
    color: var(--error);
    padding: 7px 10px;
    background: var(--error-soft);
    border-radius: var(--r-md);
  }

  .del-msg { font-size: 14px; color: var(--body); line-height: 1.6; }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 960px) {
    .main-card { grid-template-columns: 1fr; min-height: auto; }
    .left-panel { border-right: none; border-bottom: 1px solid var(--hairline); }
    .img-area { min-height: 200px; }
  }

  @media (max-width: 600px) {
    .field-grid { grid-template-columns: 1fr; gap: 16px; }
    .top-strip { flex-direction: column; align-items: flex-start; gap: 8px; }
    .action-btns { width: 100%; }
    .form-2col { grid-template-columns: 1fr; }
  }
</style>
