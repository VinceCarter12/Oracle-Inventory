<script lang="ts">
  import { browser } from '$app/environment';
  import '../app.css';
  import { authStore } from '$lib/stores/auth.svelte';
  const { children } = $props();

  // Run synchronously so auth state is ready before any child onMount fires.
  // `browser` guard prevents localStorage access during SSR.
  if (browser) {
    authStore.init();
  }
</script>

{@render children()}
