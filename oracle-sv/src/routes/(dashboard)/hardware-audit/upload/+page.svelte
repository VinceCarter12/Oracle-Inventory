<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';
  import { can } from '$lib/utils/permissions';

  // ── API types ─────────────────────────────────────────────────────────────
  interface ApiAsset {
    id: string; name: string; serialNumber: string | null; assetTag: string | null;
    category: { id: string; name: string } | null;
    branch: { id: string; name: string } | null;
    assignments: { employee: { name: string } }[];
  }

  interface SpecField { key: string; label: string; value: string; tier: 'hard' | 'soft' | 'skip'; }
  interface ParsedSpecs {
    version: number;
    sections: Record<string, { key: string; name: string; fields: SpecField[] }>;
    meta: { computerName?: string; profileDate?: string; advisorVersion?: string; missingSections: string[] };
  }
  interface ScanSummary { id: string; assetId: string; isBaseline: boolean; overallStatus: 'match' | 'warning' | 'mismatch' | null; }

  interface FieldComparison {
    key: string; label: string; section: string; tier: 'hard' | 'soft';
    baseline: string | null; current: string | null;
    status: 'match' | 'warning' | 'mismatch' | 'missing' | 'added';
  }
  interface ComparisonResult {
    overallStatus: 'match' | 'warning' | 'mismatch';
    summary: { match: number; warning: number; mismatch: number; missing: number; added: number };
    fields: FieldComparison[];
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let loading   = $state(true);
  let loadErr   = $state('');
  let assets    = $state<ApiAsset[]>([]);
  let search    = $state('');
  let selected  = $state<ApiAsset | null>(null);
  let baseline  = $state<ScanSummary | null>(null);

  let file       = $state<File | null>(null);
  let dragOver   = $state(false);
  let parsing    = $state(false);
  let parseErr   = $state('');
  let preview    = $state<ParsedSpecs | null>(null);
  let comparison = $state<ComparisonResult | null>(null);

  const issues = $derived(
    (comparison?.fields ?? []).filter((f) => f.status !== 'match')
  );

  let submitting = $state(false);
  let submitErr  = $state('');
  let submitted  = $state<ScanSummary | null>(null);
  let accepting  = $state(false);

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets.slice(0, 8);
    return assets
      .filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.serialNumber ?? '').toLowerCase().includes(q) ||
        (a.assetTag ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  });

  // ── Preview headline specs ────────────────────────────────────────────────
  interface HeadlineRow { label: string; value: string; }
  const headline = $derived.by((): HeadlineRow[] => {
    if (!preview) return [];
    const rows: HeadlineRow[] = [];
    const get = (section: string, key: string) =>
      preview!.sections[section]?.fields.find((f) => f.key === key)?.value;
    const os = get('operatingSystem', 'operatingSystem.description');
    if (os) rows.push({ label: 'OS', value: os });
    const model = get('systemModel', 'systemModel.model');
    if (model) rows.push({ label: 'Model', value: model });
    const serial = get('systemModel', 'systemModel.system_serial_number');
    if (serial) rows.push({ label: 'System Serial', value: serial });
    const cpu = get('processor', 'processor.name');
    if (cpu) rows.push({ label: 'CPU', value: cpu });
    const ram = get('memory', 'memory.total');
    if (ram) rows.push({ label: 'RAM', value: ram });
    const gpus = preview.sections.display?.fields.filter((f) => f.key.startsWith('display.adapter')) ?? [];
    if (gpus.length) rows.push({ label: 'GPU', value: gpus.map((g) => g.value).join(' · ') });
    const drives = preview.sections.localStorage?.fields.filter((f) => f.key.endsWith('.model')) ?? [];
    if (drives.length) rows.push({ label: 'Drives', value: drives.map((d) => d.value).join(' · ') });
    return rows;
  });

  const sectionCount = $derived(preview ? Object.keys(preview.sections).length : 0);

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      assets = await api.get<ApiAsset[]>('/api/assets');
      const preselect = $page.url.searchParams.get('asset');
      if (preselect) {
        const found = assets.find((a) => a.id === preselect);
        if (found) await selectAsset(found);
      }
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  async function selectAsset(a: ApiAsset) {
    selected = a;
    submitted = null;
    submitErr = '';
    baseline = await api.get<ScanSummary | null>(`/api/hardware-audit/baseline/${a.id}`).catch(() => null);
  }

  // ── File handling ─────────────────────────────────────────────────────────
  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) void handleFile(input.files[0]);
    input.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files?.[0]) void handleFile(e.dataTransfer.files[0]);
  }

  async function handleFile(f: File) {
    parseErr = '';
    preview = null;
    comparison = null;
    submitted = null;
    if (!/\.html?$/i.test(f.name)) {
      parseErr = 'Only .html / .htm Belarc exports are accepted.';
      return;
    }
    file = f;
    parsing = true;
    try {
      const formData = new FormData();
      formData.append('file', f);
      formData.append('dryRun', 'true');
      // With the asset known, the dry run also previews the diff vs. baseline
      if (selected) formData.append('assetId', selected.id);
      const res = await fetch('/api/hardware-audit/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}` },
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      preview = body.parsedSpecs as ParsedSpecs;
      comparison = (body.comparison ?? null) as ComparisonResult | null;
    } catch (e) {
      parseErr = (e as Error).message;
      file = null;
    } finally {
      parsing = false;
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!selected || !file) return;
    submitting = true;
    submitErr = '';
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetId', selected.id);
      const res = await fetch('/api/hardware-audit/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}` },
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      submitted = body as ScanSummary;
    } catch (e) {
      submitErr = (e as Error).message;
    } finally {
      submitting = false;
    }
  }

  async function acceptAsBaseline() {
    if (!submitted) return;
    accepting = true;
    try {
      await api.put(`/api/hardware-audit/scans/${submitted.id}/baseline`, {});
      goto(`/assets/${submitted.assetId}`);
    } catch (e) {
      submitErr = (e as Error).message;
    } finally {
      accepting = false;
    }
  }

  function fmtSize(bytes: number): string {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }
</script>

<svelte:head><title>Upload Hardware Scan — Oracle Inventory</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1 class="page-title">Hardware Audit</h1>
      <p class="page-sub">Upload a Belarc Advisor HTML report for an asset</p>
    </div>
  </div>

  {#if loading}
    <div class="panel muted">Loading assets…</div>
  {:else if loadErr}
    <div class="panel error-text">{loadErr}</div>
  {:else if !can('view_inventory')}
    <div class="panel muted">You do not have permission to view inventory.</div>
  {:else}

    <!-- Step 1 — Select asset -->
    <div class="panel">
      <div class="step-head"><span class="step-num">1</span> Select Asset</div>
      {#if selected}
        <div class="asset-row selected-row">
          <div class="asset-main">
            <span class="asset-name">{selected.name}</span>
            <span class="asset-meta mono">SN: {selected.serialNumber ?? '—'}</span>
            <span class="asset-meta">{selected.branch?.name ?? '—'}{selected.assignments?.[0] ? ` · Assigned to ${selected.assignments[0].employee.name}` : ''}</span>
          </div>
          <div class="asset-side">
            {#if baseline}
              <span class="badge badge-green">Baseline set</span>
            {:else}
              <span class="badge badge-orange">No baseline yet</span>
            {/if}
            <button class="btn-ghost" onclick={() => { selected = null; baseline = null; }}>Change</button>
          </div>
        </div>
      {:else}
        <input class="search-input" type="text" placeholder="Search asset by name, serial number, or tag…" bind:value={search} />
        <div class="asset-list">
          {#each filtered as a (a.id)}
            <button class="asset-row" onclick={() => selectAsset(a)}>
              <div class="asset-main">
                <span class="asset-name">{a.name}</span>
                <span class="asset-meta mono">SN: {a.serialNumber ?? '—'}</span>
                <span class="asset-meta">{a.branch?.name ?? '—'}{a.assignments?.[0] ? ` · Assigned to ${a.assignments[0].employee.name}` : ''}</span>
              </div>
              <span class="asset-cat">{a.category?.name ?? ''}</span>
            </button>
          {:else}
            <div class="muted list-empty">No assets match “{search}”.</div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Step 2 — Upload file -->
    <div class="panel" class:disabled={!selected}>
      <div class="step-head"><span class="step-num">2</span> Upload Belarc HTML File</div>
      <label
        class="dropzone"
        class:drag-over={dragOver}
        ondragover={(e) => { e.preventDefault(); dragOver = true; }}
        ondragleave={() => (dragOver = false)}
        ondrop={onDrop}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span>Drop Belarc HTML file here, or <span class="link">browse</span></span>
        <span class="hint">Accepted: .html, .htm — Belarc Advisor export only</span>
        <input type="file" accept=".html,.htm,text/html" onchange={onFileInput} disabled={!selected} hidden />
      </label>

      {#if parsing}
        <div class="file-status muted">Parsing {file?.name}…</div>
      {:else if parseErr}
        <div class="file-status error-text">{parseErr}</div>
      {:else if file && preview}
        <div class="file-status ok">
          ✓ {file.name} ({fmtSize(file.size)}) — parsed successfully, {sectionCount} sections detected
          {#if preview.meta.computerName}· Computer: <strong>{preview.meta.computerName}</strong>{/if}
        </div>
      {/if}
    </div>

    <!-- Step 3 — Preview -->
    {#if preview}
      <div class="panel">
        <div class="step-head"><span class="step-num">3</span> Preview Parsed Specs</div>
        <div class="spec-grid">
          {#each headline as row}
            <div class="spec-row">
              <span class="spec-label">{row.label}</span>
              <span class="spec-value">{row.value}</span>
            </div>
          {/each}
        </div>
        {#if preview.meta.missingSections.length > 0}
          <div class="warn-box">
            ⚠ Some sections could not be detected: {preview.meta.missingSections.join(', ')}
          </div>
        {/if}

        {#if comparison}
          <div class="cmp" class:cmp-mismatch={comparison.overallStatus === 'mismatch'} class:cmp-warning={comparison.overallStatus === 'warning'}>
            <div class="cmp-head">
              {#if comparison.overallStatus === 'match'}
                🟢 Matches baseline — all {comparison.summary.match} compared fields identical
              {:else if comparison.overallStatus === 'warning'}
                🟡 {issues.length} difference{issues.length === 1 ? '' : 's'} vs baseline — warnings only
              {:else}
                🔴 Mismatch vs baseline — {comparison.summary.mismatch + comparison.summary.missing + comparison.summary.added} flagged field{comparison.summary.mismatch + comparison.summary.missing + comparison.summary.added === 1 ? '' : 's'}
              {/if}
            </div>
            {#if issues.length > 0}
              <div class="cmp-list">
                {#each issues.slice(0, 12) as f (f.key)}
                  <div class="cmp-row">
                    <span class="cmp-dot" class:dot-hard={f.tier === 'hard'}></span>
                    <span class="cmp-label">{f.label || f.key}</span>
                    <span class="cmp-vals">
                      {#if f.status === 'missing'}
                        was <strong>{f.baseline}</strong> — not found in this scan
                      {:else if f.status === 'added'}
                        new: <strong>{f.current}</strong> — not in baseline
                      {:else}
                        <strong>{f.baseline}</strong> → <strong>{f.current}</strong>
                      {/if}
                    </span>
                  </div>
                {/each}
                {#if issues.length > 12}
                  <div class="cmp-more">…and {issues.length - 12} more</div>
                {/if}
              </div>
            {/if}
          </div>
        {:else if baseline}
          <div class="warn-box">Comparison against baseline will run on submit.</div>
        {/if}

        <div class="actions">
          {#if submitted}
            <span class="ok">
              ✓ Scan submitted{submitted.overallStatus === 'mismatch' ? ' — flagged for review (mismatch)' : submitted.overallStatus === 'warning' ? ' — warnings noted' : submitted.overallStatus === 'match' ? ' — matches baseline' : ''}.
            </span>
            {#if !baseline && can('edit_inventory')}
              <button class="btn-primary" disabled={accepting} onclick={acceptAsBaseline}>
                {accepting ? 'Accepting…' : 'Accept as Baseline'}
              </button>
            {/if}
            <button class="btn-outline" onclick={() => goto(`/assets/${submitted!.assetId}`)}>View Asset</button>
          {:else}
            {#if submitErr}<span class="error-text">{submitErr}</span>{/if}
            <button class="btn-outline" onclick={() => { file = null; preview = null; parseErr = ''; }}>Cancel</button>
            <button class="btn-primary" disabled={!selected || submitting} onclick={submit}>
              {submitting ? 'Submitting…' : baseline ? 'Submit for Review →' : 'Submit Scan →'}
            </button>
          {/if}
        </div>
      </div>
    {/if}

  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--sp-lg, 16px); }
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; }
  .page-title { font-size: 20px; font-weight: 600; color: var(--ink); margin: 0; }
  .page-sub { font-size: 13px; color: var(--mute); margin: 2px 0 0; }

  .panel {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md, 8px);
    padding: 18px 20px;
  }
  .panel.disabled { opacity: 0.5; pointer-events: none; }
  .muted { color: var(--mute); font-size: 13px; }
  .error-text { color: var(--error); font-size: 13px; }
  .ok { color: var(--body); font-size: 13px; }

  .step-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 14px; }
  .step-num {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--ink); color: var(--on-primary, #fff);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600;
  }

  .search-input {
    width: 100%; padding: 8px 12px; font-size: 13px;
    border: 1px solid var(--hairline-strong); border-radius: var(--r-sm, 6px);
    background: var(--canvas); color: var(--ink);
  }
  .search-input:focus { outline: none; border-color: var(--ink); }

  .asset-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .asset-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    width: 100%; text-align: left; padding: 10px 12px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm, 6px);
    background: var(--canvas); cursor: pointer; font: inherit; color: inherit;
  }
  .asset-row:hover { border-color: var(--hairline-strong); background: var(--canvas-soft); }
  .selected-row { cursor: default; background: var(--canvas-soft); }
  .selected-row:hover { border-color: var(--hairline); }
  .asset-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .asset-name { font-size: 13px; font-weight: 600; color: var(--ink); }
  .asset-meta { font-size: 12px; color: var(--mute); }
  .asset-cat { font-size: 11px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.04em; }
  .asset-side { display: flex; align-items: center; gap: 10px; }
  .list-empty { padding: 10px 2px; }
  .mono { font-family: var(--font-mono, ui-monospace, monospace); }

  .dropzone {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 30px 16px; cursor: pointer; text-align: center;
    border: 1.5px dashed var(--hairline-strong); border-radius: var(--r-md, 8px);
    color: var(--body); font-size: 13px;
  }
  .dropzone:hover, .dropzone.drag-over { border-color: var(--ink); background: var(--canvas-soft); }
  .dropzone .link { text-decoration: underline; }
  .dropzone .hint { font-size: 12px; color: var(--mute); }
  .file-status { margin-top: 10px; font-size: 13px; }

  .spec-grid { display: flex; flex-direction: column; gap: 8px; }
  .spec-row { display: grid; grid-template-columns: 120px 1fr; gap: 12px; font-size: 13px; }
  .spec-label { color: var(--mute); }
  .spec-value { color: var(--ink); word-break: break-word; }

  .warn-box {
    margin-top: 14px; padding: 10px 12px; font-size: 13px;
    border: 1px solid var(--hairline-strong); border-radius: var(--r-sm, 6px);
    background: var(--canvas-soft); color: var(--body);
  }

  .cmp {
    margin-top: 14px; padding: 12px 14px; font-size: 13px;
    border: 1px solid var(--hairline-strong); border-radius: var(--r-sm, 6px);
    background: var(--canvas-soft);
  }
  .cmp-mismatch { border-color: var(--error); }
  .cmp-head { font-weight: 600; color: var(--ink); }
  .cmp-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .cmp-row { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; color: var(--body); }
  .cmp-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--hairline-strong); flex-shrink: 0; align-self: center; }
  .cmp-dot.dot-hard { background: var(--error); }
  .cmp-label { font-weight: 500; color: var(--ink); white-space: nowrap; }
  .cmp-vals { word-break: break-word; }
  .cmp-more { font-size: 12px; color: var(--mute); }

  .actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 16px; }
  .btn-primary, .btn-outline, .btn-ghost {
    font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
    padding: 7px 14px; border-radius: var(--r-sm, 6px);
  }
  .btn-primary { background: var(--ink); color: var(--on-primary, #fff); border: 1px solid var(--ink); }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-outline { background: var(--canvas); color: var(--ink); border: 1px solid var(--hairline-strong); }
  .btn-outline:hover { background: var(--canvas-soft); }
  .btn-ghost { background: none; border: none; color: var(--mute); text-decoration: underline; padding: 4px 6px; }

  .badge {
    font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: var(--r-full, 999px);
    border: 1px solid var(--hairline);
  }
  .badge-green { color: var(--body); background: var(--canvas-soft); }
  .badge-orange { color: var(--body); background: var(--canvas-soft-2); }
</style>
