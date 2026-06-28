<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import SearchInput from '$lib/components/SearchInput.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Modal from '$lib/components/Modal.svelte';

  // ── Types ─────────────────────────────────────────────────────────────────
  type EmpSource = 'imported' | 'excel' | 'zoho' | 'manual';

  interface Employee {
    id:          string;
    name:        string;
    email:       string | null;
    phone:       string | null;
    employeeId:  string | null;
    isActive:    boolean;
    source:      EmpSource;
    createdAt:   string;
    branch:      { id: string; name: string } | null;
    department:  { id: string; name: string } | null;
    assignments: { id: string; asset: { id: string; name: string } }[];
  }

  interface Branch     { id: string; name: string; }
  interface Department { id: string; name: string; }

  // ── State ──────────────────────────────────────────────────────────────────
  let employees   = $state<Employee[]>([]);
  let branches    = $state<Branch[]>([]);
  let departments = $state<Department[]>([]);
  let loading     = $state(true);
  let loadErr     = $state('');

  let search       = $state('');
  let filterBranch = $state('all');
  let filterDept   = $state('all');
  let filterSource = $state<'all' | EmpSource>('all');

  // ── Pagination ─────────────────────────────────────────────────────────────
  let currentPage = $state(1);
  let perPage     = $state(25);

  // ── Select mode ───────────────────────────────────────────────────────────
  let selectMode   = $state(false);
  let selectedIds  = $state(new Set<string>());
  let bulkDeleting = $state(false);

  const someSelected = $derived(selectedIds.size > 0);

  function toggleSelectMode() { selectMode = !selectMode; if (!selectMode) selectedIds = new Set(); }
  function clearSelection()   { selectedIds = new Set(); selectMode = false; }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
  }

  function toggleAll() {
    const next = new Set(selectedIds);
    const allOnPage = paginated.every(e => next.has(e.id));
    if (allOnPage) paginated.forEach(e => next.delete(e.id));
    else           paginated.forEach(e => next.add(e.id));
    selectedIds = next;
  }

  async function deleteSelected() {
    bulkDeleting = true;
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => api.delete(`/api/employees/${id}`)));
      employees = employees.filter(e => !selectedIds.has(e.id));
      clearSelection();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      bulkDeleting = false;
    }
  }

  // ── Add Staff modal ────────────────────────────────────────────────────────
  let showAdd = $state(false);
  let adding  = $state(false);
  let addErr  = $state('');
  let addForm = $state({ name: '', employeeId: '', branchId: '', departmentId: '', email: '', phone: '' });

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = $derived(
    employees.filter(e => {
      const q = search.toLowerCase();
      const matchSearch = !q
        || e.name.toLowerCase().includes(q)
        || (e.email ?? '').toLowerCase().includes(q)
        || (e.employeeId ?? '').toLowerCase().includes(q);
      const matchBranch = filterBranch === 'all' || e.branch?.id === filterBranch;
      const matchDept   = filterDept   === 'all' || e.department?.id === filterDept;
      const matchSource = filterSource === 'all'
        || (filterSource === 'imported' && (e.source === 'imported' || e.source === 'excel'))
        || (filterSource !== 'imported' && e.source === filterSource);
      return matchSearch && matchBranch && matchDept && matchSource;
    })
  );

  const totalPages  = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const paginated   = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));
  const allSelected = $derived(paginated.length > 0 && paginated.every(e => selectedIds.has(e.id)));

  const totalActive     = $derived(employees.filter(e => e.isActive).length);
  const totalWithAssets = $derived(employees.filter(e => e.assignments.length > 0).length);

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      const [empData, branchData, deptData] = await Promise.all([
        api.get<Employee[]>('/api/employees'),
        api.get<Branch[]>('/api/branches'),
        api.get<Department[]>('/api/departments'),
      ]);
      employees   = empData;
      branches    = branchData;
      departments = deptData;
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  // ── Add Staff ─────────────────────────────────────────────────────────────
  function openAdd() {
    addForm = { name: '', employeeId: '', branchId: '', departmentId: '', email: '', phone: '' };
    addErr = '';
    showAdd = true;
  }

  async function saveAdd() {
    if (!addForm.name.trim())       { addErr = 'Name is required.'; return; }
    if (!addForm.employeeId.trim()) { addErr = 'Employee ID is required.'; return; }
    adding = true; addErr = '';
    try {
      const created = await api.post<Employee>('/api/employees', {
        name:         addForm.name.trim(),
        employeeId:   addForm.employeeId.trim(),
        branchId:     addForm.branchId     || null,
        departmentId: addForm.departmentId || null,
        email:        addForm.email.trim() || null,
        phone:        addForm.phone.trim() || null,
      });
      employees = [created, ...employees];
      showAdd = false;
    } catch (e) { addErr = (e as Error).message; }
    finally { adding = false; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return iso; }
  }

  function resetPage() { currentPage = 1; }

  const SOURCE_LABEL: Record<EmpSource, string> = { imported: 'Imported', excel: 'Imported', zoho: 'Zoho', manual: 'Manual' };
  const SOURCE_CLASS: Record<EmpSource, string> = { imported: 'src-imported', excel: 'src-imported', zoho: 'src-zoho', manual: 'src-manual' };
