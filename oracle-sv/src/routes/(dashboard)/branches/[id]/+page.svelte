<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

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

  const branchId = $derived($page.params.id);
  let branch  = $state<Branch | null>(null);
  let loading = $state(true);
  let loadErr = $state('');

  // ── Edit modal ─────────────────────────────────────────────────────────────
  let showEdit = $state(false);
  let editing  = $state(false);
  let editErr  = $state('');
  let editForm = $state({ name: '', address: '', latitude: '', longitude: '' });

  // ── Delete ──────────────────────────────────────────────────────────────────
  let showDelete  = $state(false);
  let deleting    = $state(false);
  let deleteErr   = $state('');

  onMount(async () => {
    try {
      branch = await api.get<Branch>(`/api/branches/${branchId}`);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  function mapSrc(b: Branch) {
    if (!b.latitude || !b.longitude) return null;
    const d = 0.012;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${b.longitude - d},${b.latitude - 0.007},${b.longitude + d},${b.latitude + 0.007}&layer=mapnik&marker=${b.latitude},${b.longitude}`;
  }

  function openEdit() {
    if (!branch) return;
    editForm = {
      name:      branch.name,
      address:   branch.address ?? '',
      latitude:  branch.latitude?.toString() ?? '',
      longitude: branch.longitude?.toString() ?? '',
    };
    editErr = '';
    searchQuery = ''; searchResults = []; showResults = false;
    showEdit = true;
  }

  // ── Location / map ──────────────────────────────────────────────────────
  let mapEl         = $state<HTMLDivElement | null>(null);
  let searchQuery   = $state('');
  let searchResults = $state<{ display_name: string; lat: string; lon: string }[]>([]);
  let searching     = $state(false);
  let showResults   = $state(false);
  // Non-reactive Leaflet refs (no $state — reinitialised on map open)
  let leafletMap:    any = null;
  let leafletMarker: any = null;
  let L:             any = null;

  $effect(() => {
    if (!mapEl) return;
    // Read initial coords without tracking, so map-click updates don't re-init
    let initLat = 12.8797, initLng = 121.7740, zoom = 6;
    untrack(() => {
      if (editForm.latitude && editForm.longitude) {
        initLat = parseFloat(editForm.latitude);
        initLng = parseFloat(editForm.longitude);
        zoom = 14;
      }
    });
    let destroyed = false;
    (async () => {
      if (!L) L = (await import('leaflet')).default;
      if (destroyed || !mapEl) return;
      leafletMap = L.map(mapEl).setView([initLat, initLng], zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(leafletMap);
      if (zoom === 14) leafletMarker = L.marker([initLat, initLng]).addTo(leafletMap);
      leafletMap.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        editForm.latitude  = lat.toFixed(6);
        editForm.longitude = lng.toFixed(6);
        if (leafletMarker) { leafletMarker.setLatLng([lat, lng]); }
        else { leafletMarker = L.marker([lat, lng]).addTo(leafletMap); }
      });
    })();
    return () => {
      destroyed = true;
      if (leafletMap) { leafletMap.remove(); leafletMap = null; leafletMarker = null; }
    };
  });

  async function searchNominatim() {
    if (!searchQuery.trim()) return;
    searching = true; showResults = false;
    try {
      searchResults = await api.post<{ display_name: string; lat: string; lon: string }[]>('/api/branches/geocode', { query: searchQuery.trim() });
      showResults = searchResults.length > 0;
    } catch { searchResults = []; }
    finally { searching = false; }
  }

  function selectResult(r: { display_name: string; lat: string; lon: string }) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    editForm.latitude  = lat.toFixed(6);
    editForm.longitude = lng.toFixed(6);
    showResults = false;
    if (leafletMap && L) {
      leafletMap.setView([lat, lng], 14);
      if (leafletMarker) { leafletMarker.setLatLng([lat, lng]); }
      else { leafletMarker = L.marker([lat, lng]).addTo(leafletMap); }
    }
  }

  async function handleDelete() {
    if (!branch) return;
    deleting = true; deleteErr = '';
    try {
      await api.delete(`/api/branches/${branch.id}`);
      goto('/branches');
    } catch (err) {
      deleteErr = (err as Error).message;
      deleting = false;
    }
  }

  async function handleUpdate(e: Event) {
    e.preventDefault();
    if (!branch) return;
    if (!editForm.name.trim()) { editErr = 'Branch name is required.'; return; }
    editing = true; editErr = '';
    try {
      const updated = await api.patch<Branch>(`/api/branches/${branch.id}`, {
        name:      editForm.name.trim(),
        address:   editForm.address.trim() || null,
        latitude:  editForm.latitude  ? parseFloat(editForm.latitude)  : null,
        longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
      });
      branch = updated;
      showEdit = false;
    } catch (err) {
      editErr = (err as Error).message;
    } finally {
      editing = false;
    }
  }
</script>

<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
</svelte:head>

<div class="page">

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/branches')}>Branches</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">{loading ? '…' : (branch?.name ?? 'Not found')}</span>
  </nav>

  {#if loading}
    <div class="state-box">Loading branch…</div>
  {:else if loadErr}
    <div class="state-box state-err">{loadErr}</div>
  {:else if !branch}
    <div class="state-box">Branch not found.</div>
  {:else}

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">{branch.name}</h1>
      <p class="page-sub">{branch.address ?? 'No address set'}</p>
    </div>
    <div class="header-actions">
      {#if can('manage_branches')}
      <button class="btn-danger" onclick={() => { showDelete = true; deleteErr = ''; }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Delete
      </button>
      <button class="btn-primary" onclick={openEdit}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Branch
      </button>
      {/if}
    </div>
  </div>

  <!-- Stats row -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/>
        </svg>
      </div>
      <div>
        <div class="stat-label">Total Assets</div>
        <div class="stat-value">{branch._count.assets.toLocaleString()}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        </svg>
      </div>
      <div>
        <div class="stat-label">Employees</div>
        <div class="stat-value">{branch._count.employees}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
      </div>
      <div>
        <div class="stat-label">Added</div>
        <div class="stat-value" style="font-size:14px">
          {new Date(branch.createdAt).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}
        </div>
      </div>
    </div>
  </div>

  <!-- Detail card -->
  <div class="card detail-card">
    <div class="card-header">
      <span class="card-title">Branch Details</span>
    </div>
    <div class="detail-body">
      <div class="detail-row">
        <span class="detail-label">Branch Name</span>
        <span class="detail-val">{branch.name}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Address</span>
        <span class="detail-val">{branch.address ?? '—'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Coordinates</span>
        <span class="detail-val">
          {#if branch.latitude && branch.longitude}
            {branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}
          {:else}
            —
          {/if}
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-val">
          {#if branch.archivedAt}
            <span class="badge badge-red">Archived</span>
          {:else}
            <span class="badge badge-green">Active</span>
          {/if}
        </span>
      </div>
    </div>

    {#if branch.latitude && branch.longitude}
    <div class="map-section">
      <iframe
        title="Map of {branch.address ?? branch.name}"
        src={mapSrc(branch) ?? ''}
        loading="lazy"
        class="map-iframe"
      ></iframe>
    </div>
    {:else}
    <div class="map-placeholder">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
      No location coordinates set for this branch.
    </div>
    {/if}
  </div>

  {/if}
</div>

<!-- Delete Branch modal -->
{#if showDelete}
<div class="modal-backdrop" onclick={() => { showDelete = false; deleteErr = ''; }}>
  <div class="modal modal-sm" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <span class="modal-title">Delete Branch</span>
      <button class="modal-close" onclick={() => { showDelete = false; deleteErr = ''; }}>✕</button>
    </div>
    <div class="modal-body">
      {#if deleteErr}
        <div class="form-err">{deleteErr}</div>
      {/if}
      <p class="delete-msg">Are you sure you want to delete <strong>{branch?.name}</strong>? This cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn-ghost" onclick={() => { showDelete = false; deleteErr = ''; }} disabled={deleting}>Cancel</button>
        <button class="btn-danger" onclick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete Branch'}
        </button>
      </div>
    </div>
  </div>
</div>
{/if}

<!-- Edit Branch modal -->
{#if showEdit}
<div class="modal-backdrop" onclick={() => { showEdit = false; editErr = ''; }}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <span class="modal-title">Edit Branch</span>
      <button class="modal-close" onclick={() => { showEdit = false; editErr = ''; }}>✕</button>
    </div>
    <form onsubmit={handleUpdate} class="modal-body">
      {#if editErr}
        <div class="form-err">{editErr}</div>
      {/if}
      <div class="field">
        <label class="field-label">Branch Name <span class="req">*</span></label>
        <input class="field-input" type="text" placeholder="e.g. Manila HQ" bind:value={editForm.name} required />
      </div>
      <div class="field">
        <label class="field-label">Address</label>
        <input class="field-input" type="text" placeholder="e.g. Makati, Metro Manila" bind:value={editForm.address} />
      </div>
      <div class="field">
        <label class="field-label">Location</label>
        <div class="map-search-row">
          <input
            class="field-input"
            type="text"
            placeholder="Search address or place…"
            bind:value={searchQuery}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchNominatim(); } }}
          />
          <button type="button" class="btn-map-search" onclick={searchNominatim} disabled={searching}>
            {#if searching}
              <svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 11-6.22-8.56"/></svg>
            {:else}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            {/if}
          </button>
        </div>
        {#if showResults}
          <div class="nom-results">
            {#each searchResults as r}
              <button type="button" class="nom-result" onclick={() => selectResult(r)}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;color:var(--mute)"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                {r.display_name}
              </button>
            {/each}
          </div>
        {/if}
        <div class="map-el" bind:this={mapEl}></div>
        {#if editForm.latitude && editForm.longitude}
          <p class="coord-hint">{parseFloat(editForm.latitude).toFixed(4)}, {parseFloat(editForm.longitude).toFixed(4)}</p>
        {:else}
          <p class="field-hint">Click the map to drop a pin, or search above.</p>
        {/if}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick={() => { showEdit = false; editErr = ''; }}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={editing}>{editing ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  </div>
</div>
{/if}

<style>
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .page { display: flex; flex-direction: column; gap: 20px; min-height: 100%; }

  .state-box { text-align: center; padding: 60px 20px; color: var(--mute); font-size: 13px; font-family: var(--font-sans); }
  .state-err { color: var(--error); }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }
  .header-actions { display: flex; align-items: center; gap: 8px; }

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

  .btn-danger {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: #dc2626; color: #fff;
    transition: opacity 120ms ease; line-height: 1;
  }
  .btn-danger:hover:not(:disabled) { opacity: 0.85; }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

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
  .stat-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 16px 18px; display: flex; align-items: flex-start; gap: 12px; }
  .stat-icon { width: 34px; height: 34px; border-radius: var(--r-md); background: var(--canvas-soft-2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--body); }
  .stat-label { font-size: 11px; font-weight: 500; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .stat-value { font-size: 22px; font-weight: 600; letter-spacing: -0.04em; color: var(--ink); line-height: 1; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .detail-card { flex: 1; display: flex; flex-direction: column; }
  .card-header { padding: 14px 20px; border-bottom: 1px solid var(--hairline); flex-shrink: 0; }
  .card-title { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }

  .detail-body { display: flex; flex-direction: column; gap: 0; flex-shrink: 0; }
  .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--hairline); }
  .detail-row:last-child { border-bottom: none; }
  .detail-label { font-size: 13px; color: var(--mute); }
  .detail-val { font-size: 13px; font-weight: 500; color: var(--ink); }

  .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: var(--r-pill); font-size: 11px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .badge-red { background: #fee2e2; color: #dc2626; }

  .map-section { border-top: 1px solid var(--hairline); flex: 1; display: flex; flex-direction: column; }
  .map-iframe { width: 100%; flex: 1; min-height: 380px; border: none; display: block; }
  .map-placeholder {
    flex: 1; min-height: 280px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; padding: 32px 20px; color: var(--mute);
    font-size: 13px; font-family: var(--font-sans);
    border-top: 1px solid var(--hairline);
  }
  .map-placeholder svg { opacity: 0.35; }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: oklch(0% 0 0 / 40%); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal { background: var(--canvas); border-radius: var(--r-lg); width: 100%; max-width: 480px; box-shadow: 0 20px 60px oklch(0% 0 0 / 20%); }
  .modal-sm { max-width: 380px; }
  .delete-msg { font-size: 13px; color: var(--body); font-family: var(--font-sans); line-height: 1.55; margin: 0; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid var(--hairline); }
  .modal-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .modal-close { background: none; border: none; cursor: pointer; color: var(--mute); font-size: 16px; padding: 2px 6px; border-radius: var(--r-sm); }
  .modal-close:hover { background: var(--canvas-soft-2); }
  .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 4px; }
  .form-err { font-size: 12.5px; color: var(--error); background: var(--error-soft); border-radius: var(--r-sm); padding: 8px 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .field-hint { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); margin-top: -4px; }
  .req { color: var(--error); }
  .field-input { height: 34px; padding: 0 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas); color: var(--ink); font-size: 13.5px; font-family: var(--font-sans); outline: none; width: 100%; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }

  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr 1fr; } }

  /* ── Map / Nominatim search ─────────────────────────────────────────────── */
  .map-search-row { display: flex; gap: 6px; }
  .btn-map-search {
    flex-shrink: 0; width: 34px; height: 34px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--body);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 100ms ease;
  }
  .btn-map-search:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-map-search:disabled { opacity: 0.5; cursor: not-allowed; }

  .nom-results {
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); overflow: hidden;
    box-shadow: 0 4px 16px oklch(0% 0 0 / 8%);
    max-height: 180px; overflow-y: auto;
  }
  .nom-result {
    display: flex; align-items: flex-start; gap: 7px;
    width: 100%; padding: 8px 10px; text-align: left;
    font-size: 12px; line-height: 1.45; color: var(--ink);
    font-family: var(--font-sans); background: none; border: none;
    border-bottom: 1px solid var(--hairline);
    cursor: pointer; transition: background 80ms ease;
  }
  .nom-result:last-child { border-bottom: none; }
  .nom-result:hover { background: var(--canvas-soft-2); }

  .map-el { height: 220px; border-radius: var(--r-sm); border: 1px solid var(--hairline); overflow: hidden; }

  .coord-hint { font-size: 11px; color: var(--mute); font-family: var(--font-mono); margin: 0; letter-spacing: 0.3px; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.75s linear infinite; }
</style>
