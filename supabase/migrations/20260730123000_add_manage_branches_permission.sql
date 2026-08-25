-- Adds a narrowly scoped Branches capability. Existing Admin/Staff/Viewer
-- assignments are deliberately unchanged; Super Admin retains its code-level bypass.
INSERT INTO public."Permission" ("id", "key", "description")
VALUES ('perm-manage-branches', 'manage_branches', 'Create, edit, archive, and delete branches')
ON CONFLICT ("id") DO UPDATE
SET "key" = EXCLUDED."key", "description" = EXCLUDED."description";

-- Rollback (run manually only if this permission is no longer in use):
-- DELETE FROM public."Permission" WHERE "id" = 'perm-manage-branches';

-- Verification after applying:
-- SELECT "id", "key", "description" FROM public."Permission" WHERE "id" = 'perm-manage-branches';
