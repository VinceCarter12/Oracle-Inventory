<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import Modal from '$lib/components/Modal.svelte';

  type Branch = { id: string; name: string };
  type Employee = { id: string; name: string; employeeId: string | null; email: string | null; position: string | null; isActive: boolean; branch: Branch | null };
  type Department = { id: string; name: string; archivedAt: string | null; createdAt: string; branch: Branch; employees: Employee[]; _count: { employees: number } };

  const departmentId = $derived($page.params.id);
  let department = $state<Department | null>(null);
  let siblingDepartments = $state<{ id: string; name: string; archivedAt: string | null }[]>([]);
  let loading = $state(true);
  let loadErr = $state('');

  let showRename = $state(false); let renameName = $state(''); let renaming = $state(false); let renameErr = $state('');
  let showArchive = $state(false); let archivePending = $state(false); let archiving = $state(false); let archiveErr = $state('');
  let showDelete = $state(false); let deleting = $state(false); let deleteErr = $state('');
  let resolution = $state<'reassign' | 'clear' | ''>(''); let targetId = $state('');

  async function load() {
    loading = true; loadErr = '';
    try {
      department = await api.get<Department>(`/api/departments/${departmentId}`);
      const all = await api.get<{ id: string; name: string; archivedAt: string | null; branch: Branch }[]>('/api/departments?includeArchived=true');
      siblingDepartments = all.filter((d) => d.id !== departmentId && !d.archivedAt && d.branch.id === department?.branch.id);
    } catch (e) { loadErr = (e as Error).message || 'Department could not be loaded.'; }
    finally { loading = false; }
  }
  onMount(load);

  function openRename() { if (!department) return; renameName = department.name; renameErr = ''; showRename = true; }
  async function rename() {
    if (!department || !renameName.trim()) { renameErr = 'Department name is required.'; return; }
    renaming = true; renameErr = '';
    try { department = await api.patch<Department>(`/api/departments/${department.id}`, { name: renameName.trim() }); showRename = false; }
    catch (e) { renameErr = (e as Error).message; }
    finally { renaming = false; }
  }

  function openArchive() {
    if (!department) return;
    archivePending = !department.archivedAt;
    resolution = ''; targetId = ''; archiveErr = '';
    showArchive = true;
  }
  async function toggleArchive() {
    if (!department) return;
    if (archivePending && department.employees.length && (!resolution || (resolution === 'reassign' && !targetId))) {
      archiveErr = 'Choose exactly one employee resolution.'; return;
    }
    archiving = true; archiveErr = '';
    try {
      department = await api.patch<Department>(`/api/departments/${department.id}`, {
        archived: !department.archivedAt,
        resolution: resolution || undefined,
        targetDepartmentId: targetId || undefined,
      });
      showArchive = false;
    } catch (e) { archiveErr = (e as Error).message; }
    finally { archiving = false; }
  }

  function openDelete() { resolution = ''; targetId = ''; deleteErr = ''; showDelete = true; }
  async function remove() {
    if (!department) return;
    if (department.employees.length && (!resolution || (resolution === 'reassign' && !targetId))) {
      deleteErr = 'Choose exactly one employee resolution.'; return;
    }
    deleting = true; deleteErr = '';
    try {
      await api.raw(`/api/departments/${department.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ resolution: resolution || undefined, targetDepartmentId: targetId || undefined }),
        headers: { 'Content-Type': 'application/json' },
      }).then(async (r) => {
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`); }
      });
      goto('/departments');
    } catch (e) { deleteErr = (e as Error).message; deleting = false; }
  }
