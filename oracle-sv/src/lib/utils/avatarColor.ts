/**
 * Avatar color utility — deterministic color from an entity ID.
 * Shared across users, employees, and any page that renders avatar initials.
 */

export const AVATAR_COLORS = [
  'oklch(52% 0.21 264)',
  'oklch(55% 0.18 210)',
  'oklch(55% 0.19 155)',
  'oklch(52% 0.22 340)',
  'oklch(60% 0.20 60)',
  'oklch(48% 0.22 300)',
  'oklch(52% 0.16 55)',
  'oklch(42% 0.18 240)',
  'oklch(50% 0.18 180)',
  'oklch(44% 0.20 20)',
];

/** Returns a stable oklch color string based on the entity's ID. */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Returns up to 2 uppercase initials from a name. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
