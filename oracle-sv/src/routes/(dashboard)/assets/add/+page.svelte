<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import { authStore } from '$lib/stores/auth.svelte';
  import DatePicker from '$lib/components/date/DatePicker.svelte';

  interface Category { id: string; name: string; }
  interface Branch   { id: string; name: string; }
  interface EmployeeOption { id: string; name: string; employeeId?: string | null; }

  const CONDITIONS = [
    { value: 'usable',       label: 'Usable'       },
    { value: 'for_repair',   label: 'For Repair'   },
    { value: 'for_disposal', label: 'For Disposal' },
  ];
  const OWNERSHIPS = [
    { value: 'company',  label: 'Company'  },
    { value: 'personal', label: 'Personal' },
  ];
  const isComputerCategoryName = (name: string | undefined) => !!name && /desktop|laptop|computer/i.test(name);

  let categories = $state<Category[]>([]);
  let branches   = $state<Branch[]>([]);

  // ── Form state (shared by every asset, computer/laptop or otherwise) ─────────
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

  // ── Computer / Laptop specifications — shown inline whenever the selected
  //    Category is a desktop/laptop/computer category. Not a separate mode:
  //    same form, same Save Asset button, one submit path. ────────────────────
  const selectedCategory = $derived(categories.find((c) => c.id === categoryId));
  const isComputerCategory = $derived(isComputerCategoryName(selectedCategory?.name));
  const computerAllowed = $derived(can('create_inventory') && ['admin', 'super_admin'].includes((authStore.user?.role ?? '').trim().toLowerCase()));
  const computerForbidden = $derived(isComputerCategory && !computerAllowed);

  type CiComponent = { type: 'ram' | 'storage'; slotOrBay?: string; brand?: string; model?: string; serialNumber?: string; capacity?: string; storageKind?: string };
  let assetTag         = $state('');
  let computerName     = $state('');
  let brand             = $state('');
  let model             = $state('');
  let deviceType        = $state<'computer' | 'laptop'>('computer');
  let processor         = $state('');
  let motherboard       = $state('');
  let operatingSystem   = $state('');
  let osVersion         = $state('');
  let osInstallDate     = $state('');
  let employeeId        = $state('');
  let components         = $state<CiComponent[]>([]);
  let employees          = $state<EmployeeOption[]>([]);

  // Duplicate-name is a soft warning (backend still allows the save); an
  // in-use asset tag is a hard block. Both surface inline — no separate
  // review screen. A duplicate-name hit requires one extra "Save Anyway"
  // click on the same button rather than a silent auto-continue.
  let pendingDuplicateConfirm = $state(false);
  let pendingDraftId          = $state('');
  let pendingDraftVersion     = $state('');
  let duplicateWarningText    = $state('');

  function resetPendingConfirm() {
    pendingDuplicateConfirm = false; pendingDraftId = ''; pendingDraftVersion = ''; duplicateWarningText = '';
  }

  onMount(async () => {
    [categories, branches] = await Promise.all([
      api.get<Category[]>('/api/categories').catch(() => []),
      api.get<Branch[]>('/api/branches').catch(() => []),
    ]);
  });

  $effect(() => {
    if (isComputerCategory && ownership !== 'company') ownership = 'company';
  });

  $effect(() => {
    if (!isComputerCategory || !branchId || !computerAllowed) { employees = []; return; }
    api.get<{ employees: EmployeeOption[] }>(`/api/computer-intake/lookups?branchId=${encodeURIComponent(branchId)}`)
      .then((res) => { employees = res.employees; })
      .catch(() => { employees = []; });
  });

  function addComponent(type: 'ram' | 'storage') { components = [...components, { type }]; }
  function removeComponent(index: number) { components = components.filter((_, i) => i !== index); }

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

  async function submitComputerAsset() {
    if (computerForbidden) throw new Error('You need Admin or Super Admin access with inventory creation permission to add computer/laptop assets.');
    if (!branchId) throw new Error('Branch is required for computer/laptop assets.');

    if (pendingDuplicateConfirm && pendingDraftId) {
      await api.post(`/api/computer-intake/drafts/${pendingDraftId}/submit`, { expectedUpdatedAt: pendingDraftVersion }, { 'Idempotency-Key': `computer-intake-${pendingDraftId}-${pendingDraftVersion}` });
      resetPendingConfirm();
      return;
    }

    const payload = {
      name: assetName.trim(), assetTag: assetTag.trim() || undefined, computerName: computerName.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined, brand: brand.trim() || undefined, model: model.trim() || undefined,
      deviceType, categoryId: categoryId || undefined, branchId, employeeId: employeeId || undefined,
      ownership: 'company', condition, status: 'active', description: description.trim() || undefined,
      purchaseDate: purchaseDate || undefined, warrantyExpiry: warrantyExpiry || undefined,
      processor: processor.trim() || undefined, motherboard: motherboard.trim() || undefined,
      operatingSystem: operatingSystem.trim() || undefined, osVersion: osVersion.trim() || undefined,
      osInstallDate: osInstallDate || undefined, components,
    };
    const draft = await api.post<{ id: string; updatedAt: string }>('/api/computer-intake/drafts', payload);
    const check = await api.get<{ duplicateComputerName: boolean; assetTagAvailable: boolean; updatedAt: string }>(`/api/computer-intake/drafts/${draft.id}/preflight`);
    if (!check.assetTagAvailable) {
      await api.raw(`/api/computer-intake/drafts/${draft.id}`, { method: 'DELETE' }).catch(() => {});
      throw new Error('This asset tag is already in use. Change it before saving.');
    }
    if (check.duplicateComputerName) {
      pendingDuplicateConfirm = true; pendingDraftId = draft.id; pendingDraftVersion = check.updatedAt;
      duplicateWarningText = 'A computer with this network name already exists in this branch. Click "Save Anyway" to confirm this is a separate device.';
      return;
    }
    await api.post(`/api/computer-intake/drafts/${draft.id}/submit`, { expectedUpdatedAt: check.updatedAt }, { 'Idempotency-Key': `computer-intake-${draft.id}-${check.updatedAt}` });
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!assetName.trim()) { submitErr = 'Asset name is required.'; return; }
    submitting = true; submitErr = '';
    try {
      if (isComputerCategory) {
        await submitComputerAsset();
        if (pendingDuplicateConfirm) { submitting = false; return; } // duplicate warning shown — wait for confirm click
      } else {
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
      }
      goto('/assets');
    } catch (e) {
      submitErr = (e as Error).message;
      submitting = false;
      resetPendingConfirm();
    }
  }

  function handleCancel() {
    goto('/assets');
  }
