<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  type Component = { type: 'ram' | 'storage'; slotOrBay: string; brand: string; model: string; serialNumber: string; capacity: string };
  type DraftData = { name: string; assetTag: string; computerName: string; serialNumber: string; brand: string; model: string; deviceType: 'computer' | 'laptop'; categoryId: string; branchId: string; employeeId: string; ownership: string; condition: string; status: string; description: string; purchaseDate: string; warrantyExpiry: string; processor: string; motherboard: string; operatingSystem: string; osVersion: string; osInstallDate: string; components: Component[] };
  type Option = { id: string; name: string; employeeId?: string | null };
  const blank = (): DraftData => ({ name: '', assetTag: '', computerName: '', serialNumber: '', brand: '', model: '', deviceType: 'computer', categoryId: '', branchId: '', employeeId: '', ownership: 'company', condition: 'usable', status: 'active', description: '', purchaseDate: '', warrantyExpiry: '', processor: '', motherboard: '', operatingSystem: '', osVersion: '', osInstallDate: '', components: [] });
  let form = $state<DraftData>(blank());
  let categories = $state<Option[]>([]);
  let branches = $state<Option[]>([]);
  let employees = $state<Option[]>([]);
  let draftId = $state('');
  let saving = $state(false);
  let error = $state('');
  let notice = $state('');
  let drafts = $state<{ id: string; updatedAt: string; data: DraftData }[]>([]);
  let duplicateComputerName = $state(false);
  let knownComputerNames = $state<string[]>([]);
  let reviewing = $state(false);

  onMount(async () => {
    try {
      const [lookup, draftRows, assets] = await Promise.all([
        api.get<{ categories: Option[]; branches: Option[]; employees: Option[] }>('/api/lookup'),
        api.get<{ id: string; updatedAt: string; data: DraftData }[]>('/api/computer-intake/drafts'),
        api.get<{ computerName: string | null }[]>('/api/assets'),
      ]);
      categories = lookup.categories; branches = lookup.branches; employees = lookup.employees;
      drafts = draftRows; knownComputerNames = assets.map((asset) => asset.computerName?.toLowerCase()).filter((name): name is string => Boolean(name));
    } catch (e) { error = (e as Error).message; }
  });
  function resumeDraft(draft: { id: string; data: DraftData }) { draftId = draft.id; form = { ...blank(), ...draft.data, components: draft.data.components ?? [] }; notice = 'Draft resumed.'; }

  function addComponent(type: 'ram' | 'storage') { form.components = [...form.components, { type, slotOrBay: '', brand: '', model: '', serialNumber: '', capacity: '' }]; }
  function removeComponent(index: number) { form.components = form.components.filter((_, i) => i !== index); }
  async function saveDraft() {
    saving = true; error = ''; notice = '';
    try {
      const saved = draftId ? await api.put<{ id: string }>(`/api/computer-intake/drafts/${draftId}`, form) : await api.post<{ id: string }>('/api/computer-intake/drafts', form);
      draftId = saved.id; notice = 'Draft saved. You can return and continue later.';
    } catch (e) { error = (e as Error).message; } finally { saving = false; }
  }
  function review() {
    if (!form.name.trim() || !form.branchId) { error = 'Computer name and branch are required.'; return; }
    duplicateComputerName = Boolean(form.computerName && knownComputerNames.includes(form.computerName.toLowerCase()));
    reviewing = true;
  }
  async function submit() {
    saving = true; error = ''; notice = '';
    try {
      const draft = draftId ? { id: draftId } : await api.post<{ id: string }>('/api/computer-intake/drafts', form);
      await api.post(`/api/computer-intake/drafts/${draft.id}/submit`, {});
      goto('/assets');
    } catch (e) { error = (e as Error).message; saving = false; }
  }
</script>

