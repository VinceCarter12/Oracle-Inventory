<script lang="ts">
  import NavIcon from './NavIcon.svelte';

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
    item: NavItemData;
    isActive: boolean;
    isOpen: boolean;
    activeSubId: string;
    onNavigate: (id: string) => void;
    onToggleGroup: (id: string) => void;
  }

  const { item, isActive, isOpen, activeSubId, onNavigate, onToggleGroup }: Props = $props();

  const hasChildren = $derived(!!(item.children && item.children.length > 0));
  const parentIsActive = $derived(isActive && hasChildren);
</script>

<div class="item-wrap">
  <button
    class="nav-row"
    class:nav-row--active={isActive}
    onclick={() => {
      if (hasChildren) {
        onToggleGroup(item.id);
        onNavigate(item.id);
      } else {
        onNavigate(item.id);
      }
    }}
    aria-current={isActive && !hasChildren ? 'page' : undefined}
    aria-expanded={hasChildren ? isOpen : undefined}
  >
    <span class="row-icon">
      <NavIcon name={item.icon} size={16} />
    </span>
    <span class="row-label">{item.label}</span>
    {#if hasChildren}
      <span class="row-badge" aria-hidden="true">{isOpen ? '−' : '+'}</span>
    {/if}
  </button>

  {#if hasChildren && isOpen}
    <div class="sub-list">
      {#each item.children! as child}
        <button
          class="sub-row"
          class:sub-row--active={activeSubId === child.id}
          onclick={() => onNavigate(child.id)}
          aria-current={activeSubId === child.id ? 'page' : undefined}
        >
          <span class="sub-icon">
            <NavIcon name="folder" size={14} />
          </span>
          <span class="sub-label">{child.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .item-wrap {
    display: flex;
    flex-direction: column;
  }

  .nav-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 10px;
    border-radius: 999px;
    border: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    text-align: left;
    color: var(--body);
    font-family: var(--font-sans);
    transition: background 120ms ease, color 120ms ease;
  }

  .nav-row:hover:not(.nav-row--active) {
    background: oklch(95% 0.002 106);
    color: var(--ink);
  }

  .nav-row--active {
    background: var(--ink);
    color: var(--on-primary);
  }

  .row-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
  }

  .row-label {
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.1px;
  }

  .row-badge {
    font-size: 13px;
    font-weight: 400;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: oklch(0% 0 0 / 8%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 1;
    font-family: var(--font-sans);
  }

  .nav-row--active .row-badge {
    background: oklch(100% 0 0 / 18%);
  }

  /* Sub-items */
  .sub-list {
    display: flex;
    flex-direction: column;
    margin-left: 19px;
    padding-left: 13px;
    border-left: 1px solid var(--hairline);
    padding-top: 3px;
    padding-bottom: 3px;
    gap: 1px;
  }

  .sub-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    border: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    text-align: left;
    color: var(--mute);
    font-family: var(--font-sans);
    transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
  }

  .sub-row:hover:not(.sub-row--active) {
    background: oklch(95% 0.002 106);
    color: var(--body);
  }

  .sub-row--active {
    background: var(--canvas);
    color: var(--ink);
    box-shadow: var(--shadow-l1);
  }

  .sub-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .sub-label {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.1px;
  }
</style>
