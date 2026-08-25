<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { apiUrl } from '$lib/api';
  import { authStore } from '$lib/stores/auth.svelte';

  const authenticated      = $derived(authStore.isAuthenticated);
  const mustChangePassword = $derived(authStore.user?.mustChangePassword ?? false);

  function redirectAfterLogin() {
    if (mustChangePassword) { goto('/first-login'); return; }
    const redirectTo = $page.url.searchParams.get('redirect');
    goto(redirectTo ? decodeURIComponent(redirectTo) : '/dashboard');
  }

  $effect(() => {
    if (authenticated) redirectAfterLogin();
  });

  let email = $state('');
  let password = $state('');
  let showPassword = $state(false);
  let rememberMe = $state(false);
  let loading = $state(false);
  let formError = $state('');
  let fieldErrors = $state<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address.';
    }
    if (!password) {
      errs.password = 'Enter your password.';
    }
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;

    loading = true;
    formError = '';

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember: rememberMe }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        formError = data.error ?? data.message ?? 'Incorrect email or password.';
        return;
      }

      authStore.login(data.user, data.token);
      redirectAfterLogin();
    } catch {
      formError = 'Connection error. Check your network and try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In — Oracle Inventory System</title>
</svelte:head>

<main class="root">

  <!-- ── Left: form panel ─────────────────────────────────────────────────── -->
  <section class="panel" aria-labelledby="auth-heading">
    <div class="panel-inner">

      <!-- Logo -->
      <a href="/" class="logo" aria-label="Oracle Inventory System home">
        <span class="logo-mark" aria-hidden="true">
          <img src="/oracle-logo.png" alt="" class="logo-img" />
        </span>
        <span class="logo-name">Oracle Inventory System</span>
      </a>

      <!-- Heading — generous gap above, tight internal spacing -->
      <div class="heading">
        <h1 id="auth-heading">Welcome back!</h1>
        <p>Sign in to your inventory workspace.</p>
      </div>

      <!-- Auth form — tight field grouping, generous separation before CTA -->
      <form onsubmit={handleSubmit} novalidate>

        <!-- Email — no visible label, placeholder only (matches reference) -->
        <div class="field">
          <div class="input-wrap">
            <input
              id="email"
              type="email"
              placeholder="name@oraclepetroleum.net"
              bind:value={email}
              autocomplete="email"
              autofocus
              aria-label="Email address"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'email-err' : undefined}
              class:input--invalid={fieldErrors.email}
            />
            <span class="input-icon" aria-hidden="true">
              <!--
                HugeIcons Mail01Icon — exact paths from @hugeicons/core-free-icons
                ESM: node_modules/@hugeicons/core-free-icons/dist/esm/Mail01Icon.js
              -->
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6"
                  stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"
                />
                <path
                  d="M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z"
                  stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"
                />
              </svg>
            </span>
          </div>
          {#if fieldErrors.email}
            <span id="email-err" class="field-err" role="alert">{fieldErrors.email}</span>
          {/if}
        </div>

        <!-- Password — no visible label, placeholder only -->
        <div class="field field--last">
          <div class="input-wrap">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              bind:value={password}
              autocomplete="current-password"
              aria-label="Password"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'pw-err' : undefined}
              class:input--invalid={fieldErrors.password}
            />
            <button
              type="button"
              class="input-icon input-icon--btn"
              onclick={() => (showPassword = !showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {#if showPassword}
                <!--
                  HugeIcons ViewOffSlashIcon — exact paths from @hugeicons/core-free-icons
                  ESM: node_modules/@hugeicons/core-free-icons/dist/esm/ViewOffSlashIcon.js
                -->
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M19.439 15.439C20.3636 14.5212 21.0775 13.6091 21.544 12.955C21.848 12.5287 22 12.3155 22 12C22 11.6845 21.848 11.4713 21.544 11.045C20.1779 9.12944 16.6892 5 12 5C11.0922 5 10.2294 5.15476 9.41827 5.41827M6.74742 6.74742C4.73118 8.1072 3.24215 9.94266 2.45604 11.045C2.15201 11.4713 2 11.6845 2 12C2 12.3155 2.15201 12.5287 2.45604 12.955C3.8221 14.8706 7.31078 19 12 19C13.9908 19 15.7651 18.2557 17.2526 17.2526"
                    stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  />
                  <path
                    d="M9.85786 10C9.32783 10.53 9 11.2623 9 12.0711C9 13.6887 10.3113 15 11.9289 15C12.7377 15 13.47 14.6722 14 14.1421"
                    stroke="currentColor" stroke-linecap="round" stroke-width="1.5"
                  />
                  <path
                    d="M3 3L21 21"
                    stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  />
                </svg>
              {:else}
                <!--
                  HugeIcons ViewIcon — exact paths from @hugeicons/core-free-icons
                  ESM: node_modules/@hugeicons/core-free-icons/dist/esm/ViewIcon.js
                -->
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z"
                    stroke="currentColor" stroke-width="1.5"
                  />
                  <path
                    d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z"
                    stroke="currentColor" stroke-width="1.5"
                  />
                </svg>
              {/if}
            </button>
          </div>
          {#if fieldErrors.password}
            <span id="pw-err" class="field-err" role="alert">{fieldErrors.password}</span>
          {/if}
        </div>

        <!-- Remember / Forgot — tight below password, generous above button -->
        <div class="remember-row">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={rememberMe} />
            <span class="checkbox-box" aria-hidden="true">
              {#if rememberMe}
                <svg width="7" height="6" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {/if}
            </span>
            <span>Remember me</span>
          </label>
          <a href="/forgot-password" class="link">Forgot Password?</a>
        </div>

        {#if formError}
          <p class="form-error" role="alert">{formError}</p>
        {/if}

        <!--
          button-primary token: --link blue, on-primary white, pill shape, button-lg (16px/500)
          Blue matches the reference hierarchy and uses DESIGN.md --link token
        -->
        <button type="submit" class="btn-submit" class:btn-submit--error={!!formError || !!fieldErrors.email || !!fieldErrors.password} disabled={loading} aria-busy={loading}>
          {#if loading}
            <span class="spinner" aria-hidden="true"></span>
            Signing in&hellip;
          {:else}
            Login
          {/if}
        </button>

      </form>

    </div>
  </section>

  <!-- ── Right: brand panel ──────────────────────────────────────────────── -->
  <aside class="brand" aria-hidden="true">
    <div class="brand-glow brand-glow--lime-a"></div>
    <div class="brand-glow brand-glow--lime-b"></div>
    <div class="brand-glow brand-glow--lime-c"></div>
    <div class="brand-grid"></div>
    <span class="brand-label brand-label--h">DISCOVERY.</span>
    <span class="brand-label brand-label--v">SPACE</span>
    <footer class="brand-footer">
      <p>© 2025 Oracle Inventory. All rights reserved.</p>
    </footer>
  </aside>

</main>

<style>
  /* ── Shell ─────────────────────────────────────────────────────────────── */
  .root {
    display: grid;
    grid-template-columns: minmax(320px, 45%) 1fr;
    height: 100dvh;
    overflow: hidden;
  }

  /* ── Panel ─────────────────────────────────────────────────────────────── */
  /*
    canvas-soft-2 (#f5f5f5) panel surface — white inputs on light-gray panel
    creates subtle depth hierarchy without introducing colour.
    Matches the reference's gray panel aesthetic exactly.
  */
  .panel {
    background: var(--canvas-soft-2);
    border-radius: 0 var(--r-xl) var(--r-xl) 0;
    display: flex;
    align-items: center;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    z-index: 1;
    /* Level 4 float-stack shadow — DESIGN.md elevation system */
    box-shadow:
      0 2px 2px oklch(0% 0 0 / 4%),
      0 8px 16px -4px oklch(0% 0 0 / 6%),
      0 0 0 1px oklch(0% 0 0 / 7%);
  }

  /*
    Spacing rhythm: no uniform gap — each section has its own breathing room.
    Logo: anchors the top naturally.
    Heading: --sp-xl (32px) above — generous, draws the eye down from the logo.
    Form: --sp-lg (24px) above — clear section separation.
    Submit: --sp-lg (24px) above the button — grouped with the remember row but distinct.
  */
  .panel-inner {
    width: 100%;
    max-width: clamp(340px, 28vw, 520px);
    margin: 0 auto;
    padding: clamp(32px, 4vh, 72px) clamp(24px, 2.5vw, 56px);
    display: flex;
    flex-direction: column;
  }

  /* ── Logo ──────────────────────────────────────────────────────────────── */
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    color: var(--ink);
    text-decoration: none;
    width: fit-content;
    align-self: flex-start; /* flush left within panel-inner — container still centered */
    margin-left: calc(-1 * (clamp(26px, 2.2vw, 40px) + 9px)); /* hanging indent: icon + gap hang left so "O" aligns with "W" */
  }

  .logo-mark {
    display: flex;
    flex-shrink: 0;
  }

  .logo-img {
    width: clamp(26px, 2.2vw, 40px);
    height: auto;
    display: block;
    flex-shrink: 0;
  }

  /* body-md token: 16px/600 — brand name scales with the icon */
  .logo-name {
    font-size: clamp(14px, 1.1vw, 20px);
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.32px; /* negative tracking per DESIGN.md brand voice */
    color: var(--ink);
  }

  /* ── Heading ───────────────────────────────────────────────────────────── */
  /*
    --sp-xl (32px) above heading — generous gap creates clear visual group break
    between logo identity and form intent.
  */
  .heading {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xxs);
    margin-top: var(--sp-lg);    /* 24px — compact gap matching reference */
    margin-bottom: var(--sp-xl); /* 32px before fields — clear gap between header and form */
    align-self: flex-start;      /* left-aligned, matches logo edge */
    width: 100%;                 /* but still fills panel-inner width for wrapping text */
    text-align: left;
  }

  /* display-lg token: 32px / 600 / lh 40px / -1.28px */
  .heading h1 {
    font-size: clamp(28px, 2.5vw, 48px);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -1.28px;
    color: var(--ink);
    margin: 0;
  }

  /* body-md token: 16px / 400 / lh 24px */
  .heading p {
    font-size: clamp(14px, 1.2vw, 20px);
    font-weight: 400;
    line-height: 1.5;
    color: var(--body);
    margin: 0;
  }

  /* ── Form ──────────────────────────────────────────────────────────────── */
  form {
    display: flex;
    flex-direction: column;
  }

  /*
    Fields get --sp-md (16px) between them — enough gap to read as distinct items,
    not so much that they lose their logical grouping.
  */
  .field {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--sp-md); /* 16px between fields */
  }

  /* Last field before remember row gets no extra gap — the row itself has its own margin */
  .field--last {
    margin-bottom: 0;
  }

  .input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  /*
    form-input token: canvas bg, hairline border, --r-sm (6px), height 40px, body-sm (14px)
    White input on canvas-soft-2 panel = clear elevation hierarchy.
  */
  .input-wrap input {
    width: 100%;
    height: clamp(40px, 3.5vh, 56px);
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 0 42px 0 var(--sp-sm);
    font-family: var(--font-sans);
    font-size: clamp(13px, 1vw, 17px); /* body-sm token */
    font-weight: 400;
    letter-spacing: -0.14px;
    color: var(--ink);
    outline: none;
    transition: border-color 0.14s ease-out, box-shadow 0.14s ease-out;
  }

  .input-wrap input::placeholder {
    color: var(--mute);
  }

  .input-wrap input:focus {
    border-color: var(--link);
    box-shadow: 0 0 0 3px oklch(51.5% 0.22 264 / 12%);
  }

  .input-wrap input.input--invalid {
    border-color: var(--error);
    box-shadow: 0 0 0 3px oklch(47.8% 0.26 28 / 10%);
  }

  .input-icon {
    position: absolute;
    right: 11px;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--mute);
    pointer-events: none;
  }

  .input-icon--btn {
    background: none;
    border: none;
    cursor: pointer;
    pointer-events: auto;
    padding: 4px;
    right: 7px; /* 7 + 4px padding = 11px — aligns icon edge with the mail span icon */
    border-radius: var(--r-xs);
    transition: color 0.12s ease-out;
  }

  .input-icon--btn:hover {
    color: var(--body);
  }

  /* caption token: 12px / error */
  .field-err {
    font-size: 12px;
    font-weight: 400;
    color: var(--error);
    margin-top: var(--sp-xxs);
    line-height: 1.3;
  }

  /* ── Remember row ──────────────────────────────────────────────────────── */
  /*
    --sp-xs (8px) above: tight coupling with the password field above it.
    --sp-lg (24px) below: generous separation before the CTA — this gap is
    the primary visual cue that the button is the main action.
  */
  .remember-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--sp-sm);    /* 12px — comfortable gap from password field */
    margin-bottom: var(--sp-xl); /* 32px — generous before submit CTA */
  }

  /* caption token: 12px / 400 — smaller than input text, reads as secondary */
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
    letter-spacing: -0.12px;
    color: var(--body);
    user-select: none;
  }

  .checkbox-label input[type='checkbox'] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  /*
    Checkbox: --link blue when checked — matches reference's blue dot indicator.
    Unchecked: canvas bg with hairline border — neutral, unobtrusive.
  */
  .checkbox-box {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-xs);
    background: var(--canvas);
    display: flex;
    align-items: center;
    justify-content: center;
    color: oklch(99.8% 0.002 106); /* on-primary white */
    transition: background 0.12s ease-out, border-color 0.12s ease-out;
  }

  .checkbox-label input:checked + .checkbox-box {
    background: var(--link);   /* --link blue matches reference */
    border-color: var(--link);
  }

  .checkbox-label input:focus-visible + .checkbox-box {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  /* link-inline token: --link color, caption size — matches remember me label scale */
  .link {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: -0.12px;
    color: var(--link);
    text-decoration: none;
    transition: color 0.1s ease-out;
  }

  .link:hover {
    color: var(--link-deep);
    text-decoration: underline;
  }

  /* ── Form error ────────────────────────────────────────────────────────── */
  .form-error {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--error);
    background: var(--error-soft);
    border: 1px solid oklch(47.8% 0.26 28 / 22%);
    border-radius: var(--r-sm);
    padding: 10px var(--sp-sm);
    margin-bottom: var(--sp-sm);
  }

  /* ── Submit button ─────────────────────────────────────────────────────── */
  /*
    button-primary token: pill shape, button-lg (16px/500).
    Gradient: acid lime-green matching the right panel brand aesthetic.
    From oklch(76% 0.30 118) → oklch(63% 0.28 136) — bright lime to deeper forest green.
    Text: var(--ink) dark — high contrast (~10:1) on the bright lime surface.
    Stacked shadow below matches DESIGN.md Level 2 elevation for a "floating" CTA feel.
  */
  .btn-submit {
    width: 85%;
    margin: 0 auto;
    background: linear-gradient(to right,
      oklch(11% 0.04 135),
      oklch(58% 0.27 129) 45%,
      oklch(58% 0.27 129) 55%,
      oklch(11% 0.04 135)
    );
    color: oklch(98% 0.003 127);
    border: none;
    border-radius: var(--r-pill);
    height: clamp(40px, 3.5vh, 56px);
    font-family: var(--font-sans);
    font-size: clamp(13px, 1vw, 17px);
    font-weight: 300;
    line-height: 1;
    letter-spacing: 0.6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow:
      0 1px 1px oklch(60% 0.28 127 / 18%),
      0 2px 8px -2px oklch(60% 0.28 127 / 22%),
      0 0 0 1px oklch(64% 0.30 118 / 30%);
    transition: filter 0.18s ease-out, box-shadow 0.18s ease-out, transform 0.1s ease-out;
    flex-shrink: 0;
  }

  .btn-submit:hover:not(:disabled) {
    filter: brightness(1.12);
    box-shadow:
      0 1px 1px oklch(58% 0.28 127 / 22%),
      0 4px 12px -2px oklch(58% 0.28 127 / 30%),
      0 0 0 1px oklch(62% 0.30 118 / 35%);
  }

  .btn-submit:active:not(:disabled) {
    transform: scale(0.98);
  }

  .btn-submit:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-submit--error {
    background: linear-gradient(to right,
      oklch(18% 0.06 25),
      oklch(52% 0.24 25) 45%,
      oklch(52% 0.24 25) 55%,
      oklch(18% 0.06 25)
    );
    color: oklch(98% 0.005 25);
    box-shadow:
      0 1px 1px oklch(50% 0.24 25 / 18%),
      0 2px 8px -2px oklch(50% 0.24 25 / 28%),
      0 0 0 1px oklch(55% 0.26 25 / 30%);
  }

  .btn-submit--error:hover:not(:disabled) {
    filter: brightness(1.12);
    box-shadow:
      0 1px 1px oklch(50% 0.24 25 / 22%),
      0 4px 12px -2px oklch(50% 0.24 25 / 36%),
      0 0 0 1px oklch(55% 0.26 25 / 38%);
  }

  /* White spinner — on lime-to-dark-green gradient surface */
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid oklch(98% 0.003 127 / 25%);
    border-top-color: oklch(98% 0.003 127 / 85%);
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Brand panel (right) ────────────────────────────────────────────────── */
  .brand {
    position: relative;
    overflow: hidden;
    background: oklch(7.5% 0.018 130);
  }

  .brand-glow {
    position: absolute;
    /* -20% overshoot so translate() never pulls a hard edge into the visible area */
    inset: -20%;
    pointer-events: none;
    will-change: transform;
  }

  .brand-glow--lime-a {
    background: radial-gradient(
      ellipse 72% 55% at 78% 18%,
      oklch(76% 0.28 127 / 62%) 0%,
      oklch(76% 0.28 127 / 20%) 38%,
      transparent 66%
    );
    animation: glow-orbit-a 11s ease-in-out infinite;
  }

  .brand-glow--lime-b {
    background: radial-gradient(
      ellipse 58% 62% at 4% 62%,
      oklch(72% 0.27 130 / 55%) 0%,
      oklch(72% 0.27 130 / 15%) 42%,
      transparent 65%
    );
    animation: glow-orbit-b 15s ease-in-out infinite;
  }

  .brand-glow--lime-c {
    background: radial-gradient(
      ellipse 44% 34% at 22% 92%,
      oklch(68% 0.25 133 / 38%) 0%,
      transparent 58%
    );
    animation: glow-orbit-c 19s ease-in-out infinite;
  }

  /* Glow orbit keyframes — transform only, no layout properties */
  @keyframes glow-orbit-a {
    0%   { transform: translate(0%, 0%); }
    20%  { transform: translate(-7%, 10%); }
    45%  { transform: translate(-14%, 3%); }
    70%  { transform: translate(-6%, -10%); }
    100% { transform: translate(0%, 0%); }
  }

  @keyframes glow-orbit-b {
    0%   { transform: translate(0%, 0%); }
    30%  { transform: translate(10%, -7%); }
    60%  { transform: translate(5%, 11%); }
    80%  { transform: translate(-4%, 5%); }
    100% { transform: translate(0%, 0%); }
  }

  @keyframes glow-orbit-c {
    0%   { transform: translate(0%, 0%); }
    25%  { transform: translate(8%, -6%); }
    55%  { transform: translate(13%, 5%); }
    75%  { transform: translate(3%, 9%); }
    100% { transform: translate(0%, 0%); }
  }

  .brand-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
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

  .brand-label--h {
    top: 42%;
    left: 50%;
    transform: translateX(-50%);
  }

  .brand-label--v {
    right: 22px;
    bottom: 22%;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.4em;
  }

  .brand-footer {
    position: absolute;
    bottom: 16px;
    right: 16px;
    z-index: 1;
  }

  .brand-footer p {
    font-size: 11px;
    font-weight: 400;
    color: oklch(72% 0.08 127 / 45%);
    background: oklch(0% 0 0 / 32%);
    backdrop-filter: blur(10px) saturate(1.2);
    -webkit-backdrop-filter: blur(10px) saturate(1.2);
    border: 1px solid oklch(82% 0.12 127 / 10%);
    border-radius: var(--r-pill);
    padding: 6px 14px;
    white-space: nowrap;
    line-height: 1.4;
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (min-width: 1440px) {
    .root {
      grid-template-columns: minmax(380px, 38%) 1fr;
    }

    .panel-inner {
      padding-top: clamp(56px, 6vh, 96px);
      padding-bottom: clamp(56px, 6vh, 96px);
    }
  }

  @media (max-width: 959px) {
    .root {
      grid-template-columns: minmax(300px, 52%) 1fr;
    }

    .panel-inner {
      padding: var(--sp-3xl) var(--sp-lg);
    }
  }

  @media (max-width: 599px) {
    .root {
      grid-template-columns: 1fr;
    }

    .brand {
      display: none;
    }

    .panel {
      border-radius: 0;
    }

    .panel-inner {
      max-width: 100%;
      padding: var(--sp-2xl) var(--sp-lg);
    }

    .heading h1 {
      font-size: 26px;
      letter-spacing: -0.8px;
    }

    .heading {
      margin-top: var(--sp-lg);
    }
  }

  @media (max-width: 359px) {
    .panel-inner {
      padding: var(--sp-xl) var(--sp-md);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
      opacity: 0.6;
    }

    .brand-glow--lime-a,
    .brand-glow--lime-b,
    .brand-glow--lime-c {
      animation: none;
    }

    .btn-submit,
    .input-wrap input,
    .checkbox-box,
    .input-icon--btn {
      transition: none;
    }
  }
</style>
