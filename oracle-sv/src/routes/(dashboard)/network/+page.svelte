<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  let loading = $state(true);
  let error = $state('');
  let interfaces = $state<{ id: string; interfaceName: string; macAddress: string | null; assetId: string }[]>([]);
  let links = $state<{ id: string; linkType: string; branchId: string; effectiveFrom: string }[]>([]);
  let vlans = $state<{ id: string; vlanNumber: number; vlanName: string | null }[]>([]);
  let ipHistory = $state<{ address: string; interfaceId: string; observedAt: string }[]>([]);
  let connectivity = $state<{ interfaces: number; ports: number; vlans: number; activeConnections: number } | null>(null);
  let retry = $state(0);
  async function refresh() {
    loading = true; error = '';
    try {
      const [i, t, v] = await Promise.all([
        api.get<{ items: typeof interfaces }>('/api/network/interfaces'),
        api.get<{ items: typeof links }>('/api/network/topology'),
        api.get<{ items: typeof vlans }>('/api/network/vlans'),
      ]);
      interfaces = i.items; links = t.items; vlans = v.items;
      ipHistory = (await Promise.all(interfaces.map((item) => api.get<{ items: typeof ipHistory }>(`/api/network/interfaces/${item.id}/ip-observations`).catch(() => ({ items: [] }))))) .flatMap((item) => item.items);
      const me = await api.get<{ branchId?: string | null }>('/api/users/me').catch(() => null); if (me?.branchId) connectivity = await api.get<typeof connectivity>(`/api/branches/${me.branchId}/connectivity`).catch(() => null);
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  onMount(() => { void refresh(); });
  function reload() { retry += 1; void refresh(); }
</script>

<svelte:head><title>Network Infrastructure — Oracle Inventory</title></svelte:head>
<div class="page">
  <div class="page-head"><div><h1 class="page-title">Network infrastructure</h1><p class="page-sub">Interfaces and effective topology history</p></div></div>
  {#if loading}<div class="panel muted" role="status">Loading network inventory…</div>
  {:else if error}<div class="panel error" role="alert">{error}<button class="retry" onclick={reload}>Retry</button></div>
  {:else}
    <section class="panel" aria-labelledby="interfaces-heading"><h2 id="interfaces-heading">Interfaces</h2>
      {#if interfaces.length === 0}<p class="muted">No network interfaces are recorded for your scope.</p>{:else}<div class="table-wrap"><table><caption class="sr-only">Network interfaces</caption><thead><tr><th scope="col">Interface</th><th scope="col">MAC address</th><th scope="col">Asset ID</th></tr></thead><tbody>{#each interfaces as item}<tr><td>{item.interfaceName}</td><td>{item.macAddress ?? '—'}</td><td>{item.assetId}</td></tr>{/each}</tbody></table></div>{/if}
    </section>
    <section class="panel" aria-labelledby="topology-heading"><h2 id="topology-heading">Topology links</h2>{#if links.length === 0}<p class="muted">No active topology links are recorded.</p>{:else}<div class="table-wrap"><table><caption class="sr-only">Topology links</caption><thead><tr><th scope="col">Type</th><th scope="col">Branch</th><th scope="col">Effective from</th></tr></thead><tbody>{#each links as link}<tr><td>{link.linkType}</td><td>{link.branchId}</td><td>{new Date(link.effectiveFrom).toLocaleString()}</td></tr>{/each}</tbody></table></div>{/if}</section>
    <section class="panel" aria-labelledby="vlan-heading"><h2 id="vlan-heading">VLANs</h2>{#if vlans.length === 0}<p class="muted">No VLANs are recorded for your scope, or you do not have permission to view sensitive network fields.</p>{:else}<ul>{#each vlans as vlan}<li>VLAN {vlan.vlanNumber} — {vlan.vlanName ?? 'Unnamed'}</li>{/each}</ul>{/if}</section>
    <section class="panel" aria-labelledby="ip-heading"><h2 id="ip-heading">IP observation history</h2>{#if ipHistory.length === 0}<p class="muted">No IP observations are recorded, or sensitive network permission is unavailable.</p>{:else}<ul>{#each ipHistory as item}<li>{item.address} · {new Date(item.observedAt).toLocaleString()}</li>{/each}</ul>{/if}</section>
    <section class="panel" aria-labelledby="summary-heading"><h2 id="summary-heading">Branch connectivity summary</h2>{#if connectivity}<ul><li>Interfaces: {connectivity.interfaces}</li><li>Ports: {connectivity.ports}</li><li>VLANs: {connectivity.vlans}</li><li>Active connections: {connectivity.activeConnections}</li></ul>{:else}<p class="muted">Connectivity summary is unavailable for your current permission or branch scope.</p>{/if}</section>
  {/if}
</div>

<style>
  .page { max-width: 1200px; margin: 0 auto; padding: 32px; }
  .page-head { display:flex; justify-content:space-between; margin-bottom:24px; }
  .page-title { margin:0; font-size:24px; }.page-sub,.muted { color:var(--muted-foreground,#71717a); }
  .panel { background:var(--card,#fff); border:1px solid var(--border,#e4e4e7); border-radius:10px; padding:20px; margin-bottom:16px; }.error { color:#b91c1c; }
  .table-wrap { overflow:auto; } table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--border,#e4e4e7); } th { font-weight:600; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
</style>
