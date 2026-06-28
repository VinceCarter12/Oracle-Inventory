import Tesseract from "tesseract.js";
import type { OcrProvider, OcrRawResponse } from "./types";

// ── Sharp (optional — graceful degradation if native bindings missing) ─────────
type SharpLib = typeof import("sharp");
let _sharp: SharpLib | null | undefined; // undefined = not yet attempted

async function getSharp(): Promise<SharpLib | null> {
  if (_sharp !== undefined) return _sharp;
  try {
    _sharp = ((await import("sharp")) as unknown as { default: SharpLib }).default;
  } catch {
    console.warn("[OCR] sharp not available — running without preprocessing");
    _sharp = null;
  }
  return _sharp;
}

async function preprocess(buf: Buffer): Promise<Buffer> {
  const sharp = await getSharp();
  if (!sharp) return buf;
  return sharp(buf)
    .rotate()                                      // auto-orient via EXIF
    .resize({ width: 1600, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function invertBuffer(buf: Buffer): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    return await sharp(buf).negate({ alpha: false }).toBuffer();
  } catch {
    return null;
  }
}

async function rotateJpeg(buf: Buffer, angle: 90 | 180 | 270): Promise<Buffer> {
  const sharp = await getSharp();
  if (!sharp) return buf;
  return sharp(buf).rotate(angle).jpeg({ quality: 90 }).toBuffer();
}

interface RecognizeResult {
  lines:   string[];
  raw:     Array<{ text: string; confidence: number }>;
  avgConf: number;
}

async function recognize(buf: Buffer): Promise<RecognizeResult> {
  const { data } = await Tesseract.recognize(buf, "eng");

  const lines = data.text
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const rawData = data as unknown as {
    words?: Array<{ text: string; confidence: number }>;
  };
  const words = rawData.words ?? [];
  const raw = words.map((w) => ({
    text:       w.text,
    confidence: parseFloat((w.confidence / 100).toFixed(3)),
  }));
  const avgConf =
    words.length > 0
      ? words.reduce((s, w) => s + w.confidence, 0) / words.length
      : 0;

  return { lines, raw, avgConf };
}

export class TesseractOcrProvider implements OcrProvider {
  async extractText(imageBuffer: Buffer, _mimeType: string): Promise<OcrRawResponse> {
    const preprocessed = await preprocess(imageBuffer);
    let best = await recognize(preprocessed);

    // Also try inverted image — helps with light-on-dark labels (e.g. monitor stickers)
    const inverted = await invertBuffer(preprocessed);
    if (inverted) {
      try {
        const invertedResult = await recognize(inverted);
        if (invertedResult.avgConf > best.avgConf) best = invertedResult;
      } catch {
        // skip if inverted recognition fails
      }
    }

    // If mean word confidence < 40 %, try the three other orientations and keep
    // whichever scores highest — handles photos taken sideways or upside-down.
    if (best.avgConf < 40) {
      for (const angle of [90, 180, 270] as const) {
        try {
          const rotated  = await rotateJpeg(preprocessed, angle);
          const attempt  = await recognize(rotated);
          if (attempt.avgConf > best.avgConf) best = attempt;
        } catch {
          // skip if rotation fails
        }
      }
    }

    return { lines: best.lines, raw: best.raw };
  }
}
