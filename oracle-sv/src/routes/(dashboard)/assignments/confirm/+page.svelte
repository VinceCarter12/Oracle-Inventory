<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  // ── API types ─────────────────────────────────────────────────────────────────
  interface ApiAssignment {
    id: string;
    status: 'active' | 'pending_return' | 'returned' | 'transferred';
    assignedAt: string;
    notes: string | null;
    returnRequestedAt: string | null;
    returnNotes: string | null;
    returnRequestedBy: string | null;
    asset: { id: string; name: string; serialNumber: string | null; condition: string; category: { name: string } | null; branch: { name: string } | null; };
    employee: { id: string; name: string; employeeId: string; department: { name: string } | null; branch: { name: string } | null; };
  }

  // ── Display types ─────────────────────────────────────────────────────────────
  interface DispEmployee { id: string; empId: string; name: string; initials: string; color: string; dept: string; branch: string; }
  interface DispAsset    { id: string; name: string; serial: string; category: string; condition: string; }
  interface DispData     {
    emp: DispEmployee; assets: DispAsset[]; assignedAt: string; notes: string;
    ref: string; status: string; assignmentIds: string[];
    returnRequestedAt: string | null; returnNotes: string | null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const AVATAR_COLORS = [
    'oklch(52% 0.21 264)', 'oklch(55% 0.18 210)', 'oklch(55% 0.19 155)',
    'oklch(52% 0.22 340)', 'oklch(60% 0.20 60)',  'oklch(48% 0.22 300)',
    'oklch(52% 0.16 55)',  'oklch(42% 0.18 240)', 'oklch(50% 0.18 180)',
    'oklch(44% 0.20 20)',
  ];
  function nameInitials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
  function avatarColor(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

  function mapFromAssignments(asnList: ApiAssignment[], overrideNotes?: string): DispData {
    const first = asnList[0];
    const e = first.employee;
    return {
      emp: { id: e.id, empId: e.employeeId, name: e.name, initials: nameInitials(e.name), color: avatarColor(e.id), dept: e.department?.name ?? '—', branch: e.branch?.name ?? '—' },
      assets: asnList.map(a => ({ id: a.asset.id, name: a.asset.name, serial: a.asset.serialNumber ?? '—', category: a.asset.category?.name ?? 'Other', condition: a.asset.condition })),
      assignedAt: first.assignedAt,
      notes: overrideNotes ?? first.notes ?? '',
      ref: `#ASN-${first.id.slice(0, 8).toUpperCase()}`,
      status: first.status,
      assignmentIds: asnList.map(a => a.id),
      returnRequestedAt: first.returnRequestedAt ?? null,
      returnNotes: first.returnNotes ?? null,
    };
  }

  function formatDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return iso; }
  }

  function formatTime(iso: string): string {
    try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  let loading = $state(true);
  let loadErr = $state('');
  let data    = $state<DispData | null>(null);
  let copied  = $state(false);

  onMount(async () => {
    // 1. Try ?id= query param (view existing assignment)
    const id = new URL(window.location.href).searchParams.get('id');
    if (id) {
      try {
        const asn = await api.get<ApiAssignment>(`/api/assignments/${id}`);
        data = mapFromAssignments([asn]);
      } catch (e) { loadErr = (e as Error).message; }
      finally { loading = false; }
      return;
    }

    // 2. Read fresh result from wizard
    try {
      const raw = sessionStorage.getItem('asn_result');
      if (raw) {
        const parsed = JSON.parse(raw) as { assignments: ApiAssignment[]; notes: string };
        sessionStorage.removeItem('asn_result');
        data = mapFromAssignments(parsed.assignments, parsed.notes || undefined);
      }
    } catch { /* ignore */ }

    if (!data) goto('/assignments');
    loading = false;
  });

  function copyRef() {
    if (!data) return;
    navigator.clipboard.writeText(data.ref).then(() => {
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    }).catch(() => { /* ignore */ });
  }

  // ── Mark Return ──────────────────────────────────────────────────────────
  let showMarkReturn  = $state(false);
  let markRetNotes    = $state('');
  let markReturning   = $state(false);
  let markRetErr      = $state('');

  async function markReturn() {
    if (!data) return;
    markReturning = true; markRetErr = '';
    try {
      const id = data.assignmentIds[0];
      await api.put(`/api/assignments/${id}/approve-return`, { notes: markRetNotes || undefined });
      data = { ...data, status: 'returned', returnNotes: null, returnRequestedAt: null };
      showMarkReturn = false; markRetNotes = '';
    } catch (e) { markRetErr = (e as Error).message; }
    finally { markReturning = false; }
  }

  // ── Approve / Reject (Admin) ──────────────────────────────────────────────
  let showReviewModal = $state(false);
  let reviewAction    = $state<'approve' | 'reject'>('approve');
  let reviewNotes     = $state('');
  let reviewing       = $state(false);
  let reviewErr       = $state('');

  async function confirmReview() {
    if (!data) return;
    reviewing = true; reviewErr = '';
    const id = data.assignmentIds[0];
    const endpoint = reviewAction === 'approve' ? 'approve-return' : 'reject-return';
    try {
      await api.put(`/api/assignments/${id}/${endpoint}`, { notes: reviewNotes || undefined });
      data = { ...data, status: reviewAction === 'approve' ? 'returned' : 'active', returnNotes: null, returnRequestedAt: null };
      showReviewModal = false; reviewNotes = '';
    } catch (e) { reviewErr = (e as Error).message; }
    finally { reviewing = false; }
  }
</script>

<div class="pg">

  <!-- LEFT scrollable panel -->
  <div class="pg-left">

  {#if loading}
    <div class="pg-loading">Loading…</div>
  {:else if loadErr}
    <div class="load-err">{loadErr}</div>
  {:else if data}

  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <button class="crumb-link" onclick={() => goto('/dashboard')}>Dashboard</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <button class="crumb-link" onclick={() => goto('/assignments')}>Assignments</button>
    <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="crumb-current">Confirm</span>
  </nav>

  <!-- Top bar -->
  <div class="topbar">
    <span class="pg-title">Assign asset</span>
    <div class="topbar-actions">
      {#if data!.status === 'active'}
        {#if can('manage_stock')}
          <button class="btn-ghost" onclick={() => showMarkReturn = true}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Mark return
          </button>
        {/if}
      {:else if data!.status === 'pending_return'}
        <span class="status-pending-badge">Pending Return</span>
        {#if can('approve_transactions')}
          <button class="btn-reject-top" onclick={() => { reviewAction = 'reject'; showReviewModal = true; }}>Reject</button>
          <button class="btn-approve-top" onclick={() => { reviewAction = 'approve'; showReviewModal = true; }}>Approve</button>
        {/if}
      {:else if data!.status === 'returned'}
        <span class="status-returned-badge">Returned</span>
      {/if}
      <button class="btn-primary" onclick={() => goto('/assignments/assign')}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        New assignment
      </button>
    </div>
  </div>

  <!-- Step bar — all done -->
  <div class="steps-bar">
    {#each ['Select employee', 'Select assets', 'Set details', 'Confirm'] as label, i}
      {#if i > 0}
        <div class="step-line done"></div>
      {/if}
      <div class="step done">
        <div class="step-num">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="step-label">{label}</span>
      </div>
    {/each}
  </div>

  <!-- Success banner -->
  <div class="success-banner">
    <div class="success-icon">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6L9 17L4 12" stroke="oklch(35% 0.15 155)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h2 class="success-title">Assignment confirmed</h2>
    <p class="success-sub">
      {data!.assets.length} {data!.assets.length === 1 ? 'asset has' : 'assets have'} been successfully assigned to {data!.emp.name}.<br/>
      An acknowledgment slip has been generated.
    </p>
    <div class="ref-pill">
      <span class="ref-pill-label">Assignment reference</span>
      <span class="ref-num">{data!.ref}</span>
      <button class="copy-btn" onclick={copyRef} aria-label="Copy reference number">
        {#if copied}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>

      <!-- Assigned to card -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Assigned to</span>
          {#if data!.status === 'active'}
            <span class="badge-active">Active</span>
          {:else if data!.status === 'pending_return'}
            <span class="badge-pending">Pending Return</span>
          {:else}
            <span class="badge-returned">Returned</span>
          {/if}
        </div>
        <div class="info-grid">
          <div class="info-cell">
            <div class="info-label">Employee</div>
            <div class="info-val">{data!.emp.name}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Employee ID</div>
            <div class="info-val">{data!.emp.empId}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Department</div>
            <div class="info-val">{data!.emp.dept}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Branch</div>
            <div class="info-val">{data!.emp.branch}</div>
          </div>
          <div class="info-cell info-cell-wide">
            <div class="info-label">Date assigned</div>
            <div class="info-val">{formatDate(data!.assignedAt)} · {formatTime(data!.assignedAt)}</div>
          </div>
        </div>
      </div>

      <!-- Pending return info card -->
      {#if data!.status === 'pending_return'}
        <div class="card pending-return-card">
          <div class="pending-return-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Return requested — awaiting approval</span>
          </div>
          {#if data!.returnRequestedAt}
            <div class="pending-return-meta">
              Submitted {formatDate(data!.returnRequestedAt)} · {formatTime(data!.returnRequestedAt)}
            </div>
          {/if}
          {#if data!.returnNotes}
            <div class="pending-return-notes">{data!.returnNotes}</div>
          {/if}
        </div>
      {/if}

      <!-- Assigned assets card -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Assigned assets</span>
          <span class="card-count">{data!.assets.length} {data!.assets.length === 1 ? 'item' : 'items'}</span>
        </div>
        {#each data!.assets as a}
          <div class="asset-row">
            <span class="asset-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                {#if a.category === 'Phone' || a.category === 'Tablet'}
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                {:else if a.category === 'Laptop'}
                  <rect x="2" y="6" width="20" height="12" rx="2"/>
                  <line x1="2" y1="20" x2="22" y2="20"/>
                {:else}
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                {/if}
              </svg>
            </span>
            <div class="asset-info">
              <div class="asset-name">{a.name}</div>
              <div class="asset-sn">{a.serial} · {a.category}</div>
            </div>
            <div class="asset-meta">
              <div class="asset-cond">Condition: {a.condition}</div>
              <div class="asset-out">Out: {formatDate(data!.assignedAt)}</div>
            </div>
            <span class="badge-assigned">Assigned</span>
          </div>
        {/each}
      </div>

      <!-- Notes card -->
      {#if data!.notes}
        <div class="card">
          <div class="card-head">
            <span class="card-title">Notes</span>
          </div>
          <div class="notes-body">{data!.notes}</div>
        </div>
      {/if}

  {/if}<!-- end if data -->

  </div><!-- end pg-left -->

  <!-- RIGHT full-height panel -->
  <div class="pg-right">

      <!-- Assignment receipt -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Assignment receipt</span>
        </div>
        {#if data}
        <div class="receipt-section">
          <div class="r-label">Reference no.</div>
          <div class="r-val mono link">{data.ref}</div>
        </div>
        <div class="receipt-section">
          <div class="r-label">Date assigned</div>
          <div class="r-val">{formatDate(data.assignedAt)}</div>
          <div class="r-sub">{formatTime(data.assignedAt)}</div>
        </div>
        <div class="receipt-section">
          <div class="r-label">Activity</div>
          <div class="timeline">
            <div class="tl-item">
              <span class="tl-dot green"></span>
              <div class="tl-line"></div>
              <div>
                <div class="tl-text">Assignment confirmed</div>
                <div class="tl-time">{formatDate(data.assignedAt)} · {formatTime(data.assignedAt)}</div>
              </div>
            </div>
            <div class="tl-item">
              <span class="tl-dot blue"></span>
              {#if data.status === 'pending_return' || data.status === 'returned'}
                <div class="tl-line"></div>
              {/if}
              <div>
                <div class="tl-text">Assets checked out</div>
                <div class="tl-time">{data.assets.length} {data.assets.length === 1 ? 'item' : 'items'} assigned</div>
              </div>
            </div>
            {#if data.status === 'pending_return' && data.returnRequestedAt}
              <div class="tl-item">
                <span class="tl-dot amber"></span>
                <div>
                  <div class="tl-text">Return requested</div>
                  <div class="tl-time">{formatDate(data.returnRequestedAt)} · {formatTime(data.returnRequestedAt)}</div>
                </div>
              </div>
            {/if}
            {#if data.status === 'returned'}
              <div class="tl-item">
                <span class="tl-dot gray"></span>
                <div>
                  <div class="tl-text">Return approved</div>
                  <div class="tl-time">Assets returned</div>
                </div>
              </div>
            {/if}
          </div>
        </div>
        {/if}
      </div>

      <!-- Next steps -->
      <div class="card next-steps-card">
        <div class="card-head">
          <span class="card-title">Next steps</span>
        </div>
        <div class="next-steps-body">
          <button class="next-btn" onclick={() => window.print()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Print acknowledgment slip
          </button>
          <button class="next-btn" onclick={() => goto(`/employees/${data?.emp.id}`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            View employee profile
          </button>
          {#if data?.status === 'active' && can('manage_stock')}
            <button class="next-btn" onclick={() => showMarkReturn = true}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Mark return
            </button>
          {/if}
          {#if data?.status === 'pending_return' && can('approve_transactions')}
            <button class="next-btn next-btn-approve" onclick={() => { reviewAction = 'approve'; showReviewModal = true; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Approve return
            </button>
          {/if}
          <button class="next-btn" onclick={() => goto('/assignments')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            View all assignments
          </button>
        </div>
      </div>

  </div><!-- end pg-right -->

  <!-- Mark Return modal -->
  {#if showMarkReturn}
    <div class="modal-overlay" onclick={() => { showMarkReturn = false; markRetNotes = ''; markRetErr = ''; }} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Mark return">
        <div class="modal-head">
          <span class="modal-title">Mark return</span>
          <button class="modal-close" onclick={() => { showMarkReturn = false; markRetNotes = ''; markRetErr = ''; }} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-msg">
            Mark {data?.assets.length === 1 ? 'this asset' : `${data?.assets.length} assets`} as returned from <strong>{data?.emp.name}</strong>. The asset will be marked available immediately.
          </p>
          <div class="form-field">
            <label class="form-label" for="mark-ret-notes">Notes <span class="form-optional">(optional)</span></label>
            <textarea id="mark-ret-notes" class="form-ta" rows="3" placeholder="e.g. Employee leaving, department transfer…" bind:value={markRetNotes}></textarea>
          </div>
          {#if markRetErr}
            <div class="modal-err">{markRetErr}</div>
          {/if}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost-modal" onclick={() => { showMarkReturn = false; markRetNotes = ''; markRetErr = ''; }}>Cancel</button>
          <button class="btn-primary-modal" onclick={markReturn} disabled={markReturning}>
            {markReturning ? 'Processing…' : 'Confirm return'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Approve / Reject modal (admin) -->
  {#if showReviewModal}
    <div class="modal-overlay" onclick={() => { showReviewModal = false; reviewNotes = ''; reviewErr = ''; }} role="presentation">
      <div class="modal modal-wide" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Review return">
        <div class="modal-head">
          <span class="modal-title">{reviewAction === 'approve' ? 'Approve return' : 'Reject return'}</span>
          <button class="modal-close" onclick={() => { showReviewModal = false; reviewNotes = ''; reviewErr = ''; }} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          {#if data?.returnNotes}
            <div class="return-notes-box">
              <div class="return-notes-label">Return reason from employee</div>
              <div class="return-notes-text">{data.returnNotes}</div>
            </div>
          {/if}
          <p class="modal-msg">
            {#if reviewAction === 'approve'}
              Approve the return of {data?.assets.length === 1 ? 'this asset' : `${data?.assets.length} assets`} from <strong>{data?.emp.name}</strong>? Assets will be marked available.
            {:else}
              Reject this return request. The assignment will remain active.
            {/if}
          </p>
          <div class="form-field">
            <label class="form-label" for="review-notes">Response notes <span class="form-optional">(optional)</span></label>
            <textarea id="review-notes" class="form-ta" rows="2" placeholder="Add a note for the record…" bind:value={reviewNotes}></textarea>
          </div>
          {#if reviewErr}
            <div class="modal-err">{reviewErr}</div>
          {/if}
        </div>
        <div class="modal-foot modal-foot-review">
          <button class="btn-ghost-modal" onclick={() => { showReviewModal = false; reviewNotes = ''; reviewErr = ''; }}>Cancel</button>
          <div class="review-actions">
            {#if reviewAction === 'approve'}
              <button class="btn-danger-modal" onclick={() => { reviewAction = 'reject'; }}>Switch to reject</button>
              <button class="btn-primary-modal" onclick={confirmReview} disabled={reviewing}>
                {reviewing ? 'Approving…' : 'Approve return'}
              </button>
            {:else}
              <button class="btn-ghost-modal" onclick={() => { reviewAction = 'approve'; }}>Switch to approve</button>
              <button class="btn-danger-modal btn-danger-confirm" onclick={confirmReview} disabled={reviewing}>
                {reviewing ? 'Rejecting…' : 'Reject request'}
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}

</div>

<style>
  .pg-loading {
    padding: 40px;
    text-align: center;
    font-size: 13px;
    color: var(--mute);
  }

  .load-err {
    padding: 10px 14px;
    border-radius: var(--r-md);
    background: var(--error-soft);
    color: var(--error);
    font-size: 13px;
  }

  .info-cell-wide {
    grid-column: span 2;
    border-right: none;
  }

  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .crumb-link { background: none; border: none; padding: 0; font-size: 12.5px; color: var(--mute); font-family: var(--font-sans); cursor: pointer; transition: color 120ms ease; }
  .crumb-link:hover { color: var(--body); }
  .crumb-sep { color: var(--hairline-strong); flex-shrink: 0; }
  .crumb-current { font-size: 12.5px; color: var(--body); font-family: var(--font-sans); }

  /* ── Split panel layout ── */
  .pg {
    margin: -32px;
    padding-right: 360px; /* reserve space for fixed right panel */
    min-height: 100vh;
    background: var(--canvas-soft-2);
  }

  /* Left: natural height, outer .main-content scrolls */
  .pg-left {
    min-height: 100vh;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    background: var(--canvas-soft-2);
  }

  /* Right: fixed panel — always fills viewport, no gaps, scrolls independently */
  .pg-right {
    position: fixed;
    top: 0;
    right: 0;
    width: 360px;
    height: 100vh;
    overflow-y: auto;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    background: var(--canvas);
    border-left: 1px solid var(--hairline);
    z-index: 5;
  }

  /* Top bar */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
  }

  .pg-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.2px;
  }

  .topbar-actions { display: flex; align-items: center; gap: var(--sp-xs); }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--body);
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    cursor: pointer;
    font-family: var(--font-sans);
    box-shadow: var(--shadow-l1);
    transition: background 100ms ease;
  }
  .btn-ghost:hover { background: var(--canvas-soft-2); }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: var(--ink);
    color: var(--on-primary);
    border: none;
    border-radius: var(--r-md);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: opacity 120ms ease;
  }
  .btn-primary:hover { opacity: 0.85; }

  /* Steps bar */
  .steps-bar {
    display: flex;
    align-items: center;
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 14px 20px;
    box-shadow: var(--shadow-l1);
    gap: 0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .step-num {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
    background: var(--link);
    color: #fff;
    border: none;
  }

  .step-label {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--link);
  }

  .step-line {
    flex: 1;
    height: 1px;
    background: var(--hairline);
    margin: 0 10px;
  }
  .step-line.done { background: var(--link); }

  /* Success banner */
  .success-banner {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0;
    box-shadow: var(--shadow-l2);
  }

  .success-icon {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    background: oklch(93% 0.06 155);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .success-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.3px;
    margin-bottom: 6px;
  }

  .success-sub {
    font-size: 13px;
    color: var(--body);
    line-height: 1.6;
    margin-bottom: 20px;
  }

  .ref-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--canvas-soft-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 7px 14px;
    font-size: 12px;
    color: var(--mute);
  }

  .ref-pill-label { white-space: nowrap; }

  .ref-num {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--mute);
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: var(--r-xs);
    transition: color 100ms ease;
  }
  .copy-btn:hover { color: var(--link); }


  /* Card */
  .card {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--shadow-l1);
    flex-shrink: 0; /* prevent flex parent from squishing card content */
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    border-bottom: 1px solid var(--hairline);
  }

  .card-title { font-size: 13px; font-weight: 600; color: var(--ink); }
  .card-count { font-size: 11px; color: var(--mute); }

  .badge-active {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-xs);
    background: oklch(93% 0.06 155);
    color: oklch(35% 0.15 155);
  }

  /* Info grid */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .info-cell {
    padding: 10px 14px;
    border-right: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
  .info-cell:nth-child(2n) { border-right: none; }
  .info-cell:nth-last-child(-n+2) { border-bottom: none; }

  .info-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 3px;
  }
  .info-val { font-size: 13px; font-weight: 500; color: var(--ink); }

  /* Asset row */
  .asset-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--hairline);
  }
  .asset-row:last-child { border-bottom: none; }

  .asset-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--r-sm);
    background: oklch(93% 0.06 264);
    color: var(--link);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .asset-info { flex: 1; min-width: 0; }
  .asset-name { font-size: 13px; font-weight: 500; color: var(--ink); }
  .asset-sn   { font-size: 11px; color: var(--mute); margin-top: 1px; }

  .asset-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
  .asset-cond { font-size: 11px; color: var(--body); }
  .asset-out  { font-size: 11px; color: var(--mute); }

  .badge-assigned {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-xs);
    background: oklch(93% 0.06 155);
    color: oklch(35% 0.15 155);
    flex-shrink: 0;
    margin-left: 8px;
  }

  /* Notes */
  .notes-body {
    padding: 12px 14px;
    font-size: 13px;
    color: var(--body);
    line-height: 1.6;
  }

  /* Receipt */
  .receipt-section {
    padding: 11px 14px;
    border-bottom: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .receipt-section:last-child { border-bottom: none; }

  .r-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .r-val { font-size: 13px; font-weight: 500; color: var(--ink); }
  .r-val.mono { font-family: var(--font-mono); }
  .r-val.link { color: var(--link); }
  .r-sub { font-size: 11px; color: var(--mute); }

  /* Timeline */
  .timeline { display: flex; flex-direction: column; gap: 0; margin-top: 4px; }

  .tl-item {
    display: flex;
    gap: 10px;
    padding-bottom: 12px;
    position: relative;
  }
  .tl-item:last-child { padding-bottom: 0; }

  .tl-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
    margin-top: 4px;
  }
  .tl-dot.green { background: oklch(60% 0.18 155); }
  .tl-dot.blue  { background: var(--link); }
  .tl-dot.gray  { background: var(--hairline-strong); }

  .tl-line {
    position: absolute;
    left: 3.5px;
    top: 12px;
    bottom: 0;
    width: 1px;
    background: var(--hairline);
  }
  .tl-item:last-child .tl-line { display: none; }

  .tl-text { font-size: 12px; color: var(--ink); font-weight: 500; }
  .tl-time { font-size: 11px; color: var(--mute); margin-top: 2px; }

  /* Next steps */
  .next-steps-card { overflow: hidden; }

  .next-steps-body {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .next-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    cursor: pointer;
    font-family: var(--font-sans);
    text-align: left;
    box-shadow: var(--shadow-l1);
    transition: background 100ms ease, color 100ms ease;
  }
  .next-btn:hover { background: var(--canvas-soft-2); color: var(--ink); }

  .badge-returned {
    font-size: 11px; font-weight: 500;
    padding: 2px 8px; border-radius: var(--r-xs);
    background: var(--canvas-soft-2); color: var(--mute);
    border: 1px solid var(--hairline);
  }

  .status-returned-badge {
    font-size: 12px; font-weight: 500;
    padding: 4px 10px; border-radius: var(--r-md);
    background: var(--canvas-soft-2); color: var(--mute);
    border: 1px solid var(--hairline);
  }

  .modal-overlay {
    position: fixed; inset: 0;
    background: oklch(0% 0 0 / 0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 50; padding: 20px;
  }
  .modal {
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-l3);
    width: 100%; max-width: 400px;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid var(--hairline);
  }
  .modal-title { font-size: 14px; font-weight: 600; color: var(--ink); }
  .modal-close {
    background: none; border: none; cursor: pointer; color: var(--mute);
    display: flex; align-items: center; padding: 4px; border-radius: var(--r-xs);
    transition: color 100ms ease;
  }
  .modal-close:hover { color: var(--ink); }
  .modal-body { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .modal-msg { font-size: 14px; color: var(--body); line-height: 1.6; }
  .modal-err {
    font-size: 12px; color: var(--error);
    padding: 7px 10px; background: var(--error-soft); border-radius: var(--r-md);
  }
  .modal-foot {
    padding: 12px 18px; border-top: 1px solid var(--hairline);
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .btn-ghost-modal {
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    color: var(--body); background: var(--canvas);
    border: 1px solid var(--hairline); border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans);
    transition: background 100ms ease;
  }
  .btn-ghost-modal:hover { background: var(--canvas-soft-2); }
  .btn-primary-modal {
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    background: var(--ink); color: var(--on-primary);
    border: none; border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans); transition: opacity 120ms ease;
  }
  .btn-primary-modal:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary-modal:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Pending / approved badges */
  .badge-pending {
    font-size: 11px; font-weight: 500;
    padding: 2px 8px; border-radius: var(--r-xs);
    background: #ffefcf; color: #ab570a;
  }

  /* Topbar action buttons */
  .status-pending-badge {
    font-size: 12px; font-weight: 500;
    padding: 4px 10px; border-radius: var(--r-md);
    background: #ffefcf; color: #ab570a;
    border: 1px solid #f0d090;
  }
  .btn-approve-top {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    background: var(--ink); color: var(--on-primary);
    border: none; border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans); transition: opacity 120ms ease;
  }
  .btn-approve-top:hover { opacity: 0.85; }
  .btn-reject-top {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    background: var(--canvas); color: #c50000;
    border: 1px solid #f7d4d6; border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans); transition: background 100ms ease;
  }
  .btn-reject-top:hover { background: #fff0f0; }

  /* Pending return info card */
  .pending-return-card {
    border-color: #f0d090;
    background: #fffbf0;
  }
  .pending-return-head {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 14px;
    font-size: 13px; font-weight: 600; color: #ab570a;
    border-bottom: 1px solid #f0d090;
  }
  .pending-return-meta {
    padding: 8px 14px;
    font-size: 12px; color: #ab570a; opacity: 0.8;
    border-bottom: 1px solid #f0d090;
  }
  .pending-return-notes {
    padding: 10px 14px;
    font-size: 13px; color: #6b3a0a;
    line-height: 1.5;
  }

  /* Timeline amber dot */
  .tl-dot.amber { background: #f0a020; }

  /* Next-steps approve button */
  .next-btn-approve { color: oklch(35% 0.15 155); }
  .next-btn-approve:hover { color: oklch(25% 0.15 155); }

  /* Modal wide */
  .modal-wide { max-width: 480px; }

  /* Form field */
  .form-field { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: 12px; font-weight: 500; color: var(--body); }
  .form-optional { font-weight: 400; color: var(--mute); }
  .form-ta {
    width: 100%; padding: 8px 10px;
    font-size: 13px; font-family: var(--font-sans); color: var(--ink);
    background: var(--canvas); border: 1px solid var(--hairline);
    border-radius: var(--r-md); resize: vertical; outline: none;
    transition: border-color 120ms ease;
    box-sizing: border-box;
  }
  .form-ta:focus { border-color: var(--link); }

  /* Return notes preview in review modal */
  .return-notes-box {
    background: var(--canvas-soft-2); border: 1px solid var(--hairline);
    border-radius: var(--r-md); padding: 10px 12px;
  }
  .return-notes-label { font-size: 10px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .return-notes-text { font-size: 13px; color: var(--body); line-height: 1.5; }

  /* Review modal footer */
  .modal-foot-review { justify-content: space-between; }
  .review-actions { display: flex; gap: 8px; }
  .btn-danger-modal {
    padding: 7px 14px; font-size: 13px; font-weight: 500;
    background: var(--canvas); color: #c50000;
    border: 1px solid #f7d4d6; border-radius: var(--r-md);
    cursor: pointer; font-family: var(--font-sans); transition: background 100ms ease;
  }
  .btn-danger-modal:hover { background: #fff0f0; }
  .btn-danger-confirm {
    background: #c50000; color: #fff; border-color: #c50000;
  }
  .btn-danger-confirm:hover { background: #a80000; }
  .btn-danger-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
