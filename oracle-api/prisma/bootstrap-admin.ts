import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Initial Administrator";

if (!email || !password) {
  throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in a secure shell before running this command.");
}

if (password.length < 16) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters.");
}

const adminEmail = email;
const adminPassword = password;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const role = await prisma.role.findUnique({ where: { name: "super_admin" } });
  if (!role) throw new Error("Reference roles are missing. Run db:seed first.");

  const existingAdmin = await prisma.systemUser.findFirst({
    where: { roleId: role.id, status: "active" },
    select: { id: true },
  });
  if (existingAdmin) {
    throw new Error("An active super_admin already exists. Refusing to create another bootstrap account.");
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  await prisma.systemUser.create({
    data: { name, email: adminEmail, password: hashedPassword, roleId: role.id, status: "active", mustChangePassword: true },
  });

  console.log("Initial administrator created. Sign in and change the temporary password immediately.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
