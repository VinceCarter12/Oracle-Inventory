<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import { authStore } from '$lib/stores/auth.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';
  import Modal from '$lib/components/Modal.svelte';

  type AssetRef = { name: string; assetTag: string | null } | null;
  type PortRef  = { id: string; portNumber: string; asset: AssetRef } | null;
  type InterfaceRef = { id: string; interfaceName: string; asset: AssetRef } | null;
  type CredentialRow = {
    id: string; assetId: string; asset: AssetRef; updatedAt: string;
    hasUsername: boolean; hasPassword: boolean; hasSnmpCommunity: boolean;
    hasVpnKey: boolean; hasWifiPassword: boolean; hasApiKey: boolean; hasRecoveryCode: boolean;
  };
  type RevealedCredentials = { username?: string; password?: string; snmpCommunity?: string; vpnKey?: string; wifiPassword?: string; apiKey?: string; recoveryCode?: string };

  const CREDENTIAL_COLUMNS: { key: keyof RevealedCredentials; flag: keyof CredentialRow; label: string }[] = [
    { key: 'username', flag: 'hasUsername', label: 'Username' },
    { key: 'password', flag: 'hasPassword', label: 'Password' },
    { key: 'snmpCommunity', flag: 'hasSnmpCommunity', label: 'SNMP community' },
    { key: 'vpnKey', flag: 'hasVpnKey', label: 'VPN key' },
    { key: 'wifiPassword', flag: 'hasWifiPassword', label: 'Wi-Fi password' },
    { key: 'apiKey', flag: 'hasApiKey', label: 'API key' },
    { key: 'recoveryCode', flag: 'hasRecoveryCode', label: 'Recovery code' },
  ];

  let loading = $state(true);
  let error   = $state('');
  let activeTab = $state<'interfaces' | 'ports' | 'topology' | 'vlans' | 'ip-history' | 'credentials' | 'connectivity'>('interfaces');
  const isSuperAdmin = $derived(authStore.user?.role === 'super_admin');
  let revealedByAsset = $state<Record<string, RevealedCredentials>>({});
  let revealError = $state('');
  let revealPromptOpen = $state(false);
  let revealPromptAssetId = $state('');
  let revealPromptPassword = $state('');
  let revealPromptError = $state('');
  let revealPromptBusy = $state(false);

  let interfaces   = $state<{ id: string; interfaceName: string; macAddress: string | null; description: string | null; assetId: string; asset: AssetRef }[]>([]);
  let ports        = $state<{ id: string; portNumber: string; portLabel: string | null; medium: string | null; speedMbps: number | null; poeCapability: string | null; adminStatus: string; operationalStatus: string; assetId: string; asset: AssetRef }[]>([]);
  let links        = $state<{ id: string; linkType: string; branchId: string; effectiveFrom: string; effectiveTo: string | null; fromPort: PortRef; toPort: PortRef; toInterface: InterfaceRef }[]>([]);
  let vlans        = $state<{ id: string; vlanNumber: number; vlanName: string | null; cidr: string | null; gateway: string | null }[]>([]);
  let ipHistory    = $state<{ id: string; address: string; prefixLength: number; family: string; addressingMode: string; gateway: string | null; dnsServers: string[]; observedAt: string; interfaceId: string; interfaceName: string; assetLabel: string }[]>([]);
  let credentials  = $state<CredentialRow[]>([]);
  let connectivity = $state<{ interfaces: number; ports: number; vlans: number; activeConnections: number } | null>(null);

  function assetLabel(asset: AssetRef) {
    if (!asset) return '—';
    return asset.assetTag ? `${asset.name} · ${asset.assetTag}` : asset.name;
  }

  async function refresh() {
    loading = true; error = '';
    try {
      const [i, p, t, v, c] = await Promise.all([
        api.get<{ items: typeof interfaces }>('/api/network/interfaces'),
        api.get<{ items: typeof ports }>('/api/network/ports'),
        api.get<{ items: typeof links }>('/api/network/topology'),
        api.get<{ items: typeof vlans }>('/api/network/vlans'),
        api.get<{ items: CredentialRow[] }>('/api/network/device-credentials').catch(() => ({ items: [] })),
      ]);
      interfaces = i.items; ports = p.items; links = t.items; vlans = v.items; credentials = c.items;
      const perInterface = await Promise.all(
        interfaces.map(item => api.get<{ items: { id: string; address: string; prefixLength: number; family: string; addressingMode: string; gateway: string | null; dnsServers: string[]; observedAt: string; interfaceId: string }[] }>(`/api/network/interfaces/${item.id}/ip-observations`).catch(() => ({ items: [] })))
      );
      ipHistory = perInterface.flatMap((response, idx) =>
        response.items.map(row => ({ ...row, interfaceName: interfaces[idx].interfaceName, assetLabel: assetLabel(interfaces[idx].asset) }))
      );
      const me = await api.get<{ branchId?: string | null }>('/api/users/me').catch(() => null);
      if (me?.branchId) connectivity = await api.get<typeof connectivity>(`/api/branches/${me.branchId}/connectivity`).catch(() => null);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function openRevealPrompt(assetId: string) {
    revealError = ''; revealPromptError = ''; revealPromptPassword = '';
    revealPromptAssetId = assetId; revealPromptOpen = true;
  }

  function closeRevealPrompt() {
    revealPromptOpen = false; revealPromptAssetId = ''; revealPromptPassword = ''; revealPromptError = '';
  }

  async function confirmReveal() {
    revealPromptError = '';
    if (!revealPromptPassword) { revealPromptError = 'Enter your account password.'; return; }
    revealPromptBusy = true;
    try {
      const payload = await api.post<RevealedCredentials>(`/api/network/device-credentials/${revealPromptAssetId}/reveal`, { currentPassword: revealPromptPassword });
      revealedByAsset = { ...revealedByAsset, [revealPromptAssetId]: payload };
      closeRevealPrompt();
    } catch (e) {
      revealPromptError = (e as Error).message;
    } finally {
      revealPromptBusy = false;
    }
  }

  function hideCredentials(assetId: string) {
    const next = { ...revealedByAsset };
    delete next[assetId];
    revealedByAsset = next;
  }

  onMount(() => { void refresh(); });
  onDestroy(onChange(['NetworkInterface', 'Vlan', 'NetworkPort', 'PortConnection', 'InterfaceVlanAssignment'], () => refresh()));
</script>

<svelte:head><title>Network Infrastructure — Oracle Inventory</title></svelte:head>

<Modal open={revealPromptOpen} title="Confirm it's you" onclose={closeRevealPrompt} maxWidth="400px">
  <form id="reveal-credentials-form" onsubmit={(e) => { e.preventDefault(); confirmReveal(); }} style="display:contents">
    <p class="reveal-hint">
      This is <strong>not</strong> the device password you're trying to view — enter the login password
      for <strong>your own Oracle Inventory account</strong>{authStore.user?.email ? ` (${authStore.user.email})` : ''} to confirm it's really you. This reveal is logged.
    </p>
    {#if revealPromptError}<div class="form-error">{revealPromptError}</div>{/if}
    <div class="field">
      <label class="field-label" for="reveal-password">Your Oracle Inventory login password</label>
      <input id="reveal-password" type="password" class="field-input" bind:value={revealPromptPassword} autocomplete="current-password" placeholder="Not the device's password" />
    </div>
  </form>

  {#snippet footer()}
    <button type="button" class="btn-ghost" onclick={closeRevealPrompt}>Cancel</button>
    <button type="submit" form="reveal-credentials-form" class="btn-primary" disabled={revealPromptBusy}>
      {revealPromptBusy ? 'Verifying…' : 'Confirm'}
    </button>
  {/snippet}
</Modal>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Network' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Network</h1>
      <p class="page-sub">Interfaces and effective topology history.</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick={() => goto('/inventory/intake/network')}>+ Add Record</button>
      <button class="btn-ghost" onclick={() => refresh()} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : interfaces.length} label="Interfaces" helper="Recorded in scope" />
    <StatCard value={loading ? '—' : ports.length} label="Ports" helper="Recorded in scope" />
    <StatCard value={loading ? '—' : vlans.length} label="VLANs" helper="Visible to your role" />
    <StatCard value={loading ? '—' : (connectivity?.activeConnections ?? '—')} label="Active Connections" helper="Branch connectivity" />
  </div>

  {#if loading || error}
    <div class="card table-card">
      <TableStates loading={loading} error={error} loadingText="Loading network inventory…" onRetry={refresh} />
    </div>
  {:else}
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected={activeTab === 'interfaces'} class="tab-btn" class:active={activeTab === 'interfaces'} onclick={() => activeTab = 'interfaces'}>
        Interfaces <span class="tab-count">{interfaces.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'ports'} class="tab-btn" class:active={activeTab === 'ports'} onclick={() => activeTab = 'ports'}>
        Ports <span class="tab-count">{ports.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'topology'} class="tab-btn" class:active={activeTab === 'topology'} onclick={() => activeTab = 'topology'}>
        Topology links <span class="tab-count">{links.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'vlans'} class="tab-btn" class:active={activeTab === 'vlans'} onclick={() => activeTab = 'vlans'}>
        VLANs <span class="tab-count">{vlans.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'ip-history'} class="tab-btn" class:active={activeTab === 'ip-history'} onclick={() => activeTab = 'ip-history'}>
        IP history <span class="tab-count">{ipHistory.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'credentials'} class="tab-btn" class:active={activeTab === 'credentials'} onclick={() => activeTab = 'credentials'}>
        Credentials <span class="tab-count">{credentials.length}</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'connectivity'} class="tab-btn" class:active={activeTab === 'connectivity'} onclick={() => activeTab = 'connectivity'}>
        Connectivity
      </button>
    </div>

    {#if activeTab === 'interfaces'}
      <div class="card table-card">
        <TableStates empty={interfaces.length === 0} emptyTitle="No interfaces yet" emptyMessage="No network interfaces are recorded for your scope." />
        {#if interfaces.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Interface</th><th>Asset</th><th>MAC address</th><th>Description</th></tr></thead>
              <tbody>
                {#each interfaces as item (item.id)}
                  <tr>
                    <td>{item.interfaceName}</td>
                    <td>{assetLabel(item.asset)}</td>
                    <td>{item.macAddress ?? '—'}</td>
                    <td>{item.description ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'ports'}
      <div class="card table-card">
        <TableStates empty={ports.length === 0} emptyTitle="No ports yet" emptyMessage="No switch/router ports are recorded for your scope." />
        {#if ports.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Port</th><th>Asset</th><th>Label</th><th>Medium</th><th>Speed</th><th>PoE</th><th>Admin</th><th>Operational</th></tr></thead>
              <tbody>
                {#each ports as port (port.id)}
                  <tr>
                    <td>{port.portNumber}</td>
                    <td>{assetLabel(port.asset)}</td>
                    <td>{port.portLabel ?? '—'}</td>
                    <td>{port.medium ?? '—'}</td>
                    <td>{port.speedMbps ? `${port.speedMbps} Mbps` : '—'}</td>
                    <td>{port.poeCapability ?? '—'}</td>
                    <td>{port.adminStatus}</td>
                    <td>{port.operationalStatus}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'topology'}
      <div class="card table-card">
        <TableStates empty={links.length === 0} emptyTitle="No topology links" emptyMessage="No active topology links are recorded." />
        {#if links.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>From</th><th>To</th><th>Effective from</th><th>Effective to</th></tr></thead>
              <tbody>
                {#each links as link (link.id)}
                  <tr>
                    <td>{link.linkType}</td>
                    <td>{link.fromPort ? `${link.fromPort.portNumber} · ${assetLabel(link.fromPort.asset)}` : '—'}</td>
                    <td>
                      {#if link.toPort}
                        {link.toPort.portNumber} · {assetLabel(link.toPort.asset)}
                      {:else if link.toInterface}
                        {link.toInterface.interfaceName} · {assetLabel(link.toInterface.asset)}
                      {:else}
                        —
                      {/if}
                    </td>
                    <td>{new Date(link.effectiveFrom).toLocaleString()}</td>
                    <td>{link.effectiveTo ? new Date(link.effectiveTo).toLocaleString() : 'Active'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'vlans'}
      <div class="card table-card">
        <TableStates empty={vlans.length === 0} emptyTitle="No VLANs visible" emptyMessage="No VLANs are recorded for your scope, or you do not have permission to view sensitive network fields." />
        {#if vlans.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>VLAN</th><th>Name</th><th>CIDR</th><th>Gateway</th></tr></thead>
              <tbody>
                {#each vlans as vlan (vlan.id)}
                  <tr>
                    <td>{vlan.vlanNumber}</td>
                    <td>{vlan.vlanName ?? '—'}</td>
                    <td>{vlan.cidr ?? '—'}</td>
                    <td>{vlan.gateway ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'ip-history'}
      <div class="card table-card">
        <TableStates empty={ipHistory.length === 0} emptyTitle="No IP observations" emptyMessage="No IP observations are recorded, or sensitive network permission is unavailable." />
        {#if ipHistory.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Interface</th><th>Address</th><th>Prefix</th><th>Mode</th><th>Gateway</th><th>DNS servers</th><th>Observed</th></tr></thead>
              <tbody>
                {#each ipHistory as item (item.id)}
                  <tr>
                    <td>{item.interfaceName}<span class="td-sub">{item.assetLabel}</span></td>
                    <td>{item.address}</td>
                    <td>/{item.prefixLength}</td>
                    <td>{item.addressingMode}</td>
                    <td>{item.gateway ?? '—'}</td>
                    <td>{item.dnsServers.length > 0 ? item.dnsServers.join(', ') : '—'}</td>
                    <td>{new Date(item.observedAt).toLocaleString()}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'credentials'}
      <div class="card table-card">
        <p class="ci-hint">Encrypted at rest. Values stay hidden until a super admin reveals them, and every reveal is logged.</p>
        <TableStates empty={credentials.length === 0} emptyTitle="No device credentials recorded" emptyMessage="No switch/AP/router credentials have been saved for your scope." />
        {#if credentials.length > 0}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  {#each CREDENTIAL_COLUMNS as col}<th>{col.label}</th>{/each}
                  <th>Updated</th>
                  {#if isSuperAdmin}<th></th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each credentials as row (row.id)}
                  <tr>
                    <td>{assetLabel(row.asset)}</td>
                    {#each CREDENTIAL_COLUMNS as col}
                      <td>
                        {#if !row[col.flag]}
                          <span class="cred-empty">—</span>
                        {:else if revealedByAsset[row.assetId]}
                          <span class="cred-value">{revealedByAsset[row.assetId][col.key] ?? '—'}</span>
                        {:else}
                          <span class="cred-masked">••••••••</span>
                        {/if}
                      </td>
                    {/each}
                    <td>{new Date(row.updatedAt).toLocaleString()}</td>
                    {#if isSuperAdmin}
                      <td>
                        {#if revealedByAsset[row.assetId]}
                          <button type="button" class="btn-ghost-sm" onclick={() => hideCredentials(row.assetId)}>Hide</button>
                        {:else}
                          <button type="button" class="btn-ghost-sm" onclick={() => openRevealPrompt(row.assetId)}>Reveal</button>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        {#if revealError}<div class="form-error">{revealError}</div>{/if}
      </div>
    {:else}
      <div class="card table-card">
        {#if connectivity}
          <ul class="plain-list">
            <li>Interfaces: {connectivity.interfaces}</li>
            <li>Ports: {connectivity.ports}</li>
            <li>VLANs: {connectivity.vlans}</li>
            <li>Active connections: {connectivity.activeConnections}</li>
          </ul>
        {:else}
          <TableStates empty emptyTitle="Connectivity unavailable" emptyMessage="Connectivity summary is unavailable for your current permission or branch scope." />
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; }

  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

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

  .reveal-hint { font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); margin: 0 0 4px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .field-input {
    height: 34px; padding: 0 10px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink);
    font-size: 13.5px; font-family: var(--font-sans);
    outline: none; width: 100%; box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }

  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .table-card { display: flex; flex-direction: column; }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; }
  .tab-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 4px 10px; margin-bottom: -1px;
    border: none; border-bottom: 2px solid transparent;
    background: transparent; color: var(--mute);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; transition: color 120ms ease, border-color 120ms ease;
  }
  .tab-btn:hover { color: var(--ink); }
  .tab-btn.active { color: var(--ink); border-bottom-color: var(--ink); }
  .tab-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 5px;
    border-radius: 999px; background: var(--canvas-soft-2); color: var(--mute);
    font-size: 11px; font-weight: 600;
  }
  .tab-btn.active .tab-count { background: var(--ink); color: var(--on-primary); }

  .table-wrap { overflow: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th, td { padding: 12px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; font-family: var(--font-sans); }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-top: none; background: var(--canvas-soft-2); }
  td { color: var(--body); vertical-align: top; }
  .td-sub { display: block; color: var(--mute); font-size: 11.5px; margin-top: 2px; }

  .plain-list { list-style: none; margin: 0; padding: 4px 0; }
  .plain-list li { padding: 10px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; color: var(--body); font-family: var(--font-sans); }
  .plain-list li:first-child { border-top: none; }

  .ci-hint { font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); padding: 12px 16px 0; margin: 0; }
  .cred-empty { color: var(--mute); }
  .cred-masked { color: var(--mute); font-family: var(--font-mono, monospace); letter-spacing: 1px; }
  .cred-value { color: var(--ink); font-family: var(--font-mono, monospace); }
  .btn-ghost-sm {
    padding: 4px 10px; border-radius: var(--r-sm);
    font-size: 12px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; white-space: nowrap;
  }
  .btn-ghost-sm:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost-sm:disabled { opacity: 0.5; cursor: not-allowed; }
  .form-error {
    margin: 12px 16px; padding: 10px 14px; background: var(--error-soft); color: var(--error);
    border-radius: var(--r-sm); font-size: 13px; font-family: var(--font-sans);
  }

  @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } .page-header { flex-direction: column; } }
</style>