</script>

<svelte:head><title>Add New Asset · Oracle Inventory</title></svelte:head>

<div class="page">

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/assets')}>Assets</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Add Asset</span>
  </nav>

  <!-- ── Page header ─────────────────────────────────────────────────────────── -->
  <header class="page-header">
    <div class="page-title-group">
      <h1 class="page-title">Add New Asset</h1>
      <p class="page-subtitle">Register a new asset into the inventory system</p>
    </div>
    <div class="header-actions">
      <div class="header-left">
        <button type="button" class="btn btn-ghost" onclick={handleCancel}>Cancel</button>
        <a href="/assets/scan" class="btn btn-scan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Scan Asset
        </a>
      </div>
      <button type="submit" form="add-asset-form" class="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : pendingDuplicateConfirm ? 'Save Anyway' : 'Save Asset'}</button>
    </div>
  </header>

  {#if submitErr}
    <div class="form-error">{submitErr}</div>
  {/if}
  {#if duplicateWarningText}
    <div class="form-warning" role="alert">{duplicateWarningText}</div>
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
                <select id="branch" class="field-select" bind:value={branchId} oninput={resetPendingConfirm}>
                  <option value="">— No branch —</option>
                  {#each branches as b}
                    <option value={b.id}>{b.name}</option>
                  {/each}
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="ownership">Ownership</label>
                <select id="ownership" class="field-select" bind:value={ownership} disabled={isComputerCategory}>
                  {#each OWNERSHIPS as o}
                    <option value={o.value}>{o.label}</option>
                  {/each}
                </select>
                {#if isComputerCategory}<span class="field-hint">Computer/laptop assets are company-owned only.</span>{/if}
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

      <!-- ── Computer / Laptop Specifications — shown only when the selected
           Category is a desktop/laptop/computer category. Same form, same
           Save Asset button as every other category. ─────────────────────── -->
      {#if isComputerCategory}
        {#if computerForbidden}
          <section class="card" aria-label="Computer specifications unavailable">
            <div class="card-body">
              <p class="page-subtitle">You need Admin or Super Admin access with inventory creation permission to add computer/laptop assets.</p>
            </div>
          </section>
        {:else}
          <section class="card" aria-label="Computer specifications">
            <div class="card-header">
              <h2 class="card-title">Computer / Laptop Specifications</h2>
            </div>
            <div class="card-body">
              <div class="fields-grid">
                <div class="field">
                  <label class="field-label" for="ci-tag">Asset Tag</label>
                  <input id="ci-tag" class="field-input" bind:value={assetTag} oninput={resetPendingConfirm} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-netname">Network Computer Name</label>
                  <input id="ci-netname" class="field-input" bind:value={computerName} oninput={resetPendingConfirm} placeholder="e.g. Finance-LT-014" />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-devicetype">Device Type</label>
                  <select id="ci-devicetype" class="field-select" bind:value={deviceType}>
                    <option value="computer">Desktop</option>
                    <option value="laptop">Laptop</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="ci-brand">Brand</label>
                  <input id="ci-brand" class="field-input" bind:value={brand} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-model">Model</label>
                  <input id="ci-model" class="field-input" bind:value={model} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-employee">Custodian / Employee</label>
                  <select id="ci-employee" class="field-select" bind:value={employeeId} oninput={resetPendingConfirm}>
                    <option value="">Leave unassigned</option>
                    {#each employees as item}<option value={item.id}>{item.name}{item.employeeId ? ` · ${item.employeeId}` : ''}</option>{/each}
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="ci-cpu">Processor</label>
                  <input id="ci-cpu" class="field-input" bind:value={processor} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-mobo">Motherboard</label>
                  <input id="ci-mobo" class="field-input" bind:value={motherboard} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-os">Operating System</label>
                  <input id="ci-os" class="field-input" bind:value={operatingSystem} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-osver">OS Version</label>
                  <input id="ci-osver" class="field-input" bind:value={osVersion} />
                </div>
                <div class="field">
                  <label class="field-label" for="ci-osdate">OS Install Date</label>
                  <DatePicker bind:value={osInstallDate} id="ci-osdate" placeholder="Pick install date" />
                </div>
              </div>

              <div class="card-divider" style="margin: 20px 0;"></div>

              <div class="components-block">
                <div class="components-head">
                  <h3 class="card-title" style="font-size: 13px;">RAM and Storage</h3>
                  <div class="header-left">
                    <button type="button" class="btn btn-ghost" onclick={() => addComponent('ram')}>+ RAM row</button>
                    <button type="button" class="btn btn-ghost" onclick={() => addComponent('storage')}>+ Storage row</button>
                  </div>
                </div>
                {#if components.length === 0}
                  <p class="page-subtitle">Optional repeatable component rows.</p>
                {/if}
                {#each components as component, index}
                  <div class="component-row">
                    <span class="component-type">{component.type === 'ram' ? 'RAM' : 'Storage'}</span>
                    <input class="field-input" aria-label="Slot or bay" bind:value={component.slotOrBay} placeholder="Slot / bay" />
                    <input class="field-input" aria-label="Brand" bind:value={component.brand} placeholder="Brand" />
                    <input class="field-input" aria-label="Model" bind:value={component.model} placeholder="Model" />
                    <input class="field-input" aria-label="Serial number" bind:value={component.serialNumber} placeholder="Serial" />
                    <input class="field-input" aria-label="Capacity" bind:value={component.capacity} placeholder="Capacity" />
                    <button type="button" class="component-remove" onclick={() => removeComponent(index)} aria-label="Remove row">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6L18 18"/></svg>
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </section>
        {/if}
      {/if}

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
</div>

<!-- Lightbox -->
{#if lightboxPhoto}
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
  }
</style>
