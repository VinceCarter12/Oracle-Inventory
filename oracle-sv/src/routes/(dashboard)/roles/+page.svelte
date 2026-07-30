<svelte:head>
  <title>Roles — Oracle Inventory</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import Modal from '$lib/components/Modal.svelte';

  interface Permission {
    id: string;
    key: string;
    description: string | null;
  }

  interface RoleRow {
    id: string;
    name: string;
    description: string | null;
    _count: { users: number };
    permissions: { permission: Permission }[];
  }

  let roles    = $state<RoleRow[]>([]);
  let allPerms = $state<Permission[]>([]);
  let loading  = $state(true);
  let pageErr  = $state('');

  // ── Create / edit modal ──────────────────────────────────────────────────────
  let modalOpen  = $state(false);
  let isEdit     = $state(false);
  let editId     = $state('');
  let mName      = $state('');
  let mDesc      = $state('');
  let mPerms     = $state(new Set<string>());
  let mSaving    = $state(false);
  let mErr       = $state('');
  const isSuperAdmin = $derived(
    (typeof authStore.user?.role === 'string' ? authStore.user.role : (authStore.user?.role as any)?.name)
      ?.trim()
      .toLowerCase() === 'super_admin'
  );

  // ── Delete confirmation ──────────────────────────────────────────────────────
  let delRole    = $state<RoleRow | null>(null);
  let deleting   = $state(false);

  async function load() {
    loading = true; pageErr = '';
    try {
      const [r, p] = await Promise.all([
        api.get<RoleRow[]>('/api/roles'),
        api.get<Permission[]>('/api/roles/permissions'),
      ]);
      roles = r; allPerms = p;
    } catch (e: any) { pageErr = e.message; }
    finally { loading = false; }
  }

  function openCreate() {
    isEdit = false; editId = ''; mName = ''; mDesc = '';
    mPerms = new Set(); mErr = ''; modalOpen = true;
  }

  function openEdit(role: RoleRow) {
    isEdit = true; editId = role.id; mName = role.name;
    mDesc = role.description ?? '';
    mPerms = new Set(role.permissions.map(rp => rp.permission.id));
    mErr = ''; modalOpen = true;
  }

  function togglePerm(id: string) {
    const s = new Set(mPerms);
    s.has(id) ? s.delete(id) : s.add(id);
    mPerms = s;
  }

  async function saveModal() {
    if (!mName.trim()) { mErr = 'Name is required'; return; }
    mSaving = true; mErr = '';
    try {
      const permIds = [...mPerms];
      if (isEdit) {
        await api.put(`/api/roles/${editId}`, { name: mName.trim(), description: mDesc.trim() || null });
        if (isSuperAdmin) await api.put(`/api/roles/${editId}/permissions`, { permissionIds: permIds });
      } else {
        const r = await api.post<RoleRow>('/api/roles', { name: mName.trim(), description: mDesc.trim() || null });
        if (isSuperAdmin) await api.put(`/api/roles/${r.id}/permissions`, { permissionIds: permIds });
      }
      modalOpen = false;
      await load();
    } catch (e: any) { mErr = e.message; }
    finally { mSaving = false; }
  }

  async function doDelete() {
    if (!delRole) return;
    deleting = true;
    try {
      await api.delete(`/api/roles/${delRole.id}`);
      delRole = null;
      await load();
    } catch (e: any) { pageErr = e.message; delRole = null; }
    finally { deleting = false; }
  }

  function permLabel(key: string) {
    return key.replace(/_/g, ' ');
  }

  onMount(load);
</script>

