import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Permission keys ──────────────────────────────────────────────────────────

const PERMISSIONS = [
  { id: "perm-view-inventory",      key: "view_inventory",      description: "View assets and inventory" },
  { id: "perm-create-inventory",    key: "create_inventory",    description: "Add new assets" },
  { id: "perm-edit-inventory",      key: "edit_inventory",      description: "Edit existing assets" },
  { id: "perm-delete-inventory",    key: "delete_inventory",    description: "Delete assets" },
  { id: "perm-manage-users",        key: "manage_users",        description: "Create, edit, disable system users" },
  { id: "perm-assign-roles",        key: "assign_roles",        description: "Assign roles to users" },
  { id: "perm-view-reports",        key: "view_reports",        description: "View reports and analytics" },
  { id: "perm-manage-stock",        key: "manage_stock",        description: "Manage stock levels and transfers" },
  { id: "perm-approve-transactions",key: "approve_transactions", description: "Approve asset transactions" },
  { id: "perm-access-logs",         key: "access_logs",         description: "View activity logs" },
  { id: "perm-manage-settings",     key: "manage_settings",     description: "Manage system settings" },
  { id: "perm-manage-branches",     key: "manage_branches",     description: "Create, edit, archive, and delete branches" },
  { id: "perm-scan-assets",        key: "scan_assets",         description: "Use OCR scanner to capture asset data" },
] as const;

// ─── Role → permission mappings ───────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, string[]> = {
  "role-super-admin": [
    "perm-view-inventory", "perm-create-inventory", "perm-edit-inventory", "perm-delete-inventory",
    "perm-manage-users", "perm-assign-roles", "perm-view-reports", "perm-manage-stock",
    "perm-approve-transactions", "perm-access-logs", "perm-manage-settings", "perm-manage-branches",
    "perm-scan-assets",
  ],
  "role-admin": [
    "perm-view-inventory", "perm-create-inventory", "perm-edit-inventory", "perm-delete-inventory",
    "perm-view-reports", "perm-manage-stock", "perm-approve-transactions", "perm-access-logs",
    "perm-scan-assets",
  ],
  "role-staff": [
    "perm-view-inventory", "perm-create-inventory", "perm-edit-inventory", "perm-manage-stock",
    "perm-scan-assets",
  ],
  "role-viewer": [
    "perm-view-inventory", "perm-view-reports",
  ],
};

async function main() {
  console.log("Seeding database...");

  // ─── Permissions ───────────────────────────────────────────────────────────
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where:  { id: perm.id },
      update: { key: perm.key, description: perm.description },
      create: { id: perm.id, key: perm.key, description: perm.description },
    });
  }
  console.log(`✓ Permissions: ${PERMISSIONS.length} records`);

  // ─── Roles ─────────────────────────────────────────────────────────────────
  const roles = [
    { id: "role-super-admin", name: "super_admin", description: "Full system access" },
    { id: "role-admin",       name: "admin",       description: "Inventory and staff management" },
    { id: "role-staff",       name: "staff",       description: "Inventory operations" },
    { id: "role-viewer",      name: "viewer",      description: "Read-only access" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where:  { id: role.id },
      update: { name: role.name, description: role.description },
      create: { id: role.id, name: role.name, description: role.description },
    });
  }
  console.log("✓ Roles: super_admin, admin, staff, viewer");

  // ─── Role Permissions ──────────────────────────────────────────────────────
  for (const [roleId, permIds] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permissionId of permIds) {
      await prisma.rolePermission.upsert({
        where:  { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }
  console.log("✓ Role permissions assigned");

  // ─── System Users ──────────────────────────────────────────────────────────
  // ─── Branches ──────────────────────────────────────────────────────────────
  const branches = [
    { id: "branch-cubao",   name: "Cubao",   address: "Cubao, Quezon City" },
    { id: "branch-malolos", name: "Malolos", address: "Malolos, Bulacan" },
    { id: "branch-davao",   name: "Davao",   address: "Davao City" },
  ];
  for (const b of branches) {
    await prisma.branch.upsert({
      where:  { id: b.id },
      update: { name: b.name, address: b.address },
      create: { id: b.id, name: b.name, address: b.address },
    });
  }
  console.log("✓ Branches: Cubao, Malolos, Davao");

  // ─── Departments ──────────────────────────────────────────────────────────
  const departments = [
    { id: "dept-it",          name: "IT",          branchId: "branch-cubao" },
    { id: "dept-accounting",  name: "Accounting",  branchId: "branch-cubao" },
    { id: "dept-operations",  name: "Operations",  branchId: "branch-cubao" },
    { id: "dept-hr",          name: "HR",          branchId: "branch-cubao" },
  ];
  for (const d of departments) {
    await prisma.department.upsert({
      where:  { id: d.id },
      update: { name: d.name, branchId: d.branchId },
      create: { id: d.id, name: d.name, branchId: d.branchId },
    });
  }
  console.log("✓ Departments: IT, Accounting, Operations, HR");

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = [
    { id: "cat-laptop",    name: "Laptop" },
    { id: "cat-desktop",   name: "Desktop" },
    { id: "cat-phone",     name: "Company Phone" },
    { id: "cat-monitor",   name: "Monitor" },
    { id: "cat-printer",   name: "Printer" },
    { id: "cat-network",   name: "Network Equipment" },
    { id: "cat-cctv",      name: "CCTV" },
    { id: "cat-ip-phone",  name: "IP Phone" },
    { id: "cat-peripheral",name: "Peripheral" },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where:  { id: c.id },
      update: { name: c.name },
      create: { id: c.id, name: c.name },
    });
  }
  console.log("✓ Categories: Laptop, Desktop, Phone, Monitor, Printer, Network, CCTV, IP Phone, Peripheral");

  console.log("\nSeed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
