<script lang="ts">
  import NavIcon from './NavIcon.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth.svelte';

  interface Props {
    mobileSidebarOpen?: boolean;
    onMobileClose?: () => void;
  }
  const { mobileSidebarOpen = false, onMobileClose = () => {} }: Props = $props();

  interface SubItem {
    id: string;
    label: string;
    href: string;
    permission?: string;
  }

  interface NavItemData {
    id: string;
    label: string;
    icon: string;
    href: string;
    children?: SubItem[];
    permission?: string;
  }

  interface NavGroup {
    label?: string;
    items: NavItemData[];
  }

  const NAV_GROUPS: NavGroup[] = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: 'home', href: '/dashboard' },
      ],
    },
    {
      label: 'Inventory',
      items: [
        {
          id: 'assets', label: 'Assets', icon: 'package', href: '/assets',
          permission: 'view_inventory',
          children: [
            { id: 'assets-all',    label: 'All Assets',    href: '/assets',        permission: 'view_inventory' },
            { id: 'assets-add',    label: 'Add Asset',     href: '/assets/add',    permission: 'create_inventory' },
            { id: 'assets-import', label: 'Import Assets', href: '/assets/import', permission: 'import_inventory' },
          ],
        },
        { id: 'assignments', label: 'Assignments', icon: 'clipboard', href: '/assignments', permission: 'view_inventory' },
      ],
    },
    {
      label: 'Organization',
      items: [
        { id: 'employees', label: 'Employees', icon: 'users',    href: '/employees', permission: 'view_inventory' },
        { id: 'branches',  label: 'Branches',  icon: 'building', href: '/branches',  permission: 'view_inventory' },
      ],
    },
    {
      label: 'Administration',
      items: [
        { id: 'users',     label: 'Users',          icon: 'shield',   href: '/users',    permission: 'manage_users' },
        { id: 'roles',     label: 'Roles',          icon: 'shield',   href: '/roles',    permission: 'assign_roles' },
        { id: 'reports',   label: 'Reports',        icon: 'analytics',href: '/reports',  permission: 'view_reports' },
        { id: 'activity',  label: 'Activity Logs',  icon: 'activity', href: '/activity', permission: 'access_logs' },
        { id: 'settings',  label: 'Settings',       icon: 'settings', href: '/settings', permission: 'manage_settings' },
      ],
    },
  ];

  // Read user fields directly so Svelte 5 tracks them as reactive dependencies
  const userRole        = $derived(authStore.user?.role ?? null);
  const userRoleId      = $derived(authStore.user?.roleId ?? null);
  const userPermissions = $derived(authStore.user?.permissions ?? []);
  const isSuperAdmin    = $derived(
    userRole === 'super_admin' || userRoleId === 'role-super-admin'
  );

  function allowed(permission?: string): boolean {
    if (!permission) return true;
    if (isSuperAdmin) return true;
    return userPermissions.includes(permission);
  }

  const nav = $derived(
    NAV_GROUPS
      .map(group => ({
        ...group,
        items: group.items
          .filter(item => allowed(item.permission))
          .map(item => ({
            ...item,
            children: item.children?.filter(c => allowed(c.permission)),
          })),
      }))
      .filter(group => group.items.length > 0)
  );

  // Flat list of all visible items (for active-state logic)
  const navFlat = $derived(nav.flatMap(g => g.items));

  // User display data
  const userName    = $derived(authStore.user?.name  ?? 'User');
  const userEmail   = $derived(authStore.user?.email ?? '');
  const userInitial = $derived(userName.charAt(0).toUpperCase());

  let expanded = $state(true);
  let openIds  = $state(new Set<string>());

  // Derive active state from the current URL
  const pathname = $derived($page.url.pathname);
  const search   = $derived($page.url.search);

  function getActiveId(): string {
    const fullUrl = pathname + search;

    // Pass 1: exact full-URL match
    for (const item of navFlat) {
      if (item.children) {
        for (const child of item.children) {
          if (fullUrl === child.href || pathname === child.href) return child.id;
        }
      } else {
        if (pathname === item.href) return item.id;
      }
    }

    // Pass 2: longest pathname-prefix match
    let bestId  = 'dashboard';
    let bestLen = -1;
    for (const item of navFlat) {
      if (item.children) {
        for (const child of item.children) {
          const childPath = child.href.split('?')[0];
          if (pathname === childPath || pathname.startsWith(childPath + '/')) {
            if (childPath.length > bestLen) { bestLen = childPath.length; bestId = child.id; }
          }
        }
      } else {
        const itemPath = item.href.split('?')[0];
        if (pathname === itemPath || pathname.startsWith(itemPath + '/')) {
          if (itemPath.length > bestLen) { bestLen = itemPath.length; bestId = item.id; }
        }
      }
    }
    return bestId;
  }

  const activeId = $derived(getActiveId());

  // Auto-open the group that contains the active child
  $effect(() => {
    for (const item of navFlat) {
      if (item.children?.some(c => c.id === activeId)) {
        if (!openIds.has(item.id)) {
          openIds = new Set([...openIds, item.id]);
        }
      }
    }
  });

  function toggle() {
    if (mobileSidebarOpen) {
      onMobileClose();
    } else {
      expanded = !expanded;
    }
  }
  function navigate(href: string) { goto(href); }
  function logout() {
    authStore.logout();
    goto('/login');
  }

  function toggleGroup(id: string) {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    openIds = next;
  }

  function isActive(item: NavItemData): boolean {
    if (activeId === item.id) return true;
    return item.children?.some(c => c.id === activeId) ?? false;
  }

  function isGroupActive(group: NavGroup): boolean {
    return group.items.some(item => isActive(item));
  }
