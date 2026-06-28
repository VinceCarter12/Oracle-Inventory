import nodemailer from "nodemailer";
import crypto from "crypto";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/** Generate a 6-digit numeric OTP */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

type OtpPurpose = "forgot_password" | "change_email" | "change_password";

const SUBJECTS: Record<OtpPurpose, string> = {
  forgot_password: "Reset your Oracle Inventory password",
  change_email:    "Confirm your new email address",
  change_password: "Confirm your password change",
};

const LABELS: Record<OtpPurpose, string> = {
  forgot_password: "reset your password",
  change_email:    "confirm your email change",
  change_password: "confirm your password change",
};

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: OtpPurpose,
): Promise<void> {
  const subject = SUBJECTS[purpose];
  const label   = LABELS[purpose];

  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "Oracle Inventory <noreply@oracle.local>",
    to,
    subject,
    text: `Your verification code to ${label} is: ${code}\n\nThis code expires in 15 minutes. If you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;">
        <h2 style="font-size:18px;font-weight:600;color:#171717;margin:0 0 12px;">Verification code</h2>
        <p style="color:#4d4d4d;font-size:14px;margin:0 0 20px;">Use this code to ${label}:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#171717;padding:16px 0;border-top:1px solid #ebebeb;border-bottom:1px solid #ebebeb;margin-bottom:20px;">${code}</div>
        <p style="color:#888888;font-size:12px;margin:0;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