<svelte:head><title>New Computer Intake · Oracle Inventory</title></svelte:head>
<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/assets">Assets</a><span>/</span><strong>New Computer Intake</strong></nav>
  <header class="header"><div><h1>New Computer Intake</h1><p>Manual Mode · official inventory record</p></div><div class="actions"><button class="btn ghost" onclick={() => goto('/assets')}>Cancel</button><button class="btn" onclick={saveDraft} disabled={saving}>Save draft</button><button class="btn primary" onclick={review} disabled={saving}>Review record</button></div></header>
  {#if error}<div class="alert error" role="alert">{error}</div>{/if}
  {#if notice}<div class="alert success" role="status">{notice}</div>{/if}
  <div class="note">Manual values become official when submitted. Belarc observations are reviewed separately and never overwrite this record automatically.</div>
  {#if drafts.length > 0}<section class="card draft-card"><div class="section-head"><h2>Saved drafts</h2><span class="muted">Resume incomplete site-walkthrough records</span></div>{#each drafts as draft}<button type="button" class="draft-row" onclick={() => resumeDraft(draft)}><span>Draft {draft.id.slice(-8)}</span><small>{new Date(draft.updatedAt).toLocaleString()}</small></button>{/each}</section>{/if}
  {#if reviewing}<section class="review card" aria-label="Review computer record"><div class="section-head"><h2>Review and confirm</h2><button type="button" class="btn ghost" onclick={() => reviewing = false}>Back to edit</button></div><p class="muted">Check the summary before this becomes an official inventory record.</p>{#if !form.branchId || !form.name}<div class="alert error">Missing required fields: computer name and branch.</div>{/if}{#if duplicateComputerName}<div class="alert warning">Warning: a computer with this name may already exist. Confirm that this is a separate device.</div>{/if}<div class="review-grid"><span>Name</span><strong>{form.name || 'Missing'}</strong><span>Asset tag</span><strong>{form.assetTag || 'Not provided'}</strong><span>Branch</span><strong>{branches.find((item) => item.id === form.branchId)?.name || 'Missing'}</strong><span>Assignment</span><strong>{employees.find((item) => item.id === form.employeeId)?.name || 'Unassigned'}</strong><span>Specifications</span><strong>{[form.brand, form.model, form.processor, form.operatingSystem].filter(Boolean).join(' · ') || 'Not provided'}</strong></div><button type="button" class="btn primary" onclick={submit} disabled={saving}>Confirm and submit official record</button></section>{/if}
  <form onsubmit={(event) => { event.preventDefault(); review(); }}>
    <section class="card"><h2>1. Identity</h2><div class="grid">
      <label>Computer name *<input bind:value={form.name} placeholder="e.g. Finance-LT-014" required /></label>
      <label>Asset tag<input bind:value={form.assetTag} placeholder="Property tag" /></label>
      <label>Serial number<input bind:value={form.serialNumber} /></label>
      <label>Computer name on network<input bind:value={form.computerName} /></label>
      <label>Brand<input bind:value={form.brand} placeholder="Dell, Lenovo…" /></label>
      <label>Model<input bind:value={form.model} /></label>
      <label>Category<select bind:value={form.categoryId}><option value="">Select category</option>{#each categories as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
      <label>Device type<select bind:value={form.deviceType}><option value="computer">Desktop</option><option value="laptop">Laptop</option></select></label>
    </div></section>
    <section class="card"><h2>2. Branch and lifecycle</h2><div class="grid">
      <label>Branch / location *<select bind:value={form.branchId} required><option value="">Select active branch</option>{#each branches as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
      <label>Ownership<select bind:value={form.ownership}><option value="company">Company</option><option value="personal">Personal / BYOD</option></select></label>
      <label>Condition<select bind:value={form.condition}><option value="usable">Usable</option><option value="for_repair">For repair</option><option value="for_disposal">For disposal</option></select></label>
      <label>Lifecycle status<select bind:value={form.status}><option value="active">Active</option><option value="lost">Lost</option><option value="stolen">Stolen</option></select></label>
      <label>Purchase date<input type="date" bind:value={form.purchaseDate} /></label>
      <label>Warranty expiry<input type="date" bind:value={form.warrantyExpiry} /></label>
    </div></section>
    <section class="card"><div class="section-head"><h2>3. Specifications</h2><span class="muted">Manual source</span></div><div class="grid">
      <label>Processor<input bind:value={form.processor} /></label><label>Motherboard<input bind:value={form.motherboard} /></label><label>Operating system<input bind:value={form.operatingSystem} /></label><label>OS version<input bind:value={form.osVersion} /></label><label>OS install date<input type="date" bind:value={form.osInstallDate} /></label>
    </div><div class="components"><div class="section-head"><h3>RAM and storage</h3><div><button type="button" class="link" onclick={() => addComponent('ram')}>+ RAM row</button><button type="button" class="link" onclick={() => addComponent('storage')}>+ Storage row</button></div></div>
      {#if form.components.length === 0}<p class="muted">Add repeatable rows when the device has multiple modules or drives.</p>{/if}
      {#each form.components as component, index}<div class="component-row"><strong>{component.type === 'ram' ? 'RAM' : 'Storage'}</strong><label><span class="sr-only">Slot or bay</span><input aria-describedby="component-help" bind:value={component.slotOrBay} placeholder="Slot / bay" /></label><label><span class="sr-only">Brand</span><input aria-describedby="component-help" bind:value={component.brand} placeholder="Brand" /></label><label><span class="sr-only">Model</span><input aria-describedby="component-help" bind:value={component.model} placeholder="Model" /></label><label><span class="sr-only">Serial number</span><input aria-describedby="component-help" bind:value={component.serialNumber} placeholder="Serial" /></label><label><span class="sr-only">Capacity</span><input aria-describedby="component-help" bind:value={component.capacity} placeholder="Capacity" /></label><button type="button" class="remove" aria-label="Remove component row" onclick={() => removeComponent(index)}>Remove</button></div>{/each}<span id="component-help" class="sr-only">Optional component details. Do not enter credentials or product keys.</span>
    </div></section>
    <section class="card"><h2>4. Optional assignment</h2><div class="grid"><label>Custodian / employee<select bind:value={form.employeeId}><option value="">Leave unassigned</option>{#each employees as item}<option value={item.id}>{item.name}{item.employeeId ? ` · ${item.employeeId}` : ''}</option>{/each}</select></label><label>Description / notes<textarea bind:value={form.description} aria-describedby="notes-help"></textarea></label></div><p id="notes-help" class="muted">The employee must be active and belong to the selected branch. Never enter passwords or credentials in notes.</p></section>
    <div class="bottom-actions"><button type="button" class="btn ghost" onclick={saveDraft}>Save draft</button><button type="submit" class="btn primary" disabled={saving}>Review and submit</button></div>
  </form>
</div>

<style>
  .page{max-width:1100px;margin:0 auto;padding:28px 32px 60px;color:var(--ink)} .breadcrumb{display:flex;gap:10px;color:var(--mute);font-size:13px;margin-bottom:24px}.breadcrumb a{color:var(--link);text-decoration:none}.header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}.header h1{margin:0;font-size:26px}.header p{margin:6px 0;color:var(--mute)}.actions,.bottom-actions{display:flex;gap:8px}.btn{border:1px solid var(--hairline);background:var(--canvas);border-radius:7px;padding:8px 13px;cursor:pointer;font:inherit}.btn.primary{background:var(--ink);color:var(--on-primary);border-color:var(--ink)}.btn.ghost{background:transparent}.btn:disabled{opacity:.55;cursor:not-allowed}.card{background:var(--canvas);border:1px solid var(--hairline);border-radius:10px;padding:22px;margin:14px 0}.card h2{font-size:16px;margin:0 0 18px}.card h3{font-size:14px;margin:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 22px}label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:600;color:var(--body)}input,select,textarea{font:inherit;font-weight:400;color:var(--ink);background:var(--canvas);border:1px solid var(--hairline);border-radius:7px;padding:9px 10px;min-height:36px}textarea{min-height:80px}input:focus,select:focus,textarea:focus{outline:2px solid var(--link);outline-offset:1px}.note,.alert{padding:12px 14px;border-radius:8px;font-size:13px;margin:12px 0}.note{background:var(--canvas-soft-2);color:var(--body)}.alert.error{background:var(--error-soft);color:var(--error)}.alert.warning{background:oklch(95% .05 80);color:oklch(40% .13 70)}.alert.success{background:oklch(94% .04 150);color:oklch(35% .12 150)}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.muted{color:var(--mute);font-size:12px}.components{border-top:1px solid var(--hairline);margin-top:20px;padding-top:18px}.link{border:0;background:none;color:var(--link);cursor:pointer;margin-left:10px;font:inherit;font-size:12px}.component-row{display:grid;grid-template-columns:80px repeat(5,minmax(0,1fr)) 55px;gap:7px;align-items:center;margin-top:10px}.component-row input{min-width:0;padding:7px}.component-row strong{font-size:12px}.remove{border:0;background:none;color:var(--error);cursor:pointer;font-size:11px}.review-grid{display:grid;grid-template-columns:140px 1fr;gap:10px;padding:16px 0}.draft-row{display:flex;justify-content:space-between;width:100%;padding:10px;border:0;border-top:1px solid var(--hairline);background:none;color:var(--ink);cursor:pointer;text-align:left}.draft-row small{color:var(--mute)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.bottom-actions{justify-content:flex-end;margin-top:20px}@media(max-width:760px){.page{padding:20px 16px}.header{flex-direction:column}.actions{width:100%;flex-wrap:wrap}.grid{grid-template-columns:1fr}.component-row{grid-template-columns:1fr 1fr}.component-row strong{grid-column:span 2}}
</style>
