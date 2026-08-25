<script lang="ts">
  import { browser, dev } from '$app/environment';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import '../app.css';
  import { authStore } from '$lib/stores/auth.svelte';
  const { children } = $props();

  // Run synchronously so auth state is ready before any child onMount fires.
  // `browser` guard prevents localStorage access during SSR.
  if (browser) {
    authStore.init();
  }

  // Local-dev-only convenience: silently sign in as the seeded dev admin
  // instead of showing the login form. /dev/auto-login refuses to run
  // outside `vite dev`, so this is a no-op (404, caught and ignored) in any
  // deployed build.
  onMount(async () => {
    if (!dev || authStore.isAuthenticated) return;
    try {
      const res = await fetch('/dev/auto-login', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      authStore.login(data.user, data.token);
      if (location.pathname === '/login' || location.pathname === '/') goto('/dashboard');
    } catch {
      // Not enabled, or the API isn't reachable yet — normal login still works.
    }
  });
</script>

{@render children()}
