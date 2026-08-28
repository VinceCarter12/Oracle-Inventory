import { Resend } from "resend";
import crypto from "crypto";

// On the free tier without a verified domain, use "onboarding@resend.dev".
// Once oraclepetroleum.net is verified in Resend, change this to your real address.
const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
const APP_URL = process.env.APP_URL ?? "http://localhost:5174";

async function send(opts: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY before sending emails.");
  }

  const { error } = await new Resend(apiKey).emails.send({ from: FROM, ...opts });
  if (error) throw new Error(error.message);
}

// ── Generators ────────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 6-digit OTP */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// ── OTP emails ────────────────────────────────────────────────────────────────

type OtpPurpose = "forgot_password" | "change_email" | "change_password";

const OTP_SUBJECTS: Record<OtpPurpose, string> = {
  forgot_password: "Reset your Oracle Petroleum Inventory password",
  change_email:    "Confirm your new email address",
  change_password: "Confirm your password change",
};

const OTP_LABELS: Record<OtpPurpose, string> = {
  forgot_password: "reset your password",
  change_email:    "confirm your email change",
  change_password: "confirm your password change",
};

export async function sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  await send({
    to,
    subject: OTP_SUBJECTS[purpose],
    html: otpHtml(code, OTP_LABELS[purpose]),
  });
}

// ── Maintenance notification emails ───────────────────────────────────────────

export interface MaintenanceAsset {
  id: string;
  name: string;
  serialNumber: string | null;
  category: string | null;
  branch: string | null;
  nextMaintenanceDate: Date;
}

export async function sendMaintenanceReminderEmail(opts: {
  to: string;
  recipientName: string;
  asset: MaintenanceAsset;
  daysUntil: number;
}): Promise<void> {
  const dueStr = opts.asset.nextMaintenanceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await send({
    to: opts.to,
    subject: `Maintenance due in ${opts.daysUntil} day${opts.daysUntil === 1 ? '' : 's'}: ${opts.asset.name}`,
    html: maintenanceHtml({
      asset: opts.asset,
      dueStr,
      headline: `Maintenance due in ${opts.daysUntil} day${opts.daysUntil === 1 ? '' : 's'}`,
      badgeColor: '#ffefcf',
      badgeText: '#ab570a',
      badgeLabel: `In ${opts.daysUntil} day${opts.daysUntil === 1 ? '' : 's'}`,
    }),
  });
}

export async function sendMaintenanceDueEmail(opts: {
  to: string;
  recipientName: string;
  asset: MaintenanceAsset;
}): Promise<void> {
  const dueStr = opts.asset.nextMaintenanceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await send({
    to: opts.to,
    subject: `Maintenance due today: ${opts.asset.name}`,
    html: maintenanceHtml({
      asset: opts.asset,
      dueStr,
      headline: 'Maintenance due today',
      badgeColor: '#f7d4d6',
      badgeText: '#c50000',
      badgeLabel: 'Due Today',
    }),
  });
}

// ── HTML templates ────────────────────────────────────────────────────────────

function otpHtml(code: string, label: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;">
      <h2 style="font-size:18px;font-weight:600;color:#171717;margin:0 0 12px;">Verification code</h2>
      <p style="color:#4d4d4d;font-size:14px;margin:0 0 20px;">Use this code to ${label}:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#171717;padding:16px 0;border-top:1px solid #ebebeb;border-bottom:1px solid #ebebeb;margin-bottom:20px;">${code}</div>
      <p style="color:#888;font-size:12px;margin:0;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>`;
}

function maintenanceHtml(opts: {
  asset: MaintenanceAsset;
  dueStr: string;
  headline: string;
  badgeColor: string;
  badgeText: string;
  badgeLabel: string;
}): string {
  const { asset, dueStr, headline, badgeColor, badgeText, badgeLabel } = opts;
  const rows = [
    ['Asset Name',        asset.name],
    ['Serial Number',     asset.serialNumber ?? '—'],
    ['Category',          asset.category ?? '—'],
    ['Branch / Location', asset.branch ?? '—'],
    ['Maintenance Due',   dueStr],
  ];
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:40px 32px;background:#fff;border-radius:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <h1 style="font-size:18px;font-weight:700;color:#171717;margin:0;">${headline}</h1>
        <span style="display:inline-block;padding:4px 12px;border-radius:6px;background:${badgeColor};color:${badgeText};font-size:12px;font-weight:600;">${badgeLabel}</span>
      </div>
      <div style="background:#f5f5f5;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${rows.map(([label, val]) => `
          <tr>
            <td style="color:#888;padding:5px 0;width:45%;vertical-align:top;">${label}</td>
            <td style="color:#171717;font-weight:500;padding:5px 0;">${val}</td>
          </tr>`).join('')}
        </table>
      </div>
      <a href="${APP_URL}/assets/${asset.id}" style="display:inline-block;padding:12px 24px;background:#171717;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
        View Asset →
      </a>
      <p style="color:#aaa;font-size:12px;margin:28px 0 0;">
        This is an automated notification from Oracle Petroleum Inventory. Please do not reply to this email.
      </p>
    </div>`;
}

