<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import DatePicker from '$lib/components/date/DatePicker.svelte';

  // ── API types ─────────────────────────────────────────────────────────────────
  interface ApiEmployee {
    id: string; name: string; employeeId: string; isActive: boolean;
    department: { id: string; name: string } | null;
    branch:     { id: string; name: string } | null;
    assignments: { id: string }[];
  }

  interface ApiAsset {
    id: string; name: string; serialNumber: string | null; condition: string;
    category: { id: string; name: string } | null;
    branch:   { id: string; name: string } | null;
    assignments: { id: string }[];
  }

  interface ApiAssignment {
    id: string; status: string; assignedAt: string; notes: string | null;
    asset: { id: string; name: string; serialNumber: string | null; condition: string; category: { name: string } | null; branch: { name: string } | null; };
    employee: { id: string; name: string; employeeId: string; department: { name: string } | null; branch: { name: string } | null; };
  }

  // ── UI types ──────────────────────────────────────────────────────────────────
  interface Employee { id: string; empId: string; name: string; initials: string; color: string; role: string; dept: string; }
  interface Asset    { id: string; name: string; serial: string; category: string; available: boolean; }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const AVATAR_COLORS = [
    'oklch(52% 0.21 264)', 'oklch(55% 0.18 210)', 'oklch(55% 0.19 155)',
    'oklch(52% 0.22 340)', 'oklch(60% 0.20 60)',  'oklch(48% 0.22 300)',
    'oklch(52% 0.16 55)',  'oklch(42% 0.18 240)', 'oklch(50% 0.18 180)',
    'oklch(44% 0.20 20)',
  ];
  function nameInitials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
  function avatarColor(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

  function mapEmployee(e: ApiEmployee): Employee {
    return { id: e.id, empId: e.employeeId, name: e.name, initials: nameInitials(e.name), color: avatarColor(e.id), role: e.department?.name ?? '—', dept: e.branch?.name ?? '—' };
  }
  function mapAsset(a: ApiAsset): Asset {
    return { id: a.id, name: a.name, serial: a.serialNumber ?? '', category: a.category?.name ?? 'Other', available: a.condition === 'usable' && a.assignments.length === 0 };
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  let loading    = $state(true);
  let loadErr    = $state('');
  let submitting = $state(false);
  let submitErr  = $state('');

  let employees = $state<Employee[]>([]);
  let assets    = $state<Asset[]>([]);

  let empSearch      = $state('');
  let assetSearch    = $state('');
  let assetCat       = $state('All');
  let selectedEmp    = $state<Employee | null>(null);
  let selectedAssets = $state(new Set<string>());
  let notes          = $state('');
  let assignedDate   = $state('');
  let expectedReturn = $state('');

  // ── Load ──────────────────────────────────────────────────────────────────────
  onMount(async () => {
    loadErr = '';
    try {
      const [rawEmps, rawAssets] = await Promise.all([
        api.get<ApiEmployee[]>('/api/employees'),
        api.get<ApiAsset[]>('/api/assets'),
      ]);
      employees = rawEmps.filter(e => e.isActive).map(mapEmployee);
      assets    = rawAssets.map(mapAsset);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  // ── Derived ───────────────────────────────────────────────────────────────────
  const categories = $derived(['All', ...new Set(assets.map(a => a.category).sort())]);

  const filteredEmps = $derived(
    employees.filter(e => {
      const q = empSearch.toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || e.empId.toLowerCase().includes(q) || e.role.toLowerCase().includes(q);
    })
  );

  const filteredAssets = $derived(
    assets.filter(a => {
      const q = assetSearch.toLowerCase();
      const matchQ = !q || a.name.toLowerCase().includes(q) || a.serial.toLowerCase().includes(q);
      const matchC = assetCat === 'All' || a.category === assetCat;
      return matchQ && matchC;
    })
  );

  const selectedAssetObjects = $derived(assets.filter(a => selectedAssets.has(a.id)));

  const step1Done  = $derived(selectedEmp !== null);
  const step2Done  = $derived(selectedAssets.size > 0);
  const canConfirm = $derived(step1Done && step2Done && !submitting);
  const currentStep = $derived(!step1Done ? 1 : !step2Done ? 2 : 3);

  function toggleAsset(id: string) {
    const next = new Set(selectedAssets);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedAssets = next;
  }

  function removeAsset(id: string) {
    const next = new Set(selectedAssets);
    next.delete(id);
    selectedAssets = next;
  }

  async function confirmAssignment() {
    if (!canConfirm || !selectedEmp) return;
    submitErr = '';
    submitting = true;
    try {
      const results = await Promise.all(
        [...selectedAssets].map(assetId =>
          api.post<ApiAssignment>('/api/assignments', {
            assetId,
            employeeId: selectedEmp!.id,
            notes: notes.trim() || null,
          })
        )
      );
      try { sessionStorage.setItem('asn_result', JSON.stringify({ assignments: results, notes })); } catch { /* ignore */ }
      goto('/assignments/confirm');
    } catch (e) {
      submitErr = (e as Error).message;
      submitting = false;
    }
  }
</script>

<div class="pg">

  <!-- Breadcrumb -->

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/assignments')}>Assignments</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Assign Asset</span>
  </nav>

  <!-- Top bar -->
  <div class="topbar">
    <button class="back-btn" onclick={() => goto('/assignments')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Back to assignments
    </button>
    <span class="pg-title">Assign asset</span>
  </div>

  <!-- Step bar -->
  <div class="steps-bar">
    {#each [
      { n: 1, label: 'Select\nemployee' },
      { n: 2, label: 'Select\nassets'   },
      { n: 3, label: 'Set\ndetails'     },
      { n: 4, label: 'Confirm'          },
    ] as s}
      {#if s.n > 1}
        <div class="step-line" class:done={currentStep > s.n - 1}></div>
      {/if}
      <div class="step" class:done={currentStep > s.n} class:active={currentStep === s.n}>
        <div class="step-num">
          {#if currentStep > s.n}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else}
            {s.n}
          {/if}
        </div>
        <span class="step-label">{s.label}</span>
      </div>
    {/each}
  </div>

  <!-- Load error -->
  {#if loadErr}
    <div class="load-err">{loadErr}</div>
  {/if}

  <!-- Body -->
  <div class="body">

    <!-- Left: Employee + Assets -->
    <div class="left-col">

      <!-- Employee card -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Employee</span>
          <span class="count-badge">{selectedEmp ? '1 selected' : '0 selected'}</span>
        </div>
        <div class="search-wrap">
          <svg class="s-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input class="search-input" type="search" placeholder="Search employee name or ID…" bind:value={empSearch} />
        </div>
        <div class="list-scroll">
          {#if loading}
            <div class="list-empty">Loading…</div>
          {:else}
          {#each filteredEmps as emp}
            <button
              class="emp-row"
              class:selected={selectedEmp?.id === emp.id}
              onclick={() => selectedEmp = selectedEmp?.id === emp.id ? null : emp}
            >
              <span class="emp-av" style="background:{emp.color}">{emp.initials}</span>
              <div class="emp-info">
                <div class="emp-name">{emp.name}</div>
                <div class="emp-sub">{emp.empId} · {emp.role}</div>
              </div>
              {#if emp.dept !== '—'}<span class="dept-tag">{emp.dept}</span>{/if}
              {#if selectedEmp?.id === emp.id}
                <span class="sel-check" aria-label="Selected">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              {/if}
            </button>
          {/each}
          {#if filteredEmps.length === 0}
            <div class="list-empty">No employees match your search.</div>
          {/if}
          {/if}
        </div>
      </div>

      <!-- Available assets card -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Available assets</span>
          <span class="count-badge">{selectedAssets.size} selected</span>
        </div>
        <div class="search-wrap">
          <svg class="s-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input class="search-input" type="search" placeholder="Search asset name, serial no., or category…" bind:value={assetSearch} />
        </div>
        <div class="filter-chips">
          {#each categories as cat}
            <button
              class="chip"
              class:chip-active={assetCat === cat}
              onclick={() => assetCat = cat}
            >{cat}</button>
          {/each}
        </div>
        <div class="list-scroll">
          {#each filteredAssets as asset}
            <button
              class="asset-row"
              class:selected={selectedAssets.has(asset.id)}
              class:unavailable={!asset.available}
              onclick={() => asset.available && toggleAsset(asset.id)}
              disabled={!asset.available}
            >
              <span class="asset-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  {#if asset.category === 'Phone' || asset.category === 'Tablet'}
                    <rect x="5" y="2" width="14" height="20" rx="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  {:else if asset.category === 'Laptop'}
                    <rect x="2" y="6" width="20" height="12" rx="2"/>
                    <line x1="2" y1="20" x2="22" y2="20"/>
                  {:else if asset.category === 'Monitor'}
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  {:else if asset.category === 'Peripheral'}
                    <path d="M3 18v-6a9 9 0 0118 0v6"/>
                    <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3z"/>
                    <path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>
                  {:else}
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M16 3l-4 4-4-4"/>
                  {/if}
                </svg>
              </span>
              <div class="asset-info">
                <div class="asset-name">{asset.name}</div>
                <div class="asset-sn">{asset.serial} · {asset.category}</div>
              </div>
              <span class="avail-badge" class:avail={asset.available} class:inuse={!asset.available}>
                {asset.available ? 'Available' : 'In use'}
              </span>
              {#if selectedAssets.has(asset.id)}
                <span class="sel-check" aria-label="Selected">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              {/if}
            </button>
          {/each}
          {#if filteredAssets.length === 0}
            <div class="list-empty">No assets match your search.</div>
          {/if}
        </div>
      </div>

    </div>

    <!-- Right: Summary sidebar -->
    <div class="summary-card">
      <div class="sum-head">
        <span class="card-title">Assignment summary</span>
      </div>

      <!-- Borrowing employee -->
      <div class="sum-section">
        <div class="sum-label">Borrowing employee</div>
        {#if selectedEmp}
          <div class="sum-emp">
            <span class="emp-av" style="background:{selectedEmp.color}">{selectedEmp.initials}</span>
            <div>
              <div class="sum-emp-name">{selectedEmp.name}</div>
              <div class="sum-emp-role">{selectedEmp.dept} · {selectedEmp.role}</div>
            </div>
          </div>
        {:else}
          <div class="sum-empty">No employee selected</div>
        {/if}
      </div>

      <!-- Assets to assign -->
      <div class="sum-section">
        <div class="sum-label">Assets to assign ({selectedAssets.size})</div>
        {#if selectedAssetObjects.length > 0}
          {#each selectedAssetObjects as a}
            <div class="sum-asset-row">
              <span class="sum-asset-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  {#if a.category === 'Phone' || a.category === 'Tablet'}
                    <rect x="5" y="2" width="14" height="20" rx="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  {:else if a.category === 'Laptop'}
                    <rect x="2" y="6" width="20" height="12" rx="2"/>
                    <line x1="2" y1="20" x2="22" y2="20"/>
                  {:else}
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  {/if}
                </svg>
              </span>
              <div class="sum-asset-info">
                <div class="sum-asset-name">{a.name}</div>
                <div class="sum-asset-sn">{a.serial}</div>
              </div>
              <button class="remove-btn" onclick={() => removeAsset(a.id)} aria-label="Remove {a.name}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          {/each}
        {:else}
          <div class="sum-empty">No assets selected</div>
        {/if}
      </div>

      <!-- Dates -->
      <div class="sum-section">
        <div class="sum-label">Assignment dates</div>
        <div class="date-grid">
          <div class="date-field">
            <span class="date-label">Assigned date</span>
            <DatePicker bind:value={assignedDate} placeholder="Today" id="assigned-date" />
          </div>
          <div class="date-field">
            <span class="date-label">Expected return</span>
            <DatePicker bind:value={expectedReturn} placeholder="Optional" id="return-date" />
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="sum-section">
        <div class="sum-label">Notes</div>
        <textarea class="notes-ta" placeholder="Reason for borrowing, condition notes…" bind:value={notes}></textarea>
      </div>

      <!-- Footer actions -->
      <div class="sum-footer">
        {#if submitErr}
          <div class="submit-err">{submitErr}</div>
        {/if}
        <button class="btn-primary-full" class:disabled={!canConfirm} onclick={confirmAssignment} disabled={!canConfirm}>
          {#if submitting}
            Confirming…
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Confirm assignment
          {/if}
        </button>
        <button class="btn-ghost-full" onclick={() => goto('/assignments')}>Cancel</button>
      </div>
    </div>

  </div>
</div>

<style>
  .load-err {
    padding: 10px 14px;
    border-radius: var(--r-md);
    background: var(--error-soft);
    color: var(--error);
    font-size: 13px;
  }

  .submit-err {
    font-size: 12px;
    color: var(--error);
    padding: 6px 8px;
    background: var(--error-soft);
    border-radius: var(--r-md);
  }

  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  .pg {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    width: 100%;
  }

  /* Top bar */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--mute);
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-sans);
    padding: 4px 0;
    transition: color 120ms ease;
  }
  .back-btn:hover { color: var(--ink); }

  .pg-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.2px;
  }

  /* Steps bar */
  .steps-bar {
    display: flex;
    align-items: center;
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 14px 20px;
    box-shadow: var(--shadow-l1);
    gap: 0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .step-num {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
    background: var(--canvas-soft-2);
    color: var(--mute);
    border: 1px solid var(--hairline);
  }

  .step.done .step-num,
  .step.active .step-num {
    background: var(--link);
    color: #fff;
    border-color: var(--link);
  }

  .step-label {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--mute);
    white-space: pre-line;
    line-height: 1.3;
  }

  .step.done .step-label,
  .step.active .step-label { color: var(--link); }

  .step-line {
    flex: 1;
    height: 1px;
    background: var(--hairline);
    margin: 0 10px;
  }
  .step-line.done { background: var(--link); }

  /* Body layout */
  .body {
    display: grid;
    grid-template-columns: 1fr 284px;
    gap: var(--sp-md);
    align-items: start;
  }

  .left-col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
  }

  /* Cards */
  .card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--shadow-l1);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  .count-badge {
    font-size: 11px;
    color: var(--mute);
  }

  /* Search */
  .search-wrap {
    position: relative;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hairline);
  }

  .s-icon {
    position: absolute;
    left: 24px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--mute);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 7px 10px 7px 30px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas-soft);
  }
  .search-input::placeholder { color: var(--mute); }
  .search-input:focus { outline: none; border-color: var(--link); background: var(--canvas); }

  /* Category filter chips */
  .filter-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hairline);
  }

  .chip {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--body);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background 100ms ease, color 100ms ease, border-color 100ms ease;
  }
  .chip:hover:not(.chip-active) { background: var(--canvas-soft-2); }
  .chip-active { background: var(--link); color: #fff; border-color: var(--link); }

  /* Scrollable list */
  .list-scroll {
    max-height: 240px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
  }

  /* Employee row */
  .emp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hairline);
    cursor: pointer;
    width: 100%;
    background: var(--canvas);
    border-left: none;
    border-right: none;
    border-top: none;
    text-align: left;
    font-family: var(--font-sans);
    transition: background 100ms ease;
  }
  .emp-row:last-child { border-bottom: none; }
  .emp-row:hover:not(.selected) { background: var(--canvas-soft); }
  .emp-row.selected { background: oklch(96% 0.04 264); }

  .emp-av {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
  }

  .emp-info { flex: 1; min-width: 0; }
  .emp-name { font-size: 13px; font-weight: 500; color: var(--ink); }
  .emp-sub  { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .dept-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--r-xs);
    background: var(--canvas-soft-2);
    color: var(--mute);
    border: 1px solid var(--hairline);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sel-check {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--link);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Asset row */
  .asset-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hairline);
    cursor: pointer;
    width: 100%;
    background: var(--canvas);
    border-left: none;
    border-right: none;
    border-top: none;
    text-align: left;
    font-family: var(--font-sans);
    transition: background 100ms ease;
  }
  .asset-row:last-child { border-bottom: none; }
  .asset-row:hover:not(.selected):not(.unavailable) { background: var(--canvas-soft); }
  .asset-row.selected { background: oklch(96% 0.04 264); }
  .asset-row.unavailable { opacity: 0.55; cursor: not-allowed; }

  .asset-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
    background: var(--canvas-soft-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--mute);
  }
  .asset-row.selected .asset-icon { color: var(--link); background: oklch(93% 0.06 264); }

  .asset-info { flex: 1; min-width: 0; }
  .asset-name { font-size: 13px; font-weight: 500; color: var(--ink); }
  .asset-sn   { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .avail-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-xs);
    flex-shrink: 0;
  }
  .avail-badge.avail { background: oklch(93% 0.06 155); color: oklch(35% 0.15 155); }
  .avail-badge.inuse { background: var(--error-soft); color: var(--error); }

  .list-empty {
    padding: 24px 14px;
    text-align: center;
    font-size: 12px;
    color: var(--mute);
  }

  /* Summary sidebar */
  .summary-card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--shadow-l1);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 16px;
  }

  .sum-head {
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
  }

  .sum-section {
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sum-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .sum-emp { display: flex; align-items: center; gap: 9px; }
  .sum-emp-name { font-size: 13px; font-weight: 500; color: var(--ink); }
  .sum-emp-role { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .sum-empty {
    font-size: 12px;
    color: var(--mute);
    font-style: italic;
  }

  .sum-asset-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sum-asset-icon {
    width: 26px;
    height: 26px;
    border-radius: var(--r-xs);
    background: oklch(93% 0.06 264);
    color: var(--link);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sum-asset-info { flex: 1; min-width: 0; }
  .sum-asset-name { font-size: 12px; font-weight: 500; color: var(--ink); }
  .sum-asset-sn   { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--mute);
    display: flex;
    align-items: center;
    padding: 3px;
    border-radius: var(--r-xs);
    flex-shrink: 0;
    transition: color 100ms ease, background 100ms ease;
  }
  .remove-btn:hover { color: var(--error); background: var(--error-soft); }

  /* Date grid */
  .date-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .date-field { display: flex; flex-direction: column; gap: 4px; }
  .date-label { font-size: 11px; color: var(--body); }
  .date-input {
    font-size: 12px;
    padding: 6px 8px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    width: 100%;
  }
  .date-input:focus { outline: none; border-color: var(--link); }

  /* Notes textarea */
  .notes-ta {
    width: 100%;
    font-size: 12px;
    padding: 7px 9px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    resize: none;
    height: 68px;
    font-family: var(--font-sans);
    color: var(--ink);
    background: var(--canvas);
    line-height: 1.5;
  }
  .notes-ta::placeholder { color: var(--mute); }
  .notes-ta:focus { outline: none; border-color: var(--link); }

  /* Footer buttons */
  .sum-footer {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-primary-full {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 9px 14px;
    background: var(--ink);
    color: var(--on-primary);
    border: none;
    border-radius: var(--r-md);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: opacity 120ms ease;
  }
  .btn-primary-full:hover:not(.disabled) { opacity: 0.85; }
  .btn-primary-full.disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-ghost-full {
    width: 100%;
    padding: 8px 14px;
    background: var(--canvas);
    color: var(--body);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    box-shadow: var(--shadow-l1);
    transition: background 100ms ease;
  }
  .btn-ghost-full:hover { background: var(--canvas-soft-2); }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .body {
      grid-template-columns: 1fr;
    }
    .summary-card {
      position: static;
    }
  }

  @media (max-width: 600px) {
    .topbar {
      flex-wrap: wrap;
      gap: 8px;
    }
    .pg-title {
      flex: 1 1 100%;
      order: -1;
    }
    .steps-bar {
      padding: 10px 12px;
    }
    .step-label {
      display: none;
    }
  }
</style>
