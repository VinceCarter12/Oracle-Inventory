<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = 'Search…',
    oninput,
  }: {
    value?: string;
    placeholder?: string;
    oninput?: () => void;
  } = $props();
</script>

<div class="search-wrap">
  <svg
    class="search-icon"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5" />
    <path
      d="M21 21l-4.35-4.35"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
  <input
    class="search-input"
    type="search"
    {placeholder}
    bind:value
    {oninput}
  />
</div>

<style>
  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    background: var(--canvas);
    padding: 0 10px 0 10px;
    gap: 7px;
    flex: 1;
    min-width: 180px;
    max-width: 320px;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .search-wrap:focus-within {
    border-color: var(--link);
    box-shadow: 0 0 0 3px var(--link-bg-soft);
  }
  .search-icon {
    color: var(--mute);
    flex-shrink: 0;
  }
  .search-input {
    border: none;
    background: transparent;
    font-size: 13.5px;
    font-family: var(--font-sans);
    color: var(--ink);
    outline: none;
    width: 100%;
    padding: 7px 0;
  }
  .search-input::placeholder {
    color: var(--mute);
  }
  /* Remove native clear button from webkit */
  .search-input::-webkit-search-cancel-button {
    -webkit-appearance: none;
  }
</style>