</script>

<!-- ── Add Staff Modal ────────────────────────────────────────────────────── -->
<Modal bind:open={showAdd} title="Add Staff Record" onclose={() => (addErr = '')}>
  <p class="modal-note">Staff records are asset holders — they do not have login access to this system.</p>
  {#if addErr}<div class="form-err">{addErr}</div>{/if}
  <div class="form-grid">
    <div class="field">
      <label class="field-label">Full Name <span class="req">*</span></label>
      <input class="field-input" type="text" placeholder="Juan dela Cruz" bind:value={addForm.name} />
    </div>
    <div class="field">
      <label class="field-label">Employee ID <span class="req">*</span></label>
      <input class="field-input" type="text" placeholder="EMP-001" bind:value={addForm.employeeId} />
    </div>
    <div class="field">
      <label class="field-label">Branch</label>
      <select class="field-input" bind:value={addForm.branchId}>
        <option value="">— Select branch —</option>
        {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label class="field-label">Department</label>
      <select class="field-input" bind:value={addForm.departmentId}>
        <option value="">— Select department —</option>
        {#each departments as d}<option value={d.id}>{d.name}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label class="field-label">Email</label>
      <input class="field-input" type="email" placeholder="juan@company.com" bind:value={addForm.email} />
    </div>
    <div class="field">
      <label class="field-label">Phone</label>
      <input class="field-input" type="text" placeholder="+63 912 345 6789" bind:value={addForm.phone} />
    </div>
  </div>

  {#snippet footer()}
    <button class="btn-ghost" onclick={() => { showAdd = false; addErr = ''; }} disabled={adding}>Cancel</button>
    <button class="btn-primary" onclick={saveAdd} disabled={adding}>
      {adding ? 'Saving…' : 'Add Staff Record'}
    </button>
  {/snippet}
</Modal>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->
<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Employees' }]} />

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Employees</h1>
      <p class="page-sub">Asset holders — not login accounts. Created via Excel import or entered manually.</p>
    </div>
    {#if can('manage_stock')}
      <button class="btn-primary" onclick={openAdd}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Add Staff
      </button>
    {/if}
  </div>

  <!-- Stats row -->
  <div class="stats-row">
    <StatCard value={loading ? '—' : employees.length} label="Total Employees" helper="All staff records">
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      {/snippet}
    </StatCard>
    <StatCard value={loading ? '—' : totalActive} label="Active" helper="Currently active">
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      {/snippet}
    </StatCard>
    <StatCard value={loading ? '—' : totalWithAssets} label="With Assets" helper="Has active assignments">
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/>
        </svg>
      {/snippet}
    </StatCard>
  </div>

  <!-- Table card -->
  <div class="card table-card">
    {#if someSelected}
      <div class="bulk-bar">
        <span class="bulk-count">{selectedIds.size} Selected</span>
        <div class="bulk-actions">
          {#if can('manage_stock')}
            <button class="bulk-btn bulk-danger" onclick={deleteSelected} disabled={bulkDeleting}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              {bulkDeleting ? 'Deleting…' : 'Delete'}
            </button>
          {/if}
          <button class="bulk-close" onclick={clearSelection} aria-label="Clear selection">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    {/if}

    <!-- Toolbar / filters -->
    <div class="toolbar">
      <SearchInput bind:value={search} placeholder="Search name, email, or employee ID…" oninput={resetPage} />
      {#if can('manage_stock')}
        <button class="tool-edit-btn" class:tool-edit-btn--active={selectMode} onclick={toggleSelectMode}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="4" height="4" rx="0.5"/><line x1="9" y1="7" x2="21" y2="7"/><rect x="3" y="11" width="4" height="4" rx="0.5"/><line x1="9" y1="13" x2="21" y2="13"/><rect x="3" y="17" width="4" height="4" rx="0.5"/><line x1="9" y1="19" x2="21" y2="19"/></svg>
          Edit
        </button>
      {/if}
      <select class="filter-select" bind:value={filterSource} onchange={resetPage}>
        <option value="all">All Sources</option>
        <option value="imported">Imported</option>
        <option value="zoho">Zoho Directory</option>
        <option value="manual">Manual</option>
      </select>
      <select class="filter-select" bind:value={filterBranch} onchange={resetPage}>
        <option value="all">All Branches</option>
        {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
      </select>
      <select class="filter-select" bind:value={filterDept} onchange={resetPage}>
        <option value="all">All Departments</option>
        {#each departments as d}<option value={d.id}>{d.name}</option>{/each}
      </select>
    </div>

    {#if loading}
      <div class="state-cell">Loading employee records…</div>
    {:else if loadErr}
      <div class="state-cell" style="color:var(--error)">{loadErr}</div>
    {:else if employees.length === 0}
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="color:var(--hairline-strong)" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p class="empty-title">No employee records yet</p>
        <p class="empty-sub">Import an Excel file with an <strong>Assigned To</strong> column to auto-create employee records, or add them manually.</p>
        <div class="empty-actions">
          {#if can('import_inventory')}
            <button class="btn-primary" onclick={() => goto('/assets/import')}>Import Assets</button>
          {/if}
          {#if can('manage_stock')}
            <button class="btn-ghost" onclick={openAdd}>Add Staff Manually</button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {#if selectMode}
                <th class="th-check">
                  <input type="checkbox" class="row-check" checked={allSelected} indeterminate={someSelected && !allSelected} onchange={toggleAll} onclick={(e) => e.stopPropagation()} />
                </th>
              {/if}
              <th>Name</th>
              <th>Employee ID</th>
              <th>Source</th>
              <th>Department</th>
              <th>Branch</th>
              <th>Email</th>
              <th>Assets</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {#each paginated as emp}
              <tr class="row row-link" class:row-selected={selectedIds.has(emp.id)}
                onclick={() => selectMode ? toggleSelect(emp.id) : goto(`/employees/${emp.id}`)}>
                {#if selectMode}
                  <td class="td-check" onclick={(e) => { e.stopPropagation(); toggleSelect(emp.id); }}>
                    <input type="checkbox" class="row-check" checked={selectedIds.has(emp.id)} onchange={() => toggleSelect(emp.id)} onclick={(e) => e.stopPropagation()} />
                  </td>
                {/if}
                <td class="cell-name">
                  <span class="avatar">{emp.name.charAt(0).toUpperCase()}</span>
                  <span class="name-text">{emp.name}</span>
                  {#if !emp.isActive}<span class="badge badge-muted">Inactive</span>{/if}
                </td>
                <td class="cell-mono">{emp.employeeId ?? '—'}</td>
                <td>
                  <span class="src-badge {SOURCE_CLASS[emp.source ?? 'manual']}">{SOURCE_LABEL[emp.source ?? 'manual']}</span>
                </td>
                <td>{emp.department?.name ?? '—'}</td>
                <td>{emp.branch?.name ?? '—'}</td>
                <td class="cell-email">{emp.email ?? '—'}</td>
                <td class="td-num">
                  {#if emp.assignments.length === 0}
                    <span style="color:var(--mute)">—</span>
                  {:else}
                    <span class="asset-count">{emp.assignments.length}</span>
                  {/if}
                </td>
                <td class="cell-date">{fmtDate(emp.createdAt)}</td>
              </tr>
            {/each}
            {#if filtered.length === 0}
              <tr><td colspan="9" class="empty-cell">No employees match your filters.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      <Pagination bind:currentPage bind:perPage {totalPages} onchange={resetPage} />
    {/if}
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 64px); min-height: 0; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-md); flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary);
    transition: opacity 120ms ease; line-height: 1;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Stats */
  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

  /* Table card */
  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .table-card { overflow: hidden; display: flex; flex-direction: column; flex: 1; min-height: 0; }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; }
  .filter-select {
    height: 34px; padding: 0 28px 0 10px;
    border: 1px solid var(--hairline); border-radius: var(--r-md);
    background: var(--canvas); font-size: 13px; font-family: var(--font-sans);
    color: var(--body); cursor: pointer; outline: none; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 9px center;
  }
  .filter-select:focus { border-color: var(--link); }

  .tool-edit-btn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 34px; padding: 0 12px; border-radius: var(--r-md);
    border: 1px solid var(--hairline); background: var(--canvas);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    color: var(--body); cursor: pointer; white-space: nowrap;
    transition: background 100ms ease, border-color 100ms ease;
  }
  .tool-edit-btn:hover { background: var(--canvas-soft-2); }
  .tool-edit-btn--active { background: var(--ink); color: var(--on-primary); border-color: var(--ink); }
  .tool-edit-btn--active:hover { background: var(--ink); opacity: 0.88; }

  /* Bulk bar */
  .bulk-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--canvas-soft-2); border-bottom: 1px solid var(--hairline); gap: 12px; }
  .bulk-count { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .bulk-actions { display: flex; align-items: center; gap: 6px; }
  .bulk-btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: var(--r-sm); font-size: 12.5px; font-weight: 500; font-family: var(--font-sans); cursor: pointer; border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); transition: background 100ms ease; }
  .bulk-btn:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .bulk-danger { border-color: var(--error); background: var(--error-soft); color: var(--error); }
  .bulk-danger:hover:not(:disabled) { background: oklch(90% 0.06 28); }
  .bulk-close { width: 28px; height: 28px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; border: 1px solid var(--hairline); background: var(--canvas); color: var(--mute); cursor: pointer; transition: background 100ms ease; }
  .bulk-close:hover { background: var(--canvas-soft-2); color: var(--ink); }

  /* Checkbox */
  .th-check { width: 40px; padding-left: 16px; }
  .td-check  { width: 40px; padding-left: 16px; cursor: default; }
  .row-check { cursor: pointer; width: 14px; height: 14px; accent-color: var(--ink); }
  .row-selected td { background: oklch(97% 0.02 264) !important; }

  /* States */
  .state-cell { padding: 40px 16px; text-align: center; color: var(--mute); font-size: 13px; font-family: var(--font-sans); }
  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 64px 24px; text-align: center; }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); margin: 0; }
  .empty-sub { font-size: 13px; color: var(--mute); margin: 0; max-width: 380px; line-height: 1.5; font-family: var(--font-sans); }
  .empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }

  /* Table */
  .table-wrap { overflow-x: auto; overflow-y: auto; flex: 1; min-height: 0; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid var(--hairline); }
  th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; background: var(--canvas-soft); position: sticky; top: 0; z-index: 2; }
  td { padding: 0 16px; font-size: 13px; color: var(--ink); border-bottom: 1px solid var(--hairline); vertical-align: middle; height: 52px; }
  tbody tr:last-child td { border-bottom: none; }
  .row { transition: background 100ms ease; }
  .row:hover td { background: var(--canvas-soft); }
  .row-link { cursor: pointer; }
  .td-num { font-weight: 500; }
  .empty-cell { text-align: center; color: var(--mute); font-size: 13px; padding: 32px 16px !important; height: auto !important; }

  /* Cells */
  .cell-name  { display: flex; align-items: center; gap: 9px; height: 52px; }
  .avatar     { width: 28px; height: 28px; border-radius: 999px; background: var(--ink); color: var(--on-primary); font-size: 11px; font-weight: 700; font-family: var(--font-sans); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .name-text  { font-weight: 600; font-size: 13px; color: var(--ink); }
  .cell-mono  { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--mute); }
  .cell-email { font-size: 12px; color: var(--body); }
  .cell-date  { font-size: 12px; color: var(--mute); white-space: nowrap; }
  .asset-count { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: var(--canvas-soft-2); border: 1px solid var(--hairline); color: var(--body); border-radius: 999px; font-size: 11.5px; font-weight: 600; font-family: var(--font-sans); }

  /* Badges */
  .src-badge { display: inline-flex; padding: 2px 8px; border-radius: var(--r-sm); font-size: 11.5px; font-weight: 500; font-family: var(--font-sans); }
  .src-imported { background: oklch(94% 0.04 250); color: oklch(35% 0.12 250); }
  .src-zoho     { background: oklch(94% 0.06 55);  color: oklch(40% 0.15 55); }
  .src-manual   { background: var(--canvas-soft-2); color: var(--mute); }
  .badge        { display: inline-flex; padding: 2px 8px; border-radius: var(--r-sm); font-size: 11px; font-weight: 500; font-family: var(--font-sans); }
  .badge-muted  { background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }

  /* Modal form */
  .modal-note { font-size: 12.5px; color: var(--mute); margin: 0; font-family: var(--font-sans); }
  .form-err   { font-size: 12.5px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 8px 12px; }
  .form-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field      { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .req        { color: var(--error); }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-size: 13px; font-family: var(--font-sans); outline: none; width: 100%; box-sizing: border-box; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } .form-grid { grid-template-columns: 1fr; } }
</style>
