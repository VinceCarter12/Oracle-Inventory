<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';

  type Branch = { id: string; name: string };

  const serviceTypes = ['fiber', 'dsl', 'cable', 'wireless', 'leased_line', 'satellite', 'other'] as const;
  const statuses = ['planned', 'active', 'degraded', 'suspended', 'terminated'] as const;
  const addressingModes = ['static', 'dhcp', 'dynamic', 'pppoe', 'cgnat', 'unknown'] as const;

  let branches = $state<Branch[]>([]);
  let loadingBranches = $state(true);

  let branchId               = $state('');
  let providerName           = $state('');
  let circuitLabel           = $state('');
  let serviceType            = $state<typeof serviceTypes[number]>('fiber');
  let status                 = $state<typeof statuses[number]>('planned');
  let demarcLocation         = $state('');
  let downloadMbps           = $state('');
  let uploadMbps             = $state('');
  let addressingMode         = $state<typeof addressingModes[number]>('unknown');
  let providerCircuitIdMasked = $state('');
  let saving  = $state(false);
  let error   = $state('');
  let saved   = $state(false);

  onMount(async () => {
    try {
      branches = await api.get<Branch[]>('/api/branches');
    } catch {
      branches = [];
    } finally {
      loadingBranches = false;
    }
  });

  async function submit() {
    error = ''; saved = false;
    const download = Number(downloadMbps);
    const upload = Number(uploadMbps);
    if (!branchId || !providerName.trim() || !circuitLabel.trim() || !(download > 0) || !(upload > 0)) {
      error = 'Branch, provider, circuit label, and positive speeds are required.';
      return;
    }
    saving = true;
    try {
      await api.post('/api/isp-circuits', {
        branchId,
        providerName: providerName.trim(),
        circuitLabel: circuitLabel.trim(),
        serviceType,
        status,
        demarcLocation: demarcLocation.trim() || undefined,
        downloadMbps: download,
        uploadMbps: upload,
        addressingMode,
        providerCircuitIdMasked: providerCircuitIdMasked.trim() || undefined,
      }, { 'Idempotency-Key': crypto.randomUUID() });
      saved = true;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Unable to save ISP circuit.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>ISP Circuit Intake | Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Servers & Circuits', href: '/infrastructure/servers' }, { label: 'ISP Circuit Intake' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">ISP circuit</h1>
      <p class="page-sub">Record provider and service metadata only. Never enter credentials, PPPoE secrets, account passwords, or private keys.</p>
    </div>
    <div class="header-actions">
      <button type="button" class="btn-ghost" onclick={() => goto('/infrastructure/servers')} disabled={saving}>Cancel</button>
      <button type="submit" form="isp-form" class="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save ISP circuit'}</button>
    </div>
  </div>

  {#if error}<div class="form-error">{error}</div>{/if}
  {#if saved}<div class="form-notice">ISP circuit saved.</div>{/if}

  <form id="isp-form" onsubmit={(event) => { event.preventDefault(); submit(); }} class="form-body">
    <section class="card">
      <div class="card-header"><h2 class="card-title">Circuit metadata</h2></div>
      <div class="card-body">
        <div class="fields-grid">
          <div class="field">
            <label class="field-label" for="branch">Branch <span class="required">*</span></label>
            <select id="branch" class="field-select" bind:value={branchId} disabled={loadingBranches}>
              <option value="">— Select branch —</option>
              {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="provider">Provider <span class="required">*</span></label>
            <input id="provider" class="field-input" bind:value={providerName} maxlength="160" placeholder="e.g. PLDT" />
          </div>
          <div class="field">
            <label class="field-label" for="label">Circuit Label <span class="required">*</span></label>
            <input id="label" class="field-input" bind:value={circuitLabel} maxlength="160" placeholder="e.g. Cubao Main Fiber" />
          </div>
          <div class="field">
            <label class="field-label" for="service">Service Type</label>
            <select id="service" class="field-select" bind:value={serviceType}>
              {#each serviceTypes as item}<option value={item}>{item.replace('_', ' ')}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="status">Status</label>
            <select id="status" class="field-select" bind:value={status}>
              {#each statuses as item}<option value={item}>{item}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="addressing">Addressing Mode</label>
            <select id="addressing" class="field-select" bind:value={addressingMode}>
              {#each addressingModes as item}<option value={item}>{item}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="down">Download Mbps <span class="required">*</span></label>
            <input id="down" type="number" min="1" class="field-input" bind:value={downloadMbps} />
          </div>
          <div class="field">
            <label class="field-label" for="up">Upload Mbps <span class="required">*</span></label>
            <input id="up" type="number" min="1" class="field-input" bind:value={uploadMbps} />
          </div>
          <div class="field">
            <label class="field-label" for="demarc">Demarc Location</label>
            <input id="demarc" class="field-input" bind:value={demarcLocation} maxlength="240" />
          </div>
          <div class="field">
            <label class="field-label" for="masked-id">Masked Provider Circuit ID <span class="optional">(never a credential)</span></label>
            <input id="masked-id" class="field-input" bind:value={providerCircuitIdMasked} maxlength="120" />
          </div>
        </div>
      </div>
    </section>
  </form>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; max-width: 560px; }

  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

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

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-body { display: flex; flex-direction: column; gap: 16px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .card-header { padding: 16px 20px 12px; border-bottom: 1px solid var(--hairline); }
  .card-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .card-body { padding: 20px; }

  .fields-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px 16px; }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .required { color: var(--error); }
  .optional { color: var(--mute); font-weight: 400; }

  .field-input, .field-select {
    height: 34px; padding: 0 10px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink);
    font-size: 13.5px; font-family: var(--font-sans);
    outline: none; width: 100%;
  }
  .field-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; cursor: pointer;
  }
  .field-input:focus, .field-select:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }

  .form-error {
    padding: 10px 14px; background: var(--error-soft); color: var(--error);
    border-radius: var(--r-sm); font-size: 13px; font-family: var(--font-sans);
  }
  .form-notice {
    padding: 10px 14px; background: var(--canvas-soft-2); color: var(--body);
    border-radius: var(--r-sm); font-size: 13px; font-family: var(--font-sans);
  }

  @media (max-width: 900px) { .fields-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .fields-grid { grid-template-columns: 1fr; } .page-header { flex-direction: column; } }
</style>
