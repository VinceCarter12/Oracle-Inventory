export interface OcrLine {
  text: string;
  confidence: number;
}

export interface OcrRawResponse {
  lines: string[];
  raw: OcrLine[];
}

/** Structured fields parsed from raw OCR text */
export interface ParsedAssetData {
  assetName: string;        // e.g. "Samsung Galaxy A55"
  brand: string;
  model: string;
  serialNumber: string;
  imei1: string;
  imei2: string;
  macAddress: string;
  serviceTag: string;
  assetTag: string;
  deviceType: "mobile" | "laptop" | "network" | "monitor" | "unknown";
  extraLines: string[];     // lines that didn't match any field
  scanReason?: string;      // set when no useful identifiers were found
  categoryHint?: string;    // suggested category name (e.g. "Monitors")
}

export interface OcrProvider {
  extractText(imageBuffer: Buffer, mimeType: string): Promise<OcrRawResponse>;
}
