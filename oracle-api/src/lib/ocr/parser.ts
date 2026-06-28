import type { ParsedAssetData } from "./types";

// ── Known brands ──────────────────────────────────────────────────────────────
const KNOWN_BRANDS = [
  "Samsung", "Apple", "iPhone", "Huawei", "Xiaomi", "OPPO", "Vivo", "Realme",
  "OnePlus", "Nokia", "Motorola", "Sony", "LG", "Lenovo", "Asus", "Acer",
  "HP", "Dell", "Toshiba", "Fujitsu", "Panasonic", "Sharp",
  "Cisco", "Netgear", "TP-Link", "D-Link", "Ubiquiti",
  "ViewSonic", "BenQ", "AOC", "Philips",
];

const MOBILE_KEYWORDS  = ["galaxy", "iphone", "ipad", "redmi", "note", "ultra", "pro max", "5g", "4g", "imei"];
const LAPTOP_KEYWORDS  = ["latitude", "inspiron", "thinkpad", "elitebook", "probook", "macbook",
                          "vivobook", "aspire", "zenbook", "service tag", "thinkcentre", "optiplex"];
const NETWORK_KEYWORDS = ["switch", "router", "access point", " ap ", "firewall", "cisco",
                          "netgear", "ubiquiti", "tp-link"];
const MONITOR_KEYWORDS = ["monitor", "display", "lcd", "led", "hz", "viewsonic", "benq", " aoc", "philips",
                          "va1", "va2", "vx", "vp", "xl", "ew", "sw", "pd"];

// ── Regex patterns ────────────────────────────────────────────────────────────

/**
 * Serial number — labeled first.
 * Labels: S/N  SN  SNID  SERIAL  SERIAL NO  SER NO  SERIAL#  S-No  Serial Number
 * Value:  5–24 chars [A-Z0-9-]
 */
