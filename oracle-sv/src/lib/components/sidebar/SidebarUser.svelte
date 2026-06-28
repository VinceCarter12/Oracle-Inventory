<script lang="ts">
  interface Props {
    name?: string;
    email?: string;
    initials?: string;
    compact?: boolean;
  }
  const {
    name = 'Admin User',
    email = 'admin@oracle.com',
    initials = 'A',
    compact = false,
  }: Props = $props();
</script>

{#if compact}
  <!-- Rail variant: avatar only -->
  <button class="avatar-btn" aria-label="User profile — {name}">
    <span class="avatar">{initials}</span>
  </button>
{:else}
  <!-- Panel variant: avatar + name + email + gear -->
  <div class="user-row">
    <span class="avatar avatar--sm" aria-hidden="true">{initials}</span>
    <span class="user-text">
      <span class="user-name">{name}</span>
      <span class="user-email">{email}</span>
    </span>
  </div>
{/if}

<style>
  /* Rail avatar button */
  .avatar-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    transition: opacity 120ms ease;
  }

  .avatar-btn:hover {
    opacity: 0.8;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--on-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-sans);
    letter-spacing: -0.2px;
    flex-shrink: 0;
  }

  .avatar--sm {
    width: 30px;
    height: 30px;
    font-size: 11.5px;
  }

  /* Panel user row */
  .user-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border-radius: 10px;
    transition: background 120ms ease;
  }

  .user-row:hover {
    background: oklch(95% 0.002 106);
  }

  .user-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
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
    font-weight: 400;
    color: var(--mute);
    font-family: var(--font-sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

</style>
