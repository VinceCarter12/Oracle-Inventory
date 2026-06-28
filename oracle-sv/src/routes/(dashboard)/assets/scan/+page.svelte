<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';

  // ── Permission gate ──────────────────────────────────────────────────────────
  const can = (key: string) => authStore.hasPermission(key);

  // ── Mode ─────────────────────────────────────────────────────────────────────
  let mode = $state<'camera' | 'upload' | 'phone'>('camera');

  // ── Camera state ─────────────────────────────────────────────────────────────
  let videoEl    = $state<HTMLVideoElement | null>(null);
  let canvasEl   = $state<HTMLCanvasElement | null>(null);
  let stream     = $state<MediaStream | null>(null);
  let cameraError  = $state('');
  let cameraReady  = $state(false);

  // ── Capture / preview state ───────────────────────────────────────────────────
  let capturedImg  = $state('');
  let previewMode  = $state(false);

  // ── Crop / ROI state ──────────────────────────────────────────────────────────
  interface Roi { x: number; y: number; w: number; h: number; }
  let cropContainerEl = $state<HTMLDivElement | null>(null);
  let cropImgEl       = $state<HTMLImageElement | null>(null);
  let roi = $state<Roi>({ x: 0, y: 0, w: 0, h: 0 });
  type HandleType = 'move' | 'tl' | 'tr' | 'bl' | 'br' | null;
  let dragType  = $state<HandleType>(null);
  let dragStart = $state({ mouseX: 0, mouseY: 0, roiX: 0, roiY: 0, roiW: 0, roiH: 0 });

  // ── Barcode toggle ────────────────────────────────────────────────────────────
  let barcodeEnabled = $state(false);

  // ── OCR state ─────────────────────────────────────────────────────────────────
  let scanning    = $state(false);
  let scanError   = $state('');
  let scanWarning = $state('');
  let scanned     = $state(false);
  let extraOpen   = $state(false);

  // ── Parsed fields ─────────────────────────────────────────────────────────────
  let assetName    = $state('');
  let brand        = $state('');
  let model        = $state('');
  let serialNumber = $state('');
  let imei1        = $state('');
  let imei2        = $state('');
  let macAddress   = $state('');
  let serviceTag   = $state('');
  let assetTag     = $state('');
  let deviceType   = $state('');
  let extraLines   = $state<string[]>([]);

  // ── Duplicate detection ───────────────────────────────────────────────────────
  interface DupAsset { id: string; name: string; serialNumber?: string; branch?: { name: string }; }
  let duplicates   = $state<DupAsset[]>([]);
  let checkingDups = $state(false);

  // ── Save state ────────────────────────────────────────────────────────────────
  interface Category { id: string; name: string; }
  interface Branch   { id: string; name: string; }
  let categories = $state<Category[]>([]);
  let branches   = $state<Branch[]>([]);
  let categoryId = $state('');
  let branchId   = $state('');
  let saving     = $state(false);
  let saveError  = $state('');

  // ── Phone (QR Room) state ─────────────────────────────────────────────────────
  interface RoomDevice {
    deviceId:    string;
    deviceToken: string;
    deviceLabel: string;
    status:      string;
    qrDataUrl?:  string;
  }
  interface ScanResultItem {
    id:          string;
    deviceLabel: string;
    parsedData:  Record<string, string>;
    status:      string;
    rejectReason?: string;
    assetId?:    string;
    scannedAt:   string;
  }

  let roomId        = $state('');
  let roomCode      = $state('');
  let roomExpiresAt = $state<Date | null>(null);
  let roomStatus    = $state('');
  let roomDevices   = $state<RoomDevice[]>([]);
  let roomResults   = $state<ScanResultItem[]>([]);
  let roomLoading   = $state(false);
  let roomError     = $state('');
  let roomExpired   = $state(false);
  let batchSaving   = $state(false);
  let batchError    = $state('');
  let batchDone     = $state(0);
  let selectedResults = $state<Set<string>>(new Set());
  let pollInterval  = $state<ReturnType<typeof setInterval> | null>(null);
  let phoneCategoryId = $state('');
  let phoneBranchId   = $state('');

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  function getEventPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }

  // ── Camera lifecycle ──────────────────────────────────────────────────────────
  async function startCamera() {
    cameraError = ''; cameraReady = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoEl) { videoEl.srcObject = stream; await videoEl.play(); }
    } catch (e: unknown) { cameraError = e instanceof Error ? e.message : 'Camera unavailable'; }
  }

  function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; cameraReady = false; }
  function onVideoMetadata() { cameraReady = true; }

  onMount(async () => {
    [categories, branches] = await Promise.all([
      api.get<Category[]>('/api/categories').catch(() => []),
      api.get<Branch[]>('/api/branches').catch(() => []),
    ]);

    // Auto-detect desktop → suggest phone mode
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!isMobile) {
      mode = 'phone';
      await createRoom();
    } else {
      await startCamera();
    }

    window.addEventListener('mousemove', onGlobalMove as EventListener);
    window.addEventListener('mouseup',   onGlobalUp   as EventListener);
    window.addEventListener('touchmove', onGlobalMove as EventListener, { passive: false });
    window.addEventListener('touchend',  onGlobalUp   as EventListener);
  });

  onDestroy(() => {
    stopCamera();
    stopPolling();
    window.removeEventListener('mousemove', onGlobalMove as EventListener);
    window.removeEventListener('mouseup',   onGlobalUp   as EventListener);
    window.removeEventListener('touchmove', onGlobalMove as EventListener);
    window.removeEventListener('touchend',  onGlobalUp   as EventListener);
  });

  async function switchMode(m: 'camera' | 'upload' | 'phone') {
    if (m === mode) return;
    stopCamera();
    stopPolling();
    mode = m;
    scanned = false; previewMode = false; capturedImg = ''; scanError = '';
    if (m === 'camera') await startCamera();
    if (m === 'phone') await createRoom();
  }

  // ── Camera capture ────────────────────────────────────────────────────────────
  async function capture() {
    if (!videoEl || !canvasEl) return;
    scanError = '';
    let w = videoEl.videoWidth, h = videoEl.videoHeight, retries = 0;
    while ((w === 0 || h === 0) && retries < 3) { await sleep(150); w = videoEl.videoWidth; h = videoEl.videoHeight; retries++; }
    if (w === 0 || h === 0) { scanError = 'Camera not ready — please wait and try again.'; return; }
    canvasEl.width = w; canvasEl.height = h;
    canvasEl.getContext('2d')!.drawImage(videoEl, 0, 0);
    capturedImg = canvasEl.toDataURL('image/jpeg');
    stopCamera(); previewMode = true;
  }

  function handleFileUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { capturedImg = reader.result as string; previewMode = true; };
    reader.readAsDataURL(file);
    input.value = '';
  }

  // ── ROI ───────────────────────────────────────────────────────────────────────
  function initRoi() {
    if (!cropContainerEl) return;
    const cw = cropContainerEl.clientWidth, ch = cropContainerEl.clientHeight;
    const rw = Math.round(cw * 0.68), rh = Math.round(ch * 0.68);
    roi = { x: Math.round((cw - rw) / 2), y: Math.round((ch - rh) / 2), w: rw, h: rh };
  }

  function startMoveDrag(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    const { x, y } = getEventPos(e);
    dragType = 'move';
    dragStart = { mouseX: x, mouseY: y, roiX: roi.x, roiY: roi.y, roiW: roi.w, roiH: roi.h };
  }
  function startResizeDrag(e: MouseEvent | TouchEvent, handle: 'tl' | 'tr' | 'bl' | 'br') {
    if ('stopPropagation' in e) e.stopPropagation();
    e.preventDefault();
    const { x, y } = getEventPos(e);
    dragType = handle;
    dragStart = { mouseX: x, mouseY: y, roiX: roi.x, roiY: roi.y, roiW: roi.w, roiH: roi.h };
  }
  function onGlobalMove(e: MouseEvent | TouchEvent) {
    if (!dragType || !cropContainerEl) return;
    if ('cancelable' in e && e.cancelable) e.preventDefault();
    const { x, y } = getEventPos(e);
    const dx = x - dragStart.mouseX, dy = y - dragStart.mouseY;
    const cw = cropContainerEl.clientWidth, ch = cropContainerEl.clientHeight;
    const MIN = 60;
    let { x: rx, y: ry, w: rw, h: rh } = { x: dragStart.roiX, y: dragStart.roiY, w: dragStart.roiW, h: dragStart.roiH };
    if (dragType === 'move') { rx = Math.max(0, Math.min(cw - rw, rx + dx)); ry = Math.max(0, Math.min(ch - rh, ry + dy)); }
    else if (dragType === 'tl') { const nx = Math.max(0, Math.min(rx + rw - MIN, rx + dx)); const ny = Math.max(0, Math.min(ry + rh - MIN, ry + dy)); rw = rw + rx - nx; rh = rh + ry - ny; rx = nx; ry = ny; }
    else if (dragType === 'tr') { const ny = Math.max(0, Math.min(ry + rh - MIN, ry + dy)); rh = rh + ry - ny; ry = ny; rw = Math.max(MIN, Math.min(cw - rx, rw + dx)); }
    else if (dragType === 'bl') { const nx = Math.max(0, Math.min(rx + rw - MIN, rx + dx)); rw = rw + rx - nx; rx = nx; rh = Math.max(MIN, Math.min(ch - ry, rh + dy)); }
    else if (dragType === 'br') { rw = Math.max(MIN, Math.min(cw - rx, rw + dx)); rh = Math.max(MIN, Math.min(ch - ry, rh + dy)); }
    roi = { x: rx, y: ry, w: rw, h: rh };
  }
  function onGlobalUp() { dragType = null; }

  // ── Barcode ───────────────────────────────────────────────────────────────────
  async function tryBarcode(canvas: HTMLCanvasElement): Promise<{ serial?: string; assetTag?: string } | null> {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      // @ts-expect-error decodeFromCanvas present at runtime
      const result = await reader.decodeFromCanvas(canvas);
      const text: string = result.getText();
      if (/^\d{15}$/.test(text)) return { serial: text };
      if (/^[A-Z0-9\-]{5,20}$/i.test(text)) return { serial: text };
    } catch { /* no barcode */ }
    return null;
  }

  // ── Scan ROI ──────────────────────────────────────────────────────────────────
  async function scanRoi() {
    if (!capturedImg) return;
    let blob: Blob;
    if (cropImgEl && cropContainerEl && roi.w > 0 && roi.h > 0) {
      const displayW = cropContainerEl.clientWidth, displayH = cropContainerEl.clientHeight;
      const natW = cropImgEl.naturalWidth || displayW, natH = cropImgEl.naturalHeight || displayH;
      const sx = Math.max(0, Math.round(roi.x * natW / displayW));
      const sy = Math.max(0, Math.round(roi.y * natH / displayH));
      const sw = Math.min(natW - sx, Math.round(roi.w * natW / displayW));
      const sh = Math.min(natH - sy, Math.round(roi.h * natH / displayH));
      if (sw > 0 && sh > 0) {
        const off = document.createElement('canvas');
        off.width = sw; off.height = sh;
        off.getContext('2d')!.drawImage(cropImgEl, sx, sy, sw, sh, 0, 0, sw, sh);
        if (barcodeEnabled) { const bc = await tryBarcode(off); if (bc?.serial) serialNumber = bc.serial; if (bc?.assetTag) assetTag = bc.assetTag; }
        blob = await new Promise<Blob>((res, rej) => off.toBlob(b => b ? res(b) : rej(new Error('Canvas empty')), 'image/jpeg', 0.92));
      } else { blob = await (await fetch(capturedImg)).blob(); }
    } else { blob = await (await fetch(capturedImg)).blob(); }
    previewMode = false;
    await runOcr(blob, 'image/jpeg');
  }

  // ── OCR ───────────────────────────────────────────────────────────────────────
  async function runOcr(blob: Blob, _mime: string) {
    scanning = true; scanError = ''; scanWarning = ''; scanned = false;
    try {
      const form = new FormData();
      form.append('image', blob, 'capture.jpg');
      const raw = await fetch('/api/scan/ocr', { method: 'POST', body: form, headers: { Authorization: `Bearer ${authStore.token}` } });
      if (!raw.ok) { const err = await raw.json().catch(() => ({ error: 'OCR failed' })); throw new Error(err.error ?? 'OCR failed'); }
      const data = await raw.json();
      const p = data.parsed;
      assetName = p.assetName ?? ''; brand = p.brand ?? ''; model = p.model ?? '';
      serialNumber = serialNumber || (p.serialNumber ?? ''); imei1 = p.imei1 ?? ''; imei2 = p.imei2 ?? '';
      macAddress = p.macAddress ?? ''; serviceTag = p.serviceTag ?? '';
      assetTag = assetTag || (p.assetTag ?? ''); deviceType = p.deviceType ?? ''; extraLines = p.extraLines ?? [];
      if (p.categoryHint && !categoryId) {
        const hint = (p.categoryHint as string).toLowerCase();
        const match = categories.find(c => c.name.toLowerCase() === hint);
        if (match) categoryId = match.id;
      }
      if (p.scanReason) scanWarning = p.scanReason;
      scanned = true;
      await checkDuplicates();
    } catch (err: unknown) {
      scanError = err instanceof Error ? err.message : 'OCR failed';
      previewMode = false;
    } finally { scanning = false; }
  }

  async function checkDuplicates() {
    const params = new URLSearchParams();
    if (serialNumber) params.set('serialNumber', serialNumber);
    if (imei1)        params.set('imei1', imei1);
    if (imei2)        params.set('imei2', imei2);
    if (macAddress)   params.set('macAddress', macAddress);
    if (serviceTag)   params.set('serviceTag', serviceTag);
    if (assetTag)     params.set('assetTag', assetTag);
    if (!params.toString()) return;
    checkingDups = true;
    try { const res = await api.get<{ duplicates: DupAsset[] }>(`/api/scan/check-duplicate?${params}`); duplicates = res.duplicates ?? []; }
    catch { duplicates = []; } finally { checkingDups = false; }
  }

  function buildNotes(): string {
    const parts: string[] = [];
    if (imei1) parts.push(`IMEI 1: ${imei1}`);
    if (imei2) parts.push(`IMEI 2: ${imei2}`);
    if (macAddress) parts.push(`MAC: ${macAddress}`);
    if (serviceTag) parts.push(`Service Tag: ${serviceTag}`);
    if (assetTag)   parts.push(`Asset Tag: ${assetTag}`);
    if (deviceType && deviceType !== 'unknown') parts.push(`Device Type: ${deviceType}`);
    return parts.join('\n');
  }

  async function saveAsset() {
    if (!assetName.trim()) { saveError = 'Asset name is required.'; return; }
    saving = true; saveError = '';
    try {
      const created = await api.post<{ id: string }>('/api/assets', {
        name: assetName.trim(), serialNumber: serialNumber || null, categoryId: categoryId || null,
        branchId: branchId || null, condition: 'usable', ownership: 'company',
        description: model ? `${brand} ${model}`.trim() : brand || null,
        internalNotes: buildNotes() || null,
      });
      goto(`/assets/${created.id}`);
    } catch (err: unknown) { saveError = err instanceof Error ? err.message : 'Failed to save asset'; }
    finally { saving = false; }
  }

  function rescan() {
    scanned = false; previewMode = false; capturedImg = ''; scanError = ''; scanWarning = ''; duplicates = [];
    assetName = brand = model = serialNumber = ''; imei1 = imei2 = macAddress = serviceTag = assetTag = deviceType = '';
    extraLines = []; roi = { x: 0, y: 0, w: 0, h: 0 };
    if (mode === 'camera') startCamera();
  }

  // ── Phone / QR Room ───────────────────────────────────────────────────────────
  async function createRoom() {
    roomLoading = true; roomError = ''; roomExpired = false;
    roomId = ''; roomCode = ''; roomDevices = []; roomResults = [];
    try {
      const data = await api.post<{
        roomId: string; roomCode: string; expiresAt: string;
        devices: { deviceId: string; deviceToken: string; deviceLabel: string; status: string }[];
      }>('/api/scan/room', { maxDevices: 5 });

      roomId        = data.roomId;
      roomCode      = data.roomCode;
      roomExpiresAt = new Date(data.expiresAt);
      roomStatus    = 'open';

      // Generate QR data URLs client-side (dynamic import keeps SSR safe)
      const QRCode = (await import('qrcode')).default;
      const origin  = window.location.origin;
      roomDevices   = await Promise.all(
        data.devices.map(async d => ({
          ...d,
          qrDataUrl: await QRCode.toDataURL(`${origin}/scan/mobile?device=${d.deviceToken}`, {
            width: 200, margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          }),
        }))
      );

      startPolling();
    } catch (err: unknown) {
      roomError = err instanceof Error ? err.message : 'Failed to create scan room';
    } finally { roomLoading = false; }
  }

  function startPolling() {
    stopPolling();
    pollInterval = setInterval(pollRoom, 1500);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  async function pollRoom() {
    if (!roomId) return;
    try {
      const data = await api.get<{
        status: string; expiresAt: string;
        devices: { deviceId: string; deviceLabel: string; status: string; lastSeenAt?: string }[];
        results: ScanResultItem[];
      }>(`/api/scan/room/${roomId}`);

      roomStatus = data.status;
      roomExpiresAt = new Date(data.expiresAt);

      // Merge device statuses
      roomDevices = roomDevices.map(d => {
        const live = data.devices.find(ld => ld.deviceId === d.deviceId);
        return live ? { ...d, status: live.status } : d;
      });

      roomResults = data.results;

      if (data.status === 'expired') { roomExpired = true; stopPolling(); }
    } catch { /* swallow poll errors */ }
  }

  async function closeRoom() {
    stopPolling();
    if (roomId) await api.delete(`/api/scan/room/${roomId}`).catch(() => {});
    roomId = ''; roomCode = ''; roomDevices = []; roomResults = []; roomStatus = '';
  }

  async function refreshRoom() {
    await closeRoom();
    await createRoom();
  }

  function toggleSelect(id: string) {
    const s = new Set(selectedResults);
    s.has(id) ? s.delete(id) : s.add(id);
    selectedResults = s;
  }

  function selectAllPending() {
    selectedResults = new Set(roomResults.filter(r => r.status === 'pending').map(r => r.id));
  }

  function clearSelection() { selectedResults = new Set(); }

  async function batchCreate(ids: string[]) {
    if (!ids.length) return;
    batchSaving = true; batchError = ''; batchDone = 0;
    try {
      const res = await api.post<{ created: number; failed: { id: string; reason: string }[] }>(
        `/api/scan/room/${roomId}/batch-create`,
        { resultIds: ids, categoryId: phoneCategoryId || undefined, branchId: phoneBranchId || undefined }
      );
      batchDone = res.created;
      selectedResults = new Set();
      await pollRoom();
    } catch (err: unknown) {
      batchError = err instanceof Error ? err.message : 'Batch create failed';
    } finally { batchSaving = false; }
  }

  function exportCsv() {
    const pending = roomResults.filter(r => r.status === 'pending');
    if (!pending.length) return;
    const header = ['#', 'Asset Name', 'Brand', 'Model', 'Serial Number', 'IMEI 1', 'MAC', 'Category Hint', 'Scanned By', 'Scanned At'];
    const rows = pending.map((r, i) => {
      const p = r.parsedData;
      return [
        i + 1, p.assetName || '', p.brand || '', p.model || '',
        p.serialNumber || '', p.imei1 || '', p.macAddress || '',
        p.categoryHint || '', r.deviceLabel,
        new Date(r.scannedAt).toLocaleString(),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `scan-${roomCode}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const pendingResults  = $derived(roomResults.filter(r => r.status === 'pending'));
  const acceptedResults = $derived(roomResults.filter(r => r.status === 'accepted'));
  const deviceStatusColor = (s: string) => s === 'connected' ? '#22c55e' : s === 'scanning' ? '#f59e0b' : '#94a3b8';
  const deviceStatusLabel = (s: string) => ({ waiting: 'Waiting', connected: 'Connected', scanning: 'Scanning…', done: 'Done' }[s] ?? s);
</script>

<div class="page">
  <!-- Header -->
  <div class="page-head">
    <div class="head-left">
      <button class="back-btn" onclick={() => goto('/assets')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div>
        <h1 class="page-title">Scan Asset</h1>
        <p class="page-sub">Capture a label or About screen to auto-fill asset details</p>
      </div>
    </div>
  </div>

  {#if !can('scan_assets')}
    <div class="perm-denied">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <p>You don't have permission to use the scanner.</p>
    </div>

  {:else}
    <!-- Mode toggle -->
    <div class="mode-toggle">
      <button class="mode-btn" class:active={mode === 'camera'} onclick={() => switchMode('camera')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Camera
      </button>
      <button class="mode-btn" class:active={mode === 'upload'} onclick={() => switchMode('upload')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload
      </button>
      <button class="mode-btn phone-mode-btn" class:active={mode === 'phone'} onclick={() => switchMode('phone')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        Use Phone
        {#if pendingResults.length > 0 && mode === 'phone'}
          <span class="mode-badge">{pendingResults.length}</span>
        {/if}
      </button>
    </div>

    <!-- ── PHONE MODE ──────────────────────────────────────────────────── -->
    {#if mode === 'phone'}
      {#if roomLoading}
        <div class="room-loading">
          <span class="spin-dark"></span> Creating scan room…
        </div>
      {:else if roomError}
        <div class="room-error-card">
          <p>{roomError}</p>
          <button class="btn-secondary" onclick={createRoom}>Retry</button>
        </div>
      {:else if roomExpired}
        <div class="room-expired-card">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p>Scan session expired (30 min limit).</p>
          <button class="btn-primary" onclick={refreshRoom}>Start New Session</button>
        </div>
      {:else}
        <div class="phone-layout">

          <!-- LEFT: QR codes + device statuses -->
          <div class="phone-left">
            <div class="qr-header">
              <div>
                <h2 class="section-title">Scan with your phone</h2>
                <p class="section-sub">Up to 5 phones can scan simultaneously</p>
              </div>
              <div class="room-meta">
                <span class="room-code-badge">Room: {roomCode}</span>
                {#if roomExpiresAt}
                  <span class="expire-hint">Expires {roomExpiresAt.toLocaleTimeString()}</span>
                {/if}
              </div>
            </div>

            <!-- Device grid -->
            <div class="device-grid">
              {#each roomDevices as device}
                <div class="device-card" class:device-active={device.status === 'connected' || device.status === 'scanning'}>
                  <div class="device-header">
                    <span class="device-label">{device.deviceLabel}</span>
                    <span class="device-status-dot" style:background={deviceStatusColor(device.status)}></span>
                    <span class="device-status-txt">{deviceStatusLabel(device.status)}</span>
                  </div>
                  {#if device.qrDataUrl}
                    <div class="qr-wrap">
                      <img src={device.qrDataUrl} alt="QR for {device.deviceLabel}" class="qr-img" />
                    </div>
                  {:else}
                    <div class="qr-placeholder"><span class="spin-dark"></span></div>
                  {/if}
                  <p class="qr-hint">Scan with {device.deviceLabel} to connect</p>
                </div>
              {/each}
            </div>

            <!-- Batch options -->
            {#if pendingResults.length > 0}
              <div class="batch-options">
                <h3 class="batch-title">Save Options</h3>
                <div class="fields-row">
                  <div class="field-group">
                    <label class="field-label">Category (optional)</label>
                    <select class="field-select" bind:value={phoneCategoryId}>
                      <option value="">— All categories —</option>
                      {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
                    </select>
                  </div>
                  <div class="field-group">
                    <label class="field-label">Branch (optional)</label>
                    <select class="field-select" bind:value={phoneBranchId}>
                      <option value="">— All branches —</option>
                      {#each branches as b}<option value={b.id}>{b.name}</option>{/each}
                    </select>
                  </div>
                </div>
              </div>
            {/if}

            <button class="btn-ghost refresh-btn" onclick={refreshRoom}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              New Session
            </button>
          </div>

          <!-- RIGHT: Live results table -->
          <div class="phone-right">
            <div class="results-header">
              <div>
                <h2 class="section-title">
                  Scan Results
                  {#if roomResults.length > 0}<span class="result-count-badge">{roomResults.length}</span>{/if}
                </h2>
                <p class="section-sub">
                  {#if pendingResults.length > 0}
                    {pendingResults.length} pending · {acceptedResults.length} saved
                  {:else if roomResults.length === 0}
                    Scans from your phones will appear here in real time
                  {:else}
                    All {roomResults.length} items saved
                  {/if}
                </p>
              </div>
              {#if pendingResults.length > 0}
                <div class="results-actions">
                  <button class="btn-secondary-sm" onclick={exportCsv}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    CSV
                  </button>
                  <button class="btn-primary-sm" onclick={selectAllPending} disabled={batchSaving}>
                    Select All
                  </button>
                  {#if selectedResults.size > 0}
                    <button class="btn-primary-sm green" onclick={() => batchCreate([...selectedResults])} disabled={batchSaving}>
                      {#if batchSaving}<span class="spin-sm"></span>{/if}
                      Save {selectedResults.size} Selected
                    </button>
                    <button class="btn-ghost-sm" onclick={clearSelection}>Clear</button>
                  {:else}
                    <button class="btn-primary-sm green" onclick={() => batchCreate(pendingResults.map(r => r.id))} disabled={batchSaving}>
                      {#if batchSaving}<span class="spin-sm"></span>{/if}
                      Accept All ({pendingResults.length})
                    </button>
                  {/if}
                </div>
              {/if}
            </div>

            {#if batchDone > 0}
              <div class="batch-success">{batchDone} asset{batchDone > 1 ? 's' : ''} created successfully.</div>
            {/if}
            {#if batchError}
              <div class="batch-err">{batchError}</div>
            {/if}

            {#if roomResults.length === 0}
              <!-- Waiting state -->
              <div class="results-empty">
                <div class="pulse-dot"></div>
                <p>Waiting for phone scans…</p>
                <p class="results-empty-hint">Scan the QR code on the left with your phone to start scanning items.</p>
              </div>
            {:else}
              <!-- Results table -->
              <div class="results-table-wrap">
                <table class="results-table">
                  <thead>
                    <tr>
                      <th class="th-check">
                        <input type="checkbox"
                          checked={selectedResults.size > 0 && selectedResults.size === pendingResults.length}
                          onchange={(e) => (e.currentTarget as HTMLInputElement).checked ? selectAllPending() : clearSelection()} />
                      </th>
                      <th>#</th>
                      <th>Asset Name</th>
                      <th>Serial / IMEI</th>
                      <th>Brand · Model</th>
                      <th>Device</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each roomResults as r, i}
                      <tr class="result-row" class:row-accepted={r.status === 'accepted'} class:row-rejected={r.status === 'rejected'}>
                        <td class="td-check">
                          {#if r.status === 'pending'}
                            <input type="checkbox"
                              checked={selectedResults.has(r.id)}
                              onchange={() => toggleSelect(r.id)} />
                          {/if}
                        </td>
                        <td class="td-num">{i + 1}</td>
                        <td class="td-name">{r.parsedData.assetName || '—'}</td>
                        <td class="td-serial mono">{r.parsedData.serialNumber || r.parsedData.imei1 || '—'}</td>
                        <td class="td-model">{[r.parsedData.brand, r.parsedData.model].filter(Boolean).join(' ') || '—'}</td>
                        <td class="td-device">{r.deviceLabel}</td>
                        <td class="td-status">
                          {#if r.status === 'pending'}
                            <span class="status-pill pending">Pending</span>
                          {:else if r.status === 'accepted'}
                            <a href="/assets/{r.assetId}" class="status-pill accepted">Saved</a>
                          {:else}
                            <span class="status-pill rejected" title={r.rejectReason}>Rejected</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>
      {/if}

    <!-- ── CAMERA / UPLOAD MODES ────────────────────────────────────────── -->
    {:else}
      <div class="scan-layout">
        <!-- LEFT: Camera / Preview / Post-scan -->
        <div class="scan-left">
          {#if !previewMode && !scanned}
            {#if mode === 'camera'}
              <div class="camera-wrap">
                {#if cameraError}
                  <div class="cam-error">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    <p>Camera error: {cameraError}</p>
                    <p class="cam-hint">Switch to Upload or Use Phone mode.</p>
                  </div>
                {:else}
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video bind:this={videoEl} class="cam-video" playsinline autoplay muted onloadedmetadata={onVideoMetadata}></video>
                  <div class="cam-overlay">
                    <div class="scan-guide">
                      <span class="guide-corner tl"></span><span class="guide-corner tr"></span>
                      <span class="guide-corner bl"></span><span class="guide-corner br"></span>
                    </div>
                  </div>
                {/if}
                <canvas bind:this={canvasEl} class="hidden-canvas"></canvas>
              </div>
              {#if !cameraError}
                <button class="capture-btn" onclick={capture} disabled={!cameraReady || scanning} title={!cameraReady ? 'Waiting for camera…' : ''}>
                  {#if !cameraReady}<span class="spin"></span> Initialising camera…
                  {:else}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>Capture{/if}
                </button>
              {/if}
            {/if}

            {#if mode === 'upload'}
              <label class="upload-zone">
                <input type="file" accept="image/*" onchange={handleFileUpload} class="hidden-input" />
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Click or drop image here</span>
                <small>JPG, PNG, WEBP — max 10 MB</small>
              </label>
            {/if}

            {#if scanError}<div class="scan-err-banner">{scanError}</div>{/if}

            <div class="tips-card">
              <p class="tips-title">Tips for best results</p>
              <ul class="tips-list">
                <li>Hold the device label flat and in good light</li>
                <li>Fit the serial number / IMEI clearly in frame</li>
                <li>After capture, drag the box to tighten the crop before scanning</li>
                <li>Use Upload if the camera is unavailable</li>
              </ul>
            </div>

          {:else if previewMode}
            <div class="crop-container" bind:this={cropContainerEl}>
              <img src={capturedImg} alt="Captured" class="crop-img" bind:this={cropImgEl} onload={initRoi} />
              {#if roi.w > 0}
                <div class="roi-vignette" style="left:{roi.x}px; top:{roi.y}px; width:{roi.w}px; height:{roi.h}px"></div>
                <div class="roi-box" style="left:{roi.x}px; top:{roi.y}px; width:{roi.w}px; height:{roi.h}px"
                  onmousedown={startMoveDrag} ontouchstart={startMoveDrag} role="region" aria-label="Crop region">
                  <span class="handle tl" onmousedown={(e) => startResizeDrag(e,'tl')} ontouchstart={(e) => startResizeDrag(e,'tl')}></span>
                  <span class="handle tr" onmousedown={(e) => startResizeDrag(e,'tr')} ontouchstart={(e) => startResizeDrag(e,'tr')}></span>
                  <span class="handle bl" onmousedown={(e) => startResizeDrag(e,'bl')} ontouchstart={(e) => startResizeDrag(e,'bl')}></span>
                  <span class="handle br" onmousedown={(e) => startResizeDrag(e,'br')} ontouchstart={(e) => startResizeDrag(e,'br')}></span>
                </div>
              {/if}
            </div>
            <p class="crop-hint">Drag the box to frame the label, drag corners to resize.</p>

          {:else}
            <div class="captured-panel">
              {#if capturedImg}<img src={capturedImg} alt="Captured" class="img-preview" />{/if}
              <div class="captured-actions">
                <p class="captured-label">Image captured</p>
                <button class="rescan-btn" onclick={rescan}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  Scan again
                </button>
              </div>
              {#if checkingDups}
                <div class="dup-card dup-checking"><span class="spin-dark"></span> Checking for duplicates…</div>
              {:else if duplicates.length}
                <div class="dup-card dup-warn">
                  <div class="dup-head"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Potential Duplicate{duplicates.length > 1 ? 's' : ''} Found</div>
                  <div class="dup-list">
                    {#each duplicates as dup}
                      <a href="/assets/{dup.id}" class="dup-item">
                        <span class="dup-name">{dup.name}</span>
                        {#if dup.serialNumber}<span class="dup-sn">SN: {dup.serialNumber}</span>{/if}
                        {#if dup.branch}<span class="dup-branch">{dup.branch.name}</span>{/if}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                      </a>
                    {/each}
                  </div>
                  <p class="dup-note">Review before saving to avoid duplicates.</p>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- RIGHT: Options / Fields form -->
        <div class="scan-right">
          {#if !previewMode && !scanned}
            <div class="idle-panel">
              <div class="idle-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>
              <p class="idle-title">Ready to scan</p>
              <p class="idle-sub">Capture or upload an image of the asset label — then adjust the crop and hit <strong>Scan ROI</strong>.</p>
            </div>
          {:else if previewMode}
            <div class="preview-panel">
              <h2 class="fields-title">Scan Options</h2>
              <label class="barcode-row">
                <div class="barcode-left">
                  <span class="barcode-label">Try barcode first</span>
                  <span class="barcode-hint">Reads Code128 / QR / DataMatrix before OCR.</span>
                </div>
                <div class="toggle-wrap">
                  <input type="checkbox" class="toggle-input" id="barcodeToggle" bind:checked={barcodeEnabled} />
                  <label class="toggle-slider" for="barcodeToggle"></label>
                </div>
              </label>
              <div class="preview-actions">
                {#if scanning}
                  <div class="scanning-msg"><span class="spin-dark"></span> Scanning image…</div>
                {:else}
                  <button class="btn-primary wide" onclick={scanRoi}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Scan ROI
                  </button>
                  <button class="btn-secondary wide" onclick={rescan}>Cancel</button>
                {/if}
              </div>
              <div class="tips-card">
                <p class="tips-title">Cropping tips</p>
                <ul class="tips-list">
                  <li>Drag the box to align with the label sticker</li>
                  <li>Drag corner handles to resize</li>
                  <li>Include S/N, Model, or IMEI in the selection</li>
                </ul>
              </div>
            </div>
          {:else}
            <div class="fields-card">
              <h2 class="fields-title">Extracted Data <span class="fields-sub">Edit before saving</span></h2>
              <div class="field-group"><label class="field-label">Asset Name <span class="required">*</span></label><input class="field-input" bind:value={assetName} placeholder="e.g. Samsung Galaxy A55" /></div>
              <div class="fields-row">
                <div class="field-group"><label class="field-label">Brand</label><input class="field-input" bind:value={brand} placeholder="Samsung" /></div>
                <div class="field-group"><label class="field-label">Model</label><input class="field-input" bind:value={model} placeholder="Galaxy A55" /></div>
              </div>
              <div class="field-group"><label class="field-label">Serial Number</label><input class="field-input mono" bind:value={serialNumber} placeholder="e.g. R58NA0XXXXX" /></div>
              <div class="fields-row">
                <div class="field-group"><label class="field-label">IMEI 1</label><input class="field-input mono" bind:value={imei1} placeholder="15 digits" /></div>
                <div class="field-group"><label class="field-label">IMEI 2</label><input class="field-input mono" bind:value={imei2} placeholder="15 digits" /></div>
              </div>
              <div class="fields-row">
                <div class="field-group"><label class="field-label">MAC Address</label><input class="field-input mono" bind:value={macAddress} placeholder="XX:XX:XX:XX:XX:XX" /></div>
                <div class="field-group"><label class="field-label">Service Tag</label><input class="field-input mono" bind:value={serviceTag} placeholder="Dell service tag" /></div>
              </div>
              <hr class="divider" />
              <div class="fields-row">
                <div class="field-group"><label class="field-label">Category</label><select class="field-select" bind:value={categoryId}><option value="">— Select —</option>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select></div>
                <div class="field-group"><label class="field-label">Branch</label><select class="field-select" bind:value={branchId}><option value="">— Select —</option>{#each branches as b}<option value={b.id}>{b.name}</option>{/each}</select></div>
              </div>
              {#if extraLines.length}
                <details class="extra-lines" open={extraOpen}>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <summary onclick={() => extraOpen = !extraOpen}>Other extracted text ({extraLines.length} lines)</summary>
                  <ul>{#each extraLines as line}<li>{line}</li>{/each}</ul>
                </details>
              {/if}
              {#if scanWarning}<div class="scan-warn-banner">{scanWarning}</div>{/if}
              {#if saveError}<div class="save-err">{saveError}</div>{/if}
              <div class="save-row">
                <button class="btn-secondary" onclick={rescan}>Rescan</button>
                <button class="btn-primary" onclick={saveAsset} disabled={saving || !assetName.trim()}>
                  {#if saving}<span class="spin"></span>{/if} Save as Asset
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 20px; width: 100%; min-width: 0; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; }
  .head-left { display: flex; align-items: flex-start; gap: 12px; }
  .back-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); cursor: pointer; color: var(--mute); flex-shrink: 0; margin-top: 3px; transition: background 120ms; }
  .back-btn:hover { background: var(--canvas-soft-2); }
  .page-title { font-size: 22px; font-weight: 700; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.4px; line-height: 1.2; }
  .page-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); margin-top: 2px; }
  .perm-denied { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 20px; color: var(--mute); text-align: center; }

  /* ── Mode toggle ── */
  .mode-toggle { display: flex; gap: 8px; }
  .mode-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 16px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); cursor: pointer; font-size: 13px; color: var(--mute); font-weight: 500; font-family: var(--font-sans); transition: all 120ms; position: relative; }
  .mode-btn.active { background: var(--ink); color: var(--on-primary); border-color: var(--ink); }
  .mode-btn:not(.active):hover { background: var(--canvas-soft-2); color: var(--body); }
  .phone-mode-btn.active { background: #1d4ed8; border-color: #1d4ed8; }
  .mode-badge { background: #ef4444; color: #fff; border-radius: 10px; padding: 1px 6px; font-size: 10px; font-weight: 700; margin-left: 2px; }

  /* ── Two-column layouts ── */
  .scan-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 20px; align-items: start; }
  .scan-left, .scan-right { display: flex; flex-direction: column; gap: 16px; }
  .phone-layout { display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr); gap: 20px; align-items: start; }
  .phone-left, .phone-right { display: flex; flex-direction: column; gap: 16px; }

  /* ── Room loading / error / expired ── */
  .room-loading { display: flex; align-items: center; gap: 10px; padding: 40px 20px; color: var(--mute); font-size: 14px; font-family: var(--font-sans); }
  .room-error-card, .room-expired-card { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 48px 24px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); text-align: center; color: var(--mute); font-family: var(--font-sans); font-size: 14px; }

  /* ── QR section ── */
  .qr-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .section-title { font-size: 15px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); margin: 0 0 3px; }
  .section-sub { font-size: 12px; color: var(--mute); font-family: var(--font-sans); margin: 0; }
  .room-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .room-code-badge { background: var(--canvas-soft-2); border: 1px solid var(--hairline); border-radius: var(--r-sm); padding: 3px 8px; font-size: 11px; font-weight: 600; color: var(--ink); font-family: var(--font-mono); letter-spacing: .06em; }
  .expire-hint { font-size: 11px; color: var(--mute); font-family: var(--font-sans); }

  .device-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .device-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: border-color 200ms; }
  .device-card.device-active { border-color: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,.1); }
  .device-header { display: flex; align-items: center; gap: 6px; width: 100%; }
  .device-label { font-size: 12px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); flex: 1; }
  .device-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .device-status-txt { font-size: 10px; color: var(--mute); font-family: var(--font-sans); }
  .qr-wrap { width: 100%; aspect-ratio: 1; background: #fff; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .qr-img { width: 100%; height: 100%; object-fit: contain; }
  .qr-placeholder { width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: var(--canvas-soft); border-radius: var(--r-sm); }
  .qr-hint { font-size: 10px; color: var(--mute); font-family: var(--font-sans); text-align: center; line-height: 1.4; }
  .refresh-btn { align-self: flex-start; display: flex; align-items: center; gap: 6px; color: var(--mute); font-size: 12px; font-family: var(--font-sans); }

  /* ── Batch options ── */
  .batch-options { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .batch-title { font-size: 12px; font-weight: 600; color: var(--body); font-family: var(--font-sans); text-transform: uppercase; letter-spacing: .05em; margin: 0; }

  /* ── Results panel ── */
  .results-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .result-count-badge { display: inline-flex; align-items: center; justify-content: center; background: var(--ink); color: var(--on-primary); border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 700; margin-left: 6px; vertical-align: middle; }
  .results-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  .batch-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: var(--r-md); padding: 10px 14px; font-size: 13px; font-family: var(--font-sans); }
  .batch-err { background: var(--error-soft); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); color: var(--error); border-radius: var(--r-md); padding: 10px 14px; font-size: 13px; font-family: var(--font-sans); }

  .results-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 24px; background: var(--canvas); border: 1px dashed var(--hairline); border-radius: var(--r-lg); text-align: center; color: var(--mute); font-family: var(--font-sans); font-size: 14px; }
  .results-empty-hint { font-size: 12px; color: var(--mute); max-width: 260px; line-height: 1.6; }
  .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: #22c55e; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(1.4); } }

  /* ── Results table ── */
  .results-table-wrap { overflow-x: auto; border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .results-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 13px; }
  .results-table thead { background: var(--canvas-soft); }
  .results-table th { padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--mute); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; border-bottom: 1px solid var(--hairline); }
  .th-check { width: 36px; }
  .results-table tbody tr { border-bottom: 1px solid var(--hairline); transition: background 100ms; }
  .results-table tbody tr:last-child { border-bottom: none; }
  .results-table tbody tr:hover { background: var(--canvas-soft); }
  .result-row td { padding: 10px 12px; color: var(--body); vertical-align: middle; }
  .row-accepted { opacity: .65; }
  .row-rejected { opacity: .5; }
  .td-check { width: 36px; }
  .td-num { color: var(--mute); font-size: 12px; width: 32px; }
  .td-name { font-weight: 500; color: var(--ink); }
  .td-serial { font-family: var(--font-mono); font-size: 12px; color: var(--body); }
  .td-model { color: var(--mute); }
  .td-device { font-size: 12px; color: var(--mute); }
  .td-status { white-space: nowrap; }
  .status-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; text-decoration: none; }
  .status-pill.pending  { background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; }
  .status-pill.accepted { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .status-pill.rejected { background: var(--error-soft); color: var(--error); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); }

  /* ── Camera ── */
  .camera-wrap { position: relative; width: 100%; aspect-ratio: 4/3; background: oklch(12% 0 0); border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--shadow-l2); }
  .cam-video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cam-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .scan-guide { position: relative; width: 68%; aspect-ratio: 4/3; }
  .guide-corner { position: absolute; width: 22px; height: 22px; border-color: rgba(255,255,255,.9); border-style: solid; }
  .guide-corner.tl { top: 0; left: 0; border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
  .guide-corner.tr { top: 0; right: 0; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
  .guide-corner.bl { bottom: 0; left: 0; border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
  .guide-corner.br { bottom: 0; right: 0; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }
  .cam-error { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 24px; text-align: center; color: rgba(255,255,255,.8); gap: 10px; font-size: 13.5px; }
  .cam-hint { font-size: 12px; opacity: .6; }
  .hidden-canvas { display: none; }
  .capture-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-size: 14px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; transition: opacity 120ms; }
  .capture-btn:hover:not(:disabled) { opacity: .85; }
  .capture-btn:disabled { opacity: .5; cursor: not-allowed; }

  /* ── Upload ── */
  .upload-zone { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 52px 24px; border: 2px dashed var(--hairline); border-radius: var(--r-lg); cursor: pointer; color: var(--mute); text-align: center; transition: border-color 150ms, color 150ms; }
  .upload-zone:hover { border-color: var(--ink); color: var(--ink); }
  .upload-zone span { font-size: 14px; font-weight: 500; font-family: var(--font-sans); }
  .upload-zone small { font-size: 12px; opacity: .6; }
  .hidden-input { display: none; }
  .scan-err-banner { background: var(--error-soft); color: var(--error); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); border-radius: var(--r-md); padding: 11px 14px; font-size: 13px; font-family: var(--font-sans); }

  /* ── Tips ── */
  .tips-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 16px 18px; box-shadow: var(--shadow-l1); }
  .tips-title { font-size: 12px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 10px; }
  .tips-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .tips-list li { font-size: 13px; color: var(--body); font-family: var(--font-sans); padding-left: 16px; position: relative; }
  .tips-list li::before { content: '·'; position: absolute; left: 4px; color: var(--mute); }

  /* ── Crop ── */
  .crop-container { position: relative; width: 100%; overflow: hidden; border-radius: var(--r-lg); border: 1px solid var(--hairline); box-shadow: var(--shadow-l2); user-select: none; touch-action: none; }
  .crop-img { display: block; width: 100%; height: auto; }
  .roi-vignette { position: absolute; pointer-events: none; box-shadow: 0 0 0 9999px rgba(0,0,0,.45); border-radius: 2px; }
  .roi-box { position: absolute; border: 2px solid #fff; border-radius: 3px; cursor: move; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
  .handle { position: absolute; width: 14px; height: 14px; background: #fff; border: 1.5px solid rgba(0,0,0,.35); border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
  .handle.tl { top: -7px; left: -7px; cursor: nwse-resize; }
  .handle.tr { top: -7px; right: -7px; cursor: nesw-resize; }
  .handle.bl { bottom: -7px; left: -7px; cursor: nesw-resize; }
  .handle.br { bottom: -7px; right: -7px; cursor: nwse-resize; }
  .crop-hint { font-size: 12px; color: var(--mute); font-family: var(--font-sans); text-align: center; }

  /* ── Preview panel ── */
  .preview-panel { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 20px; box-shadow: var(--shadow-l1); display: flex; flex-direction: column; gap: 18px; }
  .barcode-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); }
  .barcode-left { display: flex; flex-direction: column; gap: 4px; }
  .barcode-label { font-size: 13.5px; font-weight: 500; color: var(--ink); font-family: var(--font-sans); }
  .barcode-hint { font-size: 12px; color: var(--mute); font-family: var(--font-sans); line-height: 1.5; }
  .toggle-wrap { position: relative; flex-shrink: 0; }
  .toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle-slider { display: block; width: 42px; height: 24px; border-radius: 12px; background: var(--hairline-strong); cursor: pointer; transition: background 200ms; position: relative; }
  .toggle-slider::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform 200ms; }
  .toggle-input:checked + .toggle-slider { background: var(--link); }
  .toggle-input:checked + .toggle-slider::after { transform: translateX(18px); }
  .preview-actions { display: flex; flex-direction: column; gap: 8px; }
  .scanning-msg { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--mute); font-family: var(--font-sans); padding: 10px 0; }

  /* ── Captured panel ── */
  .captured-panel { display: flex; flex-direction: column; gap: 14px; }
  .img-preview { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--r-lg); border: 1px solid var(--hairline); box-shadow: var(--shadow-l2); }
  .captured-actions { display: flex; align-items: center; justify-content: space-between; }
  .captured-label { font-size: 13px; color: var(--mute); font-family: var(--font-sans); }
  .rescan-btn { display: flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas); cursor: pointer; font-size: 13px; color: var(--body); font-family: var(--font-sans); transition: background 120ms; }
  .rescan-btn:hover { background: var(--canvas-soft-2); }

  /* ── Duplicate warnings ── */
  .dup-card { border-radius: var(--r-md); padding: 12px 14px; font-family: var(--font-sans); }
  .dup-checking { background: var(--canvas-soft); border: 1px solid var(--hairline); color: var(--mute); font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .dup-warn { background: #fffbeb; border: 1px solid #fcd34d; }
  .dup-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; color: #92400e; margin-bottom: 10px; }
  .dup-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .dup-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: #fff; border-radius: var(--r-sm); border: 1px solid #fde68a; text-decoration: none; color: inherit; }
  .dup-item:hover { background: #fef9c3; }
  .dup-item svg { margin-left: auto; color: #92400e; flex-shrink: 0; }
  .dup-name { font-weight: 500; font-size: 13px; flex: 1; }
  .dup-sn, .dup-branch { font-size: 11px; color: #78716c; background: #fef3c7; padding: 2px 6px; border-radius: var(--r-xs); white-space: nowrap; }
  .dup-note { font-size: 11px; color: #92400e; margin: 0; }

  /* ── Idle ── */
  .idle-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 60px 32px; background: var(--canvas); border: 1px dashed var(--hairline); border-radius: var(--r-lg); text-align: center; min-height: 320px; }
  .idle-icon { color: var(--hairline-strong); }
  .idle-title { font-size: 16px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); }
  .idle-sub { font-size: 13px; color: var(--mute); font-family: var(--font-sans); max-width: 280px; line-height: 1.6; }

  /* ── Fields card ── */
  .fields-card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 20px; box-shadow: var(--shadow-l1); }
  .fields-title { font-size: 15px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); margin: 0 0 16px; }
  .fields-sub { font-size: 12px; color: var(--mute); font-weight: 400; margin-left: 8px; }
  .field-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 13px; }
  .field-label { font-size: 12px; font-weight: 500; color: var(--body); font-family: var(--font-sans); }
  .required { color: var(--error); }
  .field-input, .field-select { padding: 8px 11px; border: 1px solid var(--hairline); border-radius: var(--r-md); background: var(--canvas-soft-2); color: var(--ink); font-size: 13.5px; font-family: var(--font-sans); outline: none; width: 100%; transition: border-color 120ms, box-shadow 120ms; }
  .field-input:focus, .field-select:focus { border-color: var(--link); background: var(--canvas); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .field-input.mono { font-family: var(--font-mono); font-size: 12.5px; letter-spacing: .03em; }
  .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .divider { border: none; border-top: 1px solid var(--hairline); margin: 14px 0; }
  .extra-lines { margin-bottom: 13px; font-size: 12px; color: var(--mute); font-family: var(--font-sans); }
  .extra-lines summary { cursor: pointer; color: var(--mute); }
  .extra-lines ul { margin: 8px 0 0 16px; padding: 0; list-style: disc; }
  .extra-lines li { margin-bottom: 2px; font-family: var(--font-mono); font-size: 12px; }
  .scan-warn-banner { background: #fffbeb; color: #92400e; border: 1px solid #fcd34d; border-radius: var(--r-md); padding: 9px 13px; font-size: 13px; margin-bottom: 12px; font-family: var(--font-sans); }
  .save-err { background: var(--error-soft); color: var(--error); border: 1px solid color-mix(in oklch, var(--error) 30%, transparent); border-radius: var(--r-md); padding: 9px 13px; font-size: 13px; margin-bottom: 12px; font-family: var(--font-sans); }
  .save-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }

  /* ── Buttons ── */
  .btn-primary { padding: 9px 20px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-weight: 600; font-size: 13.5px; font-family: var(--font-sans); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 120ms; }
  .btn-primary:hover:not(:disabled) { opacity: .85; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-secondary { padding: 9px 16px; border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); border-radius: var(--r-md); font-size: 13.5px; font-family: var(--font-sans); cursor: pointer; transition: background 120ms; }
  .btn-secondary:hover { background: var(--canvas-soft-2); }
  .wide { width: 100%; }
  .btn-primary-sm { padding: 6px 12px; background: var(--ink); color: var(--on-primary); border: none; border-radius: var(--r-md); font-size: 12px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; display: flex; align-items: center; gap: 5px; transition: opacity 120ms; white-space: nowrap; }
  .btn-primary-sm:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary-sm.green { background: #16a34a; }
  .btn-secondary-sm { padding: 6px 12px; border: 1px solid var(--hairline); background: var(--canvas); color: var(--body); border-radius: var(--r-md); font-size: 12px; font-family: var(--font-sans); cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background 120ms; white-space: nowrap; }
  .btn-secondary-sm:hover { background: var(--canvas-soft-2); }
  .btn-ghost { background: transparent; border: none; color: var(--mute); cursor: pointer; font-size: 13px; font-family: var(--font-sans); padding: 6px 0; transition: color 120ms; }
  .btn-ghost:hover { color: var(--body); }
  .btn-ghost-sm { background: transparent; border: none; color: var(--mute); cursor: pointer; font-size: 12px; font-family: var(--font-sans); padding: 4px 0; transition: color 120ms; white-space: nowrap; }
  .btn-ghost-sm:hover { color: var(--body); }

  /* ── Spinners ── */
  .spin { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  .spin-sm { display: inline-block; width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  .spin-dark { display: inline-block; width: 13px; height: 13px; border: 2px solid var(--hairline); border-top-color: var(--mute); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Responsive ── */
  @media (max-width: 1100px) { .phone-layout { grid-template-columns: 1fr; } }
  @media (max-width: 900px) {
    .scan-layout { grid-template-columns: 1fr; }
    .scan-right { order: -1; }
    .idle-panel { min-height: 140px; padding: 28px; }
    .mode-toggle { flex-wrap: wrap; }
  }
  @media (max-width: 600px) { .fields-row { grid-template-columns: 1fr; } .device-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
