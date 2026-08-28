<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { onChange } from '$lib/ws';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TableStates from '$lib/components/TableStates.svelte';

  type Camera = { id: string; physicalLocation: string; cameraType: string; asset: { name: string; assetTag: string | null }; assignments: { channel: { channelNumber: number; recorder: { physicalLocation: string } } }[] };
  type Recorder = { id: string; physicalLocation: string; channelCapacity: number; asset: { name: string; assetTag: string | null }; channels: { channelNumber: number; enabled: boolean; assignments: { camera: { asset: { name: string; assetTag: string | null } } }[] }[] };

  let cameras   = $state<Camera[]>([]);
  let recorders = $state<Recorder[]>([]);
  let loading   = $state(true);
  let error     = $state('');
  let activeTab = $state<'cameras' | 'recorders'>('cameras');
  let search = $state('');
  let assignmentFilter = $state<'all' | 'assigned' | 'unassigned'>('all');

  const unassignedCameras = $derived(cameras.filter(c => c.assignments.length === 0).length);
  const totalChannels = $derived(recorders.reduce((total, recorder) => total + recorder.channels.length, 0));
  const usedChannels = $derived(recorders.reduce((total, recorder) => total + recorder.channels.filter(channel => channel.assignments.length > 0).length, 0));

  async function load() {
    loading = true; error = '';
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (search.trim()) params.set('q', search.trim());
      if (assignmentFilter !== 'all') params.set('assigned', assignmentFilter === 'assigned' ? 'true' : 'false');
      const recorderParams = new URLSearchParams({ pageSize: '100' });
      if (search.trim()) recorderParams.set('q', search.trim());
      const [cameraResponse, recorderResponse] = await Promise.all([
        api.get<{ items: Camera[] }>(`/api/cctv/cameras?${params}`),
        api.get<{ items: Recorder[] }>(`/api/cctv/recorders?${recorderParams}`),
      ]);
      cameras = cameraResponse.items;
      recorders = recorderResponse.items;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => { void load(); });
  onDestroy(onChange(['CameraProfile', 'RecorderProfile', 'CameraChannelAssignment'], () => load()));
  function onFilterKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') void load();
  }
</script>

<svelte:head><title>CCTV and NVR — Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'CCTV & NVR' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">CCTV & NVR</h1>
      <p class="page-sub">Camera profiles and explicit recorder-channel assignments.</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick={() => goto('/assets/add?type=camera')}>+ Add Camera</button>
      <button class="btn-ghost" onclick={() => goto('/assets/add?type=recorder')}>+ Add Recorder</button>
      <button class="btn-ghost" onclick={() => load()} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </div>

  <div class="stats-row">
    <StatCard value={loading ? '—' : cameras.length} label="Cameras" helper="Profiles in scope" />
    <StatCard value={loading ? '—' : recorders.length} label="Recorders" helper="NVR profiles in scope" />
    <StatCard value={loading ? '—' : unassignedCameras} label="Unassigned" helper="Cameras with no channel" />
    <StatCard value={loading ? '—' : `${usedChannels}/${totalChannels}`} label="Channels used" helper="Assigned / available channels" />
  </div>

  {#if loading || error}
    <div class="card table-card">
      <TableStates loading={loading} error={error} loadingText="Loading CCTV inventory…" onRetry={load} />
    </div>
  {:else}
    <div class="filter-bar">
      <label class="search-label" for="cctv-search">Search inventory</label>
      <input id="cctv-search" class="search-input" type="search" bind:value={search} onkeydown={onFilterKeydown} placeholder="Search camera, recorder, or location" />
      <label class="filter-label" for="assignment-filter">Camera assignment</label>
      <select id="assignment-filter" class="filter-select" bind:value={assignmentFilter} onchange={() => load()}>
        <option value="all">All cameras</option>
        <option value="assigned">Assigned</option>
        <option value="unassigned">Unassigned</option>
      </select>
      <button class="btn-ghost filter-button" type="button" onclick={() => load()}>Apply</button>
    </div>

    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'cameras'}
        class="tab-btn"
        class:active={activeTab === 'cameras'}
        onclick={() => activeTab = 'cameras'}
      >
        Cameras
        <span class="tab-count">{cameras.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'recorders'}
        class="tab-btn"
        class:active={activeTab === 'recorders'}
        onclick={() => activeTab = 'recorders'}
      >
        Recorders
        <span class="tab-count">{recorders.length}</span>
      </button>
    </div>

    {#if activeTab === 'cameras'}
      <div class="card table-card">
        <TableStates empty={cameras.length === 0} emptyTitle="No cameras yet" emptyMessage="No cameras are in this branch scope. Use + Add Camera above to create one." />
        {#if cameras.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Camera</th><th>Location</th><th>Type</th><th>Assignment</th></tr></thead>
              <tbody>
                {#each cameras as camera (camera.id)}
                  <tr>
                    <td>{camera.asset.name}<span class="td-sub">{camera.asset.assetTag ?? 'No asset tag'}</span></td>
                    <td>{camera.physicalLocation}</td>
                    <td>{camera.cameraType}</td>
                    <td>
                      {#if camera.assignments[0]}
                        Channel {camera.assignments[0].channel.channelNumber} · {camera.assignments[0].channel.recorder.physicalLocation}
                      {:else}
                        <span class="status-unassigned">Unassigned</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else}
      <div class="card table-card">
        <TableStates empty={recorders.length === 0} emptyTitle="No recorders yet" emptyMessage="No recorder profiles are available in this scope. Use + Add Recorder above to create one." />
        {#if recorders.length > 0}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Recorder</th><th>Channel</th><th>State</th><th>Camera</th></tr></thead>
              <tbody>
                {#each recorders as recorder (recorder.id)}
                  {#each recorder.channels as channel}
                    <tr>
                      <td>{recorder.asset.name}</td>
                      <td>{channel.channelNumber}</td>
                      <td>{channel.enabled ? (channel.assignments[0] ? 'Assigned' : 'Unused') : 'Disabled'}</td>
                      <td>{channel.assignments[0]?.camera.asset.name ?? '—'}</td>
                    </tr>
                  {/each}
                {/each}
              </tbody>
            </table>
          </div>
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

  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

  .filter-bar { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto 170px auto; align-items: center; gap: 8px 10px; }
  .search-label, .filter-label { color: var(--mute); font-size: 12px; font-weight: 600; }
  .search-input, .filter-select { min-height: 34px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); color: var(--ink); font: inherit; font-size: 13px; padding: 7px 10px; }
  .search-input:focus, .filter-select:focus { outline: 2px solid color-mix(in srgb, var(--ink) 20%, transparent); outline-offset: 1px; }
  .filter-button { min-height: 34px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; }
  .table-card { display: flex; flex-direction: column; }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--hairline); }
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
  th, td { padding: 12px 16px; border-top: 1px solid var(--hairline); font-size: 13.5px; font-family: var(--font-sans); vertical-align: top; }
  th { color: var(--mute); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; border-top: none; background: var(--canvas-soft-2); }
  td { color: var(--body); }
  .td-sub { display: block; color: var(--mute); font-size: 11.5px; margin-top: 2px; }
  .status-unassigned { color: var(--mute); }

  @media (max-width: 1100px) { .stats-row { grid-template-columns: 1fr 1fr; } .filter-bar { grid-template-columns: auto 1fr; } .filter-select { width: 100%; } }
  @media (max-width: 640px) { .stats-row { grid-template-columns: 1fr; } .page-header { flex-direction: column; } .filter-bar { grid-template-columns: 1fr; } .search-label, .filter-label { margin-top: 4px; } }
</style>
