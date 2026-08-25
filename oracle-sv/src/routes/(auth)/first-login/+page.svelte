<svelte:head>
  <title>Set Your Password — Oracle Inventory</title>
</svelte:head>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';

  // If not authenticated or no forced change, redirect appropriately
  const authenticated      = $derived(authStore.isAuthenticated);
  const mustChangePassword = $derived(authStore.user?.mustChangePassword ?? false);

  $effect(() => {
    if (!authenticated) goto('/login');
    else if (authenticated && !mustChangePassword) goto('/dashboard');
  });

  let currentPassword = $state('');
  let newPassword     = $state('');
  let confirmPassword = $state('');
  let loading         = $state(false);
  let error           = $state('');
  let fieldErrors     = $state<{ current?: string; new?: string; confirm?: string }>({});

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!currentPassword) errs.current = 'Enter your temporary password.';
    if (!newPassword || newPassword.length < 8) errs.new = 'Password must be at least 8 characters.';
    if (newPassword && newPassword === currentPassword) errs.new = 'New password must differ from your temporary password.';
    if (newPassword !== confirmPassword) errs.confirm = 'Passwords do not match.';
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;

    loading = true;
    error = '';

    try {
      const res = await api.raw('/api/users/me/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.error ?? 'Failed to update password. Please try again.';
        return;
      }

      // Clear the flag in the local store so guards don't redirect back
      authStore.clearMustChangePassword();
      goto('/dashboard');
    } catch {
      error = 'Connection error. Check your network and try again.';
    } finally {
      loading = false;
    }
  }
</script>

