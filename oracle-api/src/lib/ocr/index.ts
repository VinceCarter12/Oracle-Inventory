import type { OcrProvider } from "./types";
import { TesseractOcrProvider } from "./tesseract";

let _provider: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (_provider) return _provider;
  _provider = new TesseractOcrProvider();
  return _provider;
}

export * from "./types";
export * from "./parser";
