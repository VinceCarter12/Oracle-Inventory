/**
 * add-test-records.js
 * Fills in realistic computer / phone test data into:
 *   C:\Users\vince\Downloads\OPC Inventory 060120adawda26.xlsx
 *
 * Run: node prisma/add-test-records.js
 */

const XLSX = require("xlsx");
const path = require("path");
const fs   = require("fs");

const FILE = path.resolve(
  "C:/Users/vince/Downloads/OPC Inventory 060120adawda26.xlsx"
);

// ── Realistic computer specs pool ────────────────────────────────────────────
const COMPUTERS = [
  { brand: "Dell",    model: "Latitude 5540",     type: "Laptop",  os: "Windows 11 Pro", osVer: "23H2",  proc: "Intel Core i5-1345U",   ram: ["16GB"],     storage: [{ t: "SSD", b: "Samsung", c: "512GB" }], gpu: "Intel Iris Xe" },
  { brand: "Dell",    model: "OptiPlex 7010",      type: "Desktop", os: "Windows 11 Pro", osVer: "22H2",  proc: "Intel Core i5-13500T",  ram: ["8GB","8GB"],storage: [{ t: "SSD", b: "WD",     c: "256GB" }], gpu: "Intel UHD 770" },
  { brand: "HP",      model: "EliteBook 840 G9",   type: "Laptop",  os: "Windows 11 Pro", osVer: "23H2",  proc: "Intel Core i7-1255U",   ram: ["16GB"],     storage: [{ t: "SSD", b: "Toshiba",c: "512GB" }], gpu: "Intel Iris Xe" },
  { brand: "HP",      model: "ProDesk 600 G6",     type: "Desktop", os: "Windows 10 Pro", osVer: "22H2",  proc: "Intel Core i5-10500",   ram: ["8GB"],      storage: [{ t: "HDD", b: "Seagate",c: "1TB"   }], gpu: "Intel UHD 630" },
  { brand: "Lenovo",  model: "ThinkPad E15 Gen 4", type: "Laptop",  os: "Windows 11 Pro", osVer: "23H2",  proc: "AMD Ryzen 5 5625U",     ram: ["16GB"],     storage: [{ t: "SSD", b: "SK Hynix",c: "512GB" }], gpu: "AMD Radeon Vega" },
  { brand: "Lenovo",  model: "ThinkCentre M70q",   type: "Desktop", os: "Windows 11 Pro", osVer: "22H2",  proc: "Intel Core i5-12400T",  ram: ["8GB","8GB"],storage: [{ t: "SSD", b: "Kingston",c: "256GB" }], gpu: "Intel UHD 730" },
  { brand: "Acer",    model: "Aspire 5 A515-57",   type: "Laptop",  os: "Windows 11 Home","osVer": "23H2", proc: "Intel Core i5-1235U",  ram: ["8GB"],      storage: [{ t: "SSD", b: "WD",    c: "512GB" }], gpu: "Intel Iris Xe" },
  { brand: "Asus",    model: "ExpertBook B1 B1500", type: "Laptop", os: "Windows 11 Pro", osVer: "23H2",  proc: "Intel Core i5-1135G7",  ram: ["8GB"],      storage: [{ t: "SSD", b: "Adata", c: "256GB" }], gpu: "Intel Iris Xe" },
];