const SN_LABEL_RE = /(?:ser(?:ial)?(?:\s*(?:no?\.?|number|#|id))?|s\/n|sn\b|snid|s[-\u2011]no?)[\s:/#.\-]*([A-Z0-9][A-Z0-9\-]{4,23})/gi;

/**
 * Model — labeled.
 * Labels: MODEL  MODEL NO  M/N  TYPE  PRODUCT NO  PN  P/N  SKU
 * Value:  2–40 chars
 */
const MODEL_LABEL_RE = /(?:model(?:\s*no?\.?)?|m\/n|type|product(?:\s*no?\.?)?|p\/?n|sku)[\s:/#.\-]*([A-Za-z0-9][A-Za-z0-9 \-\/\.]{1,38})/gi;

/**
 * MAC — labeled (MAC / MAC ID / MAC Address) or bare hex-pair pattern.
 */
const MAC_LABEL_RE = /mac(?:\s*(?:id|address))?[\s:/#.\-]*((?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2})/i;
const MAC_BARE_RE  = /\b((?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2})\b/;

/**
 * Service tag: "Service Tag" / "Express Service Code" (Dell) / vendor variants.
 */
const SERVICE_TAG_RE = /(?:service\s*tag|express\s*service\s*(?:code|no?\.?))[\s:/#.\-]*([A-Z0-9]{4,15})/gi;

/**
 * Asset tag: "Asset Tag" / "Asset#" / "Asset No".
 */
const ASSET_TAG_RE = /asset\s*(?:tag|#|no\.?)?[\s:/#.\-]*([A-Z0-9]{4,15})/gi;

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectBrand(lines: string[]): string {
  const joined = lines.join(" ").toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (joined.includes(brand.toLowerCase())) return brand;
  }
  return "";
}

function detectDeviceType(lines: string[]): "mobile" | "laptop" | "network" | "monitor" | "unknown" {
  const joined = lines.join(" ").toLowerCase();
  if (MOBILE_KEYWORDS.some(k  => joined.includes(k))) return "mobile";
  if (LAPTOP_KEYWORDS.some(k  => joined.includes(k))) return "laptop";
  if (NETWORK_KEYWORDS.some(k => joined.includes(k))) return "network";
  if (MONITOR_KEYWORDS.some(k => joined.includes(k))) return "monitor";
  return "unknown";
}

function extractModelNearBrand(lines: string[], brand: string): string {
  if (!brand) return "";
  for (const line of lines) {
    const idx = line.toLowerCase().indexOf(brand.toLowerCase());
    if (idx !== -1) {
      const after = line.slice(idx + brand.length).trim();
      if (after.length >= 2 && after.length <= 40) return after.split("\n")[0].trim();
    }
  }
  return "";
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOcrText(lines: string[]): ParsedAssetData {
  const result: ParsedAssetData = {
    assetName:    "",
    brand:        "",
    model:        "",
    serialNumber: "",
    imei1:        "",
    imei2:        "",
    macAddress:   "",
    serviceTag:   "",
    assetTag:     "",
    deviceType:   "unknown",
    extraLines:   [],
    categoryHint: undefined,
  };

  const joined = lines.join(" ");

  // ── IMEI (labeled first, then bare 15-digit fallback) ─────────────────────
  const imeis: string[] = [];
  let m: RegExpExecArray | null;

  const imeiLabelRe = /imei\s*\d?\s*[:\s]?\s*(\d{15})/gi;
  while ((m = imeiLabelRe.exec(joined)) !== null) {
    if (!imeis.includes(m[1])) imeis.push(m[1]);
  }
  if (imeis.length < 2) {
    const bareRe = /\b(\d{15})\b/g;
    while ((m = bareRe.exec(joined)) !== null) {
      if (!imeis.includes(m[1])) imeis.push(m[1]);
      if (imeis.length >= 2) break;
    }
  }
  result.imei1 = imeis[0] ?? "";
  result.imei2 = imeis[1] ?? "";

  // ── Serial number (labeled first) ─────────────────────────────────────────
  SN_LABEL_RE.lastIndex = 0;
  const snMatch = SN_LABEL_RE.exec(joined);
  if (snMatch) result.serialNumber = snMatch[1].toUpperCase();

  // ── MAC address (labeled first, bare fallback) ─────────────────────────────
  const macLabelMatch = MAC_LABEL_RE.exec(joined);
  if (macLabelMatch) {
    result.macAddress = macLabelMatch[1].toUpperCase();
  } else {
    const macBareMatch = MAC_BARE_RE.exec(joined);
    if (macBareMatch) result.macAddress = macBareMatch[1].toUpperCase();
  }

  // ── Service tag ────────────────────────────────────────────────────────────
  SERVICE_TAG_RE.lastIndex = 0;
  const stMatch = SERVICE_TAG_RE.exec(joined);
  if (stMatch) result.serviceTag = stMatch[1].toUpperCase();

  // ── Asset tag ──────────────────────────────────────────────────────────────
  ASSET_TAG_RE.lastIndex = 0;
  const atMatch = ASSET_TAG_RE.exec(joined);
  if (atMatch) result.assetTag = atMatch[1].toUpperCase();

  // ── Brand + device type ───────────────────────────────────────────────────
  result.brand      = detectBrand(lines);
  result.deviceType = detectDeviceType(lines);
  if (result.deviceType === "monitor") result.categoryHint = "Monitors";

  // ── Model (labeled first, then brand-proximity fallback) ──────────────────
  MODEL_LABEL_RE.lastIndex = 0;
  const modelMatch = MODEL_LABEL_RE.exec(joined);
  if (modelMatch) {
    result.model = modelMatch[1].trim().replace(/\s+/g, " ").substring(0, 40);
  } else {
    result.model = extractModelNearBrand(lines, result.brand);
  }

  // ── Asset name (brand + model composite) ──────────────────────────────────
  if (result.brand && result.model) {
    result.assetName = `${result.brand} ${result.model}`;
  } else if (result.brand) {
    result.assetName = result.brand;
  } else if (result.model) {
    result.assetName = result.model;
  }

  // ── scanReason — set when nothing useful was found ────────────────────────
  const hasId = result.serialNumber || result.imei1 || result.macAddress ||
                result.serviceTag   || result.assetTag;
  if (!hasId && !result.model) {
    result.scanReason =
      "No serial number, model, or IMEI detected. " +
      "Try cropping closer to the label or improving contrast.";
  }

  // ── Extra lines (up to 10) not matched by any field ───────────────────────
  const usedValues = [
    result.serialNumber, result.imei1, result.imei2,
    result.macAddress,   result.serviceTag, result.assetTag,
  ].filter(Boolean);

  result.extraLines = lines.filter(line => {
    const l = line.trim();
    if (!l || l.length < 3) return false;
    if (result.brand && l.toLowerCase().includes(result.brand.toLowerCase())) return false;
    if (usedValues.some(v => l.toUpperCase().includes(v.toUpperCase()))) return false;
    return true;
  }).slice(0, 10);

  return result;
}
