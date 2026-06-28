<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { avatarColor, initials } from '$lib/utils/avatarColor';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import SearchInput from '$lib/components/SearchInput.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Modal from '$lib/components/Modal.svelte';

  // ── Types ────────────────────────────────────────────────────────────────────

  type UserStatus = 'active' | 'inactive' | 'suspended';

  interface SystemUser {
    id: string;
    name: string;
    email: string;
    position: string | null;
    phone: string | null;
    status: UserStatus;
    roleId: string | null;
    branchId: string | null;
    createdAt: string;
    role: { id: string; name: string } | null;
    branch: { id: string; name: string } | null;
  }

  interface Role   { id: string; name: string; }
  interface Branch { id: string; name: string; }

  // ── State ────────────────────────────────────────────────────────────────────

  let users    = $state<SystemUser[]>([]);
  let roles    = $state<Role[]>([]);
  let branches = $state<Branch[]>([]);
  let loading  = $state(true);
  let loadErr  = $state('');

  let search       = $state('');
  let filterStatus = $state<'all' | UserStatus>('all');
  let filterRole   = $state('all');
  let filterBranch = $state('all');

  // ── Create user modal ────────────────────────────────────────────────────────

  let showCreate = $state(false);
  let creating   = $state(false);
  let createErr  = $state('');
  let form = $state({
    name: '', email: '', position: '', phone: '', roleId: '', branchId: '',
  });

  // ── Pagination ────────────────────────────────────────────────────────────────

  let perPage     = $state(25);
  let currentPage = $state(1);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filtered = $derived(
    users.filter((u) => {
      const q = search.toLowerCase();
      const matchQ =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.position ?? '').toLowerCase().includes(q);
      const matchS = filterStatus === 'all' || u.status === filterStatus;
      const matchR = filterRole   === 'all' || u.roleId   === filterRole;
      const matchB = filterBranch === 'all' || u.branchId === filterBranch;
      return matchQ && matchS && matchR && matchB;
    }),
  );

  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
  const pageRows   = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));

  const totalActive    = $derived(users.filter((u) => u.status === 'active').length);
  const totalInactive  = $derived(users.filter((u) => u.status === 'inactive').length);
  const totalSuspended = $derived(users.filter((u) => u.status === 'suspended').length);

  // ── Load ─────────────────────────────────────────────────────────────────────

  onMount(async () => {
    try {
      [users, roles, branches] = await Promise.all([
        api.get<SystemUser[]>('/api/users'),
        api.get<Role[]>('/api/roles'),
        api.get<Branch[]>('/api/branches'),
      ]);
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function resetPage() { currentPage = 1; }

  function clearFilters() {
    search = '';
    filterStatus = 'all';
    filterRole   = 'all';
    filterBranch = 'all';
    currentPage  = 1;
  }

  // ── Create user ───────────────────────────────────────────────────────────────

  async function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    createErr = '';
    if (!form.name.trim() || !form.email.trim()) {
      createErr = 'Name and email are required.';
      return;
    }
    creating = true;
    try {
      const created = await api.post<SystemUser>('/api/users', {
        name:     form.name.trim(),
        email:    form.email.trim(),
        position: form.position.trim() || null,
        phone:    form.phone.trim()    || null,
        roleId:   form.roleId   || null,
        branchId: form.branchId || null,
      });
      users = [created, ...users];
      showCreate = false;
      form = { name: '', email: '', position: '', phone: '', roleId: '', branchId: '' };
    } catch (e) {
      createErr = (e as Error).message;
    } finally {
      creating = false;
    }
  }
</script>

<!-- ── Create user modal ─────────────────────────────────────────────────────── -->
<Modal bind:open={showCreate} title="Add User" onclose={() => (createErr = '')}>
  <form onsubmit={submitCreate} style="display:contents">
    {#if createErr}
      <div class="form-error">{createErr}</div>
    {/if}

    <div class="field-row">
      <div class="field">
        <label class="field-label">Full name *</label>
        <input class="field-input" bind:value={form.name} placeholder="Jane Smith" required />
      </div>
      <div class="field">
        <label class="field-label">Email *</label>
        <input class="field-input" bind:value={form.email} type="email" placeholder="jane@example.com" required />
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label class="field-label">Position</label>
        <input class="field-input" bind:value={form.position} placeholder="IT Admin" />
      </div>
      <div class="field">
        <label class="field-label">Phone</label>
        <input class="field-input" bind:value={form.phone} placeholder="+63 9XX XXX XXXX" />
      </div>
    </div>

    <p class="temp-pw-note">A temporary password will be emailed to the user upon creation.</p>

    <div class="field-row">
      <div class="field">
        <label class="field-label">Role</label>
        <select class="field-input" bind:value={form.roleId}>
          <option value="">— No role —</option>
          {#each roles.filter((r) => r.name !== 'super_admin') as r}
            <option value={r.id}>{r.name}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label class="field-label">Branch</label>
        <select class="field-input" bind:value={form.branchId}>
          <option value="">— No branch —</option>
          {#each branches as b}
            <option value={b.id}>{b.name}</option>
          {/each}
        </select>
      </div>
    </div>

    {#snippet footer()}
      <button type="button" class="btn-ghost" onclick={() => { showCreate = false; createErr = ''; }}>Cancel</button>
      <button type="submit" class="btn-primary" disabled={creating}>
        {creating ? 'Creating…' : 'Create user'}
      </button>
    {/snippet}
  </form>
</Modal>

<!-- ── Page ──────────────────────────────────────────────────────────────────── -->
<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users' }]} />

  <!-- Header -->
  <div class="page-head">
    <div class="head-left">
      <h1 class="page-title">Users</h1>
      <div class="head-meta">
        <span class="meta-pill active-pill">{totalActive} active</span>
        {#if totalInactive > 0}
          <span class="meta-pill inactive-pill">{totalInactive} inactive</span>
        {/if}
        {#if totalSuspended > 0}
          <span class="meta-pill suspended-pill">{totalSuspended} suspended</span>
        {/if}
      </div>
    </div>
    {#if can('manage_users')}
      <button class="btn-primary" onclick={() => (showCreate = true)}>+ Add User</button>
    {/if}
  </div>

  <!-- Stats -->
  <div class="stats-row">
    <StatCard value={users.length} label="Total users" />
    <StatCard value={totalActive} label="Active" />
    <StatCard
      value={[...new Set(users.map((u) => u.roleId).filter(Boolean))].length}
      label="Roles in use"
    />
    <StatCard
      value={[...new Set(users.map((u) => u.branchId).filter(Boolean))].length}
      label="Branches covered"
    />
  </div>

  <!-- Filter bar -->
  <div class="filter-bar">
    <SearchInput bind:value={search} placeholder="Search users…" oninput={resetPage} />

    <select class="filter-select" bind:value={filterStatus} onchange={resetPage}>
      <option value="all">Status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="suspended">Suspended</option>
    </select>

    <select class="filter-select" bind:value={filterRole} onchange={resetPage}>
      <option value="all">Role</option>
      {#each roles as r}
        <option value={r.id}>{r.name}</option>
      {/each}
    </select>

    <select class="filter-select" bind:value={filterBranch} onchange={resetPage}>
      <option value="all">Branch</option>
      {#each branches as b}
        <option value={b.id}>{b.name}</option>
      {/each}
    </select>
  </div>

  <!-- Table card -->
  <div class="table-card">
    {#if loading}
      <div class="state-body"><span class="state-text">Loading users…</span></div>
    {:else if loadErr}
      <div class="state-body">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
          <path d="M12 8V12M12 16H12.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <p class="state-text">Failed to load users: {loadErr}</p>
        <button class="btn-ghost" onclick={() => window.location.reload()}>Retry</button>
      </div>
    {:else}
      <div class="table-scroll">
        <table class="users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Position</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each pageRows as u}
              <tr
                class="user-row"
                onclick={() => goto(`/users/${u.id}`)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && goto(`/users/${u.id}`)}
              >
                <td class="cell-user">
                  <div class="u-avatar" style="background:{avatarColor(u.id)}">{initials(u.name)}</div>
                  <div class="u-identity">
                    <span class="u-name">{u.name}</span>
                    <span class="u-email">{u.email}</span>
                  </div>
                </td>
                <td class="cell-role">
                  {#if u.role?.name}{u.role.name}{:else}<span class="cell-mute">—</span>{/if}
                </td>
                <td class="cell-site">
                  {#if u.branch?.name}{u.branch.name}{:else}<span class="cell-mute">—</span>{/if}
                </td>
                <td class="cell-pos">
                  {#if u.position}{u.position}{:else}<span class="cell-mute">—</span>{/if}
                </td>
                <td>
                  <span class="status-badge status-{u.status}">{u.status}</span>
                </td>
              </tr>
            {/each}
            {#if pageRows.length === 0}
              <tr><td colspan="5" class="empty-row">No users match your filters.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      <Pagination bind:currentPage bind:perPage {totalPages} onchange={resetPage} />
    {/if}
  </div>
</div>

<style>
  /* ── Page shell ──────────────────────────────────────────────────────────── */
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: calc(100vh - 64px);
    min-height: 0;
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .head-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.025em;
    margin: 0;
  }
  .head-meta { display: flex; gap: 6px; }
  .meta-pill {
    font-size: 11.5px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-full);
    font-family: var(--font-sans);
  }
  .active-pill    { background: oklch(94% 0.07 155); color: oklch(38% 0.15 155); }
  .inactive-pill  { background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }
  .suspended-pill { background: oklch(95% 0.06 60);  color: oklch(40% 0.18 60); }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn-primary {
    padding: 8px 16px;
    background: var(--ink);
    color: var(--on-primary);
    border: none;
    border-radius: var(--r-md);
    font-size: 13.5px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 120ms ease;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  .btn-ghost {
    padding: 6px 14px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    background: transparent;
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--body);
    cursor: pointer;
    transition: background 120ms ease;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }

  /* ── Stats ───────────────────────────────────────────────────────────────── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  /* ── Filter bar ──────────────────────────────────────────────────────────── */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filter-select {
    padding: 7px 28px 7px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    background: var(--canvas);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--body);
    cursor: pointer;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 9px center;
    transition: border-color 120ms ease;
  }
  .filter-select:focus { border-color: var(--link); }

  /* ── States ──────────────────────────────────────────────────────────────── */
  .state-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    color: var(--mute);
    font-family: var(--font-sans);
  }
  .state-text { font-size: 14px; color: var(--body); margin: 0; }

  /* ── Table card ──────────────────────────────────────────────────────────── */
  .table-card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l1);
    overflow: hidden;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .table-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .users-table { width: 100%; border-collapse: collapse; }
  .users-table thead th {
    padding: 10px 16px;
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--mute);
    font-family: var(--font-sans);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--hairline);
    background: var(--canvas-soft);
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .user-row { cursor: pointer; transition: background 120ms ease; }
  .user-row:hover { background: var(--canvas-soft); }
  .user-row td { padding: 14px 16px; border-bottom: 1px solid var(--hairline); font-family: var(--font-sans); }
  .user-row:last-child td { border-bottom: none; }
  .empty-row { text-align: center; color: var(--mute); padding: 40px 12px !important; font-size: 13px; }

  .cell-user { display: flex; align-items: center; gap: 12px; }
  .u-avatar {
    width: 36px; height: 36px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; font-family: var(--font-sans);
    color: oklch(99% 0.003 106); flex-shrink: 0; letter-spacing: 0.3px;
  }
  .u-identity { display: flex; flex-direction: column; gap: 1px; }
  .u-name  { font-size: 13.5px; font-weight: 600; color: var(--ink); letter-spacing: -0.2px; }
  .u-email { font-size: 12px; color: var(--mute); }

  .cell-role, .cell-site, .cell-pos { font-size: 13px; color: var(--body); }
  .cell-mute { color: var(--mute); }

  .status-badge {
    display: inline-block;
    font-size: 11.5px;
    font-weight: 500;
    padding: 2px 9px;
    border-radius: var(--r-full);
    font-family: var(--font-sans);
  }
  .status-active    { background: oklch(94% 0.07 155); color: oklch(35% 0.17 155); }
  .status-inactive  { background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }
  .status-suspended { background: oklch(95% 0.06 60);  color: oklch(40% 0.18 60); }

  /* ── Modal form ──────────────────────────────────────────────────────────── */
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-label {
    font-size: 12px; font-weight: 600; color: var(--mute);
    font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.5px;
  }
  .field-input {
    padding: 8px 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    background: var(--canvas);
    font-size: 13.5px;
    font-family: var(--font-sans);
    color: var(--ink);
    outline: none;
    transition: border-color 120ms ease, box-shadow 120ms ease;
    width: 100%;
    box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .form-error {
    padding: 10px 12px;
    background: var(--error-soft);
    border: 1px solid oklch(88% 0.08 25);
    border-radius: var(--r-md);
    font-size: 13px;
    color: var(--error);
    font-family: var(--font-sans);
  }
  .temp-pw-note {
    margin: 0;
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
    padding: 8px 10px;
    background: var(--canvas-soft);
    border-radius: var(--r-md);
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 800px) {
    .stats-row { grid-template-columns: repeat(2, 1fr); }
    .field-row  { grid-template-columns: 1fr; }
    .users-table thead th:nth-child(3), .users-table tbody td:nth-child(3),
    .users-table thead th:nth-child(4), .users-table tbody td:nth-child(4) { display: none; }
  }
  @media (max-width: 600px) {
    .page-head { flex-direction: column; align-items: flex-start; }
    .filter-bar { gap: 6px; }
  }
</style>