<main class="root">

  <section class="panel" aria-labelledby="heading">
    <div class="panel-inner">

      <a href="/" class="logo" aria-label="Oracle Inventory System home">
        <span class="logo-mark">
          <img src="/oracle-logo.png" alt="" class="logo-img" />
        </span>
        <span class="logo-name">Oracle Inventory System</span>
      </a>

      <div class="heading">
        <div class="badge">First Login</div>
        <h1 id="heading">Set your password</h1>
        <p>Your account was created with a temporary password. You must set a new password before continuing.</p>
      </div>

      <form onsubmit={handleSubmit} novalidate>

        <div class="field">
          <label for="current-pw" class="field-label">Temporary Password</label>
          <input
            id="current-pw"
            type="password"
            placeholder="Enter your temporary password"
            bind:value={currentPassword}
            autocomplete="current-password"
            aria-invalid={!!fieldErrors.current}
            class:input--invalid={fieldErrors.current}
          />
          {#if fieldErrors.current}
            <span class="field-err" role="alert">{fieldErrors.current}</span>
          {/if}
        </div>

        <div class="field">
          <label for="new-pw" class="field-label">New Password</label>
          <input
            id="new-pw"
            type="password"
            placeholder="At least 8 characters"
            bind:value={newPassword}
            autocomplete="new-password"
            aria-invalid={!!fieldErrors.new}
            class:input--invalid={fieldErrors.new}
          />
          {#if fieldErrors.new}
            <span class="field-err" role="alert">{fieldErrors.new}</span>
          {/if}
        </div>

        <div class="field field--last">
          <label for="confirm-pw" class="field-label">Confirm New Password</label>
          <input
            id="confirm-pw"
            type="password"
            placeholder="Repeat new password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            aria-invalid={!!fieldErrors.confirm}
            class:input--invalid={fieldErrors.confirm}
          />
          {#if fieldErrors.confirm}
            <span class="field-err" role="alert">{fieldErrors.confirm}</span>
          {/if}
        </div>

        {#if error}
          <p class="form-error" role="alert">{error}</p>
        {/if}

        <button type="submit" class="btn-submit" disabled={loading} aria-busy={loading}>
          {#if loading}
            <span class="spinner" aria-hidden="true"></span>
            Updating&hellip;
          {:else}
            Set Password & Continue
          {/if}
        </button>

      </form>

    </div>
  </section>

  <aside class="brand" aria-hidden="true">
    <div class="brand-glow brand-glow--a"></div>
    <div class="brand-glow brand-glow--b"></div>
    <div class="brand-grid"></div>
    <span class="brand-label brand-label--h">SECURE.</span>
    <span class="brand-label brand-label--v">FIRST</span>
  </aside>

</main>

<style>
  .root {
    display: grid;
    grid-template-columns: minmax(320px, 45%) 1fr;
    height: 100dvh;
    overflow: hidden;
  }

  .panel {
    background: var(--canvas-soft-2);
    border-radius: 0 var(--r-xl) var(--r-xl) 0;
    display: flex;
    align-items: center;
    overflow-y: auto;
    position: relative;
    z-index: 1;
    box-shadow:
      0 2px 2px oklch(0% 0 0 / 4%),
      0 8px 16px -4px oklch(0% 0 0 / 6%),
      0 0 0 1px oklch(0% 0 0 / 7%);
  }

  .panel-inner {
    width: 100%;
    max-width: clamp(340px, 28vw, 520px);
    margin: 0 auto;
    padding: clamp(32px, 4vh, 72px) clamp(24px, 2.5vw, 56px);
    display: flex;
    flex-direction: column;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    color: var(--ink);
    text-decoration: none;
    width: fit-content;
  }

  .logo-img { width: clamp(26px, 2.2vw, 40px); height: auto; display: block; }

  .logo-name {
    font-size: clamp(14px, 1.1vw, 20px);
    font-weight: 600;
    letter-spacing: -0.32px;
    color: var(--ink);
  }

  .heading {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    margin-top: var(--sp-lg);
    margin-bottom: var(--sp-xl);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    background: oklch(94% 0.06 80);
    color: oklch(42% 0.16 80);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.2px;
    width: fit-content;
  }

  .heading h1 {
    font-size: clamp(24px, 2vw, 40px);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -1px;
    color: var(--ink);
    margin: 0;
  }

  .heading p {
    font-size: clamp(13px, 1vw, 16px);
    color: var(--body);
    line-height: 1.5;
    margin: 0;
  }

  form { display: flex; flex-direction: column; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: var(--sp-md);
  }

  .field--last { margin-bottom: 0; }

  .field-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--body);
    font-family: var(--font-sans);
  }

  .field input {
    width: 100%;
    height: clamp(40px, 3.5vh, 52px);
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 0 var(--sp-sm);
    font-family: var(--font-sans);
    font-size: clamp(13px, 1vw, 16px);
    color: var(--ink);
    outline: none;
    transition: border-color 0.14s ease-out, box-shadow 0.14s ease-out;
  }

  .field input::placeholder { color: var(--mute); }

  .field input:focus {
    border-color: var(--link);
    box-shadow: 0 0 0 3px oklch(51.5% 0.22 264 / 12%);
  }

  .field input.input--invalid {
    border-color: var(--error);
    box-shadow: 0 0 0 3px oklch(47.8% 0.26 28 / 10%);
  }

  .field-err {
    font-size: 12px;
    color: var(--error);
    line-height: 1.3;
  }

  .form-error {
    font-size: 13px;
    color: var(--error);
    background: var(--error-soft);
    border: 1px solid oklch(47.8% 0.26 28 / 22%);
    border-radius: var(--r-sm);
    padding: 10px var(--sp-sm);
    margin-top: var(--sp-md);
    margin-bottom: var(--sp-sm);
  }

  .btn-submit {
    width: 85%;
    margin: var(--sp-lg) auto 0;
    background: linear-gradient(to right, oklch(11% 0.04 135), oklch(58% 0.27 129) 45%, oklch(58% 0.27 129) 55%, oklch(11% 0.04 135));
    color: oklch(98% 0.003 127);
    border: none;
    border-radius: var(--r-pill);
    height: clamp(40px, 3.5vh, 52px);
    font-family: var(--font-sans);
    font-size: clamp(13px, 1vw, 16px);
    font-weight: 300;
    letter-spacing: 0.6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: filter 0.18s ease-out, transform 0.1s ease-out;
  }

  .btn-submit:hover:not(:disabled) { filter: brightness(1.12); }
  .btn-submit:active:not(:disabled) { transform: scale(0.98); }
  .btn-submit:disabled { opacity: 0.55; cursor: not-allowed; }

  .spinner {
    width: 14px; height: 14px;
    border: 2px solid oklch(98% 0.003 127 / 25%);
    border-top-color: oklch(98% 0.003 127 / 85%);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Brand panel */
  .brand {
    position: relative;
    overflow: hidden;
    background: oklch(7.5% 0.018 130);
  }

  .brand-glow {
    position: absolute;
    inset: -20%;
    pointer-events: none;
  }

  .brand-glow--a {
    background: radial-gradient(ellipse 72% 55% at 78% 18%, oklch(76% 0.28 127 / 62%) 0%, transparent 66%);
    animation: glow-a 11s ease-in-out infinite;
  }

  .brand-glow--b {
    background: radial-gradient(ellipse 58% 62% at 4% 62%, oklch(72% 0.27 130 / 55%) 0%, transparent 65%);
    animation: glow-b 15s ease-in-out infinite;
  }

  @keyframes glow-a {
    0%, 100% { transform: translate(0%, 0%); }
    45%       { transform: translate(-14%, 3%); }
  }

  @keyframes glow-b {
    0%, 100% { transform: translate(0%, 0%); }
    60%       { transform: translate(5%, 11%); }
  }

  .brand-grid {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(oklch(82% 0.26 127 / 8%) 1px, transparent 1px),
      linear-gradient(90deg, oklch(82% 0.26 127 / 8%) 1px, transparent 1px);
    background-size: 72px 72px;
  }

  .brand-label {
    position: absolute;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: oklch(82% 0.12 127 / 32%);
    pointer-events: none;
    z-index: 1;
  }

  .brand-label--h { top: 42%; left: 50%; transform: translateX(-50%); }
  .brand-label--v { right: 22px; bottom: 22%; writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.4em; }

  @media (max-width: 599px) {
    .root { grid-template-columns: 1fr; }
    .brand { display: none; }
    .panel { border-radius: 0; }
    .panel-inner { max-width: 100%; padding: var(--sp-2xl) var(--sp-lg); }
  }
</style>
