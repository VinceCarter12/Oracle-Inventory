<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';
  import { can } from '$lib/utils/permissions';

  interface SpecField { key: string; label: string; value: string; tier: string; }
  interface FieldComparison {
    key: string; label: string; section: string; tier: 'hard' | 'soft';
    baseline: string | null; current: string | null;
    status: 'match' | 'warning' | 'mismatch' | 'missing' | 'added';
  }
  interface ScanDetail {
    id: string; assetId: string; fileName: string; isBaseline: boolean;
    overallStatus: 'match' | 'warning' | 'mismatch' | null;
    status: 'pending' | 'reviewed' | 'flagged' | 'archived';
    createdAt: string; reviewedAt: string | null; reviewNotes: string | null;
    submittedBy: { id: string; name: string } | null;
    reviewedBy: { id: string; name: string } | null;
    parsedSpecs: {
      sections: Record<string, { key: string; name: string; fields: SpecField[] }>;
      meta: { computerName?: string; profileDate?: string; missingSections: string[] };
    };
    comparisonResult: {
      overallStatus: 'match' | 'warning' | 'mismatch';
      summary: { match: number; warning: number; mismatch: number; missing: number; added: number };
      fields: FieldComparison[];
    } | null;
    asset: { id: string; name: string; serialNumber: string | null; branch: { id: string; name: string } | null } | null;
  }

  let loading = $state(true);
  let loadErr = $state('');
  let scan    = $state<ScanDetail | null>(null);

  let notes     = $state('');
  let saving    = $state('');
  let actionErr = $state('');
  let rawUrl    = $state('');

  const scanId = $derived($page.params.scanId);

  // Group comparison fields by section, flagged sections first
  interface SectionGroup { key: string; name: string; fields: FieldComparison[]; flagged: number; }
  const groups = $derived.by((): SectionGroup[] => {
    if (!scan?.comparisonResult) return [];
    const bySection = new Map<string, FieldComparison[]>();
    for (const f of scan.comparisonResult.fields) {
      if (!bySection.has(f.section)) bySection.set(f.section, []);
      bySection.get(f.section)!.push(f);
    }
    return [...bySection.entries()]
      .map(([key, fields]) => ({
        key,
        name: scan!.parsedSpecs.sections[key]?.name ?? key,
        fields,
        flagged: fields.filter((f) => f.status !== 'match').length,
      }))
      .sort((a, b) => b.flagged - a.flagged || a.name.localeCompare(b.name));
  });

  const issues = $derived(scan?.comparisonResult?.fields.filter((f) => f.status !== 'match') ?? []);

  async function load() {
    loading = true;
    try {
      scan = await api.get<ScanDetail>(`/api/hardware-audit/scans/${scanId}`);
      notes = scan.reviewNotes ?? '';
    } catch (e) {
      loadErr = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function review(action: 'reviewed' | 'flagged' | 'archived') {
    saving = action;
    actionErr = '';
    try {
      await api.put(`/api/hardware-audit/scans/${scanId}/review`, { action, notes });
      await load();
    } catch (e) {
      actionErr = (e as Error).message;
    } finally {
      saving = '';
    }
  }

  async function acceptBaseline() {
    saving = 'baseline';
    actionErr = '';
    try {
      await api.put(`/api/hardware-audit/scans/${scanId}/baseline`, {});
      await load();
    } catch (e) {
      actionErr = (e as Error).message;
    } finally {
      saving = '';
    }
  }

  // Untrusted uploaded HTML — render only in a fully sandboxed iframe
  async function viewRaw() {
    try {
      const res = await fetch(`/api/hardware-audit/scans/${scanId}/raw`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawUrl = URL.createObjectURL(await res.blob());
    } catch (e) {
      actionErr = (e as Error).message;
    }
  }
  function closeRaw() {
    if (rawUrl) URL.revokeObjectURL(rawUrl);
    rawUrl = '';
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ' · ' + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function statusIcon(s: FieldComparison['status']): string {
    if (s === 'match') return 'MATCH';
    if (s === 'warning') return 'WARNING';
    if (s === 'missing' || s === 'added') return 'FIELD';
    return 'MISMATCH';
  }

  function explain(f: FieldComparison): string {
    if (f.status === 'missing') {
      return `Baseline recorded “${f.baseline}” but this scan does not include it. ${f.tier === 'hard' ? 'A hardware component may have been removed.' : ''}`;
    }
    if (f.status === 'added') {
      return `“${f.current}” appears in this scan but not in the baseline. ${f.tier === 'hard' ? 'An unrecognized hardware component was detected.' : ''}`;
    }
    if (f.status === 'mismatch') {
      return `Value does not match baseline. Original: ${f.baseline} — Detected: ${f.current}. ${/serial/i.test(f.key) ? 'A serial change is the strongest indicator of a hardware swap.' : ''}`;
    }
    return `Changed since baseline — soft field, expected drift is possible.`;
  }
</script>

<svelte:head><title>Scan Review — Oracle Inventory</title></svelte:head>

<div class="page">
  <button class="back-link" onclick={() => goto('/hardware-audit')}>← Back to Hardware Audit Queue</button>

  {#if loading}
    <div class="panel muted">Loading scan…</div>
  {:else if loadErr}
    <div class="panel error-text">{loadErr}</div>
  {:else if scan}

    <!-- Header -->
    <div class="head">
      <h1 class="page-title">
        {scan.asset?.name ?? 'Unknown asset'}
        {#if scan.asset?.serialNumber}<span class="mono sn">· SN: {scan.asset.serialNumber}</span>{/if}
      </h1>
      <p class="page-sub">
        Scan submitted {fmtDate(scan.createdAt)}{scan.submittedBy ? ` by ${scan.submittedBy.name}` : ''}
        {#if scan.asset?.branch}· {scan.asset.branch.name}{/if}
        {#if scan.fileName !== 'Manual entry'}· <button class="link-btn" onclick={viewRaw}>View original Belarc report</button>{/if}
        {#if scan.asset}· <button class="link-btn" onclick={() => goto(`/assets/${scan!.asset!.id}`)}>Open asset</button>{/if}
      </p>
    </div>

    <!-- Overall result -->
    <div class="panel overall"
         class:ov-mismatch={scan.comparisonResult?.overallStatus === 'mismatch'}
         class:ov-warning={scan.comparisonResult?.overallStatus === 'warning'}>
      {#if scan.isBaseline}
        <div class="ov-title">BASELINE — this scan is the asset's reference point</div>
        <div class="muted">Later scans are compared against these specs. Accepted {fmtDate(scan.reviewedAt)}{scan.reviewedBy ? ` by ${scan.reviewedBy.name}` : ''}.</div>
      {:else if !scan.comparisonResult}
        <div class="ov-title">NO BASELINE — nothing to compare against</div>
        <div class="muted">This scan was uploaded before the asset had a baseline. Accept it (or another scan) as the baseline to enable comparisons.</div>
      {:else if scan.comparisonResult.overallStatus === 'match'}
        <div class="ov-title">MATCH — all {scan.comparisonResult.summary.match} compared fields identical</div>
      {:else if scan.comparisonResult.overallStatus === 'warning'}
        <div class="ov-title">WARNING — {issues.length} difference{issues.length === 1 ? '' : 's'} found, none hardware-critical</div>
      {:else}
        <div class="ov-title">MISMATCH — {issues.length} discrepanc{issues.length === 1 ? 'y' : 'ies'} found</div>
        <ul class="ov-list">
          {#each issues.filter((f) => f.tier === 'hard').slice(0, 5) as f}
            <li>{f.label || f.key}: {f.status === 'missing' ? 'missing from scan' : f.status === 'added' ? 'not in baseline' : `${f.baseline} → ${f.current}`}</li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Spec comparison -->
    {#if scan.comparisonResult}
      <div class="panel flush">
        <div class="cmp-head-row">
          <span class="col-field">Field</span>
          <span class="col-base">Baseline (Stored)</span>
          <span class="col-live">Live Scan</span>
          <span class="col-badge"></span>
        </div>
        {#each groups as group (group.key)}
          <div class="section-row">{group.name}{#if group.flagged > 0}<span class="section-flag">{group.flagged} flagged</span>{/if}</div>
          {#each group.fields as f (f.key)}
            <div class="cmp-row" class:cmp-flagged={f.status !== 'match'}>
              <span class="col-field">{f.label || f.key.split('.').slice(1).join('.')}</span>
              <span class="col-base">{f.baseline ?? '—'}</span>
              <span class="col-live">{f.current ?? '—'}</span>
              <span class="col-badge">{statusIcon(f.status)}</span>
            </div>
            {#if f.status !== 'match'}
              <div class="explain" class:explain-hard={f.tier === 'hard'}>
                {f.tier === 'hard' ? '⚠' : 'ℹ'} {explain(f)}
              </div>
            {/if}
          {/each}
        {/each}
      </div>
    {:else if !scan.isBaseline}
      <div class="panel">
        <div class="muted" style="margin-bottom:10px">Parsed specs from this scan ({Object.keys(scan.parsedSpecs.sections).length} sections{scan.parsedSpecs.meta.computerName ? ` · Computer: ${scan.parsedSpecs.meta.computerName}` : ''}):</div>
        {#each Object.values(scan.parsedSpecs.sections).filter((s) => s.fields.length > 0).slice(0, 8) as section}
          <div class="section-row flat">{section.name}</div>
          {#each section.fields.slice(0, 4) as f}
            <div class="spec-line"><span class="muted">{f.label || f.key}</span> {f.value}</div>
          {/each}
        {/each}
      </div>
    {/if}

    <!-- Admin review -->
    <div class="panel">
      <div class="review-head">
        Admin Review
        <span class="badge badge-status">{scan.status.toUpperCase()}</span>
        {#if scan.reviewedAt}<span class="muted">— {fmtDate(scan.reviewedAt)}{scan.reviewedBy ? ` by ${scan.reviewedBy.name}` : ''}</span>{/if}
      </div>
      {#if can('approve_transactions')}
        <textarea class="notes" rows="3" placeholder="Notes…" bind:value={notes}></textarea>
        {#if actionErr}<div class="error-text" style="margin-bottom:8px">{actionErr}</div>{/if}
        <div class="review-actions">
          {#if !scan.isBaseline && can('edit_inventory')}
            <button class="btn-outline" disabled={!!saving} onclick={acceptBaseline}>
              {saving === 'baseline' ? 'Accepting…' : 'Accept as Baseline'}
            </button>
          {/if}
          <span class="spacer"></span>
          <button class="btn-outline btn-flag" disabled={!!saving} onclick={() => review('flagged')}>
            {saving === 'flagged' ? 'Saving…' : '🚩 Flag for Action'}
          </button>
          <button class="btn-primary" disabled={!!saving} onclick={() => review('reviewed')}>
            {saving === 'reviewed' ? 'Saving…' : '✓ Mark Reviewed'}
          </button>
          <button class="btn-ghost" disabled={!!saving} onclick={() => review('archived')}>
            {saving === 'archived' ? 'Saving…' : 'Archive'}
          </button>
        </div>
      {:else}
        {#if scan.reviewNotes}<div class="spec-line">{scan.reviewNotes}</div>{:else}<div class="muted">No review notes.</div>{/if}
      {/if}
    </div>

  {/if}

  <!-- Sandboxed raw report viewer -->
  {#if rawUrl}
    <div class="modal-overlay" onclick={closeRaw} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Original Belarc report">
        <div class="modal-head">
          <span>Original Belarc Report</span>
          <button class="modal-close" onclick={closeRaw} aria-label="Close">✕</button>
        </div>
        <iframe class="raw-frame" sandbox="" src={rawUrl} title="Belarc report"></iframe>
      </div>
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--sp-lg, 16px); }
  .back-link {
    align-self: flex-start; font: inherit; font-size: 13px; color: var(--mute);
    background: none; border: none; cursor: pointer; padding: 0;
  }
  .back-link:hover { color: var(--ink); }
  .page-title { font-size: 20px; font-weight: 600; color: var(--ink); margin: 0; }
  .sn { font-size: 14px; font-weight: 400; color: var(--mute); }
  .page-sub { font-size: 13px; color: var(--mute); margin: 4px 0 0; }
  .link-btn {
    font: inherit; font-size: 13px; color: var(--link); background: none;
    border: none; cursor: pointer; padding: 0; text-decoration: underline;
  }
  .mono { font-family: var(--font-mono, ui-monospace, monospace); }
  .muted { color: var(--mute); font-size: 13px; }
  .error-text { color: var(--error); font-size: 13px; }

  .panel {
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-md, 8px); padding: 16px 18px;
  }
  .panel.flush { padding: 0; overflow: hidden; }

  .overall.ov-mismatch { border-color: var(--error); }
  .ov-title { font-size: 14px; font-weight: 600; color: var(--ink); }
  .ov-list { margin: 8px 0 0; padding-left: 22px; font-size: 13px; color: var(--body); }
  .ov-list li { margin: 2px 0; }

  .cmp-head-row, .cmp-row {
    display: grid; grid-template-columns: 180px 1fr 1fr 36px; gap: 12px;
    padding: 8px 16px; font-size: 12.5px; align-items: baseline;
  }
  .cmp-head-row {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--mute); border-bottom: 1px solid var(--hairline); background: var(--canvas-soft);
  }
  .cmp-row { border-bottom: 1px solid var(--hairline); color: var(--body); }
  .cmp-row .col-field { font-weight: 500; color: var(--ink); }
  .cmp-row .col-base, .cmp-row .col-live { word-break: break-word; }
  .cmp-row.cmp-flagged { background: var(--canvas-soft); }
  .col-badge { text-align: center; font-size: 11px; }

  .section-row {
    padding: 8px 16px; font-size: 11.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--mute); background: var(--canvas-soft-2);
    border-bottom: 1px solid var(--hairline);
    display: flex; align-items: center; gap: 10px;
  }
  .section-row.flat { background: none; border: none; padding: 10px 0 4px; }
  .section-flag { color: var(--error); font-weight: 500; text-transform: none; letter-spacing: 0; }

  .explain {
    margin: 0 16px 8px 192px; padding: 8px 12px; font-size: 12.5px; color: var(--body);
    border: 1px solid var(--hairline-strong); border-radius: var(--r-sm, 6px);
    background: var(--canvas-soft);
  }
  .explain-hard { border-color: var(--error); }
  @media (max-width: 767px) {
    .cmp-head-row, .cmp-row { grid-template-columns: 1fr 1fr 1fr 28px; }
    .explain { margin-left: 16px; }
  }

  .spec-line { font-size: 13px; color: var(--body); padding: 2px 0; }
  .spec-line .muted { display: inline-block; min-width: 160px; }

  .review-head { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 12px; }
  .notes {
    width: 100%; font: inherit; font-size: 13px; color: var(--ink);
    padding: 8px 12px; border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm, 6px); background: var(--canvas);
    resize: vertical; margin-bottom: 10px;
  }
  .review-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .spacer { flex: 1; }

  .badge {
    font-size: 10px; font-weight: 500; letter-spacing: 0.05em; padding: 3px 9px;
    border-radius: var(--r-full, 999px); border: 1px solid var(--hairline);
    background: var(--canvas-soft); color: var(--mute);
  }

  .btn-primary, .btn-outline, .btn-ghost {
    font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
    padding: 7px 14px; border-radius: var(--r-sm, 6px);
  }
  .btn-primary { background: var(--ink); color: var(--on-primary, #fff); border: 1px solid var(--ink); }
  .btn-outline { background: var(--canvas); color: var(--ink); border: 1px solid var(--hairline-strong); }
  .btn-flag { color: var(--error); border-color: var(--error); }
  .btn-ghost { background: none; border: none; color: var(--mute); text-decoration: underline; }
  .btn-primary:disabled, .btn-outline:disabled, .btn-ghost:disabled { opacity: 0.5; cursor: default; }

  .modal-overlay {
    position: fixed; inset: 0; background: oklch(0% 0 0 / 40%);
    display: flex; align-items: center; justify-content: center; z-index: 300;
  }
  .modal {
    background: var(--canvas); border-radius: var(--r-md, 8px);
    width: min(920px, 94vw); height: min(80vh, 800px);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--hairline);
    font-size: 14px; font-weight: 600; color: var(--ink);
  }
  .modal-close { font: inherit; background: none; border: none; cursor: pointer; color: var(--mute); }
  .raw-frame { flex: 1; width: 100%; border: none; background: #fff; }
</style>
