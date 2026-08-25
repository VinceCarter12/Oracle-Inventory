<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  type Camera = { id: string; physicalLocation: string; cameraType: string; asset: { name: string; assetTag: string | null }; assignments: { channel: { channelNumber: number; recorder: { physicalLocation: string } } }[] };
  type Recorder = { id: string; physicalLocation: string; channelCapacity: number; asset: { name: string; assetTag: string | null }; channels: { channelNumber: number; enabled: boolean; assignments: { camera: { asset: { name: string; assetTag: string | null } } }[] }[] };
  let cameras = $state<Camera[]>([]);
  let recorders = $state<Recorder[]>([]);
  let loading = $state(true); let error = $state('');
  async function load() { loading = true; error = ''; try { const [cameraResponse, recorderResponse] = await Promise.all([api.get<{ items: Camera[] }>('/api/cctv/cameras'), api.get<{ items: Recorder[] }>('/api/cctv/recorders')]); cameras = cameraResponse.items; recorders = recorderResponse.items; } catch (e) { error = (e as Error).message; } finally { loading = false; } }
  onMount(() => { void load(); });
</script>
<svelte:head><title>CCTV and NVR — Oracle Inventory</title></svelte:head>
<div class="page">
  <header class="page-head"><div><h1>CCTV and NVR</h1><p>Camera profiles and explicit recorder-channel assignments.</p></div><button onclick={() => load()} disabled={loading}>Refresh</button></header>
  {#if loading}<div class="panel" role="status">Loading CCTV inventory…</div>
  {:else if error}<div class="panel error" role="alert">{error}<button onclick={() => load()}>Retry</button></div>
  {:else}<section class="panel" aria-labelledby="camera-heading"><h2 id="camera-heading">Camera channels</h2>{#if cameras.length === 0}<p class="muted">No cameras in this branch scope. Create a camera profile through manual intake.</p>{:else}<div class="table-wrap"><table><caption class="sr-only">Camera profiles and current recorder channels</caption><thead><tr><th scope="col">Camera</th><th scope="col">Location</th><th scope="col">Type</th><th scope="col">Assignment</th></tr></thead><tbody>{#each cameras as camera}<tr><td>{camera.asset.name}<small>{camera.asset.assetTag ?? 'No asset tag'}</small></td><td>{camera.physicalLocation}</td><td>{camera.cameraType}</td><td>{#if camera.assignments[0]}Channel {camera.assignments[0].channel.channelNumber} · {camera.assignments[0].channel.recorder.physicalLocation}{:else}<span class="status">Unassigned</span>{/if}</td></tr>{/each}</tbody></table></div>{/if}</section><section class="panel" aria-labelledby="recorder-heading"><h2 id="recorder-heading">Recorder channel board</h2>{#if recorders.length === 0}<p class="muted">No recorder profiles are available in this scope.</p>{:else}<div class="table-wrap"><table><caption class="sr-only">Recorder channels and assignment status</caption><thead><tr><th scope="col">Recorder</th><th scope="col">Channel</th><th scope="col">State</th><th scope="col">Camera</th></tr></thead><tbody>{#each recorders as recorder}{#each recorder.channels as channel}<tr><td>{recorder.asset.name}</td><td>{channel.channelNumber}</td><td>{channel.enabled ? (channel.assignments[0] ? 'Assigned' : 'Unused') : 'Disabled'}</td><td>{channel.assignments[0]?.camera.asset.name ?? '—'}</td></tr>{/each}{/each}</tbody></table></div>{/if}</section>{/if}
</div>
<style>
  .page{max-width:1200px;margin:0 auto;padding:32px}.page-head{display:flex;justify-content:space-between;align-items:start;margin-bottom:24px}h1{margin:0;font-size:24px}p,.status,small{color:var(--muted-foreground,#71717a)}button{padding:8px 12px;border:1px solid var(--border,#e4e4e7);border-radius:8px;background:var(--card,#fff);cursor:pointer}.panel{background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);border-radius:10px;padding:20px}.error{color:#b91c1c}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--border,#e4e4e7)}th{font-weight:600}small{display:block;margin-top:3px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
