<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';
  import { can } from '$lib/utils/permissions';

  // ── Types ────────────────────────────────────────────────────────────────────

  type UserStatus = 'active' | 'inactive' | 'suspended';

  interface SystemUser {
    id:        string;
    name:      string;
    email:     string;
    position:  string | null;
    phone:     string | null;
    status:    UserStatus;
    roleId:    string | null;
    branchId:  string | null;
    createdAt: string;
    role:      { id: string; name: string } | null;
    branch:    { id: string; name: string } | null;
  }

  interface Role   { id: string; name: string; }
  interface Branch { id: string; name: string; }

  // ── Load state ───────────────────────────────────────────────────────────────

  let user     = $state<SystemUser | null>(null);
  let roles    = $state<Role[]>([]);
  let branches = $state<Branch[]>([]);
  let loading  = $state(true);
  let loadErr  = $state('');

  const userId = $derived($page.params.id);
  const isSelf = $derived(authStore.user?.id === userId);
  const isSuperAdminUser = $derived(user?.role?.name?.trim().toLowerCase() === 'super_admin');
  const isCurrentSuperAdmin = $derived((typeof authStore.user?.role === 'string' ? authStore.user.role : (authStore.user?.role as any)?.name)?.trim().toLowerCase() === 'super_admin');

  // ── Edit state ───────────────────────────────────────────────────────────────

  let editMode = $state(false);
  let saving   = $state(false);
  let saveErr  = $state('');
  let draft    = $state({ name: '', email: '', position: '', phone: '', branchId: '' });

  // ── Modal state ──────────────────────────────────────────────────────────────

  let showResetPw   = $state(false);
  let showAssignRole = $state(false);
  let showConfirmDelete = $state(false);

  let newPassword    = $state('');
  let resetErr       = $state('');
  let resetting      = $state(false);
  let selectedRoleId = $state('');
  let assigningRole  = $state(false);
  let assignRoleErr  = $state('');
  let deleting       = $state(false);

  // ── Load ─────────────────────────────────────────────────────────────────────

  onMount(async () => {
    try {
      [user, roles, branches] = await Promise.all([
        api.get<SystemUser>(`/api/users/${userId}`),
        api.get<Role[]>('/api/roles'),
        api.get<Branch[]>('/api/branches'),
      ]);
      selectedRoleId = user?.roleId ?? '';
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

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

  // ── Edit ─────────────────────────────────────────────────────────────────────

  function startEdit() {
    if (!user) return;
    draft = {
      name:     user.name,
      email:    user.email,
      position: user.position ?? '',
      phone:    user.phone    ?? '',
      branchId: user.branchId  ?? '',
    };
    saveErr  = '';
    editMode = true;
  }

  async function saveEdit() {
    if (!user) return;
    saveErr = '';
    if (!draft.name.trim() || !draft.email.trim()) {
      saveErr = 'Name and email are required.';
      return;
    }
    saving = true;
    try {
      user = await api.put<SystemUser>(`/api/users/${userId}`, {
        name:     draft.name.trim(),
        email:    draft.email.trim(),
        position: draft.position.trim() || null,
        phone:    draft.phone.trim()    || null,
        branchId: draft.branchId         || null,
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
    if (!user) return;
    const next: UserStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      user = await api.patch<SystemUser>(`/api/users/${userId}/status`, { status: next });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ── Assign role ───────────────────────────────────────────────────────────────

  async function submitAssignRole(e: SubmitEvent) {
    e.preventDefault();
    assignRoleErr = '';
    assigningRole = true;
    try {
      user = await api.put<SystemUser>(`/api/users/${userId}/role`, { roleId: selectedRoleId || null });
      showAssignRole = false;
    } catch (e) {
      assignRoleErr = (e as Error).message;
    } finally {
      assigningRole = false;
    }
  }

  // ── Reset password ────────────────────────────────────────────────────────────

  async function submitResetPw(e: SubmitEvent) {
    e.preventDefault();
    resetErr = '';
    if (newPassword.length < 8) { resetErr = 'Password must be at least 8 characters.'; return; }
    resetting = true;
    try {
      await api.put(`/api/users/${userId}/reset-password`, { newPassword });
      showResetPw = false;
      newPassword = '';
    } catch (e) {
      resetErr = (e as Error).message;
    } finally {
      resetting = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function confirmDelete() {
    deleting = true;
    try {
      await api.delete(`/api/users/${userId}`);
      goto('/users');
    } catch (e) {
      alert((e as Error).message);
      deleting = false;
      showConfirmDelete = false;
    }
  }
</script>

<!-- ── Reset password modal ───────────────────────────────────────────────── -->
{#if showResetPw}
<div class="modal-backdrop" onclick={() => { showResetPw = false; resetErr = ''; newPassword = ''; }}>
  <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <span class="modal-title">Reset Password</span>
      <button class="modal-close" onclick={() => { showResetPw = false; resetErr = ''; newPassword = ''; }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <form class="modal-body" onsubmit={submitResetPw}>
      {#if resetErr}<div class="form-error">{resetErr}</div>{/if}
      <div class="field">
        <label class="field-label">New password</label>
        <input class="field-input" bind:value={newPassword} type="password" placeholder="Min 8 characters" required />
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-ghost" onclick={() => { showResetPw = false; resetErr = ''; newPassword = ''; }}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={resetting}>{resetting ? 'Saving…' : 'Set password'}</button>
      </div>
    </form>
  </div>
</div>
{/if}

<!-- ── Assign role modal ──────────────────────────────────────────────────── -->
{#if showAssignRole}
<div class="modal-backdrop" onclick={() => { showAssignRole = false; assignRoleErr = ''; }}>
  <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <span class="modal-title">Assign Role</span>
      <button class="modal-close" onclick={() => { showAssignRole = false; assignRoleErr = ''; }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <form class="modal-body" onsubmit={submitAssignRole}>
      {#if assignRoleErr}<div class="form-error">{assignRoleErr}</div>{/if}
      <div class="field">
        <label class="field-label">Role</label>
        <select class="field-input" bind:value={selectedRoleId}>
          <option value="">— No role —</option>
          {#each roles.filter((r) => r.name.trim().toLowerCase() !== 'super_admin') as r}
            <option value={r.id}>{r.name}</option>
          {/each}
        </select>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-ghost" onclick={() => { showAssignRole = false; assignRoleErr = ''; }}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={assigningRole}>{assigningRole ? 'Saving…' : 'Assign role'}</button>
      </div>
    </form>
  </div>
</div>
{/if}

<!-- ── Delete confirmation ────────────────────────────────────────────────── -->
{#if showConfirmDelete}
<div class="modal-backdrop" onclick={() => showConfirmDelete = false}>
  <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <span class="modal-title">Delete User</span>
      <button class="modal-close" onclick={() => showConfirmDelete = false}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <p class="confirm-text">Delete <strong>{user?.name}</strong>? This cannot be undone.</p>
      <div class="modal-foot">
        <button class="btn-ghost" onclick={() => showConfirmDelete = false}>Cancel</button>
        <button class="btn-danger" onclick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete user'}</button>
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
    <span class="eb-label">Editing user</span>
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
  <div class="loading-state">Loading user…</div>

{:else if loadErr}
  <div class="error-state">
    <p>Failed to load user: {loadErr}</p>
    <button class="btn-ghost" onclick={() => goto('/users')}>← Back to Users</button>
  </div>

{:else if !user}
  <div class="error-state">
    <p>User not found.</p>
    <button class="btn-ghost" onclick={() => goto('/users')}>← Back to Users</button>
  </div>

{:else}
<div class="page">

  <!-- Top strip -->
  <div class="top-strip">
    <nav class="breadcrumb">
      <button class="bc-link" onclick={() => goto('/users')}>Users</button>
      <span class="bc-sep">›</span>
      <span class="bc-cur">{user.name}</span>
    </nav>
    <div class="top-actions">
      {#if can('manage_users') && !isSelf && !isSuperAdminUser}
        <button class="btn-ghost btn-ghost-warn" onclick={() => showConfirmDelete = true}>Delete</button>
        <button class="btn-ghost" onclick={toggleStatus}>
          {user.status === 'active' ? 'Disable' : 'Enable'}
        </button>
      {/if}
      {#if isCurrentSuperAdmin && !isSuperAdminUser}
        <button class="btn-ghost" onclick={() => { selectedRoleId = user?.roleId ?? ''; showAssignRole = true; }}>Assign Role</button>
      {/if}
      {#if can('manage_users') && !isSuperAdminUser}
        <button class="btn-ghost" onclick={() => showResetPw = true}>Reset Password</button>
      {/if}
      {#if (can('manage_users') && !isSuperAdminUser) || isSelf && !isSuperAdminUser}
        <button class="btn-primary" onclick={startEdit}>Edit</button>
      {/if}
    </div>
  </div>

  <!-- Main grid -->
  <div class="main-grid">

    <!-- Left: profile card -->
    <div class="left-col">

      <div class="profile-card">
        <div class="profile-row">

          <!-- Avatar panel -->
          <div class="avatar-panel">
            <div class="avatar-circle" style="background:{avatarColor(user.id)}">{initials(user.name)}</div>
            {#if editMode}
              <input class="ap-input ap-name-input" bind:value={draft.name} placeholder="Full name" />
              <input class="ap-input ap-email-input" bind:value={draft.email} type="email" placeholder="email@example.com" />
            {:else}
              <span class="prof-name">{user.name}</span>
              <span class="prof-email">{user.email}</span>
            {/if}
            <span class="status-badge status-{user.status}">{user.status}</span>
          </div>

          <!-- Field grid -->
          <div class="field-grid">
            <div class="fc">
              <span class="fl">ROLE</span>
              <span class="fv" class:fv-mute={!user.role?.name}>{user.role?.name ?? '—'}</span>
            </div>
            <div class="fc">
              <span class="fl">BRANCH</span>
              {#if editMode}
                <select class="fc-select" bind:value={draft.branchId}>
                  <option value="">— None —</option>
                  {#each branches as b}
                    <option value={b.id}>{b.name}</option>
                  {/each}
                </select>
              {:else}
                <span class="fv" class:fv-mute={!user.branch?.name}>{user.branch?.name ?? '—'}</span>
              {/if}
            </div>
            <div class="fc">
              <span class="fl">POSITION</span>
              {#if editMode}
                <input class="fc-input" bind:value={draft.position} placeholder="Job title" />
              {:else}
                <span class="fv" class:fv-mute={!user.position}>{user.position ?? '—'}</span>
              {/if}
            </div>
            <div class="fc">
              <span class="fl">PHONE</span>
              {#if editMode}
                <input class="fc-input" bind:value={draft.phone} type="tel" placeholder="+1 (555) …" />
              {:else}
                <span class="fv" class:fv-mute={!user.phone}>{user.phone ?? '—'}</span>
              {/if}
            </div>
            <div class="fc fc-last">
              <span class="fl">USER ID</span>
              <span class="fv fv-mono">{user.id}</span>
            </div>
            <div class="fc fc-last">
              <span class="fl">JOINED</span>
              <span class="fv">{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Right: quick info -->
    <div class="right-col">
      <div class="side-card">
        <span class="side-title">Quick info</span>
        <div class="qi-list">
          <div class="qi-row">
            <span class="qi-label">Status</span>
            <span class="status-badge status-{user.status}">{user.status}</span>
          </div>
          <div class="qi-row">
            <span class="qi-label">Role</span>
            <span class="qi-val">{user.role?.name ?? '—'}</span>
          </div>
          <div class="qi-row">
            <span class="qi-label">Branch</span>
            <span class="qi-val">{user.branch?.name ?? '—'}</span>
          </div>
          <div class="qi-row">
            <span class="qi-label">Position</span>
            <span class="qi-val">{user.position ?? '—'}</span>
          </div>
          <div class="qi-row qi-last">
            <span class="qi-label">Joined</span>
            <span class="qi-val">{formatDate(user.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>
{/if}

<style>
  /* ── States ─────────────────────────────────────────────────────────────── */
  .loading-state { padding: 64px 24px; text-align: center; font-size: 14px; color: var(--mute); font-family: var(--font-sans); }
  .error-state { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 80px 24px; text-align: center; font-family: var(--font-sans); }
  .error-state p { font-size: 14px; color: var(--body); margin: 0; }
  .btn-ghost { padding: 7px 14px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: transparent; font-size: 13px; font-family: var(--font-sans); color: var(--body); cursor: pointer; transition: background 120ms ease; }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-ghost-warn { color: var(--error-deep); border-color: oklch(88% 0.07 25); }
  .btn-ghost-warn:hover { background: var(--error-soft); }

  /* ── Edit bar ───────────────────────────────────────────────────────────── */
  .edit-bar { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 200; display: flex; align-items: center; gap: 12px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: 0 4px 24px oklch(0% 0 0 / 0.12); padding: 10px 14px; font-family: var(--font-sans); white-space: nowrap; }
  .eb-indicator { display: flex; align-items: center; gap: 7px; }
  .eb-dot { width: 7px; height: 7px; border-radius: 999px; background: oklch(58% 0.20 155); flex-shrink: 0; }
  .eb-label { font-size: 13px; color: var(--body); font-weight: 500; }
  .eb-err { font-size: 12px; color: var(--error-deep); }
  .eb-actions { display: flex; gap: 6px; }
  .eb-discard { padding: 6px 14px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: transparent; font-size: 13px; font-family: var(--font-sans); color: var(--body); cursor: pointer; transition: background 120ms ease; }
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
  .btn-primary { padding: 7px 14px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-size: 13px; font-weight: 500; font-family: var(--font-sans); cursor: pointer; transition: opacity 120ms ease; }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-danger { padding: 7px 14px; background: var(--error); color: #fff; border: none; border-radius: var(--r-md); font-size: 13px; font-weight: 500; font-family: var(--font-sans); cursor: pointer; transition: opacity 120ms ease; }
  .btn-danger:hover:not(:disabled) { opacity: 0.85; }
  .btn-danger:disabled { opacity: 0.5; cursor: default; }

  /* ── Main grid ──────────────────────────────────────────────────────────── */
  .main-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
  .left-col { display: flex; flex-direction: column; gap: 16px; }

  /* ── Profile card ───────────────────────────────────────────────────────── */
  .profile-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); overflow: hidden; }
  .profile-row { display: grid; grid-template-columns: 176px 1fr; }
  .avatar-panel { background: var(--canvas-soft-2); border-right: 1px solid var(--hairline); padding: 28px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .avatar-circle { width: 64px; height: 64px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; font-family: var(--font-sans); color: oklch(99% 0.003 106); flex-shrink: 0; letter-spacing: 0.5px; margin-bottom: 4px; }
  .prof-name { font-size: 15px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.3px; text-align: center; }
  .prof-email { font-size: 11.5px; color: var(--mute); font-family: var(--font-sans); text-align: center; word-break: break-all; }
  .ap-input { width: 100%; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-sm); outline: none; font-family: var(--font-sans); padding: 4px 8px; text-align: center; transition: border-color 120ms ease; box-sizing: border-box; }
  .ap-input:focus { border-color: var(--link); }
  .ap-name-input { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .ap-email-input { font-size: 11.5px; color: var(--mute); }

  .field-grid { display: grid; grid-template-columns: 1fr 1fr; align-content: start; }
  .fc { display: flex; flex-direction: column; gap: 5px; padding: 14px 20px; border-bottom: 1px solid var(--hairline); border-right: 1px solid var(--hairline); }
  .fc:nth-child(2n) { border-right: none; }
  .fc.fc-last { border-bottom: none; }
  .fl { font-size: 10px; font-weight: 600; color: var(--mute); font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.6px; }
  .fv { font-size: 13.5px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .fv-mono { font-family: var(--font-mono); font-size: 12px; word-break: break-all; }
  .fv-mute { font-weight: 400; color: var(--mute); }
  .fc-input, .fc-select { width: 100%; padding: 5px 8px; border: 1px solid var(--hairline); border-radius: var(--r-sm); background: var(--canvas-soft); font-size: 13px; font-weight: 600; font-family: var(--font-sans); color: var(--ink); outline: none; transition: border-color 120ms ease; box-sizing: border-box; }
  .fc-input:focus, .fc-select:focus { border-color: var(--link); background: var(--canvas); }

  /* ── Status badge ───────────────────────────────────────────────────────── */
  .status-badge { display: inline-block; font-size: 11.5px; font-weight: 500; padding: 2px 9px; border-radius: var(--r-full); font-family: var(--font-sans); }
  .status-active    { background: oklch(94% 0.07 155); color: oklch(35% 0.17 155); }
  .status-inactive  { background: var(--canvas-soft-2); color: var(--mute); border: 1px solid var(--hairline); }
  .status-suspended { background: oklch(95% 0.06 60); color: oklch(40% 0.18 60); }

  /* ── Right col ──────────────────────────────────────────────────────────── */
  .right-col { display: flex; flex-direction: column; gap: 16px; }
  .side-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); box-shadow: var(--shadow-l1); padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .side-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .qi-list { display: flex; flex-direction: column; }
  .qi-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--hairline); }
  .qi-row.qi-last { border-bottom: none; }
  .qi-label { font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); }
  .qi-val { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); text-align: right; }

  /* ── Modal ──────────────────────────────────────────────────────────────── */
  .modal-backdrop { position: fixed; inset: 0; background: oklch(0% 0 0 / 0.45); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; }
  .modal { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-xl); box-shadow: 0 8px 40px oklch(0% 0 0 / 0.18); width: 100%; max-width: 440px; }
  .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--hairline); }
  .modal-title { font-size: 16px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.3px; }
  .modal-close { background: none; border: none; cursor: pointer; color: var(--mute); padding: 4px; border-radius: var(--r-sm); transition: background 120ms ease, color 120ms ease; }
  .modal-close:hover { background: var(--canvas-soft-2); color: var(--ink); }
  .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-size: 12px; font-weight: 600; color: var(--mute); font-family: var(--font-sans); text-transform: uppercase; letter-spacing: 0.5px; }
  .field-input { padding: 8px 10px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); font-size: 13.5px; font-family: var(--font-sans); color: var(--ink); outline: none; transition: border-color 120ms ease, box-shadow 120ms ease; width: 100%; box-sizing: border-box; }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .modal-foot { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--hairline); padding-top: 16px; }
  .form-error { padding: 10px 12px; background: var(--error-soft); border: 1px solid oklch(88% 0.08 25); border-radius: var(--r-md); font-size: 13px; color: var(--error-deep); font-family: var(--font-sans); }
  .confirm-text { font-size: 14px; color: var(--body); font-family: var(--font-sans); margin: 0; line-height: 1.5; }
  .confirm-text strong { color: var(--ink); }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 960px) {
    .main-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .profile-row { grid-template-columns: 1fr; }
    .avatar-panel { border-right: none; border-bottom: 1px solid var(--hairline); }
    .top-strip { flex-direction: column; align-items: flex-start; }
    .edit-bar { width: calc(100% - 32px); flex-wrap: wrap; gap: 8px; justify-content: space-between; }
  }
</style>
