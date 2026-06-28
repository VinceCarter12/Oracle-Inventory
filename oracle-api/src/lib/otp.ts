import { prisma } from "./prisma";

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOtp(email: string, purpose: string): Promise<string> {
  // Invalidate any prior unused codes for same email+purpose
  await prisma.otpCode.updateMany({
    where: { email, purpose, used: false },
    data: { used: true },
  });
  const code = genCode();
  await prisma.otpCode.create({
    data: {
      email,
      purpose,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });
  return code;
}

export async function verifyOtp(email: string, purpose: string, code: string): Promise<boolean> {
  const record = await prisma.otpCode.findFirst({
    where: { email, purpose, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return false;
  await prisma.otpCode.update({ where: { id: record.id }, data: { used: true } });
  return true;
}