</script>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/departments')}>Departments</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">{loading ? '…' : (department?.name ?? 'Not found')}</span>
  </nav>

  {#if loading}
    <div class="state-box">Loading department…</div>
  {:else if loadErr}
    <div class="state-box state-err">{loadErr}</div>
  {:else if !department}
    <div class="state-box">Department not found.</div>
  {:else}

  <div class="page-header">
    <div>
      <h1 class="page-title">{department.name}</h1>
      <p class="page-sub">{department.branch.name} · {department.archivedAt ? 'Archived' : 'Active'}</p>
    </div>
    {#if can('manage_users')}
    <div class="header-actions">
      <button class="btn-danger" onclick={openDelete}>Delete</button>
      <button class="btn-ghost" onclick={openArchive}>{department.archivedAt ? 'Unarchive' : 'Archive'}</button>
      <button class="btn-primary" onclick={openRename}>Edit name</button>
    </div>
    {/if}
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-label">Employees</div>
      <div class="stat-value">{department._count.employees}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Branch</div>
      <div class="stat-value" style="font-size:15px">{department.branch.name}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Added</div>
      <div class="stat-value" style="font-size:14px">{new Date(department.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
    </div>
  </div>

  <div class="card detail-card">
    <div class="card-header"><span class="card-title">Members</span></div>
    {#if department.employees.length}
      <ul class="member-list">
        {#each department.employees as e}
          <li><strong>{e.name}</strong><span>{e.position ?? e.email ?? 'No additional details'}</span></li>
        {/each}
      </ul>
    {:else}
      <p class="muted">No employees assigned.</p>
    {/if}
  </div>

  {/if}
</div>

<Modal bind:open={showRename} title="Edit department name" onclose={() => (renameErr = '')}>
  <div class="field"><label for="rename-input">Department name</label><input id="rename-input" class="field-input" bind:value={renameName} /></div>
  {#if renameErr}<div class="form-err">{renameErr}</div>{/if}
  {#snippet footer()}<button class="btn-ghost" onclick={() => (showRename = false)}>Cancel</button><button class="btn-primary" onclick={rename} disabled={renaming}>Save</button>{/snippet}
</Modal>

<Modal bind:open={showArchive} title={`${archivePending ? 'Archive' : 'Unarchive'} ${department?.name ?? ''}?`} onclose={() => (archiveErr = '')}>
  {#if archivePending && department && department.employees.length}
    <p>Resolve all {department.employees.length} employees before archiving.</p>
    <label><input type="radio" bind:group={resolution} value="reassign" /> Reassign to active department in this branch</label>
    {#if resolution === 'reassign'}
      <select class="field-input" bind:value={targetId}>
        <option value="">Choose department…</option>
        {#each siblingDepartments as d}<option value={d.id}>{d.name}</option>{/each}
      </select>
    {/if}
    <label><input type="radio" bind:group={resolution} value="clear" /> Clear department assignment</label>
  {:else if archivePending}
    <p>This department has no members. It will be archived and can be restored later.</p>
  {:else}
    <p>This department will become active again.</p>
  {/if}
  {#if archiveErr}<div class="form-err">{archiveErr}</div>{/if}
  {#snippet footer()}<button class="btn-ghost" onclick={() => (showArchive = false)}>Cancel</button><button class="btn-primary" onclick={toggleArchive} disabled={archiving}>{archivePending ? 'Archive' : 'Unarchive'}</button>{/snippet}
</Modal>

<Modal bind:open={showDelete} title={`Delete ${department?.name ?? ''}?`} onclose={() => (deleteErr = '')}>
  {#if department && department.employees.length}
    <p>Resolve all {department.employees.length} employees before permanent deletion.</p>
    <label><input type="radio" bind:group={resolution} value="reassign" /> Reassign to active department in this branch</label>
    {#if resolution === 'reassign'}
      <select class="field-input" bind:value={targetId}>
        <option value="">Choose department…</option>
        {#each siblingDepartments as d}<option value={d.id}>{d.name}</option>{/each}
      </select>
    {/if}
    <label><input type="radio" bind:group={resolution} value="clear" /> Clear department assignment</label>
  {:else}
    <p><strong>This cannot be undone.</strong> The department record and its history will be permanently deleted.</p>
  {/if}
  {#if deleteErr}<div class="form-err">{deleteErr}</div>{/if}
  {#snippet footer()}<button class="btn-ghost" onclick={() => (showDelete = false)}>Cancel</button><button class="btn-danger" onclick={remove} disabled={deleting}>Delete permanently</button>{/snippet}
</Modal>

<style>
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); cursor: pointer; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); }

  .page { display: flex; flex-direction: column; gap: 20px; min-height: 100%; }
  .state-box { text-align: center; padding: 60px 20px; color: var(--mute); font-size: 13px; }
  .state-err { color: var(--error); }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }
  .header-actions { display: flex; align-items: center; gap: 8px; }

  .btn-primary, .btn-ghost, .btn-danger { padding: 7px 13px; border-radius: var(--r-md); font-size: 13px; font-weight: 500; cursor: pointer; line-height: 1; }
  .btn-primary { border: none; background: var(--ink); color: var(--on-primary); }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-ghost { border: 1px solid var(--hairline); background: var(--canvas); color: var(--ink); }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-danger { border: none; background: #dc2626; color: #fff; }
  .btn-danger:hover:not(:disabled) { opacity: 0.85; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 16px 18px; }
  .stat-label { font-size: 11px; font-weight: 500; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .stat-value { font-size: 22px; font-weight: 600; letter-spacing: -0.04em; color: var(--ink); }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .detail-card { flex: 1; }
  .card-header { padding: 14px 20px; border-bottom: 1px solid var(--hairline); }
  .card-title { font-size: 13px; font-weight: 600; color: var(--ink); }
  .muted { padding: 20px; font-size: 13px; color: var(--mute); }
  .member-list { list-style: none; margin: 0; padding: 0; }
  .member-list li { display: flex; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid var(--hairline); font-size: 13px; }
  .member-list li:last-child { border-bottom: none; }
  .member-list li span { color: var(--mute); }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); width: 100%; background: var(--canvas); color: var(--ink); margin-bottom: 8px; }
  .form-err { color: var(--error); font-size: 13px; margin-top: 8px; }

  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } }
</style>
