// Permission codes shared by the app (to hide buttons) and the server (the real gate).
// The owner (ADMIN) always has every permission. Staff get the defaults below when added.

export const PERMISSIONS = [
  { code: 'ORDER_CREATE', label: 'Save new orders', group: 'Orders', defaultOn: true },
  { code: 'ORDER_VIEW_ALL', label: "See everyone's orders", group: 'Orders', defaultOn: true },
  { code: 'ORDER_VIEW_AMOUNT', label: 'See amounts', group: 'Orders', defaultOn: true },
  { code: 'ORDER_EDIT_OWN', label: 'Edit own orders', group: 'Orders', defaultOn: true },
  { code: 'ORDER_EDIT_ALL', label: "Edit anyone's orders", group: 'Orders', defaultOn: false },
  { code: 'ORDER_DELETE', label: 'Delete orders', group: 'Orders', defaultOn: false },
  { code: 'LABEL_PRINT', label: 'Download labels', group: 'Printing', defaultOn: true },
  { code: 'LABEL_REPRINT', label: 'Reprint printed orders', group: 'Printing', defaultOn: false },
  { code: 'DUPLICATE_OVERRIDE', label: 'Save anyway on duplicate', group: 'Special', defaultOn: false },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['code'];
export type Role = 'ADMIN' | 'STAFF';

export const ALL_PERMISSION_CODES: Permission[] = PERMISSIONS.map((p) => p.code);
export const DEFAULT_STAFF_PERMISSIONS: Permission[] = PERMISSIONS.filter((p) => p.defaultOn).map((p) => p.code);

export function hasPermission(user: { role: Role; permissions: string[] } | null | undefined, code: Permission): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return user.permissions.includes(code);
}
