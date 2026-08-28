<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import SearchInput from '$lib/components/SearchInput.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { can } from '$lib/utils/permissions';
  import { onChange } from '$lib/ws';

  interface Branch {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    archivedAt: string | null;
    createdAt: string;
    _count: { assets: number; employees: number };
  }

  let branches   = $state<Branch[]>([]);
  let loading    = $state(true);
  let loadErr    = $state('');

  let search       = $state('');
  let currentPage  = $state(1);
  let perPage      = $state(5);
  let goToInput    = $state('');

  // ── Create modal ──────────────────────────────────────────────────────────
  let showCreate  = $state(false);
  let creating    = $state(false);
  let createErr   = $state('');
  let createForm  = $state({ name: '', address: '', latitude: '', longitude: '' });
  let createMapEl = $state<HTMLDivElement | null>(null);
  let searchingAddress = $state(false);
  let addressResults = $state<{ display_name: string; lat: string; lon: string }[]>([]);
  let showAddressResults = $state(false);
  let createMap: any = null;
  let createMarker: any = null;
  let L: any = null;
  const PHILIPPINES_BOUNDS: [[number, number], [number, number]] = [[4.2, 116.7], [21.4, 126.7]];

  // ── Edit modal ────────────────────────────────────────────────────────────
  let showEdit    = $state(false);
  let editTarget  = $state<Branch | null>(null);
  let editing     = $state(false);
  let editErr     = $state('');
  let editForm    = $state({ name: '', address: '', latitude: '', longitude: '' });

  async function loadBranches() {
    try {
      branches = await api.get<Branch[]>('/api/branches');
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => { void loadBranches(); });
  onDestroy(onChange(['Branch'], () => loadBranches()));

  const filtered = $derived(
    branches.filter(b => {
      const q = search.toLowerCase();
      return !q || b.name.toLowerCase().includes(q) || (b.address ?? '').toLowerCase().includes(q);
    })
  );

  const totalPages   = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const paginated    = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));
  const visiblePages = $derived(
    Array.from({ length: Math.min(5, totalPages) }, (_, i) =>
      Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
    ).filter(p => p >= 1 && p <= totalPages)
  );

  function resetPage() { currentPage = 1; }
  function goTo(p: number) { currentPage = Math.max(1, Math.min(totalPages, p)); }
  function handleGoTo() {
    const n = parseInt(goToInput);
    if (!isNaN(n)) { goTo(n); goToInput = ''; }
  }
  function handlePerPageChange() { currentPage = 1; }

  function setCreatePin(lat: number, lng: number, zoom = false) {
    createForm.latitude = lat.toFixed(6);
    createForm.longitude = lng.toFixed(6);
    if (!createMap || !L) return;
    if (zoom) createMap.setView([lat, lng], 15);
    if (createMarker) createMarker.setLatLng([lat, lng]);
    else createMarker = L.marker([lat, lng], { draggable: true }).addTo(createMap);
    createMarker.on('dragend', () => {
      const point = createMarker.getLatLng();
      createForm.latitude = point.lat.toFixed(6);
      createForm.longitude = point.lng.toFixed(6);
    });
  }

  $effect(() => {
    if (!showCreate || !createMapEl) return;
    let destroyed = false;
    (async () => {
      if (!L) L = (await import('leaflet')).default;
      if (destroyed || !createMapEl) return;
      createMap = L.map(createMapEl, {
        maxBounds: PHILIPPINES_BOUNDS,
        maxBoundsViscosity: 1,
      }).setView([12.8797, 121.7740], 6);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(createMap);
      createMap.on('click', (event: any) => setCreatePin(event.latlng.lat, event.latlng.lng));
    })();
    return () => {
      destroyed = true;
      if (createMap) { createMap.remove(); createMap = null; createMarker = null; }
    };
  });

  async function searchAddress() {
    const query = createForm.address.trim();
    if (!query) { createErr = 'Enter an address before searching the map.'; return; }
    searchingAddress = true; createErr = ''; showAddressResults = false;
    try {
      addressResults = await api.post<{ display_name: string; lat: string; lon: string }[]>('/api/branches/geocode', { query });
      showAddressResults = addressResults.length > 0;
      if (!addressResults.length) createErr = 'No matching address found. You can still place the pin manually.';
    } catch (error) { createErr = (error as Error).message; addressResults = []; }
    finally { searchingAddress = false; }
  }

  function mapSrc(b: Branch) {
    if (!b.latitude || !b.longitude) return null;
    const d = 0.012;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${b.longitude - d},${b.latitude - 0.007},${b.longitude + d},${b.latitude + 0.007}&layer=mapnik&marker=${b.latitude},${b.longitude}`;
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!createForm.name.trim()) { createErr = 'Branch name is required.'; return; }
    creating = true; createErr = '';
    try {
      const created = await api.post<Branch>('/api/branches', {
        name: createForm.name.trim(),
        address: createForm.address.trim() || null,
        latitude: createForm.latitude ? Number(createForm.latitude) : null,
        longitude: createForm.longitude ? Number(createForm.longitude) : null,
      });
      branches = [created, ...branches];
      showCreate = false;
      createForm = { name: '', address: '', latitude: '', longitude: '' };
    } catch (e) {
      createErr = (e as Error).message;
    } finally {
      creating = false;
    }
  }

  function openEdit(b: Branch, e: MouseEvent) {
    e.stopPropagation();
    editTarget = b;
    editForm = { name: b.name, address: b.address ?? '', latitude: b.latitude?.toString() ?? '', longitude: b.longitude?.toString() ?? '' };
    editErr = '';
    showEdit = true;
  }

  async function handleUpdate(e: Event) {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { editErr = 'Branch name is required.'; return; }
    editing = true; editErr = '';
    try {
      const updated = await api.patch<Branch>(`/api/branches/${editTarget.id}`, {
        name:      editForm.name.trim(),
        address:   editForm.address.trim() || null,
        latitude:  editForm.latitude  ? parseFloat(editForm.latitude)  : null,
        longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
      });
      branches = branches.map(b => b.id === updated.id ? { ...b, ...updated } : b);
      showEdit = false;
      editTarget = null;
    } catch (e) {
      editErr = (e as Error).message;
    } finally {
      editing = false;
    }
  }
</script>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Branches' }]} />

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Branches</h1>
      <p class="page-sub">Manage office locations and assigned inventory by branch.</p>
    </div>
    {#if can('manage_branches')}
    <div class="header-actions">
      <button class="btn-primary" onclick={() => showCreate = true}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Add Branch
      </button>
    </div>
    {/if}
  </div>

  <!-- Stats row -->
  <div class="stats-row">
    <StatCard value={loading ? '—' : branches.length} label="Total Branches" helper="All regions">
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        </svg>
      {/snippet}
    </StatCard>
    <StatCard value={loading ? '—' : branches.reduce((a, b) => a + b._count.assets, 0).toLocaleString()} label="Total Assets" helper="Across all branches">
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/>
        </svg>
      {/snippet}
    </StatCard>
    <StatCard value={loading ? '—' : branches.reduce((a, b) => a + b._count.employees, 0)} label="Employees Assigned" helper="Across all branches">
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      {/snippet}
    </StatCard>
  </div>

  <!-- Table -->
  <div class="main-grid">
    <div class="card table-card">
      <div class="toolbar">
        <SearchInput bind:value={search} placeholder="Search branches…" oninput={resetPage} />
      </div>

      {#if loading}
        <div class="empty-cell" style="padding:40px 16px;text-align:center;color:var(--mute);font-size:13px;">Loading branches…</div>
      {:else if loadErr}
        <div class="empty-cell" style="padding:40px 16px;text-align:center;color:var(--error);font-size:13px;">{loadErr}</div>
      {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Branch name</th>
              <th>Address</th>
              <th>Assets</th>
              <th>Employees</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each paginated as b}
              <tr class="row">
                <td>
                  <button
                    class="branch-name-btn"
                    onclick={(e) => { e.stopPropagation(); goto('/branches/' + b.id); }}
                  >{b.name}</button>
                </td>
                <td><span class="location-text">{b.address ?? '—'}</span></td>
                <td class="td-num">{b._count.assets.toLocaleString()}</td>
                <td class="td-num">{b._count.employees > 0 ? b._count.employees : '—'}</td>
                <td onclick={(e) => e.stopPropagation()}>
                  <div class="action-cell">
                    <button class="icon-btn" title="View" onclick={() => goto('/branches/' + b.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                    {#if can('manage_branches')}
                    <button class="icon-btn" title="Edit" onclick={(e) => openEdit(b, e)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
            {#if filtered.length === 0}
              <tr><td colspan="5" class="empty-cell">No branches found. Add your first branch.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      <Pagination bind:currentPage bind:perPage {totalPages} perPageOptions={[5, 10, 25]} />
      {/if}
    </div>
  </div>

</div>

<!-- Add Branch modal -->
<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
</svelte:head>

<Modal bind:open={showCreate} title="Add Branch" maxWidth="620px" onclose={() => (createErr = '')}>
  <form id="create-branch-form" onsubmit={handleCreate}>
    {#if createErr}<div class="form-err">{createErr}</div>{/if}
    <div class="field">
      <label class="field-label">Branch Name <span class="req">*</span></label>
      <input class="field-input" type="text" placeholder="e.g. Manila HQ" bind:value={createForm.name} required />
    </div>
    <div class="field">
      <label class="field-label">Address</label>
      <input class="field-input" type="text" placeholder="e.g. Makati, Metro Manila" bind:value={createForm.address} />
    </div>
    <div class="field">
      <label class="field-label">Exact location <span class="opt">(optional)</span></label>
      <div class="map-search-row">
        <button type="button" class="btn-ghost" onclick={searchAddress} disabled={searchingAddress}>
          {searchingAddress ? 'Searching...' : 'Find address on map'}
        </button>
        {#if createForm.latitude && createForm.longitude}
          <span class="coord-hint">{Number(createForm.latitude).toFixed(4)}, {Number(createForm.longitude).toFixed(4)}</span>
        {/if}
      </div>
      {#if showAddressResults}
        <div class="address-results">
          {#each addressResults as result}
            <button type="button" class="address-result" onclick={() => { setCreatePin(Number(result.lat), Number(result.lon), true); showAddressResults = false; }}>
              {result.display_name}
            </button>
          {/each}
        </div>
      {/if}
      <div class="map-picker" bind:this={createMapEl}></div>
      <span class="field-hint">Philippine addresses only. Search the address, then click or drag the pin to the exact company location.</span>
    </div>
  </form>
  {#snippet footer()}
    <button type="button" class="btn-ghost" onclick={() => { showCreate = false; createErr = ''; }}>Cancel</button>
    <button type="submit" form="create-branch-form" class="btn-primary" disabled={creating}>{creating ? 'Saving…' : 'Add Branch'}</button>
  {/snippet}
</Modal>

<!-- Edit Branch modal -->
<Modal bind:open={showEdit} title="Edit Branch" maxWidth="400px" onclose={() => (editErr = '')}>
  <form id="edit-branch-form" onsubmit={handleUpdate}>
    {#if editErr}<div class="form-err">{editErr}</div>{/if}
    <div class="field">
      <label class="field-label">Branch Name <span class="req">*</span></label>
      <input class="field-input" type="text" placeholder="e.g. Manila HQ" bind:value={editForm.name} required />
    </div>
    <div class="field">
      <label class="field-label">Address</label>
      <input class="field-input" type="text" placeholder="e.g. Makati, Metro Manila" bind:value={editForm.address} />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field">
        <label class="field-label">Latitude</label>
        <input class="field-input" type="number" step="any" placeholder="e.g. 10.3157" bind:value={editForm.latitude} />
      </div>
      <div class="field">
        <label class="field-label">Longitude</label>
        <input class="field-input" type="number" step="any" placeholder="e.g. 123.8854" bind:value={editForm.longitude} />
      </div>
    </div>
  </form>
  {#snippet footer()}
    <button type="button" class="btn-ghost" onclick={() => { showEdit = false; editErr = ''; }}>Cancel</button>
    <button type="submit" form="edit-branch-form" class="btn-primary" disabled={editing}>{editing ? 'Saving…' : 'Save Changes'}</button>
  {/snippet}
</Modal>

<style>

  .page { display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 64px); min-height: 0; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-md); flex-wrap: wrap; }
  .page-title { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }
  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

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
  .btn-primary.btn-sm { padding: 5px 10px; font-size: 12px; border-radius: var(--r-sm); }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }

  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat-card {
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-lg); padding: 16px 18px;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .stat-icon {
    width: 34px; height: 34px; border-radius: var(--r-md);
    background: var(--canvas-soft-2); display: flex;
    align-items: center; justify-content: center; flex-shrink: 0; color: var(--body);
  }
  .stat-label { font-size: 11px; font-weight: 500; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .stat-value { font-size: 22px; font-weight: 600; letter-spacing: -0.04em; color: var(--ink); line-height: 1; margin-bottom: 4px; }
  .stat-helper { font-size: 11px; color: var(--mute); }

  .main-grid { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: stretch; flex: 1; min-height: 0; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .table-card { overflow: hidden; display: flex; flex-direction: column; flex: 1; min-height: 0; }

  .toolbar { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; }

  .table-wrap { overflow-x: auto; overflow-y: auto; flex: 1; min-height: 0; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid var(--hairline); }
  th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; background: var(--canvas-soft); position: sticky; top: 0; z-index: 2; }
  td { padding: 0 16px; font-size: 13px; color: var(--ink); border-bottom: 1px solid var(--hairline); vertical-align: middle; height: 52px; }
  tbody tr:last-child td { border-bottom: none; }
  .row { transition: background 100ms ease; }
  .row:hover td { background: var(--canvas-soft); }
  .td-num { font-weight: 500; }
  .empty-cell { text-align: center; color: var(--mute); font-size: 13px; padding: 32px 16px !important; height: auto !important; }

  .branch-name-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .branch-name-btn:hover { color: var(--link); text-decoration: underline; }
  .location-text { font-size: 12px; color: var(--body); }

  .action-cell { display: flex; align-items: center; gap: 4px; }
  .icon-btn { width: 27px; height: 27px; border-radius: var(--r-sm); border: 1px solid var(--hairline); background: var(--canvas); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--mute); transition: background 100ms ease, color 100ms ease; }
  .icon-btn:hover { background: var(--canvas-soft-2); color: var(--ink); }

  /* Modal form */
  .form-err { font-size: 12.5px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 8px 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .opt, .field-hint { font-size: 11.5px; color: var(--mute); font-weight: 400; }
  .req { color: var(--error); }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-size: 13.5px; font-family: var(--font-sans); outline: none; width: 100%; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .map-search-row { display: flex; align-items: center; gap: 10px; }
  .coord-hint { font: 11px var(--font-mono); color: var(--mute); }
  .map-picker { height: 240px; border: 1px solid var(--hairline); border-radius: var(--r-sm); overflow: hidden; }
  .address-results { max-height: 140px; overflow-y: auto; border: 1px solid var(--hairline); border-radius: var(--r-sm); }
  .address-result { display: block; width: 100%; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--hairline); background: var(--canvas); color: var(--ink); font: 12px var(--font-sans); text-align: left; cursor: pointer; }
  .address-result:last-child { border-bottom: 0; }
  .address-result:hover { background: var(--canvas-soft-2); }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } }
</style>
