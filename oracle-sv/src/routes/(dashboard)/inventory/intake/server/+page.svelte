<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';

  type AssetOption = { id: string; name: string; assetTag: string | null; category: { name: string } | null };

  const environments = ['production', 'staging', 'development', 'test', 'other'] as const;
  const criticalities = ['critical', 'high', 'medium', 'low'] as const;
  const virtualizationRoles = ['physical', 'hypervisor', 'virtual_machine', 'container_host', 'other'] as const;

  let assets = $state<AssetOption[]>([]);
  let loadingAssets = $state(true);

  let assetId            = $state('');
  let environment         = $state<typeof environments[number]>('production');
  let criticality         = $state<typeof criticalities[number]>('medium');
  let virtualizationRole  = $state<typeof virtualizationRoles[number]>('physical');
  let serviceOwner        = $state('');
  let supportOwner        = $state('');
  let purpose             = $state('');
  let saving = $state(false);
  let error  = $state('');
  let saved  = $state(false);

  const serverAssets = $derived(assets.filter(a => /server/i.test(a.category?.name ?? '')));

  onMount(async () => {
    try {
      assets = await api.get<AssetOption[]>('/api/assets');
    } catch {
      assets = [];
    } finally {
      loadingAssets = false;
    }
  });

  async function submit() {
    error = ''; saved = false;
    if (!assetId || !serviceOwner.trim()) { error = 'A server asset and service owner are required.'; return; }
    saving = true;
    try {
      await api.put(`/api/servers/${assetId}/profile`, {
        environment, criticality, virtualizationRole,
        serviceOwner: serviceOwner.trim(),
        supportOwner: supportOwner.trim() || undefined,
        purpose: purpose.trim() || undefined,
      }, { 'Idempotency-Key': crypto.randomUUID() });
      saved = true;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Unable to save server profile.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Server Intake | Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Servers & Circuits', href: '/infrastructure/servers' }, { label: 'Server Intake' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Server profile</h1>
      <p class="page-sub">Record metadata against an existing Server asset. Create the asset itself from Add Asset first if it doesn't exist yet. Never enter passwords, tokens, firewall rules, raw configuration, or backup keys.</p>
    </div>
    <div class="header-actions">
      <button type="button" class="btn-ghost" onclick={() => goto('/infrastructure/servers')} disabled={saving}>Cancel</button>
      <button type="submit" form="server-form" class="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save server profile'}</button>
    </div>
  </div>

  {#if error}<div class="form-error">{error}</div>{/if}
  {#if saved}<div class="form-notice">Server profile saved.</div>{/if}

  <form id="server-form" onsubmit={(event) => { event.preventDefault(); submit(); }} class="form-body">
    <section class="card">
      <div class="card-header"><h2 class="card-title">Server metadata</h2></div>
      <div class="card-body">
        <div class="fields-grid">
          <div class="field">
            <label class="field-label" for="asset">Server Asset <span class="required">*</span></label>
            <select id="asset" class="field-select" bind:value={assetId} disabled={loadingAssets}>
              <option value="">— Select server asset —</option>
              {#each serverAssets as a}<option value={a.id}>{a.name}{a.assetTag ? ` · ${a.assetTag}` : ''}</option>{/each}
            </select>
            {#if !loadingAssets && serverAssets.length === 0}
              <p class="field-hint">No Server-category assets found yet. Create one from Add Asset first.</p>
            {/if}
          </div>
          <div class="field">
            <label class="field-label" for="environment">Environment</label>
            <select id="environment" class="field-select" bind:value={environment}>
              {#each environments as item}<option value={item}>{item}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="criticality">Criticality</label>
            <select id="criticality" class="field-select" bind:value={criticality}>
              {#each criticalities as item}<option value={item}>{item}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="virtualization">Virtualization Role</label>
            <select id="virtualization" class="field-select" bind:value={virtualizationRole}>
              {#each virtualizationRoles as item}<option value={item}>{item.replace('_', ' ')}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="owner">Service Owner <span class="required">*</span></label>
            <input id="owner" class="field-input" bind:value={serviceOwner} maxlength="160" />
          </div>
          <div class="field">
            <label class="field-label" for="support">Support Owner <span class="optional">(optional)</span></label>
            <input id="support" class="field-input" bind:value={supportOwner} maxlength="160" />
          </div>
        </div>
        <div class="field field-textarea" style="margin-top: 16px;">
          <label class="field-label" for="purpose">Purpose <span class="optional">(metadata only)</span></label>
          <textarea id="purpose" class="field-textarea-input" bind:value={purpose} maxlength="1000" rows="3"></textarea>
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
  .field-hint { font-size: 11.5px; color: var(--mute); margin: 2px 0 0; }
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

  .field-textarea-input {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink);
    font-size: 13.5px; font-family: var(--font-sans);
    outline: none; resize: vertical; line-height: 1.5;
  }
  .field-textarea-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }

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
