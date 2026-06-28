import { authStore } from '$lib/stores/auth.svelte';

/** Check if current user has a specific permission */
export function can(key: string): boolean {
  return authStore.hasPermission(key);
}

/** Check if current user has ALL of the given permissions */
export function canAll(...keys: string[]): boolean {
  return keys.every((k) => authStore.hasPermission(k));
}

/** Check if current user has ANY of the given permissions */
export function canAny(...keys: string[]): boolean {
  return keys.some((k) => authStore.hasPermission(k));
}

/** Throw-style guard — returns true or false, useful in load functions */
export function requirePermission(key: string): boolean {
  return authStore.hasPermission(key);
}

/** All permission keys used in the system */
export const PERMISSIONS = [
  'view_inventory',
  'create_inventory',
  'edit_inventory',
  'delete_inventory',
  'manage_users',
  'assign_roles',
  'view_reports',
  'manage_stock',
  'approve_transactions',
  'access_logs',
  'manage_settings',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];
