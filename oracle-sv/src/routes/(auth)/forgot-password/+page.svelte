<script lang="ts">
  import { api } from '$lib/api';
  // Step 1: enter email → POST /api/auth/forgot-password
  // Step 2: enter OTP + new password → POST /api/auth/reset-password

  type Step = 'email' | 'reset' | 'done';
  let step    = $state<Step>('email');

  // Email step
  let email   = $state('');
  let emailErr = $state('');
  let emailBusy = $state(false);

  async function requestReset(e: SubmitEvent) {
    e.preventDefault();
    emailErr = '';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      emailErr = 'Enter a valid email address.';
      return;
    }
    emailBusy = true;
    try {
      const res = await api.raw('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        emailErr = (body as { error?: string }).error ?? 'Something went wrong.';
        return;
      }
      step = 'reset';
    } catch {
      emailErr = 'Network error. Check your connection.';
    } finally {
      emailBusy = false;
    }
  }

  // Reset step
  let otpCode     = $state('');
  let newPassword = $state('');
  let confirmPw   = $state('');
  let showPw      = $state(false);
  let resetErr    = $state('');
  let resetBusy   = $state(false);

  async function submitReset(e: SubmitEvent) {
    e.preventDefault();
    resetErr = '';
    if (!otpCode.trim()) { resetErr = 'Enter the verification code.'; return; }
    if (newPassword.length < 8) { resetErr = 'Password must be at least 8 characters.'; return; }
    if (newPassword !== confirmPw) { resetErr = 'Passwords do not match.'; return; }

    resetBusy = true;
    try {
      const res = await api.raw('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim(), newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        resetErr = (body as { error?: string }).error ?? 'Something went wrong.';
        return;
      }
      step = 'done';
    } catch {
      resetErr = 'Network error. Check your connection.';
    } finally {
      resetBusy = false;
    }
  }
</script>

