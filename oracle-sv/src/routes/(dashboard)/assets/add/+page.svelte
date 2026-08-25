<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { authStore } from '$lib/stores/auth.svelte';
  import DatePicker from '$lib/components/date/DatePicker.svelte';

  interface Category { id: string; name: string; }
  interface Branch   { id: string; name: string; }

  const CONDITIONS = [
    { value: 'usable',       label: 'Usable'       },
    { value: 'for_repair',   label: 'For Repair'   },
    { value: 'for_disposal', label: 'For Disposal' },
  ];
  const OWNERSHIPS = [
    { value: 'company',  label: 'Company'  },
    { value: 'personal', label: 'Personal' },
  ];

  let categories = $state<Category[]>([]);
  let branches   = $state<Branch[]>([]);

  // ── Form state ───────────────────────────────────────────────────────────────
  let assetName         = $state('');
  let serialNumber      = $state('');
  let condition         = $state('usable');
  let categoryId        = $state('');
  let branchId          = $state('');
  let ownership         = $state('company');
  let warrantyExpiry    = $state('');
  let purchaseDate      = $state('');
  let description       = $state('');
  let enableMaintenance = $state(false);
  let markInactive      = $state(false);
  let nextMaintenance   = $state('');
  let vendor            = $state('');
  let internalNotes     = $state('');

  interface PhotoEntry { id: string; preview: string; file: File; }
  let photos        = $state<PhotoEntry[]>([]);
  let lightboxPhoto = $state<string | null>(null);

  let submitting = $state(false);
  let submitErr  = $state('');

  // ── Mode toggle: Generic Asset vs. Computer / Laptop (Manual Mode) ────────────
  let mode = $state<'generic' | 'computer'>('generic');
  let ciLoaded = $state(false);

  function switchMode(next: 'generic' | 'computer') {
    mode = next;
    if (next === 'computer' && !ciLoaded) void ciInit();
  }

  onMount(async () => {
    [categories, branches] = await Promise.all([
      api.get<Category[]>('/api/categories').catch(() => []),
      api.get<Branch[]>('/api/branches').catch(() => []),
    ]);

    if ($page.url.searchParams.get('type') === 'computer') {
      mode = 'computer';
      void ciInit();
    }
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleAddPhotos(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) continue;
      const id = crypto.randomUUID();
      const reader = new FileReader();
      reader.onload = () => {
        photos = [...photos, { id, preview: reader.result as string, file }];
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }

  function removePhoto(id: string) {
    photos = photos.filter(p => p.id !== id);
  }

  function replacePhoto(id: string, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      photos = photos.map(p => p.id === id ? { ...p, preview: reader.result as string, file } : p);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!assetName.trim()) { submitErr = 'Asset name is required.'; return; }
    submitting = true; submitErr = '';
    try {
      await api.post('/api/assets', {
        name:               assetName.trim(),
        serialNumber:       serialNumber.trim() || null,
        categoryId:         categoryId || null,
        branchId:           branchId || null,
        condition,
        ownership,
        description:        description.trim() || null,
        warrantyExpiry:     warrantyExpiry || null,
        nextMaintenanceDate: enableMaintenance && nextMaintenance ? nextMaintenance : null,
      });
      goto('/assets');
    } catch (e) {
      submitErr = (e as Error).message;
      submitting = false;
    }
  }

  function handleCancel() {
    goto('/assets');
  }

  // ── Computer / Laptop Manual Mode intake (folded in from the former
  //    /assets/add/computer route) ─────────────────────────────────────────────
  //    State/handlers are prefixed `ci` so they never collide with the generic
  //    asset form's own state above — the two modes stay fully independent.
  type CiComponent = { type: 'ram' | 'storage'; slotOrBay?: string; brand?: string; model?: string; serialNumber?: string; capacity?: string; storageKind?: string };
  type CiForm = { name: string; assetTag: string; computerName: string; serialNumber: string; brand: string; model: string; deviceType: 'computer' | 'laptop'; categoryId: string; branchId: string; employeeId: string; ownership: string; condition: string; status: string; description: string; purchaseDate: string; warrantyExpiry: string; processor: string; motherboard: string; operatingSystem: string; osVersion: string; osInstallDate: string; components: CiComponent[] };
  type CiOption = { id: string; name: string; employeeId?: string | null };

  const ciBlank = (): CiForm => ({ name: '', assetTag: '', computerName: '', serialNumber: '', brand: '', model: '', deviceType: 'computer', categoryId: '', branchId: '', employeeId: '', ownership: 'company', condition: 'usable', status: 'active', description: '', purchaseDate: '', warrantyExpiry: '', processor: '', motherboard: '', operatingSystem: '', osVersion: '', osInstallDate: '', components: [] });

  let ciForm      = $state(ciBlank());
  let ciCategories = $state<CiOption[]>([]);
  let ciBranches   = $state<CiOption[]>([]);
  let ciEmployees  = $state<CiOption[]>([]);
  let ciDraftId       = $state('');
  let ciDraftVersion  = $state('');
  let ciError    = $state('');
  let ciNotice   = $state('');
  let ciLoading  = $state(true);
  let ciSaving   = $state(false);
  let ciReviewing = $state(false);
  let ciForbidden = $state(false);
  let ciDuplicateComputerName = $state(false);
  let ciTagUnavailable = $state(false);

  async function ciInit() {
    ciLoaded = true;
    const role = authStore.user?.role?.trim().toLowerCase();
    if (!can('create_inventory') || (role !== 'admin' && role !== 'super_admin')) {
      ciForbidden = true; ciLoading = false; return;
    }
    try {
      const [lookup, drafts] = await Promise.all([
        api.get<{ categories: CiOption[]; branches: CiOption[]; employees: CiOption[] }>('/api/computer-intake/lookups'),
        api.get<{ id: string; updatedAt: string; data: CiForm }[]>('/api/computer-intake/drafts'),
      ]);
      ciCategories = lookup.categories; ciBranches = lookup.branches; ciEmployees = lookup.employees;
      const latest = drafts[0];
      if (latest) {
        ciDraftId = latest.id; ciDraftVersion = latest.updatedAt;
        ciForm = { ...ciBlank(), ...latest.data, components: latest.data.components ?? [] };
        ciNotice = 'Latest draft loaded. Review before submitting.';
      }
    } catch (e) { ciError = (e as Error).message; }
    finally { ciLoading = false; }
  }

  function ciAddComponent(type: 'ram' | 'storage') { ciForm.components = [...ciForm.components, { type }]; }
  function ciRemoveComponent(index: number) { ciForm.components = ciForm.components.filter((_, i) => i !== index); }

  async function ciSave() {
    ciSaving = true; ciError = '';
    try {
      const body = ciDraftId ? { ...ciForm, expectedUpdatedAt: ciDraftVersion } : ciForm;
      const row = ciDraftId
        ? await api.put<{ id: string; updatedAt: string }>(`/api/computer-intake/drafts/${ciDraftId}`, body)
        : await api.post<{ id: string; updatedAt: string }>('/api/computer-intake/drafts', ciForm);
      ciDraftId = row.id; ciDraftVersion = row.updatedAt;
      ciNotice = 'Draft saved.';
    } catch (e) { ciError = (e as Error).message; }
    finally { ciSaving = false; }
  }

  async function ciReview() {
    ciError = '';
    if (!ciForm.name.trim() || !ciForm.branchId) { ciError = 'Computer name and branch are required.'; return; }
    if (!ciDraftId) { await ciSave(); }
    if (ciDraftId) {
      try {
        const check = await api.get<{ duplicateComputerName: boolean; assetTagAvailable: boolean; updatedAt: string }>(`/api/computer-intake/drafts/${ciDraftId}/preflight`);
        ciDuplicateComputerName = check.duplicateComputerName;
        ciTagUnavailable = !check.assetTagAvailable;
        ciDraftVersion = check.updatedAt;
      } catch (e) { ciError = (e as Error).message; return; }
    }
    ciReviewing = true;
  }

  async function ciSubmit() {
    ciSaving = true; ciError = '';
    try {
      if (!ciDraftId) {
        const row = await api.post<{ id: string; updatedAt: string }>('/api/computer-intake/drafts', ciForm);
        ciDraftId = row.id; ciDraftVersion = row.updatedAt;
      }
      await api.post(`/api/computer-intake/drafts/${ciDraftId}/submit`, { expectedUpdatedAt: ciDraftVersion }, { 'Idempotency-Key': `computer-intake-${ciDraftId}-${ciDraftVersion}` });
      goto('/assets');
    } catch (e) { ciError = (e as Error).message; }
    finally { ciSaving = false; }
  }
</script>

<svelte:head><title>{mode === 'computer' ? 'New Computer Intake' : 'Add New Asset'} · Oracle Inventory</title></svelte:head>

<div class="page">

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/assets')}>Assets</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">{mode === 'computer' ? 'New Computer Intake' : 'Add Asset'}</span>
  </nav>

  <!-- ── Page header ─────────────────────────────────────────────────────────── -->
  <header class="page-header">
    <div class="page-title-group">
      <h1 class="page-title">{mode === 'computer' ? 'New Computer Intake' : 'Add New Asset'}</h1>
      <p class="page-subtitle">{mode === 'computer' ? 'Manual Mode · official inventory record' : 'Register a new asset into the inventory system'}</p>
    </div>
    <div class="header-actions">
      <div class="header-left">
        <button type="button" class="btn btn-ghost" onclick={handleCancel}>Cancel</button>
        {#if mode === 'generic'}
          <a href="/assets/scan" class="btn btn-scan">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Scan Asset
          </a>
        {/if}
      </div>
      {#if mode === 'generic'}
        <button type="submit" form="add-asset-form" class="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save Asset'}</button>
      {:else if !ciForbidden}
        <div class="header-left">
          <button type="button" class="btn btn-ghost" onclick={ciSave} disabled={ciSaving || ciLoading}>{ciSaving ? 'Saving…' : 'Save Draft'}</button>
          <button type="button" class="btn btn-primary" onclick={ciReview} disabled={ciSaving || ciLoading}>Review</button>
        </div>
      {/if}
    </div>
  </header>

  <!-- ── Mode toggle ─────────────────────────────────────────────────────────── -->
  <div class="mode-toggle" role="tablist" aria-label="Asset intake mode">
    <button type="button" class="mode-tab" class:mode-tab--active={mode === 'generic'} onclick={() => switchMode('generic')} role="tab" aria-selected={mode === 'generic'}>Generic Asset</button>
    <button type="button" class="mode-tab" class:mode-tab--active={mode === 'computer'} onclick={() => switchMode('computer')} role="tab" aria-selected={mode === 'computer'}>Computer / Laptop (Manual Mode)</button>
  </div>

  {#if mode === 'generic'}

    {#if submitErr}
      <div class="form-error">{submitErr}</div>
    {/if}

    <form id="add-asset-form" onsubmit={handleSubmit} class="form-body" novalidate>

      <!-- ── Card 1: Asset Information ────────────────────────────────────────── -->
      <section class="card" aria-label="Asset information">
        <div class="card-header">
          <h2 class="card-title">Asset Information</h2>
        </div>

        <div class="card-main">
          <!-- Left: photo gallery -->
          <div class="image-col">
            {#if photos.length === 0}
              <div class="image-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="m21 15-5-5L5 21"/>
                </svg>
                <span class="empty-label">No photos</span>
              </div>
            {:else}
              <div class="photo-grid">
                {#each photos as photo (photo.id)}
                  <div class="photo-thumb">
                    <img src={photo.preview} alt="Asset photo" class="thumb-img" />
                    <div class="thumb-overlay">
                      <button
                        type="button"
                        class="thumb-action"
                        title="Preview"
                        onclick={() => lightboxPhoto = photo.preview}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      <label class="thumb-action" title="Replace" for="replace-{photo.id}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </label>
                      <input id="replace-{photo.id}" type="file" accept="image/*" class="sr-only" onchange={(e) => replacePhoto(photo.id, e)} />
                      <button
                        type="button"
                        class="thumb-action thumb-action-remove"
                        title="Remove"
                        onclick={() => removePhoto(photo.id)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                          <path d="M18 6L6 18M6 6L18 18" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            <label class="upload-btn" for="asset-images">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Upload Photos
            </label>
            <input id="asset-images" type="file" accept="image/*" multiple class="sr-only" onchange={handleAddPhotos} />
            <p class="upload-hint">Max 5MB each<br />JPG, PNG, or WebP</p>
          </div>

          <!-- Right: form fields grid -->
          <div class="fields-col">
            <div class="fields-grid">
              <!-- Row 1 -->
              <div class="field">
                <label class="field-label" for="asset-name">Asset Name <span class="required">*</span></label>
                <input
                  id="asset-name"
                  type="text"
                  class="field-input"
                  placeholder="e.g. Dell Latitude 5520"
                  bind:value={assetName}
                  required
                />
              </div>
              <div class="field">
                <label class="field-label" for="serial-number">Serial Number</label>
                <input
                  id="serial-number"
                  type="text"
                  class="field-input"
                  placeholder="e.g. SN-A10021"
                  bind:value={serialNumber}
                />
              </div>
              <div class="field">
                <label class="field-label" for="condition">Condition <span class="required">*</span></label>
                <select id="condition" class="field-select" bind:value={condition} required>
                  {#each CONDITIONS as c}
                    <option value={c.value}>{c.label}</option>
                  {/each}
                </select>
              </div>

              <!-- Row 2 -->
              <div class="field">
                <label class="field-label" for="category">Category</label>
                <select id="category" class="field-select" bind:value={categoryId}>
                  <option value="">— No category —</option>
                  {#each categories as cat}
                    <option value={cat.id}>{cat.name}</option>
                  {/each}
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="branch">Branch / Location</label>
                <select id="branch" class="field-select" bind:value={branchId}>
                  <option value="">— No branch —</option>
                  {#each branches as b}
                    <option value={b.id}>{b.name}</option>
                  {/each}
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="ownership">Ownership</label>
                <select id="ownership" class="field-select" bind:value={ownership}>
                  {#each OWNERSHIPS as o}
                    <option value={o.value}>{o.label}</option>
                  {/each}
                </select>
              </div>

              <!-- Row 3 -->
              <div class="field">
                <label class="field-label" for="warranty-expiry">Warranty Expiry</label>
                <DatePicker
                  bind:value={warrantyExpiry}
                  id="warranty-expiry"
                  placeholder="Pick expiry date"
                />
              </div>
              <div class="field">
                <label class="field-label" for="purchase-date">Purchase Date</label>
                <DatePicker
                  bind:value={purchaseDate}
                  id="purchase-date"
                  placeholder="Pick purchase date"
                />
              </div>
            </div>

          </div>
        </div>

        <!-- Divider + bottom section -->
        <div class="card-divider"></div>

        <div class="card-bottom">
          <div class="field field-textarea">
            <label class="field-label" for="description">Description</label>
            <textarea
              id="description"
              class="field-textarea-input"
              placeholder="Write a description of this asset..."
              bind:value={description}
              rows="5"
            ></textarea>
          </div>
          <div class="field attachment-field">
            <label class="field-label" for="attachment">Attachment</label>
            <label class="attach-btn" for="attachment">Choose File</label>
            <input id="attachment" type="file" class="sr-only" accept=".pdf,.csv,.zip,.docx,.xlsx,.jpeg,.jpg,.png" />
            <p class="upload-hint" style="margin-top: 8px;">Max file size: 5MB<br />PDF, CSV, ZIP, DOCX, XLSX, JPEG</p>
          </div>
        </div>
      </section>

      <!-- ── Card 2: Additional Details ───────────────────────────────────────── -->
      <section class="card" aria-label="Additional details">
        <div class="card-header">
          <h2 class="card-title">Additional Details</h2>
        </div>

        <div class="card-body">
          <!-- Checkbox row -->
          <div class="checkbox-pair">
            <label class="checkbox-row">
              <input type="checkbox" class="checkbox" bind:checked={enableMaintenance} />
              <span class="checkbox-label">Enable maintenance tracking</span>
              <span class="checkbox-hint">Schedule and track maintenance events for this asset</span>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" class="checkbox" bind:checked={markInactive} />
              <span class="checkbox-label">Mark as inactive</span>
              <span class="checkbox-hint">Asset will not appear in active inventory counts</span>
            </label>
          </div>

          <!-- Additional fields grid -->
          <div class="fields-grid-3">
            <div class="field" class:field-disabled={!enableMaintenance}>
              <label class="field-label" for="next-maintenance">Next Maintenance Date</label>
              <DatePicker
                bind:value={nextMaintenance}
                id="next-maintenance"
                placeholder="Pick date"
              />
            </div>
            <div class="field">
              <label class="field-label" for="vendor">Vendor / Supplier</label>
              <input
                id="vendor"
                type="text"
                class="field-input"
                placeholder="e.g. Dell Technologies"
                bind:value={vendor}
              />
            </div>
          </div>

          <!-- Internal notes -->
          <div class="field">
            <label class="field-label" for="internal-notes">Internal Notes</label>
            <textarea
              id="internal-notes"
              class="field-textarea-input"
              placeholder="Any internal notes about this asset..."
              bind:value={internalNotes}
              rows="3"
            ></textarea>
          </div>
        </div>
      </section>

    </form>

  {:else}
    <!-- ── Computer / Laptop Manual Mode ────────────────────────────────────── -->

    {#if ciForbidden}
      <section class="card" aria-label="Computer intake unavailable">
        <div class="card-body">
          <h2 class="card-title">Computer intake unavailable</h2>
          <p class="page-subtitle" style="margin-top: 4px;">You need Admin or Super Admin access with inventory creation permission.</p>
          <button class="btn btn-ghost" style="margin-top: 12px;" onclick={() => goto('/assets')}>Return to Assets</button>
        </div>
      </section>
    {:else}

      {#if ciError}<div class="form-error">{ciError}</div>{/if}
      {#if ciNotice}<div class="form-notice">{ciNotice}</div>{/if}
      <div class="form-notice form-notice-muted">Manual values become official only after confirmation. Never enter passwords, product keys, or credentials.</div>

      {#if ciReviewing}
        <section class="card" aria-labelledby="ci-review-title">
          <div class="card-header">
            <h2 class="card-title" id="ci-review-title">Review and Confirm</h2>
            <button type="button" class="btn btn-ghost" onclick={() => ciReviewing = false}>Back to Edit</button>
          </div>
          <div class="card-body">
            {#if ciDuplicateComputerName}
              <div class="form-warning" role="alert">Warning: this computer name already exists in the branch. Confirm this is a separate device.</div>
            {/if}
            {#if ciTagUnavailable}
              <div class="form-error" role="alert">This asset tag is already in use. Change it before submitting.</div>
            {/if}
            <div class="review-grid">
              <div class="review-row"><span class="review-key">Name</span><span class="review-val">{ciForm.name}</span></div>
              <div class="review-row"><span class="review-key">Asset tag</span><span class="review-val">{ciForm.assetTag || 'Not provided'}</span></div>
              <div class="review-row"><span class="review-key">Branch</span><span class="review-val">{ciBranches.find(x => x.id === ciForm.branchId)?.name || 'Missing'}</span></div>
              <div class="review-row"><span class="review-key">Assignment</span><span class="review-val">{ciEmployees.find(x => x.id === ciForm.employeeId)?.name || 'Unassigned'}</span></div>
              <div class="review-row"><span class="review-key">Specifications</span><span class="review-val">{[ciForm.brand, ciForm.model, ciForm.processor, ciForm.operatingSystem].filter(Boolean).join(' · ') || 'Not provided'}</span></div>
            </div>
            <button class="btn btn-primary" onclick={ciSubmit} disabled={ciSaving || ciTagUnavailable}>Confirm and Submit Official Record</button>
          </div>
        </section>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); void ciReview(); }} class="form-body">

        <section class="card">
          <div class="card-header"><h2 class="card-title">1. Identity</h2></div>
          <div class="card-body">
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="ci-name">Computer Name <span class="required">*</span></label>
                <input id="ci-name" class="field-input" bind:value={ciForm.name} required placeholder="e.g. Finance-LT-014" />
              </div>
              <div class="field">
                <label class="field-label" for="ci-tag">Asset Tag</label>
                <input id="ci-tag" class="field-input" bind:value={ciForm.assetTag} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-serial">Serial Number</label>
                <input id="ci-serial" class="field-input" bind:value={ciForm.serialNumber} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-netname">Network Computer Name</label>
                <input id="ci-netname" class="field-input" bind:value={ciForm.computerName} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-brand">Brand</label>
                <input id="ci-brand" class="field-input" bind:value={ciForm.brand} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-model">Model</label>
                <input id="ci-model" class="field-input" bind:value={ciForm.model} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-category">Category</label>
                <select id="ci-category" class="field-select" bind:value={ciForm.categoryId}>
                  <option value="">Select category</option>
                  {#each ciCategories as item}<option value={item.id}>{item.name}</option>{/each}
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="ci-devicetype">Device Type</label>
                <select id="ci-devicetype" class="field-select" bind:value={ciForm.deviceType}>
                  <option value="computer">Desktop</option>
                  <option value="laptop">Laptop</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2 class="card-title">2. Branch and Lifecycle</h2></div>
          <div class="card-body">
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="ci-branch">Branch / Location <span class="required">*</span></label>
                <select id="ci-branch" class="field-select" bind:value={ciForm.branchId} required>
                  <option value="">Select active branch</option>
                  {#each ciBranches as item}<option value={item.id}>{item.name}</option>{/each}
                </select>
              </div>
              <div class="field">
                <span class="field-label">Ownership</span>
                <p class="field-static">Company <span class="field-hint">(Phase 1 supports company inventory only)</span></p>
              </div>
              <div class="field">
                <label class="field-label" for="ci-condition">Condition</label>
                <select id="ci-condition" class="field-select" bind:value={ciForm.condition}>
                  <option value="usable">Usable</option>
                  <option value="for_repair">For Repair</option>
                  <option value="for_disposal">For Disposal</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="ci-status">Status</label>
                <select id="ci-status" class="field-select" bind:value={ciForm.status}>
                  <option value="active">Active</option>
                  <option value="lost">Lost</option>
                  <option value="stolen">Stolen</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="ci-purchase">Purchase Date</label>
                <DatePicker bind:value={ciForm.purchaseDate} id="ci-purchase" placeholder="Pick purchase date" />
              </div>
              <div class="field">
                <label class="field-label" for="ci-warranty">Warranty Expiry</label>
                <DatePicker bind:value={ciForm.warrantyExpiry} id="ci-warranty" placeholder="Pick expiry date" />
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2 class="card-title">3. Specifications</h2></div>
          <div class="card-body">
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="ci-cpu">Processor</label>
                <input id="ci-cpu" class="field-input" bind:value={ciForm.processor} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-mobo">Motherboard</label>
                <input id="ci-mobo" class="field-input" bind:value={ciForm.motherboard} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-os">Operating System</label>
                <input id="ci-os" class="field-input" bind:value={ciForm.operatingSystem} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-osver">OS Version</label>
                <input id="ci-osver" class="field-input" bind:value={ciForm.osVersion} />
              </div>
              <div class="field">
                <label class="field-label" for="ci-osdate">OS Install Date</label>
                <DatePicker bind:value={ciForm.osInstallDate} id="ci-osdate" placeholder="Pick install date" />
              </div>
            </div>

            <div class="card-divider"></div>

            <div class="components-block">
              <div class="components-head">
                <h3 class="card-title" style="font-size: 13px;">RAM and Storage</h3>
                <div class="header-left">
                  <button type="button" class="btn btn-ghost" onclick={() => ciAddComponent('ram')}>+ RAM row</button>
                  <button type="button" class="btn btn-ghost" onclick={() => ciAddComponent('storage')}>+ Storage row</button>
                </div>
              </div>
              {#if ciForm.components.length === 0}
                <p class="page-subtitle">Optional repeatable component rows.</p>
              {/if}
              {#each ciForm.components as component, index}
                <div class="component-row">
                  <span class="component-type">{component.type === 'ram' ? 'RAM' : 'Storage'}</span>
                  <input class="field-input" aria-label="Slot or bay" bind:value={component.slotOrBay} placeholder="Slot / bay" />
                  <input class="field-input" aria-label="Brand" bind:value={component.brand} placeholder="Brand" />
                  <input class="field-input" aria-label="Model" bind:value={component.model} placeholder="Model" />
                  <input class="field-input" aria-label="Serial number" bind:value={component.serialNumber} placeholder="Serial" />
                  <input class="field-input" aria-label="Capacity" bind:value={component.capacity} placeholder="Capacity" />
                  <button type="button" class="component-remove" onclick={() => ciRemoveComponent(index)} aria-label="Remove row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6L18 18"/></svg>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2 class="card-title">4. Optional Assignment</h2></div>
          <div class="card-body">
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="ci-employee">Custodian / Employee</label>
                <select id="ci-employee" class="field-select" bind:value={ciForm.employeeId}>
                  <option value="">Leave unassigned</option>
                  {#each ciEmployees as item}<option value={item.id}>{item.name}{item.employeeId ? ` · ${item.employeeId}` : ''}</option>{/each}
                </select>
              </div>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="ci-notes">Notes</label>
              <textarea id="ci-notes" class="field-textarea-input" bind:value={ciForm.description} rows="3"></textarea>
            </div>
          </div>
        </section>

        <div class="ci-bottom-actions">
          <button type="button" class="btn btn-ghost" onclick={ciSave}>Save Draft</button>
          <button type="submit" class="btn btn-primary" disabled={ciSaving}>Review and Submit</button>
        </div>
      </form>
    {/if}
  {/if}
</div>

<!-- Lightbox (generic-mode photo preview only) -->
{#if mode === 'generic' && lightboxPhoto}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="lightbox-overlay" onclick={() => lightboxPhoto = null}>
    <div class="lightbox-inner" onclick={(e) => e.stopPropagation()}>
      <img src={lightboxPhoto} alt="Asset photo preview" class="lightbox-img" />
      <button type="button" class="lightbox-close" onclick={() => lightboxPhoto = null} aria-label="Close preview">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path d="M18 6L6 18M6 6L18 18" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  /* ── Page shell ─────────────────────────────────────────────────────────── */
  .page {
    width: 100%;
    min-width: 0;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .page-title {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.5px;
    line-height: 1.3;
    font-family: var(--font-sans);
  }

  .page-subtitle {
    font-size: 13px;
    color: var(--mute);
    margin-top: 2px;
    font-family: var(--font-sans);
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 32px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Mode toggle ────────────────────────────────────────────────────────── */
  .mode-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    width: fit-content;
    margin-bottom: 16px;
  }

  .mode-tab {
    padding: 7px 14px;
    border-radius: var(--r-sm);
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    color: var(--body);
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
    white-space: nowrap;
  }

  .mode-tab:hover {
    color: var(--ink);
  }

  .mode-tab--active {
    background: var(--canvas);
    color: var(--ink);
    box-shadow: var(--shadow-l1);
  }

  /* ── Form body ──────────────────────────────────────────────────────────── */
  .form-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Card ───────────────────────────────────────────────────────────────── */
  .card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l1);
  }

  .card-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--hairline);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.2px;
  }

  /* ── Card main (image + fields side-by-side) ────────────────────────────── */
  .card-main {
    display: flex;
    gap: 0;
    padding: 20px;
    gap: 24px;
    align-items: flex-start;
  }

  /* ── Image column ───────────────────────────────────────────────────────── */
  .image-col {
    flex-shrink: 0;
    width: 168px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  /* ── Empty state ── */
  .image-empty {
    width: 100%;
    height: 120px;
    border: 1.5px dashed var(--hairline-strong);
    border-radius: var(--r-md);
    background: var(--canvas-soft);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--hairline-strong);
  }
  .empty-label {
    font-size: 11px;
    color: var(--mute);
    font-family: var(--font-sans);
  }

  /* ── Photo grid ── */
  .photo-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
    width: 100%;
    max-height: 280px;
    overflow-y: auto;
  }

  .photo-thumb {
    position: relative;
    width: 100%;
    height: 120px;
    border-radius: var(--r-sm);
    overflow: hidden;
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Overlay: visible on hover */
  .thumb-overlay {
    position: absolute;
    inset: 0;
    background: oklch(0% 0 0 / 45%);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    opacity: 0;
    transition: opacity 140ms ease;
  }
  .photo-thumb:hover .thumb-overlay {
    opacity: 1;
  }

  .thumb-action {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: oklch(100% 0 0 / 90%);
    border: none;
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 100ms;
    flex-shrink: 0;
  }
  .thumb-action:hover {
    background: oklch(100% 0 0);
  }
  .thumb-action-remove {
    background: oklch(60% 0.22 25 / 90%);
    color: #fff;
  }
  .thumb-action-remove:hover {
    background: oklch(52% 0.24 25);
  }

  /* ── Upload button ── */
  .upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
    text-align: center;
    width: 100%;
    justify-content: center;
  }
  .upload-btn:hover {
    background: var(--canvas-soft);
    border-color: var(--hairline-strong);
  }

  .upload-hint {
    font-size: 11px;
    color: var(--mute);
    font-family: var(--font-sans);
    text-align: center;
    line-height: 1.5;
  }

  /* ── Lightbox ── */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: oklch(0% 0 0 / 72%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lightbox-inner {
    position: relative;
    max-width: min(90vw, 820px);
    max-height: 90vh;
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: 0 24px 80px oklch(0% 0 0 / 0.4);
  }
  .lightbox-img {
    display: block;
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
  }
  .lightbox-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: oklch(0% 0 0 / 55%);
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 100ms;
  }
  .lightbox-close:hover {
    background: oklch(0% 0 0 / 80%);
  }

  /* ── Fields column ──────────────────────────────────────────────────────── */
  .fields-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .fields-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px 16px;
  }

  /* ── Card bottom (description + attachment) ─────────────────────────────── */
  .card-divider {
    height: 1px;
    background: var(--hairline);
    margin: 0 20px;
  }

  .card-bottom {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 20px;
    padding: 20px;
    align-items: flex-start;
  }

  .attachment-field {
    width: 200px;
  }

  /* ── Card body (additional details) ────────────────────────────────────── */
  .card-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .fields-grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px 16px;
  }

  /* ── Checkbox rows ──────────────────────────────────────────────────────── */
  .checkbox-pair {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
  }

  .checkbox-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    cursor: pointer;
    flex-wrap: wrap;
  }

  .checkbox {
    width: 15px;
    height: 15px;
    accent-color: var(--link);
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .checkbox-label {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
  }

  .checkbox-hint {
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
    width: 100%;
    padding-left: 23px;
    margin-top: -4px;
  }

  /* ── Form fields ────────────────────────────────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
    letter-spacing: -0.1px;
  }

  .field-static {
    font-size: 13.5px;
    color: var(--ink);
    font-family: var(--font-sans);
    margin: 0;
    padding: 7px 0;
  }

  .field-hint {
    font-size: 12px;
    color: var(--mute);
  }

  .required {
    color: var(--error);
  }

  .field-input,
  .field-select {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    background: var(--canvas);
    color: var(--ink);
    font-size: 13.5px;
    font-family: var(--font-sans);
    outline: none;
    transition: border-color 120ms ease, box-shadow 120ms ease;
    width: 100%;
  }

  .field-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 30px;
    cursor: pointer;
  }

  .field-input:focus,
  .field-select:focus {
    border-color: var(--link);
    box-shadow: 0 0 0 3px var(--link-bg-soft);
  }

  .field-input:disabled,
  .field-select:disabled {
    background: var(--canvas-soft-2);
    color: var(--mute);
    cursor: not-allowed;
  }

  .field-input::placeholder {
    color: var(--mute);
  }

  .field-textarea {
    flex: 1;
  }

  .field-textarea-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    background: var(--canvas);
    color: var(--ink);
    font-size: 13.5px;
    font-family: var(--font-sans);
    outline: none;
    resize: vertical;
    line-height: 1.5;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  .field-textarea-input:focus {
    border-color: var(--link);
    box-shadow: 0 0 0 3px var(--link-bg-soft);
  }

  .field-textarea-input::placeholder {
    color: var(--mute);
  }

  /* ── Attachment button ──────────────────────────────────────────────────── */
  .attach-btn {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }

  .attach-btn:hover {
    background: var(--canvas-soft);
    border-color: var(--hairline-strong);
  }

  /* ── Buttons ────────────────────────────────────────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 34px;
    border-radius: var(--r-sm);
    font-size: 13.5px;
    font-weight: 500;
    font-family: var(--font-sans);
    letter-spacing: -0.1px;
    cursor: pointer;
    border: none;
    transition: background 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  }

  .btn-primary {
    background: var(--ink);
    color: var(--on-primary);
  }

  .btn-primary:hover {
    opacity: 0.85;
  }

  .btn-ghost {
    background: var(--canvas);
    color: var(--body);
    border: 1px solid var(--hairline);
  }

  .btn-ghost:hover {
    background: var(--canvas-soft-2);
    border-color: var(--hairline-strong);
  }

  .form-error {
    padding: 10px 14px;
    background: var(--error-soft);
    color: var(--error);
    border-radius: var(--r-sm);
    font-size: 13px;
    font-family: var(--font-sans);
  }

  .form-notice {
    padding: 10px 14px;
    background: oklch(94% 0.04 150);
    color: oklch(35% 0.12 150);
    border-radius: var(--r-sm);
    font-size: 13px;
    font-family: var(--font-sans);
  }

  .form-notice-muted {
    background: var(--canvas-soft-2);
    color: var(--body);
  }

  .form-warning {
    padding: 10px 14px;
    background: var(--warning-soft);
    color: var(--warning);
    border-radius: var(--r-sm);
    font-size: 13px;
    font-family: var(--font-sans);
    margin-bottom: 4px;
  }

  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Disabled field wrapper (e.g. maintenance date when checkbox is off) */
  .field-disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .btn-scan {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 34px;
    border-radius: var(--r-sm);
    font-size: 13.5px;
    font-weight: 500;
    font-family: var(--font-sans);
    letter-spacing: -0.1px;
    cursor: pointer;
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--body);
    text-decoration: none;
    transition: background 120ms ease, border-color 120ms ease;
  }

  .btn-scan:hover {
    background: var(--canvas-soft-2);
    border-color: var(--hairline-strong);
  }

  /* ── Computer intake: review summary ────────────────────────────────────── */
  .review-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .review-row {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 12px;
    font-size: 13.5px;
    font-family: var(--font-sans);
  }

  .review-key {
    color: var(--mute);
  }

  .review-val {
    color: var(--ink);
  }

  /* ── Computer intake: RAM/storage component rows ────────────────────────── */
  .components-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .components-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .component-row {
    display: grid;
    grid-template-columns: 60px repeat(5, minmax(0, 1fr)) 34px;
    gap: 8px;
    align-items: center;
  }

  .component-type {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--body);
    font-family: var(--font-sans);
  }

  .component-remove {
    width: 28px;
    height: 28px;
    border-radius: var(--r-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas);
    color: var(--error);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 100ms ease;
  }

  .component-remove:hover {
    background: var(--error-soft);
  }

  .ci-bottom-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 4px 0 8px;
  }

  /* ── Accessibility ──────────────────────────────────────────────────────── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .fields-grid,
    .fields-grid-3 {
      grid-template-columns: 1fr 1fr;
    }

    .card-bottom {
      grid-template-columns: 1fr;
    }

    .attachment-field {
      width: 100%;
    }

    .component-row {
      grid-template-columns: 1fr 1fr;
    }

    .component-type {
      grid-column: span 2;
    }
  }

  @media (max-width: 600px) {
    .page-header {
      flex-direction: column;
      gap: 12px;
    }

    .card-main {
      flex-direction: column;
    }

    .image-col {
      width: 100%;
    }

    .image-preview {
      width: 100%;
      height: 160px;
    }

    .fields-grid,
    .fields-grid-3 {
      grid-template-columns: 1fr;
    }

    .checkbox-pair {
      flex-direction: column;
      gap: 16px;
    }

    .review-row {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
