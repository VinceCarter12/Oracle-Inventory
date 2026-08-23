<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';

  // ── Permission gate ──────────────────────────────────────────────────────────
  const can = (key: string) => authStore.hasPermission(key);

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

    await startCamera();

    window.addEventListener('mousemove', onGlobalMove as EventListener);
    window.addEventListener('mouseup',   onGlobalUp   as EventListener);
    window.addEventListener('touchmove', onGlobalMove as EventListener, { passive: false });
    window.addEventListener('touchend',  onGlobalUp   as EventListener);
  });

  onDestroy(() => {
    stopCamera();
    window.removeEventListener('mousemove', onGlobalMove as EventListener);
    window.removeEventListener('mouseup',   onGlobalUp   as EventListener);
    window.removeEventListener('touchmove', onGlobalMove as EventListener);
    window.removeEventListener('touchend',  onGlobalUp   as EventListener);
  });

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
      const raw = await api.raw('/api/scan/ocr', { method: 'POST', body: form });
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
    startCamera();
  }
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
      <div class="scan-layout">
        <!-- LEFT: Camera / Preview / Post-scan -->
        <div class="scan-left">
          {#if !previewMode && !scanned}
              <div class="camera-wrap">
                {#if cameraError}
                  <div class="cam-error">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    <p>Camera error: {cameraError}</p>
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

            {#if scanError}<div class="scan-err-banner">{scanError}</div>{/if}

            <div class="tips-card">
              <p class="tips-title">Tips for best results</p>
              <ul class="tips-list">
                <li>Hold the device label flat and in good light</li>
                <li>Fit the serial number / IMEI clearly in frame</li>
                <li>After capture, drag the box to tighten the crop before scanning</li>
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
              <p class="idle-sub">Capture an image of the asset label — then adjust the crop and hit <strong>Scan ROI</strong>.</p>
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

  /* ── Two-column layout ── */
  .scan-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 20px; align-items: start; }
  .scan-left, .scan-right { display: flex; flex-direction: column; gap: 16px; }

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
  /* ── Spinners ── */
  .spin { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  .spin-dark { display: inline-block; width: 13px; height: 13px; border: 2px solid var(--hairline); border-top-color: var(--mute); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .scan-layout { grid-template-columns: 1fr; }
    .scan-right { order: -1; }
    .idle-panel { min-height: 140px; padding: 28px; }
  }
  @media (max-width: 600px) { .fields-row { grid-template-columns: 1fr; } }
</style>
