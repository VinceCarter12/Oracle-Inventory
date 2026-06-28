<script lang="ts">
  import NavIcon from './NavIcon.svelte';
  import SidebarUser from './SidebarUser.svelte';

  interface SubItem {
    id: string;
    label: string;
  }

  interface NavItemData {
    id: string;
    label: string;
    icon: string;
    children?: SubItem[];
    dividerBefore?: boolean;
  }

  interface Props {
    expanded: boolean;
    activeId: string;
    navItems: NavItemData[];
    onToggle: () => void;
    onNavigate: (id: string) => void;
  }

  const { expanded, activeId, navItems, onToggle, onNavigate }: Props = $props();

  function isItemActive(item: NavItemData): boolean {
    if (activeId === item.id) return true;
    if (item.children) return item.children.some(c => c.id === activeId);
    return false;
  }
</script>

<div class="rail">
  <!-- Logo / toggle pill -->
  <button
    class="logo-pill"
    onclick={onToggle}
    aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
    aria-expanded={expanded}
  >
    <!-- 4-point star, matches reference -->
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C12 2 12.8 8.2 14.8 9.2C16.8 10.2 22 12 22 12C22 12 16.8 13.8 14.8 14.8C12.8 15.8 12 22 12 22C12 22 11.2 15.8 9.2 14.8C7.2 13.8 2 12 2 12C2 12 7.2 10.2 9.2 9.2C11.2 8.2 12 2 12 2Z"/>
    </svg>
  </button>

  <!-- Nav icons -->
  <nav class="icon-list" aria-label="Main navigation">
    {#each navItems as item}
      {#if item.dividerBefore}
        <div class="rail-divider" role="separator"></div>
      {/if}
      <button
        class="icon-btn"
        class:icon-btn--active={isItemActive(item)}
        onclick={() => onNavigate(item.id)}
        aria-label={item.label}
        aria-current={activeId === item.id ? 'page' : undefined}
        title={item.label}
      >
        <NavIcon name={item.icon} size={18} />
      </button>
    {/each}
  </nav>

  <!-- User avatar at bottom -->
  <div class="rail-foot">
    <SidebarUser compact={true} initials="A" name="Admin User" email="admin@oracle.com" />
  </div>
</div>

<style>
  .rail {
    width: 56px;
    background: var(--canvas-soft-2);
    border-right: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0 14px;
    flex-shrink: 0;
    height: 100%;
  }

  /* Logo pill — tall rounded capsule, ink bg */
  .logo-pill {
    width: 36px;
    height: 76px;
    background: var(--ink);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--on-primary);
    border: none;
    cursor: pointer;
    margin-bottom: 14px;
    flex-shrink: 0;
    transition: opacity 150ms ease, transform 150ms ease;
  }

  .logo-pill:hover {
    opacity: 0.82;
  }

  .logo-pill:active {
    transform: scale(0.96);
  }

  /* Icon list */
  .icon-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex: 1;
    width: 100%;
    padding: 0 10px;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--mute);
    transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
    flex-shrink: 0;
  }

  .icon-btn:hover:not(.icon-btn--active) {
    background: oklch(93% 0.002 106);
    color: var(--body);
  }

  .icon-btn--active {
    background: var(--canvas);
    color: var(--ink);
    box-shadow: var(--shadow-l2);
  }

  .rail-divider {
    width: 22px;
    height: 1px;
    background: var(--hairline);
    margin: 6px 0;
    flex-shrink: 0;
  }

  /* Bottom user */
  .rail-foot {
    flex-shrink: 0;
    padding-top: 10px;
  }
</style>
