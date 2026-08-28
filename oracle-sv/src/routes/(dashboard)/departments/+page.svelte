<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import SearchInput from '$lib/components/SearchInput.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Branch = { id: string; name: string };
  type Department = { id: string; name: string; archivedAt: string | null; createdAt: string; branch: Branch; _count: { employees: number } };
  let departments = $state<Department[]>([]);
  let branches = $state<Branch[]>([]);
  let loading = $state(true); let error = $state(''); let search = $state(''); let currentPage = $state(1); let perPage = $state(10);
  let showCreate = $state(false); let busy = $state(false); let formError = $state('');
  let name = $state(''); let branchId = $state('');
  const filtered = $derived(departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())));
  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const paginated = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));
  const activeCount = $derived(departments.filter((d) => !d.archivedAt).length);
  const employeeCount = $derived(departments.reduce((sum, d) => sum + d._count.employees, 0));

  async function load() {
    loading = true; error = '';
    try {
      const [deptData, branchData] = await Promise.all([
        api.get<Department[]>('/api/departments?includeArchived=true'),
        api.get<Branch[]>('/api/branches'),
      ]);
      departments = deptData; branches = branchData;
    } catch (e) { error = (e as Error).message || 'Departments could not be loaded.'; }
    finally { loading = false; }
  }
  onMount(load);
  onDestroy(onChange(['Department', 'Branch'], () => load()));
  function resetPage() { currentPage = 1; }
  function startCreate() { name = ''; branchId = branches[0]?.id ?? ''; formError = ''; showCreate = true; }
  async function create() {
    if (!name.trim()) { formError = 'Department name is required.'; return; }
    if (!branchId) { formError = 'Branch is required.'; return; }
    busy = true; formError = '';
    try { await api.post('/api/departments', { name: name.trim(), branchId }); showCreate = false; await load(); }
    catch (e) { formError = (e as Error).message; }
    finally { busy = false; }
  }
</script>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Departments' }]} />
  <div class="page-header">
    <div><h1 class="page-title">Departments</h1><p class="page-sub">Manage branch departments and employee membership.</p></div>
    {#if can('manage_users')}<button class="btn-primary" onclick={startCreate}>Add Department</button>{/if}
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : departments.length} label="Total Departments" helper="Active and archived" />
    <StatCard value={loading ? '—' : activeCount} label="Active" helper="Available for assignment" />
    <StatCard value={loading ? '—' : employeeCount} label="Employees Assigned" helper="Across all departments" />
  </div>

  <div class="main-grid">
    <div class="card table-card">
      <div class="toolbar"><SearchInput bind:value={search} placeholder="Search departments…" oninput={resetPage} /></div>
      <TableStates loading={loading} error={error} empty={!loading && !error && filtered.length === 0} loadingText="Loading departments…" emptyTitle={search ? 'No departments match your search' : 'No departments yet'} emptyMessage={search ? 'Try a different search term.' : 'Create your first department to organize employee records.'} onRetry={load} />
      {#if !loading && !error && filtered.length}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Branch</th><th>Status</th><th>Employees</th><th>Actions</th></tr></thead>
          <tbody>
            {#each paginated as d}
            <tr class="row">
              <td><button class="name-btn" onclick={() => goto('/departments/' + d.id)}>{d.name}</button></td>
              <td>{d.branch.name}</td>
              <td>{d.archivedAt ? 'Archived' : 'Active'}</td>
              <td class="td-num">{d._count.employees}</td>
              <td onclick={(e) => e.stopPropagation()}>
                <button class="icon-btn" title="View" onclick={() => goto('/departments/' + d.id)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </td>
            </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination bind:currentPage bind:perPage {totalPages} perPageOptions={[10, 25, 50]} />
      {/if}
    </div>
  </div>
</div>

<Modal bind:open={showCreate} title="Create department" onclose={() => (formError = '')}>
  <div class="field"><label for="department-name">Department name</label><input id="department-name" class="field-input" bind:value={name} /></div>
  <div class="field"><label for="department-branch">Branch</label>
    <select id="department-branch" class="field-input" bind:value={branchId}>
      {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
    </select>
  </div>
  {#if formError}<div class="form-err">{formError}</div>{/if}
  {#snippet footer()}<button class="btn-ghost" onclick={() => (showCreate = false)}>Cancel</button><button class="btn-primary" onclick={create} disabled={busy}>Create</button>{/snippet}
</Modal>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 64px); min-height: 0; }
  .page-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title { font-size: 20px; font-weight: 600; }
  .page-sub { font-size: 13px; color: var(--mute); }
  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .main-grid { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: stretch; flex: 1; min-height: 0; }
  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .table-card { overflow: hidden; display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .toolbar { padding: 14px 16px; border-bottom: 1px solid var(--hairline); }
  .table-wrap { overflow-x: auto; overflow-y: auto; flex: 1; min-height: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); font-size: 13px; }
  th { font-size: 11px; color: var(--mute); text-transform: uppercase; position: sticky; top: 0; background: var(--canvas-soft); }
  tbody tr:last-child td { border-bottom: none; }
  .row { transition: background 100ms ease; }
  .row:hover td { background: var(--canvas-soft); }
  .td-num { font-weight: 500; }
  .name-btn { border: 0; background: transparent; font-weight: 600; cursor: pointer; color: var(--ink); padding: 0; font-family: var(--font-sans); font-size: 13px; }
  .name-btn:hover { color: var(--link); text-decoration: underline; }
  .icon-btn, .btn-ghost, .btn-primary { padding: 7px 12px; border-radius: var(--r-md); cursor: pointer; }
  .icon-btn { width: 27px; height: 27px; padding: 0; display: flex; align-items: center; justify-content: center; border: 1px solid var(--hairline); background: var(--canvas); color: var(--mute); }
  .icon-btn:hover { background: var(--canvas-soft-2); color: var(--ink); }
  .btn-ghost { border: 1px solid var(--hairline); background: var(--canvas); }
  .btn-primary { border: 0; background: var(--ink); color: var(--on-primary); }
  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); width: 100%; background: var(--canvas); color: var(--ink); }
  .form-err { color: var(--error); font-size: 13px; margin-top: 8px; }
  @media (max-width: 700px) { .stats-row { grid-template-columns: 1fr; } }
</style>
