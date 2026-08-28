<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';

  type AssetOption = { id: string; name: string; assetTag: string | null; category: { name: string } | null };

  const modes = ['routed_gateway', 'transparent_bridge', 'host_firewall', 'virtual_appliance', 'other'] as const;
  const roles = ['standalone', 'active', 'passive', 'member', 'unknown'] as const;

  let assets = $state<AssetOption[]>([]);
  let loadingAssets = $state(true);

  let assetId                  = $state('');
  let deploymentMode           = $state<typeof modes[number]>('routed_gateway');
  let haRole                   = $state<typeof roles[number]>('standalone');
  let policyOwner              = $state('');
  let managementInterfaceId    = $state('');
  let configurationArtifactRef = $state('');
  let saving = $state(false);
  let error  = $state('');
  let saved  = $state(false);

  const firewallAssets = $derived(assets.filter(a => /firewall/i.test(a.category?.name ?? '')));

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
    if (!assetId || !policyOwner.trim()) { error = 'A firewall asset and policy owner are required.'; return; }
    saving = true;
    try {
      await api.put(`/api/firewalls/${assetId}/profile`, {
        deploymentMode, haRole,
        policyOwner: policyOwner.trim(),
        managementInterfaceId: managementInterfaceId.trim() || undefined,
        configurationArtifactRef: configurationArtifactRef.trim() || undefined,
      }, { 'Idempotency-Key': crypto.randomUUID() });
      saved = true;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Unable to save firewall profile.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Firewall Intake | Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Firewalls', href: '/infrastructure/firewalls' }, { label: 'Firewall Intake' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Firewall profile</h1>
      <p class="page-sub">Record governance metadata against an existing Firewall asset. Never enter passwords, VPN/PPPoE values, rulesets, or raw firewall configuration.</p>
    </div>
    <div class="header-actions">
      <button type="button" class="btn-ghost" onclick={() => goto('/infrastructure/firewalls')} disabled={saving}>Cancel</button>
      <button type="submit" form="firewall-form" class="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save firewall profile'}</button>
    </div>
  </div>

  {#if error}<div class="form-error">{error}</div>{/if}
  {#if saved}<div class="form-notice">Firewall profile saved.</div>{/if}

  <form id="firewall-form" onsubmit={(event) => { event.preventDefault(); submit(); }} class="form-body">
    <section class="card">
      <div class="card-header"><h2 class="card-title">Firewall metadata</h2></div>
      <div class="card-body">
        <div class="fields-grid">
          <div class="field">
            <label class="field-label" for="asset">Firewall Asset <span class="required">*</span></label>
            <select id="asset" class="field-select" bind:value={assetId} disabled={loadingAssets}>
              <option value="">— Select firewall asset —</option>
              {#each firewallAssets as a}<option value={a.id}>{a.name}{a.assetTag ? ` · ${a.assetTag}` : ''}</option>{/each}
            </select>
            {#if !loadingAssets && firewallAssets.length === 0}
              <p class="field-hint">No Firewall-category assets found yet. Create one from Add Asset first.</p>
            {/if}
          </div>
          <div class="field">
            <label class="field-label" for="mode">Deployment Mode</label>
            <select id="mode" class="field-select" bind:value={deploymentMode}>
              {#each modes as item}<option value={item}>{item.replace('_', ' ')}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="ha-role">HA Role</label>
            <select id="ha-role" class="field-select" bind:value={haRole}>
              {#each roles as item}<option value={item}>{item}</option>{/each}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="owner">Policy Owner <span class="required">*</span></label>
            <input id="owner" class="field-input" bind:value={policyOwner} maxlength="160" />
          </div>
          <div class="field">
            <label class="field-label" for="interface">Management Interface ID <span class="optional">(metadata reference)</span></label>
            <input id="interface" class="field-input" bind:value={managementInterfaceId} autocomplete="off" />
          </div>
          <div class="field">
            <label class="field-label" for="artifact">Configuration Artifact Ref <span class="optional">(repo:// or vault:// only)</span></label>
            <input id="artifact" class="field-input" bind:value={configurationArtifactRef} maxlength="240" placeholder="vault://..." />
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
