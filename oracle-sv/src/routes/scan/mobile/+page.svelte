<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';

  // ── Device token from URL ─────────────────────────────────────────────────
  const deviceToken = $derived($page.url.searchParams.get('device') ?? '');

  // ── Session state ─────────────────────────────────────────────────────────
  let deviceLabel  = $state('');
  let roomCode     = $state('');
  let expiresAt    = $state<Date | null>(null);
  let sessionError = $state('');
  let sessionReady = $state(false);

  // ── Camera state ──────────────────────────────────────────────────────────
  let videoEl    = $state<HTMLVideoElement | null>(null);
  let canvasEl   = $state<HTMLCanvasElement | null>(null);
  let stream     = $state<MediaStream | null>(null);
  let cameraReady  = $state(false);
  let cameraError  = $state('');
  let torchSupported = $state(false);
  let torchOn      = $state(false);

  // ── Scan flow state ───────────────────────────────────────────────────────
  let capturedImg  = $state('');
  let scanning     = $state(false);
  let scanError    = $state('');
  let scanCount    = $state(0);

  // ── Result confirm state ──────────────────────────────────────────────────
  interface ParsedResult {
    assetName?: string;
    brand?: string;
    model?: string;
    serialNumber?: string;
    imei1?: string;
    imei2?: string;
    macAddress?: string;
    serviceTag?: string;
    assetTag?: string;
    deviceType?: string;
    categoryHint?: string;
    scanReason?: string;
  }
  let result       = $state<ParsedResult | null>(null);
  let editMode     = $state(false);

  // Editable fields (populated when result arrives)
  let eName        = $state('');
  let eBrand       = $state('');
  let eModel       = $state('');
  let eSerial      = $state('');
  let eImei1       = $state('');

  // ── Manual entry state ────────────────────────────────────────────────────
  let manualMode   = $state(false);
  let mName        = $state('');
  let mSerial      = $state('');
  let submitting   = $state(false);
  let submitError  = $state('');
  let submitted    = $state(false);

  // ── API base (same origin as the page, proxied by SvelteKit) ─────────────
  const API = '/api';

  // ── Session ping on mount ─────────────────────────────────────────────────
  onMount(async () => {
    if (!deviceToken) {
      sessionError = 'No device token in URL. Please scan the QR code from your computer.';
      return;
    }

    try {
      const res = await fetch(`${API}/scan/device/${deviceToken}/ping`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        sessionError = (body as { error?: string }).error ?? 'Session not found or expired.';
        return;
      }
      const data = await res.json();
      deviceLabel  = data.deviceLabel;
      roomCode     = data.roomCode;
      expiresAt    = new Date(data.expiresAt);
      sessionReady = true;
      await startCamera();
    } catch {
      sessionError = 'Could not connect to server. Check your network.';
    }
  });

  onDestroy(() => stopCamera());

  // ── Camera ────────────────────────────────────────────────────────────────
  async function startCamera() {
    cameraError = '';
    cameraReady = false;
    torchOn     = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play();
      }
      // Detect torch support after stream starts
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = track.getCapabilities() as Record<string, unknown>;
        torchSupported = 'torch' in caps;
      }
    } catch (e: unknown) {
      cameraError = e instanceof Error ? e.message : 'Camera unavailable';
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    cameraReady = false;
    torchOn     = false;
    torchSupported = false;
  }

  function onVideoMetadata() { cameraReady = true; }

  async function toggleTorch() {
    if (!stream || !torchSupported) return;
    const track = stream.getVideoTracks()[0];
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] });
    } catch {
      torchOn = false; // revert if applyConstraints fails
    }
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  async function capture() {
    if (!videoEl || !canvasEl) return;
    scanError = '';

    let w = videoEl.videoWidth;
    let h = videoEl.videoHeight;
    let retries = 0;
    while ((w === 0 || h === 0) && retries < 3) {
      await sleep(150);
      w = videoEl.videoWidth; h = videoEl.videoHeight; retries++;
    }
    if (w === 0 || h === 0) { scanError = 'Camera not ready — wait and try again.'; return; }

    canvasEl.width  = w;
    canvasEl.height = h;
    canvasEl.getContext('2d')!.drawImage(videoEl, 0, 0);
    capturedImg = canvasEl.toDataURL('image/jpeg');
    stopCamera();
    await runOcr();
  }

  // ── OCR submission ────────────────────────────────────────────────────────
  async function runOcr() {
    if (!capturedImg) return;
    scanning  = true;
    scanError = '';
    result    = null;
    editMode  = false;

    try {
      const blob = await (await fetch(capturedImg)).blob();
      const form = new FormData();
      form.append('image', blob, 'capture.jpg');

      const res = await fetch(`${API}/scan/device/${deviceToken}/result`, {
        method: 'POST',
        body:   form,
        // No Authorization header — token is in the URL path
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'OCR failed');
      }

      const data = await res.json();
      result = data.parsed as ParsedResult;
      eName   = result.assetName    ?? '';
      eBrand  = result.brand        ?? '';
      eModel  = result.model        ?? '';
      eSerial = result.serialNumber ?? '';
      eImei1  = result.imei1        ?? '';
      scanCount++;
    } catch (err: unknown) {
      scanError = err instanceof Error ? err.message : 'OCR failed';
    } finally {
      scanning = false;
    }
  }

  // ── Manual submit (when user edits or enters manually) ───────────────────
  async function submitManual() {
    if (!mName.trim() && !eName.trim()) { submitError = 'Asset name is required.'; return; }
    submitting  = true;
    submitError = '';

    const payload: ParsedResult = manualMode
      ? { assetName: mName.trim(), serialNumber: mSerial.trim() || undefined }
      : { ...result, assetName: eName, brand: eBrand, model: eModel, serialNumber: eSerial, imei1: eImei1 };

    try {
      const form = new FormData();
      // Submit a tiny 1×1 transparent JPEG so the endpoint always gets an image
      // For manual entry we POST to a separate JSON endpoint approach:
      // Actually, re-send as a form upload but piggyback data in a JSON field
      // Simpler: post edited data directly as a "manual result" to the same device endpoint
      // We'll create a minimal canvas image to satisfy the upload requirement.
      const off = document.createElement('canvas');
      off.width = 1; off.height = 1;
      const blob = await new Promise<Blob>((res) => off.toBlob(b => res(b!), 'image/jpeg'));
      form.append('image', blob, 'manual.jpg');
      form.append('overrideParsed', JSON.stringify(payload));

      const res = await fetch(`${API}/scan/device/${deviceToken}/result`, {
        method: 'POST',
        body:   form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Submit failed');
      }

      submitted = true;
      scanCount++;
      // Reset for next scan after a short delay
      setTimeout(() => {
        submitted   = false;
        manualMode  = false;
        result      = null;
        capturedImg = '';
        submitError = '';
        mName = mSerial = '';
        startCamera();
      }, 2000);
    } catch (err) {
      submitError = err instanceof Error ? err.message : 'Submit failed';
    } finally {
      submitting = false;
    }
  }

  // ── Scan next (confirm without editing) ───────────────────────────────────
  function scanNext() {
    result      = null;
    capturedImg = '';
    scanError   = '';
    editMode    = false;
    startCamera();
  }
</script>

<svelte:head>
  <title>{deviceLabel ? `${deviceLabel} — Oracle Scan` : 'Oracle Scan'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
</svelte:head>

<div class="shell">

  <!-- Session error -->
  {#if sessionError}
    <div class="error-screen">
      <div class="error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      </div>
      <h1 class="error-title">Session Error</h1>
      <p class="error-msg">{sessionError}</p>
      <p class="error-hint">Return to your computer and refresh the scan page to get a new QR code.</p>
    </div>

  <!-- Loading session -->
  {:else if !sessionReady}
    <div class="loading-screen">
      <span class="spin-lg"></span>
      <p>Connecting…</p>
    </div>

  <!-- Scan complete confirmation -->
  {:else if submitted}
    <div class="confirm-screen">
      <div class="confirm-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
      </div>
      <h2 class="confirm-title">Submitted!</h2>
      <p class="confirm-sub">Opening camera for next item…</p>
    </div>

  <!-- Result review -->
  {:else if result && !scanError}
    <div class="review-screen">
      <div class="review-header">
        <span class="device-badge">{deviceLabel}</span>
        <span class="count-badge">{scanCount} scanned</span>
      </div>

      {#if !editMode}
        <div class="result-card">
          <h2 class="result-title">Scan Result</h2>
          <div class="result-row"><span class="result-label">Asset Name</span><span class="result-val">{result.assetName || '—'}</span></div>
          <div class="result-row"><span class="result-label">Brand</span><span class="result-val">{result.brand || '—'}</span></div>
          <div class="result-row"><span class="result-label">Model</span><span class="result-val">{result.model || '—'}</span></div>
          <div class="result-row"><span class="result-label">Serial</span><span class="result-val mono">{result.serialNumber || '—'}</span></div>
          {#if result.imei1}<div class="result-row"><span class="result-label">IMEI 1</span><span class="result-val mono">{result.imei1}</span></div>{/if}
          {#if result.categoryHint}<div class="result-row"><span class="result-label">Category</span><span class="result-val">{result.categoryHint}</span></div>{/if}
          {#if result.scanReason}<div class="warn-note">{result.scanReason}</div>{/if}
        </div>

        <div class="review-actions">
          <button class="btn-primary" onclick={scanNext}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            Confirm & Scan Next
          </button>
          <button class="btn-secondary" onclick={() => editMode = true}>Edit Before Adding</button>
          <button class="btn-ghost" onclick={scanNext}>Discard & Scan Again</button>
        </div>

      {:else}
        <!-- Edit form -->
        <div class="edit-card">
          <h2 class="result-title">Edit Before Submitting</h2>
          <div class="field-group">
            <label class="field-label">Asset Name <span class="req">*</span></label>
            <input class="field-input" bind:value={eName} placeholder="e.g. Samsung A55" />
          </div>
          <div class="fields-row">
            <div class="field-group">
              <label class="field-label">Brand</label>
              <input class="field-input" bind:value={eBrand} />
            </div>
            <div class="field-group">
              <label class="field-label">Model</label>
              <input class="field-input" bind:value={eModel} />
            </div>
          </div>
          <div class="field-group">
            <label class="field-label">Serial Number</label>
            <input class="field-input mono" bind:value={eSerial} />
          </div>
          <div class="field-group">
            <label class="field-label">IMEI 1</label>
            <input class="field-input mono" bind:value={eImei1} />
          </div>
          {#if submitError}<div class="err-note">{submitError}</div>{/if}
          <div class="edit-actions">
            <button class="btn-primary" onclick={submitManual} disabled={submitting || !eName.trim()}>
              {#if submitting}<span class="spin-sm"></span>{/if}
              Submit
            </button>
            <button class="btn-ghost" onclick={() => editMode = false}>Back</button>
          </div>
        </div>
      {/if}
    </div>

  <!-- OCR scanning in progress -->
  {:else if scanning}
    <div class="scanning-screen">
      {#if capturedImg}
        <img src={capturedImg} alt="Captured" class="captured-preview" />
      {/if}
      <div class="scanning-overlay">
        <span class="spin-lg white"></span>
        <p class="scanning-msg">Scanning label…</p>
      </div>
    </div>

  <!-- Camera view (main) -->
  {:else}
    <div class="camera-shell">

      <!-- Header bar -->
      <div class="cam-header">
        <div class="cam-header-left">
          <span class="device-badge">{deviceLabel}</span>
          {#if scanCount > 0}<span class="count-badge">{scanCount} scanned</span>{/if}
        </div>
        {#if torchSupported}
          <button class="torch-btn" class:torch-on={torchOn} onclick={toggleTorch} title="Toggle flashlight">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6l-6 6-4-4-5 5"/>
              <path d="M15 3l3 3-9.5 9.5-3-3z"/>
              <line x1="1" y1="1" x2="23" y2="23" class="torch-cross" style:display={torchOn ? 'none' : 'inline'}/>
            </svg>
          </button>
        {/if}
      </div>

      <!-- Camera viewfinder -->
      <div class="viewfinder">
        {#if cameraError}
          <div class="cam-error">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            <p>{cameraError}</p>
            <button class="btn-secondary-sm" onclick={startCamera}>Retry Camera</button>
          </div>
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={videoEl} class="cam-video" playsinline autoplay muted
            onloadedmetadata={onVideoMetadata}></video>
          <div class="scan-guide-overlay">
            <div class="scan-guide">
              <span class="gc tl"></span><span class="gc tr"></span>
              <span class="gc bl"></span><span class="gc br"></span>
            </div>
          </div>
        {/if}
        <canvas bind:this={canvasEl} class="hidden-canvas"></canvas>
      </div>

      {#if scanError}
        <div class="scan-err-bar">{scanError}</div>
      {/if}

      <!-- Capture button -->
      <div class="capture-bar">
        <button class="capture-btn" onclick={capture}
          disabled={!cameraReady || scanning || !!cameraError}>
          {#if !cameraReady}
            <span class="spin-sm white"></span> Initialising…
          {:else}
            <div class="capture-circle"></div>
          {/if}
        </button>
      </div>

      <!-- Manual entry fallback -->
      <div class="manual-bar">
        <button class="btn-ghost-sm" onclick={() => { manualMode = true; stopCamera(); }}>
          Enter manually instead
        </button>
      </div>

    </div>

    <!-- Manual entry mode -->
    {#if manualMode}
      <div class="manual-overlay">
        <div class="manual-card">
          <h2 class="result-title">Manual Entry</h2>
          <div class="field-group">
            <label class="field-label">Asset Name <span class="req">*</span></label>
            <input class="field-input" bind:value={mName} placeholder="e.g. Dell Laptop" autofocus />
          </div>
          <div class="field-group">
            <label class="field-label">Serial Number</label>
            <input class="field-input mono" bind:value={mSerial} placeholder="optional" />
          </div>
          {#if submitError}<div class="err-note">{submitError}</div>{/if}
          <div class="edit-actions">
            <button class="btn-primary" onclick={submitManual} disabled={submitting || !mName.trim()}>
              {#if submitting}<span class="spin-sm"></span>{/if}
              Submit
            </button>
            <button class="btn-ghost" onclick={() => { manualMode = false; startCamera(); }}>Back to Camera</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}

</div>

<style>
  :global(html, body) { margin: 0; padding: 0; background: #0a0a0a; color: #fff; font-family: system-ui, sans-serif; }

  .shell { min-height: 100dvh; display: flex; flex-direction: column; background: #0a0a0a; }

  /* ── Error / Loading / Confirm screens ── */
  .error-screen, .loading-screen, .confirm-screen {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 32px 24px; text-align: center; gap: 16px;
  }
  .error-icon { color: #f87171; }
  .error-title { font-size: 22px; font-weight: 700; margin: 0; }
  .error-msg { font-size: 14px; color: rgba(255,255,255,.75); margin: 0; }
  .error-hint { font-size: 12px; color: rgba(255,255,255,.45); margin: 0; max-width: 300px; line-height: 1.6; }
  .loading-screen { gap: 16px; color: rgba(255,255,255,.6); font-size: 14px; }
  .confirm-icon { color: #4ade80; }
  .confirm-title { font-size: 24px; font-weight: 700; margin: 0; }
  .confirm-sub { font-size: 13px; color: rgba(255,255,255,.6); margin: 0; }

  /* ── Camera shell ── */
  .camera-shell { flex: 1; display: flex; flex-direction: column; }
  .cam-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(0,0,0,.5); }
  .cam-header-left { display: flex; align-items: center; gap: 8px; }
  .device-badge { background: rgba(255,255,255,.12); color: #fff; border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
  .count-badge { background: #2563eb; color: #fff; border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
  .torch-btn {
    width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.3);
    background: rgba(255,255,255,.1); color: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 150ms;
  }
  .torch-btn.torch-on { background: #fbbf24; border-color: #fbbf24; color: #000; }
  .torch-btn:hover { background: rgba(255,255,255,.2); }

  .viewfinder { position: relative; width: 100%; flex: 1; background: #000; overflow: hidden; min-height: 55vw; }
  .cam-video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .scan-guide-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .scan-guide { position: relative; width: 72%; aspect-ratio: 3/2; }
  .gc { position: absolute; width: 24px; height: 24px; border-color: rgba(255,255,255,.9); border-style: solid; }
  .gc.tl { top: 0; left: 0; border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
  .gc.tr { top: 0; right: 0; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
  .gc.bl { bottom: 0; left: 0; border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
  .gc.br { bottom: 0; right: 0; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }
  .cam-error { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; padding: 24px; text-align: center; font-size: 14px; color: rgba(255,255,255,.7); }
  .hidden-canvas { display: none; }

  .scan-err-bar { background: #ef4444; color: #fff; padding: 10px 16px; font-size: 13px; text-align: center; }

  .capture-bar { display: flex; justify-content: center; padding: 20px 0 10px; background: #0a0a0a; }
  .capture-btn {
    width: 72px; height: 72px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25);
    background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: border-color 150ms;
  }
  .capture-btn:disabled { opacity: .4; cursor: not-allowed; }
  .capture-btn:not(:disabled):active .capture-circle { transform: scale(.85); }
  .capture-circle { width: 52px; height: 52px; border-radius: 50%; background: #fff; transition: transform 100ms; }

  .manual-bar { display: flex; justify-content: center; padding: 6px 0 24px; background: #0a0a0a; }

  /* ── Review / Edit screens ── */
  .review-screen { flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 20px 16px; background: #0f0f0f; overflow-y: auto; }
  .review-header { display: flex; align-items: center; gap: 8px; }

  .result-card, .edit-card { background: #1a1a1a; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .result-title { font-size: 15px; font-weight: 600; margin: 0; }
  .result-row { display: flex; align-items: baseline; gap: 8px; }
  .result-label { font-size: 12px; color: rgba(255,255,255,.4); min-width: 80px; }
  .result-val { font-size: 14px; color: rgba(255,255,255,.9); word-break: break-all; }
  .result-val.mono { font-family: monospace; font-size: 13px; }
  .warn-note { font-size: 12px; color: #fbbf24; padding: 8px 10px; background: rgba(251,191,36,.08); border-radius: 6px; }

  .review-actions { display: flex; flex-direction: column; gap: 10px; }
  .edit-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }

  /* ── Manual overlay ── */
  .manual-overlay { position: fixed; inset: 0; background: #0a0a0a; z-index: 10; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow-y: auto; }
  .manual-card { width: 100%; max-width: 480px; background: #1a1a1a; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }

  /* ── Scanning screen ── */
  .scanning-screen { flex: 1; position: relative; background: #000; }
  .captured-preview { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(.4); }
  .scanning-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
  .scanning-msg { font-size: 15px; color: rgba(255,255,255,.85); }

  /* ── Form fields ── */
  .field-group { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-size: 12px; color: rgba(255,255,255,.5); font-weight: 500; }
  .req { color: #f87171; }
  .field-input {
    padding: 10px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px;
    background: rgba(255,255,255,.06); color: #fff; font-size: 14px;
    outline: none; transition: border-color 150ms;
  }
  .field-input:focus { border-color: #3b82f6; background: rgba(59,130,246,.08); }
  .field-input.mono { font-family: monospace; font-size: 13px; letter-spacing: .03em; }
  .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .err-note { font-size: 12px; color: #f87171; background: rgba(248,113,113,.1); border-radius: 6px; padding: 8px 10px; }

  /* ── Buttons ── */
  .btn-primary {
    width: 100%; padding: 13px; background: #2563eb; color: #fff; border: none; border-radius: 10px;
    font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center;
    gap: 8px; transition: opacity 150ms;
  }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-primary:not(:disabled):active { opacity: .85; }
  .btn-secondary { width: 100%; padding: 12px; background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 150ms; }
  .btn-secondary:hover { background: rgba(255,255,255,.14); }
  .btn-secondary-sm { padding: 8px 16px; background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; font-size: 13px; cursor: pointer; }
  .btn-ghost { width: 100%; padding: 10px; background: transparent; color: rgba(255,255,255,.5); border: none; border-radius: 8px; font-size: 13px; cursor: pointer; transition: color 150ms; }
  .btn-ghost:hover { color: rgba(255,255,255,.8); }
  .btn-ghost-sm { padding: 6px 12px; background: transparent; color: rgba(255,255,255,.4); border: none; font-size: 13px; cursor: pointer; }

  /* ── Spinners ── */
  .spin-lg { display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(255,255,255,.2); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
  .spin-lg.white { border-color: rgba(255,255,255,.3); border-top-color: #fff; }
  .spin-sm { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
