<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import SearchInput from '$lib/components/SearchInput.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Department = { id: string; name: string; archivedAt: string | null; createdAt: string; _count: { employees: number } };
  type Employee = { id: string; name: string; employeeId: string | null; email: string | null; position: string | null; isActive: boolean; branch: { id: string; name: string } | null };
  type DepartmentDetail = Department & { employees: Employee[] };
  let departments = $state<Department[]>([]); let selected = $state<DepartmentDetail | null>(null);
  let loading = $state(true); let error = $state(''); let search = $state(''); let currentPage = $state(1); let perPage = $state(10);
  let showCreate = $state(false); let showDelete = $state(false); let archivePending = $state(false); let busy = $state(false); let formError = $state(''); let detailError = $state(''); let editingName = $state(false);
  let name = $state(''); let resolution = $state<'reassign' | 'clear' | ''>(''); let targetId = $state('');
  const filtered = $derived(departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())));
  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const paginated = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));
  const activeDepartments = $derived(departments.filter((d) => !d.archivedAt));
  const activeCount = $derived(departments.filter((d) => !d.archivedAt).length);
  const employeeCount = $derived(departments.reduce((sum, d) => sum + d._count.employees, 0));

  async function load() { loading = true; error = ''; try { departments = await api.get<Department[]>('/api/departments?includeArchived=true'); if (selected) selected = await api.get<DepartmentDetail>(`/api/departments/${selected.id}`); } catch (e) { error = (e as Error).message || 'Departments could not be loaded.'; } finally { loading = false; } }
  onMount(load);
  function resetPage() { currentPage = 1; }
  async function open(d: Department) { detailError = ''; try { selected = await api.get<DepartmentDetail>(`/api/departments/${d.id}`); editingName = false; name = ''; } catch (e) { detailError = (e as Error).message || 'Department details could not be loaded.'; } }
  function startCreate() { name = ''; formError = ''; showCreate = true; }
  async function create() { if (!name.trim()) { formError = 'Department name is required.'; return; } busy = true; formError = ''; try { await api.post('/api/departments', { name: name.trim() }); showCreate = false; await load(); } catch (e) { formError = (e as Error).message; } finally { busy = false; } }
  function startRename() { if (selected) { name = selected.name; detailError = ''; editingName = true; } }
  async function rename() { if (!selected || !name.trim()) { detailError = 'Department name is required.'; return; } busy = true; detailError = ''; try { selected = await api.patch<DepartmentDetail>(`/api/departments/${selected.id}`, { name: name.trim() }); name = ''; editingName = false; await load(); } catch (e) { detailError = (e as Error).message; } finally { busy = false; } }
  async function openResolution() { if (!selected) return; archivePending = true; resolution = ''; targetId = ''; formError = ''; showDelete = true; }
  async function archive() {
    if (!selected) return;
    if (!selected.archivedAt && selected.employees.length) { await openResolution(); return; }
    busy = true; detailError = '';
    try {
      const res = await api.raw(`/api/departments/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !selected.archivedAt }), headers: { 'Content-Type': 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && (body as { requiresResolution?: boolean }).requiresResolution) {
          // Another session assigned employees to this department since it was loaded — refresh and let the user resolve them instead of failing silently.
          selected = await api.get<DepartmentDetail>(`/api/departments/${selected.id}`);
          await openResolution();
          return;
        }
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      selected = body as DepartmentDetail; await load();
    } catch (e) { detailError = (e as Error).message; } finally { busy = false; }
  }
  function startDelete() { archivePending = false; resolution = ''; targetId = ''; formError = ''; showDelete = true; }
  async function remove() { if (!selected) return; if (selected.employees.length && (!resolution || (resolution === 'reassign' && !targetId))) { formError = 'Choose exactly one employee resolution.'; return; } busy = true; formError = ''; try { if (archivePending) selected = await api.patch<DepartmentDetail>(`/api/departments/${selected.id}`, { archived: true, resolution, targetDepartmentId: targetId || undefined }); else { await api.raw(`/api/departments/${selected.id}`, { method: 'DELETE', body: JSON.stringify({ resolution: resolution || undefined, targetDepartmentId: targetId || undefined }), headers: { 'Content-Type': 'application/json' } }).then(async (r) => { if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`); } }); selected = null; } showDelete = false; await load(); } catch (e) { formError = (e as Error).message; } finally { busy = false; } }
</script>

