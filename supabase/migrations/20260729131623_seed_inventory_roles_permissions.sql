INSERT INTO public."Permission" ("id", "key", "description") VALUES
  ('perm-view-inventory', 'view_inventory', 'View assets and inventory'),
  ('perm-create-inventory', 'create_inventory', 'Add new assets'),
  ('perm-edit-inventory', 'edit_inventory', 'Edit existing assets'),
  ('perm-delete-inventory', 'delete_inventory', 'Delete assets'),
  ('perm-manage-users', 'manage_users', 'Create, edit, disable system users'),
  ('perm-assign-roles', 'assign_roles', 'Assign roles to users'),
  ('perm-view-reports', 'view_reports', 'View reports and analytics'),
  ('perm-manage-stock', 'manage_stock', 'Manage stock levels and transfers'),
  ('perm-approve-transactions', 'approve_transactions', 'Approve asset transactions'),
  ('perm-access-logs', 'access_logs', 'View activity logs'),
  ('perm-manage-settings', 'manage_settings', 'Manage system settings'),
  ('perm-import-inventory', 'import_inventory', 'Upload and import Excel/CSV inventory files'),
  ('perm-force-import', 'force_import', 'Force overwrite duplicates during import'),
  ('perm-scan-assets', 'scan_assets', 'Use OCR scanner to capture asset data')
ON CONFLICT ("id") DO UPDATE SET "key" = EXCLUDED."key", "description" = EXCLUDED."description";

INSERT INTO public."Role" ("id", "name", "description") VALUES
  ('role-super-admin', 'super_admin', 'Full system access'),
  ('role-admin', 'admin', 'Inventory and staff management'),
  ('role-staff', 'staff', 'Inventory operations'),
  ('role-viewer', 'viewer', 'Read-only access')
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description";

INSERT INTO public."RolePermission" ("roleId", "permissionId")
SELECT role_id, permission_id
FROM (VALUES
  ('role-super-admin','perm-view-inventory'), ('role-super-admin','perm-create-inventory'),
  ('role-super-admin','perm-edit-inventory'), ('role-super-admin','perm-delete-inventory'),
  ('role-super-admin','perm-manage-users'), ('role-super-admin','perm-assign-roles'),
  ('role-super-admin','perm-view-reports'), ('role-super-admin','perm-manage-stock'),
  ('role-super-admin','perm-approve-transactions'), ('role-super-admin','perm-access-logs'),
  ('role-super-admin','perm-manage-settings'), ('role-super-admin','perm-import-inventory'),
  ('role-super-admin','perm-force-import'), ('role-super-admin','perm-scan-assets'),
  ('role-admin','perm-view-inventory'), ('role-admin','perm-create-inventory'),
  ('role-admin','perm-edit-inventory'), ('role-admin','perm-delete-inventory'),
  ('role-admin','perm-view-reports'), ('role-admin','perm-manage-stock'),
  ('role-admin','perm-approve-transactions'), ('role-admin','perm-access-logs'),
  ('role-admin','perm-import-inventory'), ('role-admin','perm-scan-assets'),
  ('role-staff','perm-view-inventory'), ('role-staff','perm-create-inventory'),
  ('role-staff','perm-edit-inventory'), ('role-staff','perm-manage-stock'),
  ('role-staff','perm-scan-assets'),
  ('role-viewer','perm-view-inventory'), ('role-viewer','perm-view-reports')
) AS mappings(role_id, permission_id)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;


