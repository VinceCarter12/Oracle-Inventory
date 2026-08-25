<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
  const { children } = $props();

  const authenticated      = $derived(authStore.isAuthenticated);
  const mustChangePassword = $derived(authStore.user?.mustChangePassword ?? false);

  let mobileSidebarOpen = $state(false);

  $effect(() => {
    if (!authenticated) goto('/login');
    else if (mustChangePassword) goto('/first-login');
  });

  // Periodically check if JWT has expired while user is idle on a page
  onMount(() => {
    const interval = setInterval(() => {
      const token = authStore.token;
      if (!token) return;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
          authStore.logout();
        }
      } catch {
        authStore.logout();
      }
    }, 60_000);
    return () => clearInterval(interval);
  });
</script>

{#if authenticated}
<div class="app-shell">
  <!-- Compact top bar — visible on tablet and smaller screens -->
  <div class="mobile-topbar">
    <button class="hamburger" onclick={() => mobileSidebarOpen = true} aria-label="Open menu" aria-expanded={mobileSidebarOpen} aria-controls="main-sidebar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6H21M3 12H21M3 18H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    <img src="/oracle-logo.png" alt="Oracle" class="mobile-logo" />
  </div>

  <Sidebar {mobileSidebarOpen} onMobileClose={() => mobileSidebarOpen = false} />
  <main class="main-content">
    {@render children()}
  </main>
</div>
{/if}

<style>
  :global(html, body) {
    background: var(--canvas-soft-2);
  }

  .app-shell {
    display: flex;
    flex-direction: row;
    height: 100vh;
    background: var(--canvas-soft-2);
  }

  .main-content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 32px;
  }

  .mobile-topbar {
    display: none;
  }

  /* iPad/tablet: keep the content usable by turning the sidebar into a drawer. */
  @media (max-width: 1023px) {
    .app-shell {
      flex-direction: column;
    }

    .mobile-topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--canvas-soft-2);
      border-bottom: 1px solid var(--hairline);
      position: sticky;
      top: 0;
      z-index: 100;
      flex-shrink: 0;
    }

    .hamburger {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: var(--ink);
      display: flex;
      align-items: center;
    }

    .mobile-logo {
      height: 22px;
      width: auto;
      object-fit: contain;
    }

    .main-content {
      padding: 16px;
    }
  }
</style>
