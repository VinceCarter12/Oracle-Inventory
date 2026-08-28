import crypto from "crypto";

// AES-256-GCM at-rest encryption for NetworkDeviceCredential. The key never
// touches the database — it lives only in NETWORK_CREDENTIAL_KEY (32 raw
// bytes, hex or base64). Without it, a leaked ciphertext/iv/tag row is inert.
function loadKey(): Buffer | null {
  const raw = process.env.NETWORK_CREDENTIAL_KEY ?? "";
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) return Buffer.from(raw, "base64");
  return null;
}

export function deviceCredentialKeyConfigured(): boolean {
  return loadKey() !== null;
}

export type DeviceCredentialPayload = {
  username?: string;
  password?: string;
  snmpCommunity?: string;
  vpnKey?: string;
  wifiPassword?: string;
  apiKey?: string;
  recoveryCode?: string;
};

export function encryptDeviceCredentials(payload: DeviceCredentialPayload): { ciphertext: string; iv: string; tag: string } {
  const key = loadKey();
  if (!key) throw new Error("NETWORK_CREDENTIAL_KEY is not configured.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptDeviceCredentials(ciphertext: string, iv: string, tag: string): DeviceCredentialPayload {
  const key = loadKey();
  if (!key) throw new Error("NETWORK_CREDENTIAL_KEY is not configured.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