<div class="auth-wrap">
  <div class="auth-card">

    <!-- Logo -->
    <div class="auth-logo">
      <img src="/oracle-logo.png" alt="Oracle" width="32" height="32" />
    </div>

    {#if step === 'email'}
      <h1 class="auth-title">Forgot password</h1>
      <p class="auth-sub">Enter your account email and we'll send you a reset code.</p>

      {#if emailErr}
        <div class="error-bar">{emailErr}</div>
      {/if}

      <form onsubmit={requestReset} novalidate>
        <div class="field">
          <label class="field-label" for="fp-email">Email address</label>
          <input
            id="fp-email"
            class="field-input"
            type="email"
            autocomplete="email"
            placeholder="you@company.com"
            bind:value={email}
            disabled={emailBusy}
          />
        </div>

        <button class="btn-primary" type="submit" disabled={emailBusy}>
          {emailBusy ? 'Sending…' : 'Send reset code'}
        </button>
      </form>

    {:else if step === 'reset'}
      <h1 class="auth-title">Reset your password</h1>
      <p class="auth-sub">A 6-digit code was sent to <strong>{email}</strong>. Enter it below along with your new password.</p>

      {#if resetErr}
        <div class="error-bar">{resetErr}</div>
      {/if}

      <form onsubmit={submitReset} novalidate>
        <div class="field">
          <label class="field-label" for="fp-code">Verification code</label>
          <input
            id="fp-code"
            class="field-input otp-input"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            bind:value={otpCode}
            disabled={resetBusy}
          />
        </div>

        <div class="field">
          <label class="field-label" for="fp-pw">New password</label>
          <div class="field-pw-wrap">
            <input
              id="fp-pw"
              class="field-input"
              type={showPw ? 'text' : 'password'}
              autocomplete="new-password"
              placeholder="Min. 8 characters"
              bind:value={newPassword}
              disabled={resetBusy}
            />
            <button
              type="button"
              class="pw-toggle"
              onclick={() => { showPw = !showPw; }}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {#if showPw}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {/if}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="fp-pw2">Confirm new password</label>
          <input
            id="fp-pw2"
            class="field-input"
            type={showPw ? 'text' : 'password'}
            autocomplete="new-password"
            placeholder="Repeat password"
            bind:value={confirmPw}
            disabled={resetBusy}
          />
        </div>

        <button class="btn-primary" type="submit" disabled={resetBusy}>
          {resetBusy ? 'Resetting…' : 'Reset password'}
        </button>
      </form>

      <button class="link-btn" onclick={() => { step = 'email'; otpCode = ''; newPassword = ''; confirmPw = ''; resetErr = ''; }}>
        Use a different email
      </button>

    {:else}
      <!-- Done -->
      <div class="done-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h1 class="auth-title">Password reset</h1>
      <p class="auth-sub">Your password has been updated. You can now log in with your new password.</p>
    {/if}

    <a class="back-link" href="/login">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      Back to login
    </a>

  </div>
</div>

<style>
  .auth-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: oklch(13% 0.02 264);
  }

  .auth-card {
    width: 100%;
    max-width: 400px;
    background: var(--canvas);
    border: 1px solid var(--hairline);
    border-radius: var(--r-xl);
    padding: 36px 32px;
    box-shadow: var(--shadow-l4);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .auth-logo {
    margin-bottom: 20px;
  }

  .auth-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.025em;
    margin-bottom: 6px;
  }

  .auth-sub {
    font-size: 13px;
    color: var(--body);
    margin-bottom: 24px;
    line-height: 1.5;
  }

  /* ── Error bar ── */
  .error-bar {
    padding: 10px 12px;
    background: var(--error-soft);
    border: 1px solid var(--error);
    border-radius: var(--r-md);
    font-size: 13px;
    color: var(--error);
    margin-bottom: 16px;
  }

  /* ── Form fields ── */
  form { display: flex; flex-direction: column; gap: 0; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: 0.01em;
  }

  .field-input {
    padding: 9px 11px;
    border-radius: var(--r-sm);
    border: 1px solid var(--hairline);
    background: var(--canvas-soft);
    font-size: 13px;
    font-family: var(--font-sans);
    color: var(--ink);
    outline: none;
    transition: border-color 120ms ease;
    width: 100%;
  }
  .field-input:focus { border-color: var(--link); background: var(--canvas); }
  .field-input:disabled { opacity: 0.6; cursor: not-allowed; }

  .otp-input {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 10px;
    text-align: center;
    font-family: var(--font-mono);
  }

  .field-pw-wrap { position: relative; }
  .field-pw-wrap .field-input { padding-right: 38px; }
  .pw-toggle {
    position: absolute;
    right: 10px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    cursor: pointer; color: var(--mute);
    display: flex; align-items: center; justify-content: center;
    padding: 2px;
  }
  .pw-toggle:hover { color: var(--ink); }

  /* ── Submit button ── */
  .btn-primary {
    display: flex; align-items: center; justify-content: center;
    width: 100%;
    padding: 10px 16px;
    border-radius: var(--r-md);
    border: none;
    background: var(--ink); color: var(--on-primary);
    font-size: 14px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; margin-top: 8px;
    transition: opacity 120ms ease;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Done state ── */
  .done-icon {
    width: 52px; height: 52px;
    background: #dcfce7; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #16a34a; margin-bottom: 16px;
  }

  /* ── Links ── */
  .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 20px;
    font-size: 12px; color: var(--mute); text-decoration: none;
  }
  .back-link:hover { color: var(--ink); }

  .link-btn {
    background: none; border: none;
    cursor: pointer; color: var(--link);
    font-size: 12px; font-family: var(--font-sans);
    padding: 0; margin-top: 12px; text-decoration: underline;
    text-align: left;
  }

  @media (max-width: 480px) {
    .auth-card { padding: 28px 20px; }
  }
</style>