</script>

<aside class="sidebar" class:expanded class:mobile-open={mobileSidebarOpen} aria-label="Main sidebar">

  <!-- ── Top: logo pill (collapsed) / Menu header (expanded) ───────────── -->
  <div class="sidebar-head">
    <button
      class="logo-btn"
      onclick={toggle}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      <img src="/oracle-logo.png" alt="Oracle logo" class="logo-img" />
    </button>
    <span class="menu-label">Menu</span>
    <button
      class="collapse-toggle"
      onclick={toggle}
      aria-label="Collapse sidebar"
      title="Collapse sidebar"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>

  <!-- ── Nav ───────────────────────────────────────────────────────────── -->
  <nav class="sidebar-nav" aria-label="Main navigation">
    {#each nav as group, gi}
      {#if gi > 0}
        <div class="nav-sep" role="separator"></div>
      {/if}

      {#if group.label}
        <span class="nav-section-label" aria-hidden="true">{group.label}</span>
      {/if}

      {#each group.items as item}
        <button
          class="nav-item"
          class:active={isActive(item)}
          onclick={() => {
            if (item.children?.length) {
              toggleGroup(item.id);
            } else {
              navigate(item.href);
            }
          }}
          aria-current={activeId === item.id ? 'page' : undefined}
          aria-expanded={item.children?.length ? openIds.has(item.id) : undefined}
          title={!expanded ? item.label : undefined}
        >
          <span class="icon-box">
            <NavIcon name={item.icon} size={18} />
          </span>
          <span class="item-label">{item.label}</span>
          {#if item.children?.length}
            <span class="item-badge" aria-hidden="true">
              {openIds.has(item.id) ? '−' : '+'}
            </span>
          {/if}
        </button>

        {#if item.children?.length && openIds.has(item.id)}
          <div class="sub-list">
            {#each item.children as child}
              <button
                class="sub-item"
                class:active={activeId === child.id}
                onclick={() => navigate(child.href)}
                aria-current={activeId === child.id ? 'page' : undefined}
              >
                <span class="sub-icon">
                  <NavIcon name="folder" size={14} />
                </span>
                <span class="sub-label">{child.label}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/each}
    {/each}
  </nav>

  <!-- ── User row ───────────────────────────────────────────────────────── -->
  <div class="sidebar-foot">
    <div class="foot-sep"></div>
    <div class="user-row">
      <span class="avatar" aria-hidden="true">{userInitial}</span>
      <span class="user-text">
        <span class="user-name">{userName}</span>
        <span class="user-email">{userEmail}</span>
      </span>
      <button class="gear-btn logout-btn" aria-label="Log out" title="Log out" onclick={logout}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 12H3M3 12L6 9M3 12L6 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 7C10 4.17157 10 2.75736 10.8787 1.87868C11.7574 1 13.1716 1 16 1H17C19.8284 1 21.2426 1 22.1213 1.87868C23 2.75736 23 4.17157 23 7V17C23 19.8284 23 21.2426 22.1213 22.1213C21.2426 23 19.8284 23 17 23H16C13.1716 23 11.7574 23 10.8787 22.1213C10 21.2426 10 19.8284 10 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>

</aside>

{#if mobileSidebarOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="mobile-backdrop" onclick={onMobileClose}></div>
{/if}

<style>
  /* ── Shell ──────────────────────────────────────────────────────────── */
  .sidebar {
    width: 56px;
    height: 100vh;
    position: sticky;
    top: 0;
    flex-shrink: 0;
    background: var(--canvas-soft-2);
    border-right: 1px solid var(--hairline);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Width animates; overflow:hidden clips labels while narrow */
    transition: width 300ms ease-in-out;
    z-index: 40;
  }

  .sidebar.expanded {
    width: 240px;
  }

  /* ── Head ───────────────────────────────────────────────────────────── */
  .sidebar-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 6px;
    flex-shrink: 0;
  }

  /*
    Logo button:
    - Collapsed: tall black pill (36 × 76px)
    - Expanded:  square transparent icon button (36 × 36px)
    Height + background + color all transition together.
  */
  .logo-btn {
    width: 36px;
    height: 76px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--on-primary);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition:
      height 300ms ease-in-out,
      background 300ms ease-in-out,
      color 200ms ease;
  }

  .logo-btn:hover {
    opacity: 0.85;
  }

  .logo-btn:active {
    transform: scale(0.95);
  }

  .logo-img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    display: block;
  }

  /* Tint logo white when button is in pill (collapsed) state */
  .sidebar:not(.expanded) .logo-img {
    filter: brightness(0) invert(1);
  }

  .sidebar.expanded .logo-btn {
    height: 36px;
    background: transparent;
    color: var(--ink);
  }

  /* "Menu" label — hidden when collapsed, fades in when expanded */
  .menu-label {
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-sans);
    color: var(--ink);
    letter-spacing: -0.3px;
    white-space: nowrap;
    opacity: 0;
    /* Fast fade-out (no delay) so it disappears before width collapses */
    transition: opacity 100ms ease 0ms;
  }

  .sidebar.expanded .menu-label {
    opacity: 1;
    /* Fade in after the width has started opening */
    transition: opacity 200ms ease 150ms;
  }

  /* ── Nav ────────────────────────────────────────────────────────────── */
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    padding: 6px 10px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  .sidebar-nav::-webkit-scrollbar {
    display: none;
  }

  .nav-sep {
    height: 1px;
    background: var(--hairline);
    margin: 6px 0;
  }

  /* Section label — shown when expanded, hidden when collapsed */
  .nav-section-label {
    display: block;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--mute);
    padding: 4px 8px 2px;
    white-space: nowrap;
    overflow: hidden;
    opacity: 0;
    max-height: 0;
    transition: opacity 100ms ease 0ms, max-height 100ms ease 0ms;
    pointer-events: none;
  }

  .sidebar.expanded .nav-section-label {
    opacity: 1;
    max-height: 24px;
    transition: opacity 200ms ease 150ms, max-height 200ms ease 150ms;
  }

  /*
    Nav item: always flex row.
    - Collapsed: 56px wide, padding centers the 36px icon-box
    - Expanded:  240px wide, label visible beside icon
    Active background is on icon-box (circle) in collapsed,
    on the nav-item itself (pill) in expanded — see below.
  */
  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 2px 10px 2px 8px;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    color: var(--body);
    font-family: var(--font-sans);
    text-align: left;
    transition: color 120ms ease;
  }

  /* ── Icon box: always 36×36, gets circle highlight in collapsed active ── */
  .icon-box {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 120ms ease, box-shadow 120ms ease;
  }

  /* Collapsed: strip left padding so icon-box centers at 28px (10px nav-padding + 18px icon-half) */
  .sidebar:not(.expanded) .nav-item {
    padding-left: 0;
  }

  /* Collapsed hover → subtle circle on icon-box */
  .sidebar:not(.expanded) .nav-item:hover .icon-box {
    background: oklch(93% 0.002 106);
  }

  /* Collapsed active → white circle with elevation on icon-box */
  .sidebar:not(.expanded) .nav-item.active .icon-box {
    background: var(--canvas);
    box-shadow: var(--shadow-l2);
    color: var(--ink);
  }

  /* Expanded hover → light bg on full nav-item row */
  .sidebar.expanded .nav-item:hover:not(.active) {
    background: oklch(93% 0.002 106);
  }

  /* Expanded active → black pill on full nav-item */
  .sidebar.expanded .nav-item.active {
    background: var(--ink);
    color: var(--on-primary);
  }

  /* Reset icon-box in expanded active (pill handles the bg) */
  .sidebar.expanded .nav-item.active .icon-box {
    background: transparent;
    box-shadow: none;
  }

  /* ── Labels ─────────────────────────────────────────────────────────── */
  .item-label {
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: -0.1px;
    white-space: nowrap;
    flex: 1;
    opacity: 0;
    transition: opacity 100ms ease 0ms; /* snap out fast before collapse */
  }

  .sidebar.expanded .item-label {
    opacity: 1;
    transition: opacity 200ms ease 150ms; /* delay — wait for width to open */
  }

  /* Badge: +/− for groups */
  .item-badge {
    font-size: 12px;
    font-weight: 400;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: oklch(0% 0 0 / 8%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 100ms ease 0ms;
  }

  .sidebar.expanded .item-badge {
    opacity: 1;
    transition: opacity 200ms ease 150ms;
  }

  .nav-item.active .item-badge {
    background: oklch(100% 0 0 / 18%);
  }

  /* ── Sub-items ──────────────────────────────────────────────────────── */
  .sub-list {
    display: flex;
    flex-direction: column;
    margin-left: 35px; /* aligns connector under icon center (10+8px padding + 36/2 = 36) */
    padding-left: 13px;
    border-left: 1px solid var(--hairline);
    gap: 1px;
    padding-top: 2px;
    padding-bottom: 2px;
  }

  .sub-item {
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

  .sub-item:hover:not(.active) {
    background: oklch(93% 0.002 106);
    color: var(--body);
  }

  .sub-item.active {
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
    letter-spacing: -0.1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── User foot ──────────────────────────────────────────────────────── */
  .sidebar-foot {
    flex-shrink: 0;
    padding: 4px 10px 14px;
  }

  /* Collapsed: center the avatar by centering the whole row */
  .sidebar:not(.expanded) .sidebar-foot {
    padding: 4px 0 14px;
  }

  .sidebar:not(.expanded) .user-row {
    justify-content: center;
    padding: 6px 0;
    gap: 0;
  }

  .foot-sep {
    height: 1px;
    background: var(--hairline);
    margin-bottom: 6px;
  }

  .user-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 0;
    border-radius: 10px;
    cursor: default;
  }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--on-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11.5px;
    font-weight: 600;
    font-family: var(--font-sans);
    flex-shrink: 0;
  }

  .user-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
    opacity: 0;
    transition: opacity 100ms ease 0ms;
  }

  .sidebar.expanded .user-text {
    opacity: 1;
    transition: opacity 200ms ease 150ms;
  }

  .user-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    font-family: var(--font-sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.1px;
    line-height: 1.2;
  }

  .user-email {
    font-size: 11.5px;
    color: var(--mute);
    font-family: var(--font-sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .gear-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    color: var(--mute);
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 100ms ease 0ms, color 120ms ease, background 120ms ease;
  }

  .sidebar.expanded .gear-btn {
    opacity: 1;
    transition: opacity 200ms ease 150ms, color 120ms ease, background 120ms ease;
  }

  .gear-btn:hover {
    color: var(--body);
    background: oklch(90% 0.003 264);
  }

  .logout-btn:hover {
    color: var(--error);
    background: var(--error-soft);
  }

  /* ── Mobile backdrop ─────────────────────────────────────────────────────── */
  .mobile-backdrop {
    display: none;
  }

  /* ── Mobile: sidebar becomes a fixed overlay drawer ─────────────────────── */
  @media (max-width: 767px) {
    .sidebar {
      position: fixed !important;
      left: 0;
      top: 0;
      height: 100vh;
      width: 240px !important;
      transform: translateX(-100%);
      transition: transform 300ms ease-in-out;
      z-index: 200;
    }

    .sidebar.mobile-open {
      transform: translateX(0);
    }

    .mobile-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: oklch(0% 0 0 / 40%);
      z-index: 199;
    }
  }

  /* ── Collapse toggle ─────────────────────────────────────────────────────── */
  .collapse-toggle {
    margin-left: auto;
    background: none;
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--mute);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 100ms ease 0ms, color 120ms ease, background 120ms ease;
  }

  .sidebar.expanded .collapse-toggle {
    opacity: 1;
    transition: opacity 200ms ease 150ms, color 120ms ease, background 120ms ease;
  }

  .collapse-toggle:hover {
    color: var(--body);
    background: oklch(93% 0.002 106);
  }
</style>
