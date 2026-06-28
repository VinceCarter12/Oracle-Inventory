<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  // ── Types ────────────────────────────────────────────────────────────────────

  type EmpSource = 'imported' | 'excel' | 'zoho' | 'manual';

  interface Assignment {
    id:         string;
    status:     string;
    assignedAt: string;
    asset: {
      id:           string;
      name:         string;
      serialNumber: string | null;
      condition:    string | null;
      category:     { name: string } | null;
    };
  }

  interface Employee {
    id:           string;
    name:         string;
    email:        string | null;
    phone:        string | null;
    employeeId:   string | null;
    isActive:     boolean;
    source:       EmpSource;
    createdAt:    string;
    branch:       { id: string; name: string } | null;
    department:   { id: string; name: string } | null;
    assignments:  Assignment[];
  }

  interface Branch     { id: string; name: string; }
  interface Department { id: string; name: string; }

  // ── Load state ───────────────────────────────────────────────────────────────

  let employee   = $state<Employee | null>(null);
  let branches   = $state<Branch[]>([]);
  let departments = $state<Department[]>([]);
  let loading    = $state(true);
  let loadErr    = $state('');

  const empId = $derived($page.params.id);

  // ── Edit state ───────────────────────────────────────────────────────────────

  let editMode = $state(false);
  let saving   = $state(false);
  let saveErr  = $state('');
  let draft    = $state({ name: '', employeeId: '', email: '', phone: '', branchId: '', departmentId: '' });

  // ── Modal state ──────────────────────────────────────────────────────────────

  let showConfirmDelete = $state(false);
  let deleting          = $state(false);
  let deleteErr         = $state('');
  let togglingStatus    = $state(false);

  // ── Load ─────────────────────────────────────────────────────────────────────

  onMount(async () => {
    try {
      [employee, branches, departments] = await Promise.all([
        api.get<Employee>(`/api/employees/${empId}`),
        api.get<Branch[]>('/api/branches'),
        api.get<Department[]>('/api/departments'),
      ]);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }

  const AVATAR_COLORS = [
    'oklch(52% 0.21 264)', 'oklch(55% 0.18 210)', 'oklch(55% 0.19 155)',
    'oklch(52% 0.22 340)', 'oklch(60% 0.20 60)',  'oklch(48% 0.22 300)',
    'oklch(52% 0.16 55)',  'oklch(42% 0.18 240)', 'oklch(50% 0.18 180)',
    'oklch(44% 0.20 20)',
  ];

  function avatarColor(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const SOURCE_LABEL: Record<EmpSource, string> = { imported: 'Imported', excel: 'Imported', zoho: 'Zoho Directory', manual: 'Manual' };
  const SOURCE_CLASS: Record<EmpSource, string> = { imported: 'src-imported', excel: 'src-imported', zoho: 'src-zoho', manual: 'src-manual' };

  const activeAssignments   = $derived(employee?.assignments.filter(a => a.status === 'active')  ?? []);
  const returnedAssignments = $derived(employee?.assignments.filter(a => a.status !== 'active')  ?? []);

  // ── Edit ─────────────────────────────────────────────────────────────────────

  function startEdit() {
    if (!employee) return;
    draft = {
      name:         employee.name,
      employeeId:   employee.employeeId  ?? '',
      email:        employee.email       ?? '',
      phone:        employee.phone       ?? '',
      branchId:     employee.branch?.id  ?? '',
      departmentId: employee.department?.id ?? '',
    };
    saveErr  = '';
    editMode = true;
  }

  async function saveEdit() {
    if (!employee) return;
    saveErr = '';
    if (!draft.name.trim())       { saveErr = 'Name is required.'; return; }
    if (!draft.employeeId.trim()) { saveErr = 'Employee ID is required.'; return; }
    saving = true;
    try {
      employee = await api.put<Employee>(`/api/employees/${empId}`, {
        name:         draft.name.trim(),
        employeeId:   draft.employeeId.trim(),
        email:        draft.email.trim()        || null,
        phone:        draft.phone.trim()        || null,
        branchId:     draft.branchId            || null,
        departmentId: draft.departmentId        || null,
        isActive:     employee.isActive,
      });
      editMode = false;
    } catch (e) {
      saveErr = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  function discardEdit() { editMode = false; saveErr = ''; }

  // ── Status toggle ─────────────────────────────────────────────────────────────

  async function toggleStatus() {
    if (!employee) return;
    togglingStatus = true;
    try {
      employee = await api.patch<Employee>(`/api/employees/${empId}/status`, { isActive: !employee.isActive });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      togglingStatus = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    deleteErr = '';
    deleting  = true;
    try {
      await api.delete(`/api/employees/${empId}`);
      goto('/employees');
    } catch (e) {
      deleteErr = (e as Error).message;
      deleting  = false;
    }
  }
</script>

<!-- ── Delete confirmation ────────────────────────────────────────────────── -->
{#if showConfirmDelete}
<div class="modal-backdrop" onclick={() => { showConfirmDelete = false; deleteErr = ''; }}>
  <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <span class="modal-title">Delete Employee</span>
      <button class="modal-close" onclick={() => { showConfirmDelete = false; deleteErr = ''; }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="modal-body">
      {#if deleteErr}
        <div class="form-error">{deleteErr}</div>
      {:else}
        <p class="confirm-text">Permanently delete <strong>{employee?.name}</strong>? This cannot be undone.</p>
        <p class="confirm-sub">The employee record will be removed from the system. Any prior asset records referencing this employee will remain.</p>
      {/if}
      <div class="modal-foot">
        <button class="btn-ghost" onclick={() => { showConfirmDelete = false; deleteErr = ''; }}>Cancel</button>
        {#if !deleteErr}
          <button class="btn-danger" onclick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete employee'}</button>
        {/if}
      </div>
    </div>
  </div>
</div>
{/if}

<!-- ── Edit bar ───────────────────────────────────────────────────────────── -->
{#if editMode}
<div class="edit-bar">
  <div class="eb-indicator">
    <span class="eb-dot"></span>
    <span class="eb-label">Editing employee</span>
  </div>
  {#if saveErr}<span class="eb-err">{saveErr}</span>{/if}
  <div class="eb-actions">
    <button class="eb-discard" onclick={discardEdit}>Discard</button>
    <button class="eb-save" onclick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
  </div>
</div>
{/if}

<!-- ── Page content ───────────────────────────────────────────────────────── -->
{#if loading}
  <div class="loading-state">Loading employee…</div>

{:else if loadErr}
  <div class="error-state">
    <p>Failed to load employee: {loadErr}</p>
    <button class="btn-ghost" onclick={() => goto('/employees')}>← Back to Employees</button>
  </div>

{:else if !employee}
  <div class="error-state">
    <p>Employee not found.</p>
    <button class="btn-ghost" onclick={() => goto('/employees')}>← Back to Employees</button>
  </div>

{:else}
<div class="page">

  <!-- Top strip -->
  <div class="top-strip">
    <nav class="breadcrumb">
      <button class="bc-link" onclick={() => goto('/employees')}>Employees</button>
      <span class="bc-sep">›</span>
      <span class="bc-cur">{employee.name}</span>
    </nav>
    <div class="top-actions">
      {#if can('manage_stock')}
        <button class="btn-ghost btn-ghost-warn" onclick={() => { deleteErr = ''; showConfirmDelete = true; }}>Delete</button>
        <button class="btn-ghost" onclick={toggleStatus} disabled={togglingStatus}>
          {employee.isActive ? 'Disable' : 'Enable'}
        </button>
        <button class="btn-primary" onclick={startEdit}>Edit</button>
      {/if}
    </div>
  </div>

  <!-- Main grid -->
  <div class="main-grid">

    <!-- Left col -->
    <div class="left-col">

      <!-- Profile card -->
      <div class="profile-card">
        <div class="profile-row">

          <!-- Avatar panel -->
          <div class="avatar-panel">
            <div class="avatar-circle" style="background:{avatarColor(employee.id)}">{initials(employee.name)}</div>
            {#if editMode}
              <input class="ap-input ap-name-input" bind:value={draft.name} placeholder="Full name" />
            {:else}
              <span class="prof-name">{employee.name}</span>
            {/if}
            <span class="emp-id-text">{employee.employeeId ?? '—'}</span>
            <span class="status-badge" class:status-active={employee.isActive} class:status-inactive={!employee.isActive}>
              {employee.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <!-- Field grid -->
          <div class="field-grid">
            <div class="fc">
              <span class="fl">EMPLOYEE ID</span>
              {#if editMode}
                <input class="fc-input" bind:value={draft.employeeId} placeholder="EMP-001" />
              {:else}
                <span class="fv fv-mono" class:fv-mute={!employee.employeeId}>{employee.employeeId ?? '—'}</span>
              {/if}
            </div>
            <div class="fc">
              <span class="fl">SOURCE</span>
              <span class="src-badge {SOURCE_CLASS[employee.source ?? 'manual']}">{SOURCE_LABEL[employee.source ?? 'manual']}</span>
            </div>
            <div class="fc">
              <span class="fl">EMAIL</span>
              {#if editMode}
                <input class="fc-input" bind:value={draft.email} type="email" placeholder="email@company.com" />
              {:else}
                <span class="fv" class:fv-mute={!employee.email}>{employee.email ?? '—'}</span>
              {/if}
            </div>
            <div class="fc">
              <span class="fl">PHONE</span>
              {#if editMode}
                <input class="fc-input" bind:value={draft.phone} type="tel" placeholder="+63 912 345 6789" />
              {:else}
                <span class="fv" class:fv-mute={!employee.phone}>{employee.phone ?? '—'}</span>
              {/if}
            </div>
            <div class="fc">
              <span class="fl">DEPARTMENT</span>
              {#if editMode}
                <select class="fc-select" bind:value={draft.departmentId}>
                  <option value="">— None —</option>
                  {#each departments as d}
                    <option value={d.id}>{d.name}</option>
                  {/each}
                </select>
              {:else}
                <span class="fv" class:fv-mute={!employee.department?.name}>{employee.department?.name ?? '—'}</span>
              {/if}
            </div>
            <div class="fc fc-last">
              <span class="fl">BRANCH</span>
              {#if editMode}
                <select class="fc-select" bind:value={draft.branchId}>
                  <option value="">— None —</option>
                  {#each branches as b}
                    <option value={b.id}>{b.name}</option>
                  {/each}
                </select>
              {:else}
                <span class="fv" class:fv-mute={!employee.branch?.name}>{employee.branch?.name ?? '—'}</span>
              {/if}
            </div>
            <div class="fc fc-last">
              <span class="fl">ADDED</span>
              <span class="fv">{formatDate(employee.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Active assignments -->
      <div class="section-card">
        <div class="section-head">
          <span class="section-title">Active Assignments</span>
          <span class="count-badge">{activeAssignments.length}</span>
        </div>
        {#if activeAssignments.length === 0}
          <div class="empty-section">No active asset assignments.</div>
        {:else}
          <div class="asset-list">
            {#each activeAssignments as a}
              <div class="asset-row" onclick={() => goto(`/assets/${a.asset.id}`)}>
                <div class="asset-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/>
                  </svg>
                </div>
                <div class="asset-info">
                  <span class="asset-name">{a.asset.name}</span>
                  <span class="asset-meta">
                    {#if a.asset.category?.name}<span class="asset-cat">{a.asset.category.name}</span>{/if}
                    {#if a.asset.serialNumber}<span class="asset-serial">S/N: {a.asset.serialNumber}</span>{/if}
                    {#if a.asset.condition}<span class="asset-cond">{a.asset.condition}</span>{/if}
                  </span>
                </div>
                <span class="asset-date">Since {formatDate(a.assignedAt)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Assignment history -->
      {#if returnedAssignments.length > 0}
      <div class="section-card">
        <div class="section-head">
          <span class="section-title">Assignment History</span>
          <span class="count-badge count-muted">{returnedAssignments.length}</span>
        </div>
        <div class="asset-list">
          {#each returnedAssignments as a}
            <div class="asset-row asset-row-muted" onclick={() => goto(`/assets/${a.asset.id}`)}>
              <div class="asset-icon asset-icon-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/>
                </svg>
              </div>
              <div class="asset-info">
                <span class="asset-name" style="color:var(--mute)">{a.asset.name}</span>
                <span class="asset-meta">
                  {#if a.asset.category?.name}<span class="asset-cat">{a.asset.category.name}</span>{/if}
                  {#if a.asset.serialNumber}<span class="asset-serial">S/N: {a.asset.serialNumber}</span>{/if}
                  <span class="asset-returned-badge">Returned</span>
                </span>
              </div>
              <span class="asset-date">{formatDate(a.assignedAt)}</span>
            </div>
          {/each}
        </div>
      </div>
      {/if}

    </div>

  </div>
</div>
{/if}

<style>
  /* ── States ─────────────────────────────────────────────────────────────── */
  .loading-state { padding: 64px 24px; text-align: center; font-size: 14px; color: var(--mute); font-family: var(--font-sans); }
  .error-state   { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 80px 24px; text-align: center; font-family: var(--font-sans); }
  .error-state p { font-size: 14px; color: var(--body); margin: 0; }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn-ghost { padding: 7px 14px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: transparent; font-size: 13px; font-family: var(--font-sans); color: var(--body); cursor: pointer; transition: background 120ms ease; }
  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: default; }
  .btn-ghost-warn { color: var(--error-deep); border-color: oklch(88% 0.07 25); }
  .btn-ghost-warn:hover { background: var(--error-soft); }
  .btn-primary { padding: 7px 14px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-size: 13px; font-weight: 500; font-family: var(--font-sans); cursor: pointer; transition: opacity 120ms ease; }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-danger { padding: 7px 14px; background: var(--error); color: #fff; border: none; border-radius: var(--r-md); font-size: 13px; font-weight: 500; font-family: var(--font-sans); cursor: pointer; transition: opacity 120ms ease; }
  .btn-danger:hover:not(:disabled) { opacity: 0.85; }
  .btn-danger:disabled { opacity: 0.5; cursor: default; }

  /* ── Edit bar ───────────────────────────────────────────────────────────── */
  .edit-bar { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 12px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: 0 4px 24px oklch(0% 0 0 / 0.12); padding: 10px 14px; font-family: var(--font-sans); white-space: nowrap; }
  .eb-indicator { display: flex; align-items: center; gap: 7px; }
  .eb-dot  { width: 7px; height: 7px; border-radius: 999px; background: oklch(58% 0.20 155); flex-shrink: 0; }
  .eb-label { font-size: 13px; color: var(--body); font-weight: 500; }
  .eb-err  { font-size: 12px; color: var(--error-deep); }
  .eb-actions { display: flex; gap: 6px; }
  .eb-discard { padding: 6px 14px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: transparent; font-size: 13px; font-family: var(--font-sans); color: var(--body); cursor: pointer; }
  .eb-discard:hover { background: var(--canvas-soft-2); }
  .eb-save { padding: 6px 16px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-size: 13px; font-weight: 500; font-family: var(--font-sans); cursor: pointer; transition: opacity 120ms ease; }
  .eb-save:hover:not(:disabled) { opacity: 0.85; }
  .eb-save:disabled { opacity: 0.5; cursor: default; }

  /* ── Page ───────────────────────────────────────────────────────────────── */
  .page { display: flex; flex-direction: column; gap: 16px; width: 100%; }
  .top-strip { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0; }
  .breadcrumb { display: flex; align-items: center; gap: 6px; font-family: var(--font-sans); }
  .bc-link { background: none; border: none; cursor: pointer; padding: 0; font-size: 13.5px; color: var(--ink); font-weight: 600; font-family: var(--font-sans); transition: opacity 120ms ease; }
  .bc-link:hover { opacity: 0.65; }
  .bc-sep { font-size: 14px; color: var(--mute); }
  .bc-cur { font-size: 13.5px; color: var(--body); font-family: var(--font-sans); }
  .top-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* ── Main grid ──────────────────────────────────────────────────────────── */
  .main-grid { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
  .left-col  { display: flex; flex-direction: column; gap: 16px; }

  /* ── Profile card ───────────────────────────────────────────────────────── */
  .profile-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); overflow: hidden; }
  .profile-row  { display: grid; grid-template-columns: 176px 1fr; }
  .avatar-panel { background: var(--canvas-soft-2); border-right: 1px solid var(--hairline); padding: 28px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .avatar-circle { width: 64px; height: 64px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; font-family: var(--font-sans); color: oklch(99% 0.003 106); flex-shrink: 0; letter-spacing: 0.5px; margin-bottom: 4px; }
  .prof-name  { font-size: 15px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.3px; text-align: center; }
  .emp-id-text { font-size: 11.5px; color: var(--mute); font-family: var(--font-mono); text-align: center; }
  .ap-input { width: 100%; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-sm); outline: none; font-family: var(--font-sans); padding: 4px 8px; text-align: center; transition: border-color 120ms ease; box-sizing: border-box; }
  .ap-input:focus { border-color: var(--link); }
  .ap-name-input { font-size: 13.5px; font-weight: 600; color: var(--ink); }

  .field-grid { display: grid; grid-template-columns: 1fr 1fr; align-content: start; }
  .fc { display: flex; flex-direction: column; gap: 5px; padding: 14px 20px; border-bottom: 1px solid var(--hairline); border-right: 1px solid var(--hairline); }
  .fc:nth-child(2n) { border-right: none; }
  .fc.fc-last { border-bottom: none; }
  .fl  { font-size: 10px; font-weight: 600; color: var(--mute); font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.6px; }
  .fv  { font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .fv-mono { font-family: var(--font-mono); font-size: 12px; word-break: break-all; }
  .fv-mute { font-weight: 400; color: var(--mute); }
  .fc-input, .fc-select { width: 100%; padding: 5px 8px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas-soft); font-size: 13px; font-weight: 600; font-family: var(--font-sans); color: var(--ink); outline: none; transition: border-color 120ms ease; box-sizing: border-box; }
  .fc-input:focus, .fc-select:focus { border-color: var(--link); background: var(--canvas); }

  /* ── Status badge ───────────────────────────────────────────────────────── */
  .status-badge    { display: inline-block; font-size: 11.5px; font-weight: 500; padding: 2px 9px; border-radius: var(--r-full); font-family: var(--font-sans); }
  .status-active   { background: oklch(94% 0.07 155); color: oklch(35% 0.17 155); }
  .status-inactive { background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }

  /* ── Source badges ──────────────────────────────────────────────────────── */
  .src-badge     { display: inline-flex; padding: 2px 8px; border-radius: var(--r-sm); font-size: 11.5px; font-weight: 500; font-family: var(--font-sans); }
  .src-imported  { background: oklch(94% 0.04 250); color: oklch(35% 0.12 250); }
  .src-zoho      { background: oklch(94% 0.06 55);  color: oklch(40% 0.15 55); }
  .src-manual    { background: var(--canvas-soft-2); color: var(--mute); }

  /* ── Section card ───────────────────────────────────────────────────────── */
  .section-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); overflow: hidden; }
  .section-head { display: flex; align-items: center; gap: 8px; padding: 14px 20px; border-bottom: 1px solid var(--hairline); }
  .section-title { font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: var(--canvas-soft-2); border: 1px solid var(--hairline); color: var(--body); border-radius: 999px; font-size: 11px; font-weight: 600; font-family: var(--font-sans); }
  .count-muted { color: var(--mute); }
  .empty-section { padding: 24px 20px; font-size: 13px; color: var(--mute); font-family: var(--font-sans); }

  /* ── Asset list ─────────────────────────────────────────────────────────── */
  .asset-list { display: flex; flex-direction: column; }
  .asset-row { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--hairline); cursor: pointer; transition: background 100ms ease; }
  .asset-row:last-child { border-bottom: none; }
  .asset-row:hover { background: var(--canvas-soft); }
  .asset-row-muted { opacity: 0.75; }
  .asset-icon { width: 32px; height: 32px; border-radius: var(--r-md); background: var(--canvas-soft-2); display: flex; align-items: center; justify-content: center; color: var(--body); flex-shrink: 0; }
  .asset-icon-muted { color: var(--mute); }
  .asset-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .asset-name { font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .asset-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .asset-cat  { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); }
  .asset-serial { font-size: 11.5px; color: var(--mute); font-family: var(--font-mono); }
  .asset-cond { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); text-transform: capitalize; }
  .asset-returned-badge { display: inline-flex; padding: 1px 6px; border-radius: var(--r-sm); font-size: 10.5px; font-weight: 500; font-family: var(--font-sans); background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }
  .asset-date { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); white-space: nowrap; flex-shrink: 0; }

  /* ── Modal ──────────────────────────────────────────────────────────────── */
  .modal-backdrop { position: fixed; inset: 0; background: oklch(0% 0 0 / 0.45); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; }
  .modal { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-xl); box-shadow: 0 8px 40px oklch(0% 0 0 / 0.18); width: 100%; max-width: 440px; }
  .modal-head  { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--hairline); }
  .modal-title { font-size: 16px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.3px; }
  .modal-close { background: none; border: none; cursor: pointer; color: var(--mute); padding: 4px; border-radius: var(--r-sm); transition: background 120ms ease, color 120ms ease; }
  .modal-close:hover { background: var(--canvas-soft-2); color: var(--ink); }
  .modal-body  { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .modal-foot  { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--hairline); padding-top: 16px; }
  .form-error  { padding: 10px 12px; background: var(--error-soft); border: 1px solid oklch(88% 0.08 25); border-radius: var(--r-md); font-size: 13px; color: var(--error-deep); font-family: var(--font-sans); }
  .confirm-text { font-size: 14px; color: var(--body); font-family: var(--font-sans); margin: 0; line-height: 1.5; }
  .confirm-text strong { color: var(--ink); }
  .confirm-sub { font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); margin: 0; line-height: 1.5; }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .profile-row { grid-template-columns: 1fr; }
    .avatar-panel { border-right: none; border-bottom: 1px solid var(--hairline); }
    .top-strip { flex-direction: column; align-items: flex-start; }
    .edit-bar { width: calc(100% - 32px); flex-wrap: wrap; gap: 8px; justify-content: space-between; }
    .field-grid { grid-template-columns: 1fr; }
    .fc { border-right: none; }
  }
</style>