// ── Realistic phone specs pool ────────────────────────────────────────────────
const PHONES = [
  { brand: "Samsung", model: "Galaxy A54 5G" },
  { brand: "Samsung", model: "Galaxy A34" },
  { brand: "Samsung", model: "Galaxy A24" },
  { brand: "Realme",  model: "C55" },
  { brand: "Realme",  model: "11 Pro" },
  { brand: "Xiaomi",  model: "Redmi 13C" },
  { brand: "Oppo",    model: "A78 5G" },
  { brand: "Vivo",    model: "Y36" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
let _tagCounter = 1000;
function nextTag(branch) {
  const prefix = branch.replace(/\s+/g, "").substring(0, 3).toUpperCase();
  return `${prefix}-${String(_tagCounter++).padStart(4, "0")}`;
}

function randomSerial(prefix = "SN") {
  return prefix + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function randomMac() {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()
  ).join(":");
}

function randomImei() {
  return "35" + Array.from({ length: 13 }, () => Math.floor(Math.random() * 10)).join("");
}

function pick(arr, i) {
  return arr[i % arr.length];
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(FILE)) {
    console.error("File not found:", FILE);
    process.exit(1);
  }

  const wb = XLSX.readFile(FILE, { cellDates: true });
  console.log("Sheets:", wb.SheetNames.join(", "));

  // Process Computer sheets
  const computerSheets = wb.SheetNames.filter((n) => /^computer/i.test(n));
  console.log("Computer sheets:", computerSheets);

  for (const sheetName of computerSheets) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
    console.log(`\n${sheetName}: ${rows.length} rows`);

    // Get headers from first row
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const headerRow = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      headerRow.push(cell ? String(cell.v) : "");
    }

    // Build col-index map
    const colIdx = {};
    headerRow.forEach((h, i) => { if (h) colIdx[h] = i; });

    // Find employee rows that have Surname/First Name but no computer data
    let filled = 0;
    for (let ri = 1; ri <= range.e.r; ri++) {  // ri=0 is header
      const surnameCell = ws[XLSX.utils.encode_cell({ r: ri, c: colIdx["Surname"] ?? -1 })];
      const brandCell   = ws[XLSX.utils.encode_cell({ r: ri, c: colIdx["Brand"] ?? -1 })];

      const hasSurname = surnameCell && String(surnameCell.v).trim();
      const hasBrand   = brandCell   && String(brandCell.v).trim();

      if (!hasSurname || hasBrand) continue; // skip if no employee or already has data
      if (filled >= 8) break; // fill up to 8 rows per sheet

      const spec = pick(COMPUTERS, filled);
      const branchPart = sheetName.replace(/^Computer\s*/i, "").trim();

      function setCell(colName, value) {
        const c = colIdx[colName];
        if (c === undefined) return;
        const addr = XLSX.utils.encode_cell({ r: ri, c });
        ws[addr] = { v: value, t: "s" };
      }

      setCell("Brand",           spec.brand);
      setCell("Model",           spec.model);
      setCell("Device Type",     spec.type);
      setCell("Serial Number",   randomSerial("SN"));
      setCell("Asset Tag Number",nextTag(branchPart));
      setCell("Computer Name",   `OPC-${branchPart.substring(0,3).toUpperCase()}-PC${String(filled + 1).padStart(2,"0")}`);
      setCell("MAC Address",     randomMac());
      setCell("Operating System",spec.os);
      setCell("OS Version",      spec.osVer);
      setCell("Processor",       spec.proc);
      setCell("RAM1 Size",       spec.ram[0] ?? null);
      if (spec.ram[1]) setCell("RAM2 Size", spec.ram[1]);
      setCell("Storatge1 Type",  spec.storage[0].t);   // note typo column
      setCell("Storage1 Brand",  spec.storage[0].b);
      setCell("Storage1 Capacity", spec.storage[0].c);
      setCell("Graphics Adapter",spec.gpu);
      setCell("Device Status",   "Good");

      filled++;
    }
    console.log(`  Filled ${filled} computer rows`);
  }

  // Process CP (Company Phone) sheets
  const cpSheets = wb.SheetNames.filter((n) => /^cp\s/i.test(n));
  console.log("\nCP sheets:", cpSheets);

  for (const sheetName of cpSheets) {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws["!ref"]);

    const headerRow = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      headerRow.push(cell ? String(cell.v) : "");
    }

    const colIdx = {};
    headerRow.forEach((h, i) => { if (h) colIdx[h] = i; });

    let filled = 0;
    for (let ri = 1; ri <= range.e.r; ri++) {
      const surnameCell = ws[XLSX.utils.encode_cell({ r: ri, c: colIdx["Surname"] ?? -1 })];
      const brandCell   = ws[XLSX.utils.encode_cell({ r: ri, c: colIdx["Brand"] ?? -1 })];

      const hasSurname = surnameCell && String(surnameCell.v).trim();
      const hasBrand   = brandCell   && String(brandCell.v).trim();

      if (!hasSurname || hasBrand) continue;
      if (filled >= 5) break; // fill up to 5 phone rows per sheet

      const spec = pick(PHONES, filled);
      const branchPart = sheetName.replace(/^CP\s*/i, "").trim();

      function setCell(colName, value) {
        const c = colIdx[colName];
        if (c === undefined) return;
        const addr = XLSX.utils.encode_cell({ r: ri, c });
        ws[addr] = { v: value, t: "s" };
      }

      setCell("Brand",               spec.brand);
      setCell("Model",               spec.model);
      setCell("Serrial Number",      randomSerial("PH")); // typo column
      setCell("IME Number",          randomImei());       // typo column
      setCell("CP Property tag",     `CP-${String(filled + 1).padStart(3,"0")}-${branchPart.substring(0,3).toUpperCase()}`);
      setCell("Company Phone Count", "1");

      filled++;
    }
    console.log(`  ${sheetName}: Filled ${filled} phone rows`);
  }

  XLSX.writeFile(wb, FILE);
  console.log("\nSaved:", FILE);
}

main();