<div class="page"><Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Departments' }]} /><div class="page-header"><div><h1 class="page-title">Departments</h1><p class="page-sub">Manage organization-wide departments and employee membership.</p></div>{#if can('manage_users')}<button class="btn-primary" onclick={startCreate}>Add Department</button>{/if}</div>
  <div class="stats-row"><StatCard value={loading ? '—' : departments.length} label="Total Departments" helper="Active and archived" /><StatCard value={loading ? '—' : activeCount} label="Active" helper="Available for assignment" /><StatCard value={loading ? '—' : employeeCount} label="Employees Assigned" helper="Across all departments" /></div>
  <div class="card table-card"><div class="toolbar"><SearchInput bind:value={search} placeholder="Search departments…" oninput={resetPage} /></div><TableStates loading={loading} error={error} empty={!loading && !error && filtered.length === 0} loadingText="Loading departments…" emptyTitle={search ? 'No departments match your search' : 'No departments yet'} emptyMessage={search ? 'Try a different search term.' : 'Create your first department to organize employee records.'} onRetry={load} />{#if !loading && !error && filtered.length}<div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Employees</th><th>Actions</th></tr></thead><tbody>{#each paginated as d}<tr><td><button class="name-btn" onclick={() => open(d)}>{d.name}</button></td><td>{d.archivedAt ? 'Archived' : 'Active'}</td><td>{d._count.employees}</td><td><button class="icon-btn" onclick={() => open(d)}>View</button></td></tr>{/each}</tbody></table></div><Pagination bind:currentPage bind:perPage {totalPages} perPageOptions={[10, 25, 50]} />{/if}</div>
  {#if selected}<div class="card detail-card"><div class="detail-head"><div><h2>{selected.name}</h2><p>{selected._count.employees} employee{selected._count.employees === 1 ? '' : 's'} · {selected.archivedAt ? 'Archived' : 'Active'}</p></div>{#if can('manage_users')}<div class="actions"><button class="btn-ghost" onclick={startRename}>Edit name</button><button class="btn-ghost" onclick={archive} disabled={busy}>{selected.archivedAt ? 'Unarchive' : 'Archive'}</button><button class="btn-danger" onclick={startDelete}>Delete</button></div>{/if}</div>{#if detailError}<div class="form-err" role="alert">{detailError}</div>{/if}{#if editingName}<div class="rename"><input bind:value={name} aria-label="Department name" /><button class="btn-primary" onclick={rename} disabled={busy}>Save name</button><button class="btn-ghost" onclick={() => { editingName = false; name = ''; detailError = ''; }}>Cancel</button></div>{/if}<h3>Members</h3>{#if selected.employees.length}<ul>{#each selected.employees as e}<li><strong>{e.name}</strong><span>{e.position ?? e.email ?? 'No additional details'}</span></li>{/each}</ul>{:else}<p class="muted">No employees assigned.</p>{/if}</div>{/if}</div>

<Modal bind:open={showCreate} title="Create department" onclose={() => (formError = '')}><div class="field"><label for="department-name">Department name</label><input id="department-name" class="field-input" bind:value={name} /></div>{#if formError}<div class="form-err">{formError}</div>{/if}{#snippet footer()}<button class="btn-ghost" onclick={() => (showCreate = false)}>Cancel</button><button class="btn-primary" onclick={create} disabled={busy}>Create</button>{/snippet}</Modal>
{#if showDelete && selected}<Modal bind:open={showDelete} title={`${archivePending ? 'Archive' : 'Delete'} ${selected.name}?`} onclose={() => (formError = '')}>{#if selected.employees.length}<p>Resolve all {selected.employees.length} employees before {archivePending ? 'archiving' : 'permanent deletion'}.</p><label><input type="radio" bind:group={resolution} value="reassign" /> Reassign to active department</label>{#if resolution === 'reassign'}<select class="field-input" bind:value={targetId}><option value="">Choose department…</option>{#each activeDepartments.filter((d) => d.id !== selected?.id) as d}<option value={d.id}>{d.name}</option>{/each}</select>{/if}<label><input type="radio" bind:group={resolution} value="clear" /> Clear department assignment</label>{:else if archivePending}<p>This department has no members. It will be archived and can be restored later.</p>{:else}<p><strong>This cannot be undone.</strong> The department record and its history will be permanently deleted.</p>{/if}{#if formError}<div class="form-err" role="alert">{formError}</div>{/if}{#snippet footer()}<button class="btn-ghost" onclick={() => (showDelete = false)}>Cancel</button><button class="btn-danger" onclick={remove} disabled={busy}>{archivePending ? 'Archive' : 'Delete permanently'}</button>{/snippet}</Modal>{/if}

<style>
  .page{display:flex;flex-direction:column;gap:16px}.page-header,.detail-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.page-title{font-size:20px;font-weight:600}.page-sub,.muted,.detail-card p{font-size:13px;color:var(--mute)}.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{background:var(--canvas);border:1px solid var(--hairline);border-radius:var(--r-lg)}.table-card{overflow:hidden}.toolbar{padding:14px 16px;border-bottom:1px solid var(--hairline)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 16px;border-bottom:1px solid var(--hairline);font-size:13px}th{font-size:11px;color:var(--mute);text-transform:uppercase}.name-btn{border:0;background:transparent;font-weight:600;cursor:pointer;color:var(--ink)}.icon-btn,.btn-ghost,.btn-primary,.btn-danger{padding:7px 12px;border-radius:var(--r-md);cursor:pointer}.icon-btn,.btn-ghost{border:1px solid var(--hairline);background:var(--canvas)}.btn-primary{border:0;background:var(--ink);color:var(--on-primary)}.btn-danger{border:0;background:var(--error);color:white}.detail-card{padding:18px}.actions{display:flex;gap:8px}.detail-card li{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--hairline)}.rename{display:flex;gap:8px;margin:14px 0}.field-input{height:34px;padding:0 10px;border:1px solid var(--hairline);border-radius:var(--r-sm);width:100%}.form-err{color:var(--error);font-size:13px;margin-top:8px}@media(max-width:700px){.stats-row{grid-template-columns:1fr}.detail-card li{display:block}.actions{flex-wrap:wrap}}
</style>
