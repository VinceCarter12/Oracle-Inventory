import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.env.BOOTSTRAP_USER_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_USER_PASSWORD;
const name = process.env.BOOTSTRAP_USER_NAME?.trim();
const roleName = process.env.BOOTSTRAP_USER_ROLE?.trim().toLowerCase() || "admin";
const branchId = process.env.BOOTSTRAP_USER_BRANCH_ID?.trim() || undefined;
const allowedRoles = new Set(["admin", "staff", "viewer"]);

if (!email || !password || !name) {
  throw new Error("Set BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD, and BOOTSTRAP_USER_NAME in a secure shell before running this command.");
}
if (password.length < 16) {
  throw new Error("BOOTSTRAP_USER_PASSWORD must be at least 16 characters.");
}
if (!allowedRoles.has(roleName)) {
  throw new Error("BOOTSTRAP_USER_ROLE must be admin, staff, or viewer. Use db:bootstrap-admin for the one-time super_admin account.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [role, existing] = await Promise.all([
    prisma.role.findUnique({ where: { name: roleName } }),
    prisma.systemUser.findUnique({ where: { email } }),
  ]);
  if (!role) throw new Error("Reference roles are missing. Run db:seed first.");
  if (existing) throw new Error("A user with this email already exists. Refusing to overwrite it.");

  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw new Error("BOOTSTRAP_USER_BRANCH_ID does not match a seeded branch.");
  }

  await prisma.systemUser.create({
    data: {
      name,
      email,
      password: await bcrypt.hash(password, 12),
      roleId: role.id,
      branchId,
      status: "active",
      mustChangePassword: true,
    },
  });
  console.log(`Initial ${roleName} account created. Sign in and change the temporary password immediately.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
