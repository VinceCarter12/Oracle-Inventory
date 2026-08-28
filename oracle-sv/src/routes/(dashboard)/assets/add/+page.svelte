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

  // ── Computer / Laptop specs: shown inline whenever the selected category
  //    is a computer/laptop category, instead of a separate mode or tab ──────────
  const isComputerCategory = $derived(
    /desktop|laptop|computer/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  let ciLoaded = $state(false);

  // ── Access Point / Switch specs: same inline pattern, direct create (no
  //    draft/preflight — these don't have duplicate-name concerns like
  //    Computer intake does). ───────────────────────────────────────────────────
  const isAccessPointCategory = $derived(
    /access.?point|\bap\b|wifi|wi-fi/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  const isSwitchCategory = $derived(
    /switch/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  let apPhysicalLocation = $state('');
  let apNotes            = $state('');
  let swSwitchType        = $state<'managed' | 'unmanaged'>('unmanaged');
  let swPhysicalLocation  = $state('');
  let swPortCount         = $state('');
  let swNotes             = $state('');

  // ── Phone specs: same inline pattern, direct create. Company vs BYOD reuses
  //    the existing Ownership field — no separate phone-type control. ──────────
  const isPhoneCategory = $derived(
    /phone/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  let phoneImei        = $state('');
  let phonePropertyTag = $state('');
  let phoneBrand       = $state('');
  let phoneModel       = $state('');
  let phoneNotes       = $state('');

  // ── Camera / NVR specs: same inline pattern, direct create. Matches the
  //    same category regex the backend uses in routes/cctv.ts. ─────────────────
  const isCameraCategory = $derived(
    /camera|cctv/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  const isRecorderCategory = $derived(
    /nvr|dvr|recorder/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  let camPhysicalLocation = $state('');
  let camCoverageArea     = $state('');
  let camType             = $state<'fixed' | 'dome' | 'bullet' | 'ptz' | 'thermal' | 'other'>('fixed');
  let camResolution       = $state('');
  let camNightVision      = $state(false);
  let camMotionDetection  = $state(false);
  let camInstallationDate = $state('');
  let camNotes            = $state('');

  let recPhysicalLocation   = $state('');
  let recChannelCapacity    = $state('');
  let recRecorderType       = $state<'nvr' | 'dvr' | 'hybrid' | 'other'>('nvr');
  let recStorageCapacityGb  = $state('');
  let recRetentionDaysTarget = $state('');
  let recNotes              = $state('');

  // ── Server specs: inline once Category is Server. Domain Controller / File
  //    Server aren't separate categories — they're a role on a Server asset,
  //    picked via Role Type below (matches ServerRoleAssignment.roleType).
  //    HIDDEN 2026-08-26 per user request (not enough time to support the
  //    Servers & Circuits surface right now) — SERVER_SPECS_ENABLED forces
  //    this off without deleting the implementation. Flip back to true to
  //    re-enable; nothing else needs to change. ─────────────────────────────────
  const SERVER_SPECS_ENABLED = false;
  const isServerCategory = $derived(
    SERVER_SPECS_ENABLED && /server/i.test(categories.find(c => c.id === categoryId)?.name ?? '')
  );
  let srvEnvironment       = $state<'production' | 'staging' | 'development' | 'test' | 'other'>('production');
  let srvCriticality       = $state<'critical' | 'high' | 'medium' | 'low'>('medium');
  let srvVirtualization    = $state<'physical' | 'hypervisor' | 'virtual_machine' | 'container_host' | 'other'>('physical');
  let srvServiceOwner      = $state('');
  let srvSupportOwner      = $state('');
  let srvPurpose           = $state('');
  let srvRoleType          = $state('');
  let srvMotherboard       = $state('');
  let srvProcessor         = $state('');

  // ── Peripherals: generic child rows attached to whatever asset is created,
  //    regardless of category — same pattern as the RAM/Storage rows already
  //    built for Computer intake, reused via a generic backend endpoint. ────────
  const PERIPHERAL_TYPES = [
    { value: 'monitor', label: 'Monitor' }, { value: 'keyboard', label: 'Keyboard' },
    { value: 'mouse', label: 'Mouse' }, { value: 'speaker', label: 'Speaker' },
    { value: 'webcam', label: 'Webcam' }, { value: 'microphone', label: 'Microphone' },
    { value: 'printer', label: 'Printer' }, { value: 'ups', label: 'UPS' },
    { value: 'avr', label: 'AVR' }, { value: 'clicker', label: 'Clicker' },
    { value: 'projector', label: 'Projector' }, { value: 'tv', label: 'TV' },
    { value: 'signal_booster', label: 'Signal Booster' }, { value: 'flash_drive', label: 'Flash Drive' },
    { value: 'external_hdd', label: 'External HDD' },
    { value: 'hdd_ssd_docking_station', label: 'HDD/SSD Docking Station' },
    { value: 'nvme_docking_station', label: 'NVME/SSD Docking Station' },
  ];
  type PeripheralRow = { type: string; brand: string; model: string; serialNumber: string; capacity: string; propertyTag: string };
  let peripherals = $state<PeripheralRow[]>([]);
  function addPeripheral() {
    peripherals = [...peripherals, { type: 'monitor', brand: '', model: '', serialNumber: '', capacity: '', propertyTag: '' }];
  }
  function removePeripheral(index: number) {
    peripherals = peripherals.filter((_, i) => i !== index);
  }

  // ── When the selected Category IS itself a peripheral type (Monitor,
  //    Keyboard, Printer, etc.), this asset IS that item — no separate
  //    "Peripherals" row for it. It still needs Brand/Model/Property Tag
  //    though, so a small Specs card replaces the generic rows in that case. ────
  const isPeripheralCategory = $derived((() => {
    const name = (categories.find(c => c.id === categoryId)?.name ?? '').toLowerCase();
    return PERIPHERAL_TYPES.some(t => name.includes(t.value.replace(/_/g, ' ')) || name.includes(t.label.toLowerCase()));
  })());
  let periphBrand       = $state('');
  let periphModel       = $state('');
  let periphPropertyTag = $state('');

  onMount(async () => {
    [categories, branches] = await Promise.all([
      api.get<Category[]>('/api/categories').catch(() => []),
      api.get<Branch[]>('/api/branches').catch(() => []),
    ]);

    const typeParam = $page.url.searchParams.get('type');
    const typePatterns: Record<string, RegExp> = {
      computer: /desktop|laptop|computer/i,
      camera:   /camera|cctv/i,
      recorder: /nvr|dvr|recorder/i,
    };
    const pattern = typeParam ? typePatterns[typeParam] : undefined;
    if (pattern) {
      const match = categories.find(c => pattern.test(c.name));
      if (match) categoryId = match.id;
    }
  });

  $effect(() => {
    if (isComputerCategory && !ciLoaded) void ciInit();
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

  function handleCancel() {
    goto('/assets');
  }

  let attachmentFile = $state<File | null>(null);
  function handleAttachmentChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    attachmentFile = input.files?.[0] ?? null;
  }
  async function uploadAttachment(assetId: string) {
    if (!attachmentFile) return;
    const form = new FormData();
    form.append('file', attachmentFile);
    await api.raw(`/api/assets/${assetId}/attachments`, { method: 'POST', body: form });
  }

  // ── Computer / Laptop specs: same form, same submit. Only relevant when the
  //    selected category is a computer/laptop category — inline in the page,
  //    no separate tab, no separate review screen. ─────────────────────────────
  type CiComponent = { type: 'ram' | 'storage'; slotOrBay?: string; brand?: string; model?: string; serialNumber?: string; capacity?: string; storageKind?: string };
  type CiOption = { id: string; name: string; employeeId?: string | null };

  let ciComputerName    = $state('');
  let ciBrand           = $state('');
  let ciModel           = $state('');
  let ciProcessor       = $state('');
  let ciMotherboard     = $state('');
  let ciOperatingSystem = $state('');
  let ciOsVersion       = $state('');
  let ciOsInstallDate   = $state('');
  let ciEmployeeId      = $state('');
  let ciComponents      = $state<CiComponent[]>([]);

  let ciEmployees  = $state<CiOption[]>([]);
  let ciError      = $state('');
  let ciForbidden  = $state(false);
  let ciDraftId       = $state('');
  let ciDraftVersion  = $state('');
  let pendingDuplicateConfirm = $state(false);
  let duplicateComputerNameWarning = $state(false);
  let tagUnavailableError = $state('');

  $effect(() => {
    void assetName;
    pendingDuplicateConfirm = false;
    duplicateComputerNameWarning = false;
    tagUnavailableError = '';
  });

  const computerAllowed = $derived(
    can('create_inventory') && ['admin', 'super_admin'].includes((authStore.user?.role ?? '').trim().toLowerCase())
  );

  async function ciInit() {
    ciLoaded = true;
    if (!computerAllowed) { ciForbidden = true; return; }
    try {
      const lookup = await api.get<{ employees: CiOption[] }>('/api/computer-intake/lookups');
      ciEmployees = lookup.employees;
    } catch (e) { ciError = (e as Error).message; }
  }

  function ciAddComponent(type: 'ram' | 'storage') { ciComponents = [...ciComponents, { type }]; }
  function ciRemoveComponent(index: number) { ciComponents = ciComponents.filter((_, i) => i !== index); }

  function ciDraftBody() {
    const deviceType = /laptop/i.test(categories.find(c => c.id === categoryId)?.name ?? '') ? 'laptop' : 'computer';
    return {
      name: assetName.trim(),
      computerName: ciComputerName.trim(),
      serialNumber: serialNumber.trim(),
      brand: ciBrand.trim(),
      model: ciModel.trim(),
      deviceType,
      categoryId,
      branchId,
      employeeId: ciEmployeeId,
      ownership,
      condition,
      status: 'active',
      description: description.trim(),
      purchaseDate,
      warrantyExpiry,
      processor: ciProcessor.trim(),
      motherboard: ciMotherboard.trim(),
      operatingSystem: ciOperatingSystem.trim(),
      osVersion: ciOsVersion.trim(),
      osInstallDate: ciOsInstallDate,
      components: ciComponents,
    };
  }

  async function submitComputerAsset() {
    ciError = ''; tagUnavailableError = '';

    const body = ciDraftId ? { ...ciDraftBody(), expectedUpdatedAt: ciDraftVersion } : ciDraftBody();
    const row = ciDraftId
      ? await api.put<{ id: string; updatedAt: string }>(`/api/computer-intake/drafts/${ciDraftId}`, body)
      : await api.post<{ id: string; updatedAt: string }>('/api/computer-intake/drafts', body);
    ciDraftId = row.id; ciDraftVersion = row.updatedAt;

    if (!pendingDuplicateConfirm) {
      const check = await api.get<{ duplicateComputerName: boolean; assetTagAvailable: boolean; updatedAt: string }>(`/api/computer-intake/drafts/${ciDraftId}/preflight`);
      ciDraftVersion = check.updatedAt;
      if (!check.assetTagAvailable) {
        tagUnavailableError = 'This asset tag is already in use. Change it before saving.';
        return;
      }
      if (check.duplicateComputerName) {
        duplicateComputerNameWarning = true;
        pendingDuplicateConfirm = true;
        return;
      }
    }

    const created = await api.post<{ id: string }>(`/api/computer-intake/drafts/${ciDraftId}/submit`, { expectedUpdatedAt: ciDraftVersion }, { 'Idempotency-Key': `computer-intake-${ciDraftId}-${ciDraftVersion}` });
    await uploadAttachment(created.id);
    goto('/assets');
  }

  async function submitPlainAsset() {
    return api.post<{ id: string }>('/api/assets', {
      name:               assetName.trim(),
      serialNumber:       serialNumber.trim() || null,
      categoryId:         categoryId || null,
      branchId:           branchId || null,
      condition,
      ownership,
      description:        description.trim() || null,
      warrantyExpiry:     warrantyExpiry || null,
      nextMaintenanceDate: enableMaintenance && nextMaintenance ? nextMaintenance : null,
      imeiNumber:         isPhoneCategory && phoneImei.trim() ? phoneImei.trim() : null,
      propertyTag:        isPhoneCategory && phonePropertyTag.trim()
                             ? phonePropertyTag.trim()
                             : isPeripheralCategory && periphPropertyTag.trim() ? periphPropertyTag.trim() : null,
    });
  }

  async function attachPeripheralSpecs(assetId: string) {
    if (!periphBrand.trim() && !periphModel.trim()) return;
    await api.put(`/api/assets/${assetId}/device-profile`, {
      brand: periphBrand.trim() || undefined,
      model: periphModel.trim() || undefined,
    });
  }

  async function attachPeripherals(assetId: string) {
    if (peripherals.length === 0) return;
    await api.post(`/api/assets/${assetId}/components`, {
      components: peripherals.map(p => ({
        type: p.type,
        brand: p.brand.trim() || undefined,
        model: p.model.trim() || undefined,
        serialNumber: p.serialNumber.trim() || undefined,
        capacity: p.capacity.trim() || undefined,
        propertyTag: p.propertyTag.trim() || undefined,
      })),
    });
  }

  async function submitPhoneAsset() {
    const asset = await submitPlainAsset();
    if (phoneBrand.trim() || phoneModel.trim() || phoneNotes.trim()) {
      const idempotencyKey = `phone-${asset.id}-${Date.now()}`;
      await api.post('/api/phones', {
        assetId: asset.id,
        brand: phoneBrand.trim() || undefined,
        model: phoneModel.trim() || undefined,
        notes: phoneNotes.trim() || undefined,
      }, { 'Idempotency-Key': idempotencyKey });
    }
    await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
    goto('/assets');
  }

  async function submitAccessPointAsset() {
    if (!apPhysicalLocation.trim()) { submitErr = 'Physical location is required for an access point.'; return; }
    const asset = await submitPlainAsset();
    const idempotencyKey = `access-point-${asset.id}-${Date.now()}`;
    await api.post('/api/network/access-points', {
      assetId: asset.id,
      physicalLocation: apPhysicalLocation.trim(),
      notes: apNotes.trim() || undefined,
    }, { 'Idempotency-Key': idempotencyKey });
    await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
    goto('/assets');
  }

  async function submitSwitchAsset() {
    if (!swPhysicalLocation.trim()) { submitErr = 'Physical location is required for a switch.'; return; }
    const asset = await submitPlainAsset();
    const idempotencyKey = `switch-${asset.id}-${Date.now()}`;
    await api.post('/api/network/switches', {
      assetId: asset.id,
      switchType: swSwitchType,
      physicalLocation: swPhysicalLocation.trim(),
      portCount: swPortCount.trim() ? Number(swPortCount) : undefined,
      notes: swNotes.trim() || undefined,
    }, { 'Idempotency-Key': idempotencyKey });
    await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
    goto('/assets');
  }

  async function submitCameraAsset() {
    if (!camPhysicalLocation.trim()) { submitErr = 'Physical location is required for a camera.'; return; }
    const asset = await submitPlainAsset();
    const idempotencyKey = `camera-${asset.id}-${Date.now()}`;
    await api.post('/api/cctv/cameras', {
      assetId: asset.id,
      physicalLocation: camPhysicalLocation.trim(),
      coverageArea: camCoverageArea.trim() || undefined,
      cameraType: camType,
      resolution: camResolution.trim() || undefined,
      nightVision: camNightVision,
      motionDetection: camMotionDetection,
      installationDate: camInstallationDate || undefined,
      notes: camNotes.trim() || undefined,
    }, { 'Idempotency-Key': idempotencyKey });
    await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
    goto('/assets');
  }

  async function submitRecorderAsset() {
    if (!recPhysicalLocation.trim()) { submitErr = 'Physical location is required for a recorder.'; return; }
    const capacity = Number(recChannelCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) { submitErr = 'Channel capacity must be a whole number of at least 1.'; return; }
    const asset = await submitPlainAsset();
    const idempotencyKey = `recorder-${asset.id}-${Date.now()}`;
    await api.post('/api/cctv/recorders', {
      assetId: asset.id,
      recorderType: recRecorderType,
      channelCapacity: capacity,
      physicalLocation: recPhysicalLocation.trim(),
      storageCapacityBytes: recStorageCapacityGb.trim() ? Number(recStorageCapacityGb) * 1_000_000_000 : undefined,
      retentionDaysTarget: recRetentionDaysTarget.trim() ? Number(recRetentionDaysTarget) : undefined,
      notes: recNotes.trim() || undefined,
    }, { 'Idempotency-Key': idempotencyKey });
    await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
    goto('/assets');
  }

  async function submitServerAsset() {
    if (!srvServiceOwner.trim()) { submitErr = 'Service owner is required for a server.'; return; }
    const asset = await submitPlainAsset();
    const profileKey = `server-profile-${asset.id}-${Date.now()}`;
    await api.put(`/api/servers/${asset.id}/profile`, {
      environment: srvEnvironment,
      criticality: srvCriticality,
      virtualizationRole: srvVirtualization,
      serviceOwner: srvServiceOwner.trim(),
      supportOwner: srvSupportOwner.trim() || undefined,
      purpose: srvPurpose.trim() || undefined,
    }, { 'Idempotency-Key': profileKey });

    if (srvMotherboard.trim() || srvProcessor.trim()) {
      await api.put(`/api/assets/${asset.id}/device-profile`, {
        motherboard: srvMotherboard.trim() || undefined,
        processor: srvProcessor.trim() || undefined,
      });
    }

    if (srvRoleType) {
      const roleKey = `server-role-${asset.id}-${Date.now()}`;
      await api.post(`/api/servers/${asset.id}/roles`, { roleType: srvRoleType }, { 'Idempotency-Key': roleKey });
    }

    await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
    goto('/assets');
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    submitErr = '';
    if (!assetName.trim()) { submitErr = 'Asset name is required.'; return; }
    if (!branchId) { submitErr = 'Branch is required. If this asset has no assigned branch yet, add a Warehouse branch first from the Branches page.'; return; }
    submitting = true;
    try {
      if (isComputerCategory && computerAllowed) {
        await submitComputerAsset();
      } else if (isAccessPointCategory) {
        await submitAccessPointAsset();
      } else if (isSwitchCategory) {
        await submitSwitchAsset();
      } else if (isPhoneCategory) {
        await submitPhoneAsset();
      } else if (isCameraCategory) {
        await submitCameraAsset();
      } else if (isRecorderCategory) {
        await submitRecorderAsset();
      } else if (isServerCategory) {
        await submitServerAsset();
      } else {
        const asset = await submitPlainAsset();
        if (isPeripheralCategory) {
          await attachPeripheralSpecs(asset.id);
          await uploadAttachment(asset.id);
        } else {
          await attachPeripherals(asset.id);
    await uploadAttachment(asset.id);
        }
        goto('/assets');
      }
    } catch (e) {
      submitErr = (e as Error).message;
    } finally {
      submitting = false;
    }
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
      <button type="submit" form="add-asset-form" class="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save Asset'}</button>
    </div>
  </header>

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
                  placeholder="Leave blank if not applicable"
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
                <label class="field-label" for="branch">Branch <span class="required">*</span></label>
                <select id="branch" class="field-select" bind:value={branchId}>
                  <option value="">— Select branch —</option>
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
            <input id="attachment" type="file" class="sr-only" accept=".pdf,.csv,.zip,.docx,.xlsx,.jpeg,.jpg,.png" onchange={handleAttachmentChange} />
            {#if attachmentFile}
              <p class="upload-hint" style="margin-top: 8px;">{attachmentFile.name} ({(attachmentFile.size / 1024).toFixed(0)} KB) <button type="button" class="link-btn" onclick={() => attachmentFile = null}>Remove</button></p>
            {:else}
              <p class="upload-hint" style="margin-top: 8px;">Max file size: 5MB<br />PDF, CSV, ZIP, DOCX, XLSX, JPEG</p>
            {/if}
          </div>
        </div>
      </section>

      <!-- ── Computer / laptop specs: shown inline once Category is Computer/Laptop.
           Same form, same submit button — no separate mode or review step. ────── -->
      {#if isComputerCategory}
        <section class="card ci-card" aria-label="Computer or laptop specifications">
          <div class="card-header">
            <h2 class="card-title">Computer / Laptop Specs</h2>
          </div>
          <div class="card-body">
            {#if !computerAllowed}
              <div class="form-notice form-notice-muted">You need Admin or Super Admin access with inventory creation permission to fill in computer specs. This asset will be saved without them.</div>
            {:else}
              <p class="ci-hint">This section appears because the category above is Computer or Laptop. Change the category and it disappears — no data is lost. Asset Tag is assigned automatically on save.</p>

              {#if duplicateComputerNameWarning}
                <div class="form-warning" role="alert">This computer name already exists in the branch. Submit again to save it anyway as a separate device.</div>
              {/if}
              {#if tagUnavailableError}
                <div class="form-error" role="alert">{tagUnavailableError}</div>
              {/if}

              <fieldset class="specs-fieldset" disabled={submitting}>
                <div class="fields-grid">
                  <div class="field">
                    <label class="field-label" for="ci-netname">Computer Name</label>
                    <input id="ci-netname" class="field-input" bind:value={ciComputerName} placeholder="e.g. Finance-LT-014" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-brand">Brand</label>
                    <input id="ci-brand" class="field-input" bind:value={ciBrand} />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-model">Model</label>
                    <input id="ci-model" class="field-input" bind:value={ciModel} />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-cpu">Processor</label>
                    <input id="ci-cpu" class="field-input" bind:value={ciProcessor} />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-mobo">Motherboard</label>
                    <input id="ci-mobo" class="field-input" bind:value={ciMotherboard} />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-os">Operating System</label>
                    <input id="ci-os" class="field-input" bind:value={ciOperatingSystem} />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-osver">OS Version</label>
                    <input id="ci-osver" class="field-input" bind:value={ciOsVersion} />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-osdate">OS Install Date</label>
                    <DatePicker bind:value={ciOsInstallDate} id="ci-osdate" placeholder="Pick install date" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="ci-employee">Assigned Employee</label>
                    <select id="ci-employee" class="field-select" bind:value={ciEmployeeId}>
                      <option value="">Leave unassigned</option>
                      {#each ciEmployees as item}<option value={item.id}>{item.name}{item.employeeId ? ` · ${item.employeeId}` : ''}</option>{/each}
                    </select>
                  </div>
                </div>

                <div class="card-divider" style="margin: 16px 0;"></div>

                <div class="components-block">
                  <div class="components-head">
                    <h3 class="card-title" style="font-size: 13px;">RAM and Storage</h3>
                    <div class="header-left">
                      <button type="button" class="btn btn-ghost" onclick={() => ciAddComponent('ram')}>+ RAM row</button>
                      <button type="button" class="btn btn-ghost" onclick={() => ciAddComponent('storage')}>+ Storage row</button>
                    </div>
                  </div>
                  {#if ciComponents.length === 0}
                    <p class="page-subtitle">Optional repeatable component rows.</p>
                  {/if}
                  {#each ciComponents as component, index}
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
              </fieldset>
            {/if}
          </div>
        </section>
      {/if}

      <!-- ── Access Point specs: inline once Category is Access Point. ──────────── -->
      {#if isAccessPointCategory}
        <section class="card ci-card" aria-label="Access point specifications">
          <div class="card-header">
            <h2 class="card-title">Access Point Specs</h2>
          </div>
          <div class="card-body">
            <p class="ci-hint">Physical location only here. IP address and VLAN are recorded from <a href="/inventory/intake/network">Network Intake</a> after this asset is saved; login credentials are linked from the asset's own page.</p>
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="ap-location">Physical Location <span class="required">*</span></label>
                <input id="ap-location" class="field-input" bind:value={apPhysicalLocation} placeholder="e.g. 2nd floor ceiling, Cubao" />
              </div>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="ap-notes">Notes</label>
              <textarea id="ap-notes" class="field-textarea-input" bind:value={apNotes} rows="3"></textarea>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Switch specs: inline once Category is Switch. ──────────────────────── -->
      {#if isSwitchCategory}
        <section class="card ci-card" aria-label="Switch specifications">
          <div class="card-header">
            <h2 class="card-title">Switch Specs</h2>
          </div>
          <div class="card-body">
            <p class="ci-hint">Port assignments and IP address are recorded from <a href="/inventory/intake/network">Network Intake</a> after this asset is saved; login credentials are linked from the asset's own page.</p>
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="sw-type">Switch Type</label>
                <select id="sw-type" class="field-select" bind:value={swSwitchType}>
                  <option value="unmanaged">Unmanaged</option>
                  <option value="managed">Managed</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="sw-location">Physical Location <span class="required">*</span></label>
                <input id="sw-location" class="field-input" bind:value={swPhysicalLocation} placeholder="e.g. Server room rack 2" />
              </div>
              <div class="field">
                <label class="field-label" for="sw-ports">Port Count</label>
                <input id="sw-ports" type="number" min="1" max="512" class="field-input" bind:value={swPortCount} placeholder="e.g. 24" />
              </div>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="sw-notes">Notes</label>
              <textarea id="sw-notes" class="field-textarea-input" bind:value={swNotes} rows="3"></textarea>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Phone specs: inline once Category is Phone. Company vs BYOD reads
           from the Ownership field above — no separate control here. ─────────── -->
      {#if isPhoneCategory}
        <section class="card ci-card" aria-label="Phone specifications">
          <div class="card-header">
            <h2 class="card-title">Phone Specs</h2>
          </div>
          <div class="card-body">
            <p class="ci-hint">Company vs BYOD uses the Ownership field above — set it to Personal for a BYOD phone.</p>
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="ph-brand">Brand</label>
                <input id="ph-brand" class="field-input" bind:value={phoneBrand} placeholder="e.g. Samsung" />
              </div>
              <div class="field">
                <label class="field-label" for="ph-model">Model</label>
                <input id="ph-model" class="field-input" bind:value={phoneModel} />
              </div>
              <div class="field">
                <label class="field-label" for="ph-imei">IMEI</label>
                <input id="ph-imei" class="field-input" bind:value={phoneImei} />
              </div>
              <div class="field">
                <label class="field-label" for="ph-tag">Property Tag</label>
                <input id="ph-tag" class="field-input" bind:value={phonePropertyTag} />
              </div>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="ph-notes">Notes</label>
              <textarea id="ph-notes" class="field-textarea-input" bind:value={phoneNotes} rows="3"></textarea>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Camera specs: inline once Category is Camera/CCTV. ─────────────────── -->
      {#if isCameraCategory}
        <section class="card ci-card" aria-label="Camera specifications">
          <div class="card-header">
            <h2 class="card-title">Camera Specs</h2>
          </div>
          <div class="card-body">
            <p class="ci-hint">Assign this camera to a recorder channel from its asset detail page after saving.</p>
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="cam-location">Physical Location <span class="required">*</span></label>
                <input id="cam-location" class="field-input" bind:value={camPhysicalLocation} placeholder="e.g. Entrance, Cubao branch" />
              </div>
              <div class="field">
                <label class="field-label" for="cam-coverage">Coverage Area</label>
                <input id="cam-coverage" class="field-input" bind:value={camCoverageArea} />
              </div>
              <div class="field">
                <label class="field-label" for="cam-type">Camera Type</label>
                <select id="cam-type" class="field-select" bind:value={camType}>
                  <option value="fixed">Fixed</option>
                  <option value="dome">Dome</option>
                  <option value="bullet">Bullet</option>
                  <option value="ptz">PTZ</option>
                  <option value="thermal">Thermal</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="cam-resolution">Resolution</label>
                <input id="cam-resolution" class="field-input" bind:value={camResolution} placeholder="e.g. 4MP" />
              </div>
              <div class="field">
                <label class="field-label" for="cam-installed">Installation Date</label>
                <DatePicker bind:value={camInstallationDate} id="cam-installed" placeholder="Pick install date" />
              </div>
            </div>
            <div class="checkbox-pair" style="margin-top: 16px;">
              <label class="checkbox-row">
                <input type="checkbox" class="checkbox" bind:checked={camNightVision} />
                <span class="checkbox-label">Night vision</span>
              </label>
              <label class="checkbox-row">
                <input type="checkbox" class="checkbox" bind:checked={camMotionDetection} />
                <span class="checkbox-label">Motion detection</span>
              </label>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="cam-notes">Notes</label>
              <textarea id="cam-notes" class="field-textarea-input" bind:value={camNotes} rows="3"></textarea>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Recorder specs: inline once Category is NVR/DVR/recorder. ──────────── -->
      {#if isRecorderCategory}
        <section class="card ci-card" aria-label="Recorder specifications">
          <div class="card-header">
            <h2 class="card-title">Recorder Specs</h2>
          </div>
          <div class="card-body">
            <p class="ci-hint">Assign cameras to this recorder's channels from its asset detail page after saving.</p>
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="rec-location">Physical Location <span class="required">*</span></label>
                <input id="rec-location" class="field-input" bind:value={recPhysicalLocation} placeholder="e.g. Server room, Cubao branch" />
              </div>
              <div class="field">
                <label class="field-label" for="rec-capacity">Channel Capacity <span class="required">*</span></label>
                <input id="rec-capacity" type="number" min="1" max="10000" class="field-input" bind:value={recChannelCapacity} placeholder="e.g. 16" />
              </div>
              <div class="field">
                <label class="field-label" for="rec-type">Recorder Type</label>
                <select id="rec-type" class="field-select" bind:value={recRecorderType}>
                  <option value="nvr">NVR</option>
                  <option value="dvr">DVR</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="rec-storage">Storage Capacity (GB)</label>
                <input id="rec-storage" type="number" min="0" class="field-input" bind:value={recStorageCapacityGb} placeholder="e.g. 2000" />
              </div>
              <div class="field">
                <label class="field-label" for="rec-retention">Retention Target (Days)</label>
                <input id="rec-retention" type="number" min="0" class="field-input" bind:value={recRetentionDaysTarget} placeholder="e.g. 30" />
              </div>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="rec-notes">Notes</label>
              <textarea id="rec-notes" class="field-textarea-input" bind:value={recNotes} rows="3"></textarea>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Server specs: inline once Category is Server. Domain Controller / File
           Server are picked as a Role Type here, not separate categories. ─────── -->
      {#if isServerCategory}
        <section class="card ci-card" aria-label="Server specifications">
          <div class="card-header">
            <h2 class="card-title">Server Specs</h2>
          </div>
          <div class="card-body">
            <p class="ci-hint">HDD rows go in the Peripherals section below (type: Docking Station / External HDD, or add a storage row). IP address is recorded from <a href="/inventory/intake/network">Network Intake</a>; ISP circuits and login credentials are linked from the Servers &amp; Circuits page after this asset is saved.</p>
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="srv-env">Environment</label>
                <select id="srv-env" class="field-select" bind:value={srvEnvironment}>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                  <option value="test">Test</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="srv-crit">Criticality</label>
                <select id="srv-crit" class="field-select" bind:value={srvCriticality}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="srv-virt">Virtualization</label>
                <select id="srv-virt" class="field-select" bind:value={srvVirtualization}>
                  <option value="physical">Physical</option>
                  <option value="hypervisor">Hypervisor</option>
                  <option value="virtual_machine">Virtual Machine</option>
                  <option value="container_host">Container Host</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="srv-role">Role Type</label>
                <select id="srv-role" class="field-select" bind:value={srvRoleType}>
                  <option value="">— No specific role —</option>
                  <option value="domain_controller">Domain Controller</option>
                  <option value="file_server">File Server</option>
                  <option value="application_server">Application Server</option>
                  <option value="database_server">Database Server</option>
                  <option value="backup_server">Backup Server</option>
                  <option value="dns_server">DNS Server</option>
                  <option value="dhcp_server">DHCP Server</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="srv-owner">Service Owner <span class="required">*</span></label>
                <input id="srv-owner" class="field-input" bind:value={srvServiceOwner} placeholder="e.g. IT Infrastructure" />
              </div>
              <div class="field">
                <label class="field-label" for="srv-support">Support Owner</label>
                <input id="srv-support" class="field-input" bind:value={srvSupportOwner} />
              </div>
              <div class="field">
                <label class="field-label" for="srv-motherboard">Motherboard</label>
                <input id="srv-motherboard" class="field-input" bind:value={srvMotherboard} />
              </div>
              <div class="field">
                <label class="field-label" for="srv-processor">Processor</label>
                <input id="srv-processor" class="field-input" bind:value={srvProcessor} />
              </div>
            </div>
            <div class="field field-textarea" style="margin-top: 16px;">
              <label class="field-label" for="srv-purpose">Purpose</label>
              <textarea id="srv-purpose" class="field-textarea-input" bind:value={srvPurpose} rows="2"></textarea>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Specs: shown when the Category itself IS a peripheral type
           (Monitor, Keyboard, Printer, etc.) — this asset IS that item, so it
           gets Brand/Model/Property Tag directly instead of the generic
           repeatable Peripherals rows below. ────────────────────────────────── -->
      {#if isPeripheralCategory}
        <section class="card ci-card" aria-label="Specs">
          <div class="card-header">
            <h2 class="card-title">Specs</h2>
          </div>
          <div class="card-body">
            <div class="fields-grid">
              <div class="field">
                <label class="field-label" for="periph-brand">Brand</label>
                <input id="periph-brand" class="field-input" bind:value={periphBrand} />
              </div>
              <div class="field">
                <label class="field-label" for="periph-model">Model</label>
                <input id="periph-model" class="field-input" bind:value={periphModel} />
              </div>
              <div class="field">
                <label class="field-label" for="periph-tag">Property Tag</label>
                <input id="periph-tag" class="field-input" bind:value={periphPropertyTag} />
              </div>
            </div>
          </div>
        </section>
      {/if}

      <!-- ── Peripherals: generic child rows, attached to whatever asset gets
           created above regardless of category. Hidden for Computer/Laptop
           (has its own RAM/Storage rows) and for a peripheral-type category
           itself (this asset IS that item — see the Specs card above instead,
           attaching another one to itself would be redundant). ───────────────── -->
      {#if !isComputerCategory && !isPeripheralCategory}
        <section class="card ci-card" aria-label="Peripherals">
          <div class="card-header">
            <h2 class="card-title">Peripherals</h2>
            <button type="button" class="btn btn-ghost" onclick={addPeripheral}>+ Add peripheral</button>
          </div>
          <div class="card-body">
            {#if peripherals.length === 0}
              <p class="page-subtitle">Optional. Monitor, keyboard, mouse, printer, and other accessories attached to this asset.</p>
            {/if}
            {#each peripherals as peripheral, index}
              <div class="component-row" style="grid-template-columns: 140px repeat(4, minmax(0, 1fr)) 34px;">
                <select class="field-select" aria-label="Peripheral type" bind:value={peripheral.type}>
                  {#each PERIPHERAL_TYPES as opt}<option value={opt.value}>{opt.label}</option>{/each}
                </select>
                <input class="field-input" aria-label="Brand" bind:value={peripheral.brand} placeholder="Brand" />
                <input class="field-input" aria-label="Model" bind:value={peripheral.model} placeholder="Model" />
                <input class="field-input" aria-label="Serial number" bind:value={peripheral.serialNumber} placeholder="Serial" />
                <input class="field-input" aria-label="Property tag" bind:value={peripheral.propertyTag} placeholder="Property tag" />
                <button type="button" class="component-remove" onclick={() => removePeripheral(index)} aria-label="Remove row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6L18 18"/></svg>
                </button>
              </div>
            {/each}
          </div>
        </section>
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

<!-- Lightbox (photo preview) -->
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

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent, #a15c2e);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
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

  /* ── Computer specs section ──────────────────────────────────────────────── */
  .ci-hint {
    font-size: 12.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    margin: 0 0 14px;
  }
  .ci-hint a { color: var(--link); text-decoration: underline; }

  .specs-fieldset {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .specs-fieldset:disabled {
    opacity: 0.6;
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
