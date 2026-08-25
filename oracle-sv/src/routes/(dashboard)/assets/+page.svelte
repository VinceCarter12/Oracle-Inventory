<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { slide } from 'svelte/transition';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  type Condition  = 'usable' | 'for_repair' | 'for_disposal';
  type AssetStatus = 'assigned' | 'available' | 'for_repair' | 'for_disposal' | 'lost' | 'stolen';

  interface Asset {
    id: string; name: string; serial: string; category: string;
    branch: string; condition: Condition; status: AssetStatus; assignee: string;
  }

  interface ApiAsset {
    id: string; name: string; serialNumber: string | null; condition: Condition;
    status: 'active' | 'lost' | 'stolen';
    category: { name: string } | null;
    branch:   { name: string } | null;
    assignments: { employee: { name: string } }[];
  }

  interface Stats { total: number; assigned: number; available: number; forRepair: number; forDisposal: number; lost: number; stolen: number; }

  function mapAsset(a: ApiAsset): Asset {
    let status: AssetStatus;
    if (a.status === 'lost')               status = 'lost';
    else if (a.status === 'stolen')        status = 'stolen';
    else if (a.condition === 'for_repair') status = 'for_repair';
    else if (a.condition === 'for_disposal') status = 'for_disposal';
    else if (a.assignments.length > 0)    status = 'assigned';
    else                                  status = 'available';
    return {
      id: a.id, name: a.name,
      serial:    a.serialNumber ?? '',
      category:  a.category?.name ?? '',
      branch:    a.branch?.name   ?? '',
      condition: a.condition, status,
      assignee:  a.assignments[0]?.employee?.name ?? '',
    };
  }

  let loading = $state(true);
  let loadErr = $state('');
  let assets  = $state<Asset[]>([]);

  let KPI = $state([
    { label: 'Total Assets', value: '0', delta: '+0', deltaLabel: 'assets', positive: true  },
    { label: 'Assigned',     value: '0', delta: '—',  deltaLabel: '',       positive: true  },
    { label: 'Available',    value: '0', delta: '—',  deltaLabel: '',       positive: true  },
    { label: 'For Repair',   value: '0', delta: '—',  deltaLabel: 'units',  positive: false },
  ]);

  function applyStats(s: Stats) {
    if (!s) return;
    KPI[0].value = (s.total     ?? 0).toLocaleString();
    KPI[1].value = (s.assigned  ?? 0).toLocaleString();
    KPI[2].value = (s.available ?? 0).toLocaleString();
    KPI[3].value = (s.forRepair ?? 0).toLocaleString();
  }

  onMount(async () => {
    loadErr = '';
    try {
      const [raw, s] = await Promise.all([
        api.get<ApiAsset[]>('/api/assets'),
        api.get<Stats>('/api/assets/stats'),
      ]);
      assets = raw.map(mapAsset);
      applyStats(s);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  // ── Core state ───────────────────────────────────────────────────────────────
  let showStatistics = $state(true);
  let selectMode     = $state(false);
  let selectedRows   = $state(new Set<string>());
  let currentPage    = $state(1);
  let perPage        = $state(10);
  let search         = $state('');
  let filterStatus   = $state<'all' | AssetStatus>('all');
  let goToPage       = $state('');

  // ── Toolbar state ────────────────────────────────────────────────────────────
  let viewMode      = $state<'table' | 'cards'>('table');
  let showViewMenu  = $state(false);
  let showSort      = $state(false);
  let showFilters   = $state(false);
  let showCustomize = $state(false);

  let sortField     = $state<string | null>(null);
  let sortDir       = $state<'asc' | 'desc'>('asc');

  let filterCategory  = $state('');
  let filterCondition = $state<'' | Condition>('');

  let visibleCols = $state({
    serial: true, category: true, branch: true,
    condition: true, status: true, assignee: true,
  });

  // ── Constants ────────────────────────────────────────────────────────────────
  const SORT_OPTIONS = [
    { field: 'name',      label: 'Asset Name'  },
    { field: 'serial',    label: 'Serial No.'  },
    { field: 'category',  label: 'Category'    },
    { field: 'branch',    label: 'Branch'      },
    { field: 'condition', label: 'Condition'   },
    { field: 'status',    label: 'Status'      },
    { field: 'assignee',  label: 'Assigned To' },
  ];

  const COL_OPTIONS: { key: keyof typeof visibleCols; label: string }[] = [
    { key: 'serial',    label: 'Serial No.'  },
    { key: 'category',  label: 'Category'    },
    { key: 'branch',    label: 'Branch'      },
    { key: 'condition', label: 'Condition'   },
    { key: 'status',    label: 'Status'      },
    { key: 'assignee',  label: 'Assigned To' },
  ];

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filtered = $derived.by(() => {
    let result = assets.filter(a => {
      const q = search.toLowerCase();
      const matchQ = !q || a.name.toLowerCase().includes(q)
        || a.serial.toLowerCase().includes(q) || a.assignee.toLowerCase().includes(q);
      const matchS    = filterStatus === 'all' || a.status === filterStatus;
      const matchC    = !filterCategory || a.category.toLowerCase().includes(filterCategory.toLowerCase());
      const matchCond = !filterCondition || a.condition === filterCondition;
      return matchQ && matchS && matchC && matchCond;
    });
    if (sortField) {
      result = [...result].sort((a, b) => {
        const av = String(a[sortField as keyof Asset] ?? '').toLowerCase();
        const bv = String(b[sortField as keyof Asset] ?? '').toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return result;
  });

  const totalPages   = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const pageRows     = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));
  const allSelected  = $derived(pageRows.length > 0 && pageRows.every(a => selectedRows.has(a.id)));
  const someSelected = $derived(selectedRows.size > 0);
  const hasExtraFilters = $derived(!!filterCategory || !!filterCondition || filterStatus !== 'all');
  const hasHiddenCols   = $derived(!Object.values(visibleCols).every(v => v));
  const colCount        = $derived(2 + Object.values(visibleCols).filter(v => v).length);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function toggleAll() {
    const next = new Set(selectedRows);
    if (allSelected) pageRows.forEach(a => next.delete(a.id));
    else             pageRows.forEach(a => next.add(a.id));
    selectedRows = next;
  }
  function toggleRow(id: string) {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedRows = next;
  }
  function clearSelection()   { selectedRows = new Set(); selectMode = false; }
  function toggleSelectMode() { selectMode = !selectMode; if (!selectMode) selectedRows = new Set(); }
  async function deleteSelected() {
    const ids = [...selectedRows];
    const errors: string[] = [];
    await Promise.all(ids.map(async id => {
      try {
        await api.delete(`/api/assets/${id}`);
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes('Asset not found')) errors.push(msg);
      }
    }));
    assets = assets.filter(a => !selectedRows.has(a.id));
    clearSelection();
    if (errors.length) {
      loadErr = `Some deletions failed: ${errors[0]}`;
    } else {
      const s = await api.get<Stats>('/api/assets/stats');
      applyStats(s);
    }
  }
  function editSelected()     { const ids = [...selectedRows]; if (ids.length === 1) goto(`/assets/${ids[0]}`); }

  function exportToExcel() {
    const headers = ['Asset Name','Serial No.','Category','Branch','Condition','Status','Assigned To'];
    const rows = filtered.map(a => [a.name, a.serial, a.category, a.branch, COND_LABEL[a.condition], STATUS_LABEL[a.status], a.assignee]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `oracle-assets-${new Date().toISOString().slice(0,10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
  }

  function goTo(p: number)    { currentPage = Math.max(1, Math.min(totalPages, p)); }
  function handleGoToPage()   { const n = parseInt(goToPage,10); if (!isNaN(n)) { goTo(n); goToPage=''; } }
  function handleSearch(e: Event)  { search = (e.target as HTMLInputElement).value; currentPage = 1; }
  function handleFilter(e: Event)  { filterStatus = (e.target as HTMLSelectElement).value as typeof filterStatus; currentPage = 1; clearSelection(); }

  function closeAllDropdowns() { showViewMenu = false; showSort = false; showCustomize = false; }
  function setSort(field: string) {
    if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortField = field; sortDir = 'asc'; }
    showSort = false;
  }
  function clearSort()         { sortField = null; showSort = false; }
  function clearExtraFilters() { filterCategory = ''; filterCondition = ''; }

  function clickOutside(node: HTMLElement, cb: () => void) {
    let callback = cb;
    function handle(e: MouseEvent) { if (!node.contains(e.target as Node)) callback(); }
    document.addEventListener('mousedown', handle, true);
    return { update(fn: () => void) { callback = fn; }, destroy() { document.removeEventListener('mousedown', handle, true); } };
  }

  const STATUS_STYLE: Record<AssetStatus, string> = {
    assigned:'badge-green', available:'badge-blue', for_repair:'badge-orange', for_disposal:'badge-red',
    lost:'badge-amber', stolen:'badge-red',
  };
  const STATUS_LABEL: Record<AssetStatus, string> = {
    assigned:'Assigned', available:'Available', for_repair:'For Repair', for_disposal:'For Disposal',
    lost:'Lost', stolen:'Stolen',
  };
  const COND_LABEL: Record<Condition, string> = {
    usable:'Usable', for_repair:'For Repair', for_disposal:'For Disposal',
  };

  function pageNums(): (number | '…')[] {
    const nums: (number | '…')[] = [];
    if (totalPages <= 7) { for (let i=1;i<=totalPages;i++) nums.push(i); }
    else {
      nums.push(1);
      if (currentPage > 3) nums.push('…');
      for (let i=Math.max(2,currentPage-1);i<=Math.min(totalPages-1,currentPage+1);i++) nums.push(i);
      if (currentPage < totalPages-2) nums.push('…');
      nums.push(totalPages);
    }
    return nums;
  }
</script>

<div class="page">

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Assets</span>
  </nav>

  <div class="page-head">
    <div class="head-left">
      <h1 class="page-title">Assets</h1>
      <span class="page-sub">Manage and track all inventory items</span>
    </div>
  </div>

  {#if loadErr}
    <div class="load-err">{loadErr}</div>
  {/if}

  <!-- ── Toolbar ───────────────────────────────────────────────────────────── -->
  <div class="toolbar">
    <div class="toolbar-left">

      <!-- Table View / Card View -->
      <div class="tool-wrap" use:clickOutside={() => showViewMenu = false}>
        <button class="tool-btn" class:tool-btn--active={viewMode === 'cards'}
          onclick={() => { closeAllDropdowns(); showViewMenu = !showViewMenu; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          {viewMode === 'table' ? 'Table View' : 'Card View'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {#if showViewMenu}
          <div class="dropdown-menu">
            <button class="drop-item" class:drop-active={viewMode === 'table'}
              onclick={() => { viewMode = 'table'; showViewMenu = false; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Table View
              {#if viewMode === 'table'}<svg class="check-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>{/if}
            </button>
            <button class="drop-item" class:drop-active={viewMode === 'cards'}
              onclick={() => { viewMode = 'cards'; showViewMenu = false; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              Card View
              {#if viewMode === 'cards'}<svg class="check-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>{/if}
            </button>
          </div>
        {/if}
      </div>

      <!-- Filter -->
      <button class="tool-btn" class:tool-btn--active={showFilters || hasExtraFilters}
        onclick={() => showFilters = !showFilters}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        Filter
        {#if hasExtraFilters}<span class="filter-dot"></span>{/if}
      </button>

      <!-- Sort -->
      <div class="tool-wrap" use:clickOutside={() => showSort = false}>
        <button class="tool-btn" class:tool-btn--active={sortField !== null}
          onclick={() => { closeAllDropdowns(); showSort = !showSort; }}>
          <svg class="sort-icon" class:sort-icon--desc={sortField !== null && sortDir === 'desc'} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          Sort
        </button>
        {#if showSort}
          <div class="dropdown-menu">
            {#each SORT_OPTIONS as opt}
              <button class="drop-item" class:drop-active={sortField === opt.field}
                onclick={() => setSort(opt.field)}>
                {opt.label}
                {#if sortField === opt.field}<span class="sort-dir-badge">{sortDir === 'asc' ? '↑' : '↓'}</span>{/if}
              </button>
            {/each}
            {#if sortField}
              <div class="drop-divider"></div>
              <button class="drop-item drop-clear" onclick={clearSort}>Clear sort</button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Edit (was Select) -->
      <button class="tool-btn" class:tool-btn--active={selectMode} onclick={toggleSelectMode}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="4" height="4" rx="0.5"/><line x1="9" y1="7" x2="21" y2="7"/><rect x="3" y="11" width="4" height="4" rx="0.5"/><line x1="9" y1="13" x2="21" y2="13"/><rect x="3" y="17" width="4" height="4" rx="0.5"/><line x1="9" y1="19" x2="21" y2="19"/></svg>
        Edit
      </button>

      <label class="stats-toggle">
        <span class="stats-label">Show Statistics</span>
        <button class="toggle-track" class:on={showStatistics} role="switch"
          aria-checked={showStatistics} aria-label="Show statistics"
          onclick={() => (showStatistics = !showStatistics)}>
          <span class="toggle-thumb"></span>
        </button>
      </label>
    </div>

    <div class="toolbar-right">
      <div class="search-wrap">
        <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="search" placeholder="Search assets…"
          value={search} oninput={handleSearch} aria-label="Search assets" />
      </div>

      <!-- Customize -->
      <div class="tool-wrap" use:clickOutside={() => showCustomize = false}>
        <button class="tool-btn" class:tool-btn--active={hasHiddenCols}
          onclick={() => { closeAllDropdowns(); showCustomize = !showCustomize; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          Customize
        </button>
        {#if showCustomize}
          <div class="dropdown-menu dropdown-right">
            <div class="drop-header">Columns</div>
            {#each COL_OPTIONS as col}
              <label class="drop-check">
                <input type="checkbox" bind:checked={visibleCols[col.key]} />
                {col.label}
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <button class="tool-btn" onclick={exportToExcel}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export
      </button>
      {#if can('scan_assets')}
        <a href="/assets/scan" class="btn-scan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Scan
        </a>
      {/if}
      {#if can('create_inventory')}
        <a class="btn-scan" href="/assets/add/computer">Computer intake</a>
        <button class="btn-primary" onclick={() => goto('/assets/add')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add New Asset
        </button>
      {/if}
    </div>
  </div>

  <!-- ── Filter bar ────────────────────────────────────────────────────────── -->
  {#if showFilters}
    <div class="filter-bar" transition:slide={{ duration: 160 }}>
      <span class="filter-bar-label">Filters</span>
      <div class="filter-inputs">
        <input class="filter-input" type="text" placeholder="Category…"
          bind:value={filterCategory} aria-label="Filter by category" />
        <select class="tool-select" bind:value={filterCondition} aria-label="Filter by condition">
          <option value="">All Conditions</option>
          <option value="usable">Usable</option>
          <option value="for_repair">For Repair</option>
          <option value="for_disposal">For Disposal</option>
        </select>
        <select class="tool-select" value={filterStatus} onchange={handleFilter} aria-label="Filter by status">
          <option value="all">All Status</option>
          <option value="assigned">Assigned</option>
          <option value="available">Available</option>
          <option value="for_repair">For Repair</option>
          <option value="for_disposal">For Disposal</option>
          <option value="lost">Lost</option>
          <option value="stolen">Stolen</option>
        </select>
      </div>
      {#if hasExtraFilters}
        <button class="filter-clear-btn" onclick={clearExtraFilters}>Clear</button>
      {/if}
    </div>
  {/if}

  <!-- ── KPI stats ─────────────────────────────────────────────────────────── -->
  {#if showStatistics}
    <div class="stats-row">
      {#each KPI as kpi}
        <div class="stat-card">
          <div class="stat-label">
            {kpi.label}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="stat-value">{kpi.value}</div>
          <div class="stat-sub">
            vs last month
            <span class="stat-badge" class:badge-neg={!kpi.positive}>
              {kpi.delta}{kpi.deltaLabel ? ' ' + kpi.deltaLabel : ''}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ── Table card ────────────────────────────────────────────────────────── -->
  <div class="table-card">

    {#if someSelected}
      <div class="bulk-bar">
        <span class="bulk-count">{selectedRows.size} Selected</span>
        <div class="bulk-actions">
          <button class="bulk-btn" onclick={editSelected} disabled={selectedRows.size !== 1}
            title={selectedRows.size !== 1 ? 'Select exactly one asset to edit' : 'Edit asset'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Info
          </button>
          {#if can('delete_inventory')}
            <button class="bulk-btn bulk-danger" onclick={deleteSelected}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Delete
            </button>
          {/if}
          <button class="bulk-close" onclick={clearSelection} aria-label="Clear selection">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    {/if}

    <!-- Card View -->
    {#if viewMode === 'cards'}
      <div class="cards-grid">
        {#each pageRows as asset (asset.id)}
          <div class="asset-card" class:card-selected={selectedRows.has(asset.id)}
            onclick={() => { if (selectMode) toggleRow(asset.id); else goto(`/assets/${asset.id}`); }}>
            {#if selectMode}
              <input type="checkbox" class="card-check"
                checked={selectedRows.has(asset.id)}
                onchange={() => toggleRow(asset.id)}
                onclick={(e) => e.stopPropagation()}
                aria-label="Select {asset.name}" />
            {/if}
            <div class="card-top">
              <span class="asset-name">{asset.name}</span>
              <span class="badge {STATUS_STYLE[asset.status]}">{STATUS_LABEL[asset.status]}</span>
            </div>
            <div class="card-serial mono">{asset.serial}</div>
            <div class="card-meta-row">
              {#if visibleCols.category}<span class="card-meta">{asset.category}</span>{/if}
              {#if visibleCols.branch}<span class="card-meta">{asset.branch}</span>{/if}
            </div>
            {#if visibleCols.condition}<div class="card-cond">{COND_LABEL[asset.condition]}</div>{/if}
            {#if visibleCols.assignee && asset.assignee}<div class="card-assignee">→ {asset.assignee}</div>{/if}
          </div>
        {/each}
        {#if pageRows.length === 0}
          <div class="empty-cards">No assets match your filters.</div>
        {/if}
      </div>

    <!-- Table View -->
    {:else}
      <div class="table-outer">
        <div class="check-overlay" class:active={selectMode}>
          <div class="overlay-head">
            <input type="checkbox" checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onchange={toggleAll} aria-label="Select all" />
          </div>
          {#each pageRows as asset (asset.id)}
            <div class="overlay-cell" class:cell-selected={selectedRows.has(asset.id)}>
              <input type="checkbox" checked={selectedRows.has(asset.id)}
                onchange={() => toggleRow(asset.id)} aria-label="Select {asset.name}" />
            </div>
          {/each}
        </div>

        <div class="table-wrap" class:shifted={selectMode}>
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-name">Asset Name</th>
                {#if visibleCols.serial}<th class="col-serial">Serial No.</th>{/if}
                {#if visibleCols.category}<th class="col-cat">Category</th>{/if}
                {#if visibleCols.branch}<th class="col-site">Branch</th>{/if}
                {#if visibleCols.condition}<th class="col-cond">Condition</th>{/if}
                {#if visibleCols.status}<th class="col-status">Status</th>{/if}
                {#if visibleCols.assignee}<th class="col-assign">Assigned To</th>{/if}
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each pageRows as asset (asset.id)}
                <tr class:row-selected={selectedRows.has(asset.id)} class="clickable-row"
                  onclick={() => { if (selectMode) toggleRow(asset.id); else goto(`/assets/${asset.id}`); }}>
                  <td class="col-name"><span class="asset-name">{asset.name}</span></td>
                  {#if visibleCols.serial}<td class="col-serial mono">{asset.serial}</td>{/if}
                  {#if visibleCols.category}<td class="col-cat">{asset.category}</td>{/if}
                  {#if visibleCols.branch}<td class="col-site">{asset.branch}</td>{/if}
                  {#if visibleCols.condition}<td class="col-cond"><span class="cond-label">{COND_LABEL[asset.condition]}</span></td>{/if}
                  {#if visibleCols.status}<td class="col-status"><span class="badge {STATUS_STYLE[asset.status]}">{STATUS_LABEL[asset.status]}</span></td>{/if}
                  {#if visibleCols.assignee}<td class="col-assign">{asset.assignee}</td>{/if}
                  <td class="col-actions">
                    <div class="row-actions">
                      <button class="action-btn" title="View asset"
                        onclick={(e) => { e.stopPropagation(); goto(`/assets/${asset.id}`); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      {#if can('update_inventory')}
                        <button class="action-btn" title="Edit asset"
                          onclick={(e) => { e.stopPropagation(); goto(`/assets/${asset.id}`); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
              {#if pageRows.length === 0}
                <tr><td colspan={colCount} class="empty-row">No assets match your filters.</td></tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

  <!-- ── Pagination ─────────────────────────────────────────────────────────── -->
  <div class="pagination">
    <div class="per-page">
      <span>Showing per page</span>
      <select class="per-page-select" value={perPage}
        onchange={(e) => { perPage = +((e.target as HTMLSelectElement).value); currentPage = 1; }}
        aria-label="Rows per page">
        {#each [10, 25, 50] as n}<option value={n}>{n}</option>{/each}
      </select>
    </div>

    <div class="page-nav">
      <button class="page-btn" onclick={() => goTo(1)} disabled={currentPage === 1} aria-label="First page">«</button>
      <button class="page-btn" onclick={() => goTo(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">‹</button>
      {#each pageNums() as p}
        {#if p === '…'}
          <span class="page-ellipsis">…</span>
        {:else}
          <button class="page-btn" class:page-active={p === currentPage}
            onclick={() => goTo(p)} aria-current={p === currentPage ? 'page' : undefined}>{p}</button>
        {/if}
      {/each}
      <button class="page-btn" onclick={() => goTo(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">›</button>
      <button class="page-btn" onclick={() => goTo(totalPages)} disabled={currentPage === totalPages} aria-label="Last page">»</button>
    </div>

    <div class="go-to">
      <span>Go to page</span>
      <input class="go-input" type="number" min="1" max={totalPages}
        bind:value={goToPage} onkeydown={(e) => e.key === 'Enter' && handleGoToPage()}
        aria-label="Go to page number" />
      <button class="btn-go" onclick={handleGoToPage}>Go</button>
    </div>
  </div>
  </div>
</div>

<style>
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .page { display: flex; flex-direction: column; gap: 16px; width: 100%; min-width: 0; height: calc(100vh - 64px); min-height: 0; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .head-left { display: flex; flex-direction: column; gap: 2px; }
  .page-title { font-size: 20px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.025em; line-height: 1.2; }
  .page-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); }

  .btn-primary { display: flex; align-items: center; gap: 6px; padding: 0 14px; height: 32px; border-radius: var(--r-md); border: none; background: var(--ink); color: var(--on-primary); font-family: var(--font-sans); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: opacity 120ms ease; }
  .btn-primary:hover { opacity: 0.85; }
  .btn-scan { display: flex; align-items: center; gap: 6px; padding: 0 14px; height: 32px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); font-family: var(--font-sans); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; text-decoration: none; transition: background 120ms ease, color 120ms ease; }
  .btn-scan:hover { background: var(--canvas-soft-2); color: var(--ink); }

  /* ── Toolbar ─────────────────────────────────────────────────────────────── */
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 10px 14px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); }
  .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .tool-btn { display: flex; align-items: center; gap: 5px; padding: 0 10px; height: 30px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); font-family: var(--font-sans); font-size: 12.5px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: background 120ms ease, color 120ms ease; }
  .tool-btn:hover { background: var(--canvas-soft-2); color: var(--ink); }
  .tool-btn--active { background: var(--ink); color: var(--on-primary); border-color: var(--ink); }
  .tool-btn--active:hover { background: var(--ink); color: var(--on-primary); opacity: 0.85; }
  .tool-select { height: 30px; padding: 0 8px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); font-family: var(--font-sans); font-size: 12.5px; font-weight: 500; cursor: pointer; outline: none; }
  .stats-toggle { display: flex; align-items: center; gap: 7px; cursor: pointer; margin-left: 4px; }
  .stats-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); white-space: nowrap; }
  .toggle-track { width: 36px; height: 20px; border-radius: 999px; border: none; background: var(--hairline); cursor: pointer; position: relative; transition: background 200ms ease; flex-shrink: 0; padding: 0; }
  .toggle-track.on { background: oklch(52% 0.18 152); }
  .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 999px; background: var(--canvas); box-shadow: var(--shadow-l2); transition: transform 200ms ease; }
  .toggle-track.on .toggle-thumb { transform: translateX(16px); }
  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-icon { position: absolute; left: 8px; color: var(--mute); pointer-events: none; }
  .search-input { height: 30px; padding: 0 10px 0 28px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas-soft); color: var(--ink); font-family: var(--font-sans); font-size: 12.5px; outline: none; width: 180px; transition: border-color 120ms ease, width 200ms ease; }
  .search-input:focus { border-color: var(--ink); background: var(--canvas); width: 220px; }
  .search-input::placeholder { color: var(--mute); }

  /* ── Dropdowns ───────────────────────────────────────────────────────────── */
  .tool-wrap { position: relative; }
  .dropdown-menu { position: absolute; top: calc(100% + 4px); left: 0; min-width: 160px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l2); z-index: 50; padding: 4px; display: flex; flex-direction: column; }
  .dropdown-right { left: auto; right: 0; }
  .drop-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: var(--r-md); border: none; background: none; color: var(--body); font-family: var(--font-sans); font-size: 13px; font-weight: 500; cursor: pointer; text-align: left; transition: background 80ms ease; width: 100%; }
  .drop-item:hover { background: var(--canvas-soft-2); color: var(--ink); }
  .drop-active { color: var(--ink); font-weight: 600; }
  .drop-header { padding: 6px 10px 4px; font-size: 11px; font-weight: 600; color: var(--mute); font-family: var(--font-sans); letter-spacing: 0.5px; text-transform: uppercase; }
  .drop-check { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: var(--r-md); font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: var(--body); cursor: pointer; transition: background 80ms ease; }
  .drop-check:hover { background: var(--canvas-soft-2); }
  .drop-check input[type="checkbox"] { width: 14px; height: 14px; cursor: pointer; }
  .drop-divider { height: 1px; background: var(--hairline); margin: 4px 0; }
  .drop-clear { color: var(--mute); }
  .drop-clear:hover { color: oklch(47.8% 0.26 28); background: oklch(93% 0.04 28); }
  .check-icon { margin-left: auto; color: var(--ink); }
  .sort-icon { transition: transform 220ms ease; flex-shrink: 0; }
  .sort-icon--desc { transform: rotate(180deg); }
  .sort-dir-badge { margin-left: auto; font-size: 11px; color: var(--mute); }

  /* ── Filter bar ──────────────────────────────────────────────────────────── */
  .filter-dot { width: 6px; height: 6px; border-radius: 999px; background: oklch(52% 0.18 264); flex-shrink: 0; }
  .filter-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); flex-wrap: wrap; }
  .filter-bar-label { font-size: 11px; font-weight: 600; color: var(--mute); font-family: var(--font-sans); letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; }
  .filter-inputs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }
  .filter-input { height: 30px; padding: 0 10px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas-soft); color: var(--ink); font-family: var(--font-sans); font-size: 12.5px; outline: none; width: 160px; transition: border-color 120ms ease; }
  .filter-input:focus { border-color: var(--ink); background: var(--canvas); }
  .filter-input::placeholder { color: var(--mute); }
  .filter-clear-btn { height: 28px; padding: 0 10px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: none; color: var(--mute); font-family: var(--font-sans); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background 120ms ease, border-color 120ms ease; }
  .filter-clear-btn:hover { color: oklch(47.8% 0.26 28); background: oklch(93% 0.04 28); border-color: oklch(47.8% 0.26 28); }

  /* ── KPI stats ───────────────────────────────────────────────────────────── */
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; }
  .stat-label { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: var(--mute); font-family: var(--font-sans); }
  .stat-value { font-size: 28px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); letter-spacing: -1px; line-height: 1.1; }
  .stat-sub { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); }
  .stat-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; font-family: var(--font-sans); background: oklch(52% 0.18 152); color: var(--on-primary); }
  .stat-badge.badge-neg { background: oklch(60% 0.18 30); }

  /* ── Table card ──────────────────────────────────────────────────────────── */
  .table-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); overflow: hidden; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .bulk-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: oklch(96.5% 0.008 264); border-bottom: 1px solid var(--hairline); gap: 12px; }
  .bulk-count { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .bulk-actions { display: flex; align-items: center; gap: 6px; }
  .bulk-btn { display: flex; align-items: center; gap: 5px; padding: 0 10px; height: 28px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); font-family: var(--font-sans); font-size: 12px; font-weight: 500; cursor: pointer; transition: background 120ms ease; }
  .bulk-btn:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .bulk-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .bulk-danger { color: oklch(47.8% 0.26 28); }
  .bulk-danger:hover { background: oklch(93% 0.04 28); border-color: oklch(47.8% 0.26 28); }
  .bulk-close { width: 28px; height: 28px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--mute); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 120ms ease; }
  .bulk-close:hover { background: var(--canvas-soft-2); color: var(--ink); }

  /* ── Card grid ───────────────────────────────────────────────────────────── */
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 16px; }
  .asset-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; position: relative; transition: box-shadow 120ms ease, border-color 120ms ease; }
  .asset-card:hover { box-shadow: var(--shadow-l2); border-color: oklch(80% 0.02 264); }
  .card-selected { background: oklch(97% 0.005 264); border-color: oklch(70% 0.06 264); }
  .card-check { position: absolute; top: 10px; right: 10px; width: 15px; height: 15px; accent-color: var(--ink); cursor: pointer; }
  .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .card-serial { font-family: var(--font-mono); font-size: 11.5px; color: var(--mute); }
  .card-meta-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .card-meta { font-size: 12px; color: var(--mute); background: var(--canvas-soft); border-radius: var(--r-md); padding: 1px 7px; }
  .card-cond { font-size: 12px; color: var(--body); }
  .card-assignee { font-size: 12px; color: var(--mute); }
  .empty-cards { grid-column: 1 / -1; text-align: center; color: var(--mute); padding: 40px 12px; font-size: 13px; font-family: var(--font-sans); }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .table-outer { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .check-overlay { position: absolute; top: 0; left: -40px; width: 40px; height: 100%; background: var(--canvas); border-right: 1px solid var(--hairline); z-index: 2; transition: left 0.18s ease; display: flex; flex-direction: column; pointer-events: none; }
  .check-overlay.active { left: 0; pointer-events: auto; }
  .overlay-head { height: 36px; display: flex; align-items: center; justify-content: center; background: var(--canvas-soft); border-bottom: 1px solid var(--hairline); flex-shrink: 0; }
  .overlay-cell { height: 41px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--hairline); flex-shrink: 0; transition: background 80ms ease; }
  .overlay-cell:last-child { border-bottom: none; }
  .overlay-cell.cell-selected { background: oklch(97% 0.005 264); }
  .table-wrap { overflow-x: auto; overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; min-height: 0; transition: margin-left 0.18s ease; }
  .table-wrap.shifted { margin-left: 40px; }
  .data-table { width: 100%; min-width: 720px; border-collapse: collapse; font-family: var(--font-sans); }
  .data-table thead { border-bottom: 1px solid var(--hairline); background: var(--canvas-soft); }
  .data-table th { padding: 9px 12px; text-align: left; font-size: 11.5px; font-weight: 600; color: var(--mute); letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap; user-select: none; position: sticky; top: 0; z-index: 2; background: var(--canvas-soft); }
  .data-table td { padding: 10px 12px; font-size: 13px; color: var(--body); border-bottom: 1px solid var(--hairline); vertical-align: middle; }
  .data-table tbody tr:last-child td { border-bottom: none; }
  .data-table tbody tr { transition: background 80ms ease; }
  .data-table tbody tr:hover { background: oklch(98% 0.002 106); }
  .clickable-row { cursor: pointer; }
  .row-selected { background: oklch(97% 0.005 264) !important; }
  .col-name { min-width: 200px; } .col-serial { min-width: 120px; } .col-cat { min-width: 100px; }
  .col-site { min-width: 120px; } .col-cond { min-width: 100px; } .col-status { min-width: 110px; } .col-assign { min-width: 110px; }
  .col-actions { width: 80px; min-width: 80px; position: sticky; right: 0; background: var(--canvas); z-index: 1; }
  .data-table thead .col-actions { background: var(--canvas-soft); }
  .row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; opacity: 0; transition: opacity 120ms ease; padding-right: 4px; }
  .data-table tbody tr:hover .row-actions { opacity: 1; }
  .action-btn { width: 26px; height: 26px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--mute); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 80ms ease, color 80ms ease; flex-shrink: 0; }
  .action-btn:hover { background: var(--canvas-soft-2); color: var(--ink); }
  .check-overlay input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; }
  .asset-name { font-weight: 500; color: var(--ink); font-size: 13px; }
  .mono { font-family: var(--font-mono); font-size: 12px; color: var(--mute); }
  .cond-label { font-size: 12px; color: var(--body); }
  .empty-row { text-align: center; color: var(--mute); padding: 40px 12px !important; font-size: 13px; }

  /* ── Badges ──────────────────────────────────────────────────────────────── */
  .badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 500; font-family: var(--font-sans); white-space: nowrap; }
  .badge-green  { background: oklch(93% 0.06 152); color: oklch(38% 0.18 152); }
  .badge-blue   { background: oklch(92% 0.05 264); color: oklch(42% 0.18 264); }
  .badge-orange { background: oklch(93% 0.07 60);  color: oklch(48% 0.18 50);  }
  .badge-red    { background: oklch(93% 0.05 28);  color: oklch(42% 0.22 28);  }
  .badge-amber  { background: oklch(95% 0.06 80);  color: oklch(40% 0.15 55);  }

  /* ── Pagination ──────────────────────────────────────────────────────────── */
  .pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--hairline); background: var(--canvas-soft); flex-wrap: wrap; flex-shrink: 0; }
  .per-page { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); white-space: nowrap; }
  .per-page-select { height: 28px; padding: 0 6px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--ink); font-family: var(--font-sans); font-size: 12.5px; cursor: pointer; outline: none; }
  .page-nav { display: flex; align-items: center; gap: 2px; }
  .page-btn { min-width: 28px; height: 28px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); font-family: var(--font-sans); font-size: 12.5px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0 4px; transition: background 120ms ease, color 120ms ease; }
  .page-btn:hover:not(:disabled):not(.page-active) { background: var(--canvas-soft-2); color: var(--ink); }
  .page-btn:disabled { color: var(--hairline); cursor: not-allowed; }
  .page-active { background: var(--ink) !important; color: var(--on-primary) !important; border-color: var(--ink); }
  .page-ellipsis { padding: 0 4px; font-size: 12.5px; color: var(--mute); display: flex; align-items: center; }
  .go-to { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); white-space: nowrap; }
  .go-input { width: 44px; height: 28px; padding: 0 6px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--ink); font-family: var(--font-sans); font-size: 12.5px; text-align: center; outline: none; }
  .go-input:focus { border-color: var(--ink); }
  .btn-go { height: 28px; padding: 0 10px; border-radius: var(--r-md); border: 1px solid var(--hairline); background: var(--canvas); color: var(--ink); font-family: var(--font-sans); font-size: 12.5px; font-weight: 500; cursor: pointer; transition: background 120ms ease; }
  .btn-go:hover { background: var(--canvas-soft-2); }

  /* ── Load error ──────────────────────────────────────────────────────────── */
  .load-err { padding: 12px 16px; background: oklch(93% 0.05 28); border: 1px solid oklch(80% 0.12 28); border-radius: var(--r-lg); color: oklch(40% 0.22 28); font-size: 13px; font-family: var(--font-sans); }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 900px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) {
    .stats-row { grid-template-columns: 1fr; }
    .page-head { flex-direction: column; }
    .toolbar { flex-direction: column; align-items: flex-start; }
    .toolbar-right { width: 100%; }
    .search-input, .search-input:focus { width: 100%; }
    .pagination { flex-direction: column; align-items: flex-start; gap: 8px; }
    .go-to { display: none; }
  }
</style>
