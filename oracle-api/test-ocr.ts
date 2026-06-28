/**
 * Quick OCR test — no server needed, no auth required.
 * Usage:  npx ts-node test-ocr.ts <path-to-image>
 * Example: npx ts-node test-ocr.ts ./sample.jpg
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { TesseractOcrProvider } from "./src/lib/ocr/tesseract";
import { parseOcrText } from "./src/lib/ocr/parser";

async function main() {
  const imgPath = process.argv[2];
  if (!imgPath) {
    console.error("Usage: npx ts-node test-ocr.ts <image-path>");
    process.exit(1);
  }

  const absPath = path.resolve(imgPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const buffer   = fs.readFileSync(absPath);
  const mimeType = absPath.endsWith(".png") ? "image/png" : "image/jpeg";

  console.log(`\nRunning OCR on: ${absPath}`);
  console.log("(First run downloads ~10MB English language data — cached after that)\n");

  const provider = new TesseractOcrProvider();

  console.time("OCR duration");
  const { lines } = await provider.extractText(buffer, mimeType);
  console.timeEnd("OCR duration");

  console.log("\n─── Raw lines extracted ───────────────────────────");
  lines.forEach((l, i) => console.log(`  [${i + 1}] ${l}`));

  console.log("\n─── Parsed fields ─────────────────────────────────");
  const parsed = parseOcrText(lines);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
