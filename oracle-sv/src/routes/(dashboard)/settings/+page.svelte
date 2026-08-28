<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { onChange } from '$lib/ws';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';

  /* ── Active subnav panel ── */
  let activePanel = $state('general');

  /* ── My Settings state ── */
  let appearance = $state<'light' | 'dark' | 'system'>('light');

  function applyTheme(val: 'light' | 'dark' | 'system') {
    appearance = val;
    const isDark = val === 'dark' || (val === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', val);
  }

  /* ── Profile state ── */
  let profileName     = $state('');
  let profileEmail    = $state('');
  let profilePosition = $state('');
  let profilePhone    = $state('');
  let profileRole     = $state('');
  let originalEmail   = $state(''); // email as loaded from API — used to detect real changes
  let profileSaving   = $state(false);
  let profileSaved    = $state(false);
  let profileError    = $state('');

  // OTP modal for email change
  let otpModalOpen    = $state(false);
  let otpCode         = $state('');
  let otpRequesting   = $state(false);
  let otpError        = $state('');
  let pendingProfile: { name: string; email: string; position: string; phone: string } | null = null;

  async function requestEmailOtp() {
    otpRequesting = true;
    otpError = '';
    try {
      await api.post('/api/auth/request-otp', { purpose: 'change_email' });
      otpModalOpen = true;
    } catch (e: unknown) {
      profileError = e instanceof Error ? e.message : 'Failed to send OTP.';
    } finally {
      otpRequesting = false;
    }
  }

  async function saveProfile() {
    profileError = '';
    const payload = {
      name:     profileName.trim(),
      email:    profileEmail.trim(),
      position: profilePosition.trim(),
      phone:    profilePhone.trim(),
    };
    if (!payload.name || !payload.email) {
      profileError = 'Name and email are required.';
      return;
    }

    const emailChanged = payload.email.toLowerCase() !== originalEmail.toLowerCase();
    if (emailChanged) {
      pendingProfile = payload;
      await requestEmailOtp();
      return;
    }

    await submitProfileSave(payload);
  }

  async function submitProfileSave(
    payload: { name: string; email: string; position: string; phone: string },
    resolvedOtpCode?: string,
  ) {
    profileSaving = true;
    profileError = '';
    try {
      await api.put('/api/users/me', { ...payload, ...(resolvedOtpCode ? { otpCode: resolvedOtpCode } : {}) });
      profileSaved = true;
      otpModalOpen = false;
      otpCode = '';
      pendingProfile = null;
      setTimeout(() => { profileSaved = false; }, 2200);
    } catch (e: unknown) {
      profileError = e instanceof Error ? e.message : 'Failed to save profile.';
    } finally {
      profileSaving = false;
    }
  }

  async function confirmOtpAndSave() {
    if (!otpCode.trim()) { otpError = 'Enter the code from your email.'; return; }
    if (!pendingProfile) return;
    otpError = '';
    await submitProfileSave(pendingProfile, otpCode.trim());
    if (profileError) { otpError = profileError; profileError = ''; }
  }

  function cancelOtp() {
    otpModalOpen = false;
    otpCode = '';
    otpError = '';
    pendingProfile = null;
  }

  /* ── Password change ── */
  let pwCurrent       = $state('');
  let pwNew           = $state('');
  let pwConfirm       = $state('');
  let pwSaving        = $state(false);
  let pwSaved         = $state(false);
  let pwError         = $state('');
  let pwOtpSent       = $state(false);
  let pwOtpCode       = $state('');
  let pwOtpRequesting = $state(false);

  async function requestPwOtp() {
    pwError = '';
    if (!pwCurrent || !pwNew || !pwConfirm) { pwError = 'All fields are required.'; return; }
    if (pwNew.length < 8) { pwError = 'New password must be at least 8 characters.'; return; }
    if (pwNew !== pwConfirm) { pwError = 'Passwords do not match.'; return; }
    pwOtpRequesting = true;
    try {
      await api.post('/api/auth/request-otp', { purpose: 'change_password' });
      pwOtpSent = true;
      pwOtpCode = '';
    } catch (e: unknown) {
      pwError = e instanceof Error ? e.message : 'Failed to send verification code.';
    } finally {
      pwOtpRequesting = false;
    }
  }

  async function changePassword() {
    pwError = '';
    if (!pwOtpCode.trim()) { pwError = 'Enter the verification code from your email.'; return; }
    pwSaving = true;
    try {
      await api.put('/api/users/me/password', { currentPassword: pwCurrent, newPassword: pwNew, otpCode: pwOtpCode.trim() });
      pwSaved = true;
      pwCurrent = ''; pwNew = ''; pwConfirm = '';
      pwOtpSent = false; pwOtpCode = '';
      setTimeout(() => { pwSaved = false; }, 2200);
    } catch (e: unknown) {
      pwError = e instanceof Error ? e.message : 'Failed to change password.';
    } finally {
      pwSaving = false;
    }
  }

  /* ── Categories state ── */
  interface Category { id: string; name: string; _count: { assets: number }; }
  let categories      = $state<Category[]>([]);
  let catLoading      = $state(false);
  let catNewName      = $state('');
  let catAdding       = $state(false);
  let catAddError     = $state('');
  let catEditId       = $state<string | null>(null);
  let catEditName     = $state('');
  let catEditSaving   = $state(false);
  let catEditError    = $state('');
  let catDeleteId     = $state<string | null>(null);
  let catDeleting     = $state(false);
  let catDeleteError  = $state('');

  async function loadCategories() {
    catLoading = true;
    try {
      categories = await api.get<Category[]>('/api/categories');
    } catch { /* keep empty */ } finally {
      catLoading = false;
    }
  }

  async function addCategory() {
    if (!catNewName.trim()) return;
    catAdding = true; catAddError = '';
    try {
      const created = await api.post<Category>('/api/categories', { name: catNewName.trim() });
      categories = [...categories, created].sort((a, b) => a.name.localeCompare(b.name));
      catNewName = '';
    } catch (e: unknown) {
      catAddError = e instanceof Error ? e.message : 'Failed to add category.';
    } finally {
      catAdding = false;
    }
  }

  function startEditCat(cat: Category) {
    catEditId    = cat.id;
    catEditName  = cat.name;
    catEditError = '';
  }

  async function saveEditCat(id: string) {
    if (!catEditName.trim()) return;
    catEditSaving = true; catEditError = '';
    try {
      const updated = await api.put<Category>(`/api/categories/${id}`, { name: catEditName.trim() });
      categories = categories.map(c => c.id === id ? updated : c).sort((a, b) => a.name.localeCompare(b.name));
      catEditId = null;
    } catch (e: unknown) {
      catEditError = e instanceof Error ? e.message : 'Failed to save.';
    } finally {
      catEditSaving = false;
    }
  }

  async function deleteCategory(id: string) {
    catDeleting = true; catDeleteError = '';
    try {
      await api.delete(`/api/categories/${id}`);
      categories = categories.filter(c => c.id !== id);
      catDeleteId = null;
    } catch (e: unknown) {
      catDeleteError = e instanceof Error ? e.message : 'Cannot delete this category.';
    } finally {
      catDeleting = false;
    }
  }

  $effect(() => {
    if (activePanel === 'categories' && categories.length === 0 && !catLoading) {
      loadCategories();
    }
  });



  /* ── Sliding pill ── */
  let itemRefs: Record<string, HTMLButtonElement> = $state({});
  let pillTop    = $state(0);
  let pillHeight = $state(34);

  $effect(() => {
    const el = itemRefs[activePanel];
    if (el) {
      pillTop    = el.offsetTop;
      pillHeight = el.offsetHeight;
    }
  });

  /* ── Subnav ── */
  const SUBNAV = [
    { section: 'ACCOUNT', items: [
      { id: 'profile',       label: 'My Profile' },
      { id: 'general',       label: 'General' },
    ]},
    { section: 'INVENTORY', items: [
      { id: 'categories',    label: 'Categories'       },
    ]},
  ];

  /* ── Init ── */
  onMount(() => {
    // Deep-link: /settings?tab=xxx
    const tab = $page.url.searchParams.get('tab');
    if (tab) activePanel = tab;

    // Dark mode
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    applyTheme(saved ?? 'light');

    // Profile from store (initial values while API loads)
    const u = authStore.user;
    if (u) {
      profileName   = u.name;
      profileEmail  = u.email;
      originalEmail = u.email;
      profileRole   = u.role ?? '';
    }
    // Fetch full profile — overrides store values with authoritative DB data
    api.get<{ name: string; email: string; position?: string; phone?: string; role?: { name: string } }>('/api/users/me')
      .then((data) => {
        profileName     = data.name;
        profileEmail    = data.email;
        originalEmail   = data.email; // anchor comparison to DB email, not JWT email
        profilePosition = data.position ?? '';
        profilePhone    = data.phone    ?? '';
        profileRole     = data.role?.name ?? '';
      })
      .catch(() => {/* keep store values */});
  });
  onDestroy(onChange(['Category'], () => loadCategories()));
</script>

<div class="page">

  <!-- Breadcrumb -->
  <div class="breadcrumb">
    Dashboard
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    <span>Settings</span>
    {#if activePanel !== 'general'}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      <span>{SUBNAV.flatMap(s => s.items).find(i => i.id === activePanel)?.label}</span>
    {/if}
  </div>

  <!-- Page header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Settings</h1>
      <p class="page-sub">Manage your account, inventory, and workspace configuration.</p>
    </div>
  </div>

  <!-- Two-panel layout -->
  <div class="settings-layout">

    <!-- Left subnav -->
    <aside class="settings-nav" aria-label="Settings navigation">
      <span
        class="nav-pill"
        aria-hidden="true"
        style="transform: translateY({pillTop}px); height: {pillHeight}px;"
      ></span>

      {#each SUBNAV as group}
        <div class="nav-group">
          <div class="nav-section-label">{group.section}</div>
          {#each group.items as item}
            <button
              class="nav-item"
              class:active={activePanel === item.id}
              bind:this={itemRefs[item.id]}
              onclick={() => { activePanel = item.id; }}
              aria-current={activePanel === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          {/each}
        </div>
      {/each}
    </aside>

    <!-- Main panel -->
    <div class="settings-main">
    {#key activePanel}

      <!-- ═══ GENERAL ══════════════════════════════════════════════════════ -->
      {#if activePanel === 'general'}
        <div class="panel">
          <div class="panel-header">
            <h2 class="panel-title">General</h2>
            <p class="panel-sub">Customize how Oracle Inventory looks on your device.</p>
          </div>

          <!-- Appearance -->
          <div class="setting-row">
            <div class="setting-text">
              <div class="setting-title">Appearance</div>
              <div class="setting-sub">Customize how Oracle Inventory looks on your device.</div>
            </div>
            <select
              class="setting-select"
              bind:value={appearance}
              onchange={() => applyTheme(appearance)}
              aria-label="Appearance"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>

      <!-- ═══ PROFILE ═══════════════════════════════════════════════════════ -->
      {:else if activePanel === 'profile'}
        <div class="panel">
          <div class="panel-header">
            <h2 class="panel-title">My Profile</h2>
            <p class="panel-sub">Update your personal account information.</p>
          </div>

          {#if profileError}
            <div class="error-bar">{profileError}</div>
          {/if}

          <div class="form-grid">
            <div class="form-field">
              <label class="form-label" for="pf-name">Full name</label>
              <input id="pf-name" class="form-input" type="text" bind:value={profileName} />
            </div>
            <div class="form-field">
              <label class="form-label" for="pf-email">Email address</label>
              <input id="pf-email" class="form-input" type="email" bind:value={profileEmail} />
              {#if profileEmail.trim().toLowerCase() !== originalEmail.toLowerCase()}
                <span class="field-hint">You'll be sent a verification code to confirm this change.</span>
              {/if}
            </div>
            <div class="form-field">
              <label class="form-label" for="pf-pos">Position / Title</label>
              <input id="pf-pos" class="form-input" type="text" bind:value={profilePosition} placeholder="e.g. IT Manager" />
            </div>
            <div class="form-field">
              <label class="form-label" for="pf-phone">Phone</label>
              <input id="pf-phone" class="form-input" type="tel" bind:value={profilePhone} placeholder="+63 900 000 0000" />
            </div>
            <div class="form-field">
              <label class="form-label">Role</label>
              <div class="form-input form-readonly">{profileRole || '—'}</div>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn-primary" onclick={saveProfile} disabled={profileSaving}>
              {#if profileSaved}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                Saved
              {:else if profileSaving}
                Saving…
              {:else}
                Save changes
              {/if}
            </button>
          </div>

          <div class="divider"></div>

          <!-- Change password -->
          <div class="panel-header" style="margin-top: 0;">
            <h2 class="panel-title">Change password</h2>
            <p class="panel-sub">Choose a strong password of at least 8 characters.</p>
          </div>

          {#if pwError}
            <div class="error-bar">{pwError}</div>
          {/if}

          <div class="form-grid">
            <div class="form-field">
              <label class="form-label" for="pw-cur">Current password</label>
              <input id="pw-cur" class="form-input" type="password" bind:value={pwCurrent} autocomplete="current-password" disabled={pwOtpSent} />
            </div>
            <div class="form-field">
              <label class="form-label" for="pw-new">New password</label>
              <input id="pw-new" class="form-input" type="password" bind:value={pwNew} autocomplete="new-password" disabled={pwOtpSent} />
            </div>
            <div class="form-field">
              <label class="form-label" for="pw-conf">Confirm new password</label>
              <input id="pw-conf" class="form-input" type="password" bind:value={pwConfirm} autocomplete="new-password" disabled={pwOtpSent} />
            </div>
          </div>

          {#if pwOtpSent}
            <div class="otp-step">
              <p class="otp-step-hint">A verification code was sent to your email. Enter it below to confirm the password change.</p>
              <div class="form-field" style="max-width: 200px;">
                <label class="form-label" for="pw-otp">Verification code</label>
                <input id="pw-otp" class="form-input otp-input" type="text" inputmode="numeric" maxlength="6"
                  placeholder="000000" bind:value={pwOtpCode}
                  onkeydown={(e) => { if (e.key === 'Enter') changePassword(); }} />
              </div>
            </div>
          {/if}

          <div class="form-actions">
            {#if !pwOtpSent}
              <button class="btn-primary" onclick={requestPwOtp} disabled={pwOtpRequesting}>
                {pwOtpRequesting ? 'Sending code…' : 'Send verification code'}
              </button>
            {:else}
              <button class="btn-primary" onclick={changePassword} disabled={pwSaving}>
                {#if pwSaved}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                  Password updated
                {:else if pwSaving}
                  Verifying…
                {:else}
                  Update password
                {/if}
              </button>
              <button class="btn-ghost" onclick={() => { pwOtpSent = false; pwOtpCode = ''; pwError = ''; }}>Cancel</button>
              <button class="link-btn" onclick={requestPwOtp} disabled={pwOtpRequesting} style="margin-left: 4px;">
                {pwOtpRequesting ? 'Sending…' : 'Resend code'}
              </button>
            {/if}
          </div>
        </div>

      <!-- ═══ ASSET NUMBERING ════════════════════════════════════════════════ -->
      <!-- ═══ CATEGORIES ══════════════════════════════════════════════════════ -->
      {:else if activePanel === 'categories'}
        <div class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Categories</h2>
            <p class="panel-sub">Manage asset categories used across the inventory.</p>
          </div>

          <!-- Add new category -->
          <div class="cat-add-row">
            <input
              class="form-input cat-input"
              type="text"
              placeholder="New category name…"
              bind:value={catNewName}
              onkeydown={(e) => { if (e.key === 'Enter') addCategory(); }}
              disabled={catAdding}
            />
            <button class="btn-primary" onclick={addCategory} disabled={catAdding || !catNewName.trim()}>
              {catAdding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {#if catAddError}
            <p class="cat-error">{catAddError}</p>
          {/if}

          <!-- Category list -->
          {#if catLoading}
            <div class="cat-loading">Loading…</div>
          {:else if categories.length === 0}
            <div class="cat-empty">No categories yet. Add one above.</div>
          {:else}
            <ul class="cat-list">
              {#each categories as cat (cat.id)}
                <li class="cat-item">
                  {#if catEditId === cat.id}
                    <!-- Inline edit -->
                    <input
                      class="form-input cat-edit-input"
                      type="text"
                      bind:value={catEditName}
                      onkeydown={(e) => { if (e.key === 'Enter') saveEditCat(cat.id); if (e.key === 'Escape') catEditId = null; }}
                      disabled={catEditSaving}
                      autofocus
                    />
                    {#if catEditError}<span class="cat-inline-err">{catEditError}</span>{/if}
                    <div class="cat-edit-actions">
                      <button class="btn-primary cat-save-btn" onclick={() => saveEditCat(cat.id)} disabled={catEditSaving || !catEditName.trim()}>
                        {catEditSaving ? '…' : 'Save'}
                      </button>
                      <button class="btn-ghost cat-cancel-btn" onclick={() => catEditId = null}>Cancel</button>
                    </div>
                  {:else if catDeleteId === cat.id}
                    <!-- Delete confirm -->
                    <span class="cat-name cat-del-name">{cat.name}</span>
                    <span class="cat-confirm-msg">Delete this category?</span>
                    {#if catDeleteError}<span class="cat-inline-err">{catDeleteError}</span>{/if}
                    <div class="cat-edit-actions">
                      <button class="btn-danger-sm" onclick={() => deleteCategory(cat.id)} disabled={catDeleting}>
                        {catDeleting ? '…' : 'Delete'}
                      </button>
                      <button class="btn-ghost cat-cancel-btn" onclick={() => { catDeleteId = null; catDeleteError = ''; }}>Cancel</button>
                    </div>
                  {:else}
                    <!-- Normal row -->
                    <span class="cat-name">{cat.name}</span>
                    <span class="cat-count">{cat._count.assets} asset{cat._count.assets !== 1 ? 's' : ''}</span>
                    <div class="cat-row-actions">
                      <button class="cat-action-btn" onclick={() => startEditCat(cat)} title="Rename">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="cat-action-btn cat-delete-btn" onclick={() => { catDeleteId = cat.id; catDeleteError = ''; }} title="Delete" disabled={cat._count.assets > 0}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          <p class="cat-hint">Categories with assets cannot be deleted.</p>
        </div>

      {/if}

    {/key}
    </div>
  </div>
</div>

<!-- OTP Modal — email change -->
{#if otpModalOpen}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Verify email change">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">Verify email change</h3>
        <button class="modal-close" onclick={cancelOtp} aria-label="Cancel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="modal-sub">A 6-digit code was sent to your current email address. Enter it below to confirm the change.</p>

      {#if otpError}
        <div class="error-bar" style="margin-bottom: 12px;">{otpError}</div>
      {/if}

      <div class="form-field" style="margin-bottom: 20px;">
        <label class="form-label" for="otp-input">Verification code</label>
        <input
          id="otp-input"
          class="form-input otp-input"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="000000"
          bind:value={otpCode}
          onkeydown={(e) => { if (e.key === 'Enter') confirmOtpAndSave(); }}
        />
      </div>

      <div class="modal-actions">
        <button class="btn-primary" onclick={confirmOtpAndSave} disabled={profileSaving}>
          {profileSaving ? 'Verifying…' : 'Confirm & save'}
        </button>
        <button class="btn-ghost" onclick={cancelOtp}>Cancel</button>
      </div>

      <div class="otp-resend">
        Didn't receive it?
        <button class="link-btn" onclick={requestEmailOtp} disabled={otpRequesting}>
          {otpRequesting ? 'Sending…' : 'Resend code'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Breadcrumb ── */
  .breadcrumb {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--mute);
  }
  .breadcrumb span { color: var(--ink); font-weight: 500; }

  /* ── Page header ── */
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }

  /* ── Two-panel layout ── */
  .settings-layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 20px;
    align-items: start;
  }

  /* ── Subnav ── */
  .settings-nav {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 8px 0 12px;
    position: sticky;
    top: 20px;
    overflow: hidden;
  }

  .nav-pill {
    position: absolute;
    left: 6px; top: 0;
    width: calc(100% - 12px);
    border-radius: var(--r-sm);
    background: var(--ink);
    pointer-events: none;
    z-index: 0;
    will-change: transform, height;
    transition: transform 240ms cubic-bezier(0.4,0,0.2,1), height 240ms cubic-bezier(0.4,0,0.2,1);
  }

  .nav-group { padding: 0; }
  .nav-group + .nav-group { margin-top: 4px; }

  .nav-section-label {
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--mute); padding: 10px 14px 4px;
    position: relative; z-index: 1;
  }

  .nav-item {
    display: block; width: 100%;
    text-align: left; padding: 7px 14px;
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    color: var(--body); background: transparent;
    border: none; cursor: pointer; border-radius: 0;
    position: relative; z-index: 1;
    transition: color 160ms ease;
  }
  .nav-item:hover:not(.active) { background: var(--canvas-soft-2); color: var(--ink); }
  .nav-item.active { color: var(--on-primary); }

  /* ── Main panel ── */
  .settings-main {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    min-height: 400px;
  }

  @keyframes panel-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .panel {
    padding: 24px 28px;
    animation: panel-in 200ms cubic-bezier(0.4,0,0.2,1) both;
    will-change: opacity, transform;
  }

  .panel-header { margin-bottom: 20px; }
  .panel-title { font-size: 15px; font-weight: 600; color: var(--ink); letter-spacing: -0.02em; }
  .panel-sub { font-size: 13px; color: var(--mute); margin-top: 3px; }

  /* ── Section blocks ── */
  .section-block { margin-bottom: 20px; }
  .section-row-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .section-label { font-size: 13px; font-weight: 500; color: var(--ink); }

  /* ── Checkboxes ── */
  .check-list { display: flex; flex-direction: column; gap: 8px; }
  .check-row { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
  .check-input { width: 16px; height: 16px; border-radius: 4px; accent-color: var(--link); cursor: pointer; flex-shrink: 0; }
  .check-label { font-size: 13px; color: var(--body); }

  /* ── Toggle rows ── */
  .toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 20px; padding: 14px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .toggle-row:last-of-type { border-bottom: none; }
  .toggle-text { flex: 1; min-width: 0; }
  .toggle-title { font-size: 13px; font-weight: 500; color: var(--ink); }
  .toggle-sub { font-size: 12px; color: var(--mute); margin-top: 2px; }

  .toggle-switch {
    width: 40px; height: 22px; border-radius: 999px;
    background: var(--hairline-strong);
    border: none; cursor: pointer; padding: 2px;
    display: flex; align-items: center;
    transition: background 200ms ease;
    flex-shrink: 0;
  }
  .toggle-switch.on { background: var(--link); }
  .toggle-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--canvas);
    box-shadow: 0 1px 3px oklch(0% 0 0 / 20%);
    transition: transform 200ms ease;
    flex-shrink: 0;
  }
  .toggle-switch.on .toggle-thumb { transform: translateX(18px); }

  /* ── Setting rows ── */
  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 20px; padding: 14px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .setting-row:last-of-type { border-bottom: none; }
  .setting-text { flex: 1; min-width: 0; }
  .setting-title { font-size: 13px; font-weight: 500; color: var(--ink); }
  .setting-sub { font-size: 12px; color: var(--mute); margin-top: 2px; }
  .setting-select {
    padding: 6px 10px; border-radius: var(--r-sm);
    border: 1px solid var(--hairline); background: var(--canvas-soft);
    font-size: 13px; font-family: var(--font-sans); color: var(--ink);
    cursor: pointer; outline: none; flex-shrink: 0; min-width: 110px;
  }
  .setting-select:focus { border-color: var(--link); }

  /* ── Divider ── */
  .divider { height: 1px; background: var(--hairline); margin: 20px 0; }

  /* ── Form grid ── */
  .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-label { font-size: 12px; font-weight: 500; color: var(--ink); letter-spacing: 0.01em; }
  .form-input {
    padding: 8px 10px; border-radius: var(--r-sm);
    border: 1px solid var(--hairline); background: var(--canvas-soft);
    font-size: 13px; font-family: var(--font-sans); color: var(--ink); outline: none;
    transition: border-color 120ms ease;
  }
  .form-input:focus { border-color: var(--link); background: var(--canvas); }
  .form-select { cursor: pointer; }
  .form-readonly { background: var(--canvas-soft-2); color: var(--mute); cursor: default; }

  .field-hint { font-size: 11px; color: var(--link); }

  /* ── Form actions ── */
  .form-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  /* ── Buttons ── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary);
    transition: opacity 120ms ease; line-height: 1;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }
  .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: var(--r-sm); }

  /* ── Info box ── */
  .info-box {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; background: var(--canvas-soft-2);
    border: 1px solid var(--hairline); border-radius: var(--r-md);
    font-size: 13px; color: var(--body); margin-bottom: 20px;
  }
  .info-box strong { color: var(--ink); font-weight: 600; margin-left: 4px; }

  /* ── Export cards ── */
  .export-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px; }
  .export-card {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; background: var(--canvas-soft);
    border: 1px solid var(--hairline); border-radius: var(--r-md); flex-wrap: wrap;
  }
  .export-card-icon {
    width: 36px; height: 36px; background: var(--canvas);
    border: 1px solid var(--hairline); border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: var(--body); flex-shrink: 0;
  }
  .export-card-body { flex: 1; min-width: 0; }
  .export-card-title { font-size: 13px; font-weight: 500; color: var(--ink); }
  .export-card-sub { font-size: 12px; color: var(--mute); margin-top: 2px; }
  .export-card-actions { display: flex; gap: 8px; flex-shrink: 0; }

  /* ── Import box ── */
  .import-box {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; border: 1px dashed var(--hairline);
    border-radius: var(--r-md); flex-wrap: wrap; color: var(--mute);
  }
  .import-text { flex: 1; min-width: 0; }
  .import-title { font-size: 13px; font-weight: 500; color: var(--ink); }
  .import-sub { font-size: 12px; color: var(--mute); margin-top: 2px; }
  .import-label { cursor: pointer; }

  /* ── Feedback / error bars ── */
  .feedback-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; background: #dcfce7;
    border: 1px solid #bbf7d0; border-radius: var(--r-md);
    font-size: 13px; color: #16a34a; margin-bottom: 16px;
  }
  .error-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; background: var(--error-soft);
    border: 1px solid var(--error); border-radius: var(--r-md);
    font-size: 13px; color: var(--error); margin-bottom: 16px;
  }

  /* ── OTP Modal ── */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: oklch(0% 0 0 / 40%);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .modal {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-xl);
    padding: 24px;
    width: 100%; max-width: 400px;
    box-shadow: var(--shadow-l5);
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .modal-title { font-size: 15px; font-weight: 600; color: var(--ink); }
  .modal-close {
    background: none; border: none; cursor: pointer;
    color: var(--mute); padding: 4px; border-radius: var(--r-sm);
    display: flex; align-items: center; justify-content: center;
  }
  .modal-close:hover { color: var(--ink); background: var(--canvas-soft-2); }
  .modal-sub { font-size: 13px; color: var(--body); margin-bottom: 20px; line-height: 1.5; }
  .modal-actions { display: flex; gap: 8px; }

  .otp-step { padding: 14px 16px; background: var(--canvas-soft); border: 1px solid var(--hairline); border-radius: var(--r-md); margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; }
  .otp-step-hint { font-size: 12.5px; color: var(--body); margin: 0; line-height: 1.5; }

  .otp-input {
    font-size: 20px; font-weight: 600; letter-spacing: 8px;
    text-align: center; font-family: var(--font-mono);
  }

  .otp-resend {
    margin-top: 16px; font-size: 12px; color: var(--mute); text-align: center;
  }
  .link-btn {
    background: none; border: none; cursor: pointer;
    color: var(--link); font-size: 12px; font-family: var(--font-sans);
    padding: 0; text-decoration: underline;
  }
  .link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Visually hidden ── */
  .visually-hidden {
    position: absolute; width: 1px; height: 1px;
    margin: -1px; padding: 0; overflow: hidden;
    clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 860px) {
    .settings-layout { grid-template-columns: 1fr; }
    .settings-nav { position: static; }
  }

  @media (max-width: 640px) {
    .panel { padding: 18px 16px; }
    .toggle-row { flex-wrap: wrap; gap: 10px; }
    .setting-row { flex-wrap: wrap; gap: 10px; }
    .setting-select { min-width: 100%; }
  }

  /* ── Categories panel ── */
  .cat-add-row { display: flex; gap: 8px; margin-bottom: 6px; }
  .cat-input { flex: 1; }
  .cat-loading { font-size: 13px; color: var(--mute); padding: 16px 0; }
  .cat-empty  { font-size: 13px; color: var(--mute); padding: 16px 0; }
  .cat-error  { font-size: 12px; color: var(--error); margin-bottom: 8px; }
  .cat-hint   { font-size: 11.5px; color: var(--mute); margin-top: 10px; }

  .cat-list { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 2px; }

  .cat-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas-soft);
    min-height: 40px;
  }
  .cat-item:hover { background: var(--canvas-soft-2); }

  .cat-name { flex: 1; font-size: 13.5px; color: var(--ink); font-family: var(--font-sans); }
  .cat-del-name { text-decoration: line-through; color: var(--mute); }
  .cat-count { font-size: 11.5px; color: var(--mute); white-space: nowrap; }
  .cat-confirm-msg { font-size: 12.5px; color: var(--error); white-space: nowrap; }
  .cat-inline-err { font-size: 12px; color: var(--error); }

  .cat-row-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .cat-action-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--r-sm);
    border: 1px solid transparent; background: transparent;
    color: var(--mute); cursor: pointer;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .cat-action-btn:hover { background: var(--canvas); border-color: var(--hairline); color: var(--ink); }
  .cat-delete-btn:hover { color: var(--error); }
  .cat-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .cat-edit-input { flex: 1; }
  .cat-edit-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .cat-save-btn   { padding: 0 12px; height: 30px; font-size: 12.5px; }
  .cat-cancel-btn { padding: 0 10px; height: 30px; font-size: 12.5px; }

  .btn-danger-sm {
    display: inline-flex; align-items: center; padding: 0 12px; height: 30px;
    border-radius: var(--r-sm); font-size: 12.5px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--error); color: #fff;
    transition: opacity 120ms ease;
  }
  .btn-danger-sm:hover:not(:disabled) { opacity: 0.85; }
  .btn-danger-sm:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
