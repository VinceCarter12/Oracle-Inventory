<script lang="ts">
  import NavItem from './NavItem.svelte';
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
    openIds: Set<string>;
    navItems: NavItemData[];
    onNavigate: (id: string) => void;
    onToggleGroup: (id: string) => void;
  }

  const { expanded, activeId, openIds, navItems, onNavigate, onToggleGroup }: Props = $props();

  function isItemActive(item: NavItemData): boolean {
    if (activeId === item.id) return true;
    if (item.children) return item.children.some(c => c.id === activeId);
    return false;
  }
</script>

<!--
  aria-hidden keeps screen readers from reading the closed panel.
  No `inert` — it suppresses CSS transitions in some browsers.
-->
<div
  class="panel"
  class:panel--open={expanded}
  aria-hidden={!expanded}
>
  <div class="panel-inner">
    <!-- Header -->
    <header class="panel-header">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C12 2 12.8 8.2 14.8 9.2C16.8 10.2 22 12 22 12C22 12 16.8 13.8 14.8 14.8C12.8 15.8 12 22 12 22C12 22 11.2 15.8 9.2 14.8C7.2 13.8 2 12 2 12C2 12 7.2 10.2 9.2 9.2C11.2 8.2 12 2 12 2Z"/>
      </svg>
      <span>Menu</span>
    </header>

    <!-- Nav -->
    <nav class="panel-nav" aria-label="Main navigation">
      {#each navItems as item}
        {#if item.dividerBefore}
          <div class="nav-divider" role="separator"></div>
        {/if}
        <NavItem
          {item}
          isActive={isItemActive(item)}
          isOpen={openIds.has(item.id)}
          activeSubId={activeId}
          {onNavigate}
          {onToggleGroup}
        />
      {/each}
    </nav>

    <!-- User row pinned to bottom -->
    <div class="panel-foot">
      <div class="foot-divider"></div>
      <SidebarUser
        compact={false}
        name="Admin User"
        email="admin@oracle.com"
        initials="A"
      />
    </div>
  </div>
</div>

<style>
  /* Outer clip shell — only width and opacity animate */
  .panel {
    width: 0;
    opacity: 0;
    overflow: hidden;
    flex-shrink: 0;
    height: 100%;
    /* width first, then opacity — matching ease-in-out at 300ms */
    transition:
      width 300ms ease-in-out,
      opacity 300ms ease-in-out;
  }

  .panel--open {
    width: 236px;
    opacity: 1;
  }

  /* Fixed-width inner container — stays 236px, clipped by parent */
  .panel-inner {
    width: 236px;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 12px 8px 14px;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--canvas-soft);
    /* Inset shadow for right border — gets clipped at width:0 */
    box-shadow: inset -1px 0 0 var(--hairline);
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
  }

  /* Labels and content fade in after the panel is mostly open */
  .panel-header,
  .panel-nav,
  .panel-foot {
    opacity: 0;
    transition: opacity 200ms ease 0ms;
    /* delay kicks in only when opening — on close it resets instantly */
  }

  .panel--open .panel-header,
  .panel--open .panel-nav,
  .panel--open .panel-foot {
    opacity: 1;
    transition: opacity 200ms ease 150ms; /* 150ms delay — wait for panel slide */
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px 32px;
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-sans);
    color: var(--ink);
    letter-spacing: -0.3px;
    flex-shrink: 0;
  }

  .panel-nav {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }

  .nav-divider {
    height: 1px;
    background: var(--hairline);
    margin: 6px 0;
  }

  .panel-foot {
    flex-shrink: 0;
    padding-top: 4px;
  }

  .foot-divider {
    height: 1px;
    background: var(--hairline);
    margin: 0 10px 6px;
  }
</style>