<div class="page">

  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Roles' }]} />

  <!-- ── Header ─────────────────────────────────────────────────────────── -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Roles</h1>
      <p class="page-sub">Manage access roles and their permissions</p>
    </div>
    {#if isSuperAdmin}
      <button class="btn-primary" onclick={openCreate}>+ New Role</button>
    {/if}
  </div>

  {#if pageErr}
    <div class="alert-error">{pageErr}</div>
  {/if}

  <!-- ── Role cards ──────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="skeleton-grid">
      {#each [1,2,3,4] as _}
        <div class="skeleton-card"></div>
      {/each}
    </div>
  {:else if roles.length === 0}
    <div class="empty">No roles found.</div>
  {:else}
    <div class="roles-grid">
      {#each roles as role}
        <div class="role-card">
          <div class="role-card-head">
            <div>
              <div class="role-name">{role.name}</div>
              {#if role.description}
                <div class="role-desc">{role.description}</div>
              {/if}
            </div>
            {#if isSuperAdmin}
              <div class="role-actions">
                <button class="action-btn" onclick={() => openEdit(role)} title="Edit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 19V12"/>
                    <path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="action-btn action-btn--danger" onclick={() => delRole = role} title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path d="M3 6H21M8 6V4H16V6M19 6L18 20H6L5 6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            {/if}
          </div>

          <div class="role-meta">
            <span class="meta-badge">{role._count.users} user{role._count.users !== 1 ? 's' : ''}</span>
            <span class="meta-badge">{role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}</span>
          </div>

          <div class="perm-chips">
            {#each role.permissions.slice(0, 6) as rp}
              <span class="perm-chip">{permLabel(rp.permission.key)}</span>
            {/each}
            {#if role.permissions.length > 6}
              <span class="perm-chip perm-chip--more">+{role.permissions.length - 6} more</span>
            {/if}
            {#if role.permissions.length === 0}
              <span class="no-perms">No permissions assigned</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- ── Create / Edit modal ───────────────────────────────────────────────── -->
<Modal bind:open={modalOpen} title={isEdit ? 'Edit Role' : 'New Role'} maxWidth="480px">
  <label class="field">
    <span class="field-label">Name</span>
    <input class="field-input" type="text" bind:value={mName} placeholder="e.g. technician" maxlength="64" />
  </label>

  <label class="field">
    <span class="field-label">Description <span class="opt">(optional)</span></span>
    <input class="field-input" type="text" bind:value={mDesc} placeholder="Short description" maxlength="128" />
  </label>

  <div class="field">
    <span class="field-label">Permissions</span>
    {#if isSuperAdmin}
    <div class="perm-list">
      {#each allPerms as perm}
        <label class="perm-row">
          <input type="checkbox" class="perm-check" checked={mPerms.has(perm.id)} onchange={() => togglePerm(perm.id)} />
          <span class="perm-row-key">{permLabel(perm.key)}</span>
          {#if perm.description}
            <span class="perm-row-desc">{perm.description}</span>
          {/if}
        </label>
      {/each}
    </div>
    {:else}
      <p class="field-label">Permission changes require Super Admin.</p>
    {/if}
  </div>

  {#if mErr}<div class="modal-err">{mErr}</div>{/if}

  {#snippet footer()}
    <button class="btn-ghost" onclick={() => modalOpen = false} disabled={mSaving}>Cancel</button>
    <button class="btn-primary" onclick={saveModal} disabled={mSaving}>
      {mSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create role')}
    </button>
  {/snippet}
</Modal>

<!-- ── Delete confirmation ────────────────────────────────────────────────── -->
<Modal open={delRole !== null} title="Delete role?" maxWidth="380px" onclose={() => delRole = null}>
  <p class="confirm-text">
    Delete <strong>{delRole?.name}</strong>? This removes the role from all
    {delRole?._count.users} user{(delRole?._count.users ?? 0) !== 1 ? 's' : ''} assigned to it.
    This action cannot be undone.
  </p>
  {#snippet footer()}
    <button class="btn-ghost" onclick={() => delRole = null} disabled={deleting}>Cancel</button>
    <button class="btn-danger" onclick={doDelete} disabled={deleting}>
      {deleting ? 'Deleting…' : 'Delete role'}
    </button>
  {/snippet}
</Modal>

<style>

  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .page-title {
    font-size: 26px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.7px;
    font-family: var(--font-sans);
    line-height: 1.2;
  }

  .page-sub {
    font-size: 13px;
    color: var(--mute);
    font-family: var(--font-sans);
    margin-top: 3px;
  }

  /* ── Buttons ─────────────────────────────────────────────────────────────── */
  .btn-primary {
    height: 34px;
    padding: 0 16px;
    background: var(--ink);
    color: var(--on-primary);
    border: none;
    border-radius: var(--r-pill);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 120ms ease;
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    height: 34px;
    padding: 0 16px;
    background: transparent;
    color: var(--body);
    border: 1px solid var(--hairline);
    border-radius: var(--r-pill);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background 120ms ease;
  }

  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-danger {
    height: 34px;
    padding: 0 16px;
    background: var(--error);
    color: #fff;
    border: none;
    border-radius: var(--r-pill);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: opacity 120ms ease;
  }

  .btn-danger:hover:not(:disabled) { opacity: 0.85; }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Alert ───────────────────────────────────────────────────────────────── */
  .alert-error {
    padding: 10px 14px;
    border-radius: var(--r-md);
    background: var(--error-soft);
    color: var(--error);
    font-size: 13px;
    font-family: var(--font-sans);
  }

  /* ── Skeleton ────────────────────────────────────────────────────────────── */
  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .skeleton-card {
    height: 160px;
    background: var(--canvas);
    border-radius: var(--r-lg);
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }

  /* ── Empty ───────────────────────────────────────────────────────────────── */
  .empty {
    color: var(--mute);
    font-size: 14px;
    font-family: var(--font-sans);
    padding: 40px 0;
    text-align: center;
  }

  /* ── Roles grid ──────────────────────────────────────────────────────────── */
  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .role-card {
    background: var(--canvas);
    border-radius: var(--r-lg);
    padding: 18px 20px 20px;
    box-shadow: var(--shadow-l2);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .role-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .role-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.2px;
  }

  .role-desc {
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
    margin-top: 2px;
  }

  .role-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--r-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--mute);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 120ms ease, background 120ms ease;
  }

  .action-btn:hover { color: var(--ink); background: var(--canvas-soft-2); }
  .action-btn--danger:hover { color: var(--error); }

  .role-meta {
    display: flex;
    gap: 6px;
  }

  .meta-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: var(--r-full);
    font-size: 11px;
    font-weight: 500;
    font-family: var(--font-sans);
    background: var(--canvas-soft-2);
    color: var(--mute);
  }

  /* ── Permission chips ────────────────────────────────────────────────────── */
  .perm-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .perm-chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--r-full);
    font-size: 11px;
    font-weight: 500;
    font-family: var(--font-sans);
    background: var(--link-bg-soft);
    color: oklch(45% 0.15 264);
    text-transform: capitalize;
  }

  .perm-chip--more {
    background: var(--canvas-soft-2);
    color: var(--mute);
  }

  .no-perms {
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
    font-style: italic;
  }

  /* ── Fields ──────────────────────────────────────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
  }

  .opt {
    font-weight: 400;
    color: var(--mute);
  }

  .field-input {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    background: var(--canvas);
    color: var(--ink);
    font-size: 13.5px;
    font-family: var(--font-sans);
    transition: border-color 120ms ease;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--hairline-strong);
  }

  /* ── Permission checklist ────────────────────────────────────────────────── */
  .perm-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .perm-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    cursor: pointer;
    background: var(--canvas);
    transition: background 100ms ease;
  }

  .perm-row:hover { background: var(--canvas-soft); }

  .perm-check {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--ink);
  }

  .perm-row-key {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
    text-transform: capitalize;
    min-width: 140px;
  }

  .perm-row-desc {
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
  }

  .modal-err {
    font-size: 13px;
    color: var(--error);
    font-family: var(--font-sans);
    padding: 8px 10px;
    border-radius: var(--r-sm);
    background: var(--error-soft);
  }

  /* ── Delete confirm ──────────────────────────────────────────────────────── */
  .confirm-text {
    font-size: 13.5px;
    color: var(--body);
    font-family: var(--font-sans);
    line-height: 1.55;
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 600px) {
    .roles-grid { grid-template-columns: 1fr; }
    .page-header { flex-direction: column; align-items: flex-start; }
  }
</style>
