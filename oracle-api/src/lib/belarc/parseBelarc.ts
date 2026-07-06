import { parse, HTMLElement } from 'node-html-parser';
import {
  NotABelarcReportError,
  type ParsedSection,
  type ParsedSpecs,
  type SpecField,
  type VolatilityTier,
} from './types';
import { RECORDED_SECTIONS, findSectionDef, normalizeHeader, type SectionDef } from './sections';

/** One <tr> — header rows (all <th>) mark group boundaries inside Belarc tables */
interface TableRow {
  header: boolean;
  cells: string[];
}

/** A section body reduced to comparable content: <br>-separated text lines + tables */
interface SectionContent {
  lines: string[];
  tables: TableRow[][];
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  dagger: '†',
  ndash: '–',
  mdash: '—',
};

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function cleanText(raw: string): string {
  return decode(raw).replace(/\s+/g, ' ').trim();
}

function extractContent(body: HTMLElement): SectionContent {
  // Footnotes/legends are display chrome, not spec data
  for (const footer of body.querySelectorAll('.rsFooter')) {
    footer.remove();
  }

  const tables: TableRow[][] = [];
  for (const table of body.querySelectorAll('table')) {
    const rows: TableRow[] = [];
    for (const tr of table.querySelectorAll('tr')) {
      const cellEls = tr.querySelectorAll('td, th');
      if (cellEls.length === 0) continue;
      rows.push({
        header: cellEls.every((c) => c.tagName === 'TH'),
        cells: cellEls.map((c) => cleanText(c.text)),
      });
    }
    if (rows.length > 0) tables.push(rows);
    table.remove();
  }

  const lines = body.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n')
    .map((line) => cleanText(line.replace(/<[^>]+>/g, ' ')))
    .filter((line) => line.length > 0 && !/^none detected$/i.test(line));

  return { lines, tables };
}

function field(key: string, label: string, value: string, tier: VolatilityTier): SpecField {
  return { key, label, value, tier };
}

/** "System Serial Number: N1NRKD002803016" → ["System Serial Number", "N1NRKD002803016"] */
function splitLabelled(line: string): [string, string] | null {
  const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

function genericFields(def: SectionDef, content: SectionContent): SpecField[] {
  const fields: SpecField[] = [];
  let i = 0;
  for (const line of content.lines) {
    fields.push(field(`${def.key}.${i++}`, '', line, def.defaultTier));
  }
  for (const table of content.tables) {
    for (const row of table) {
      if (row.header) continue;
      const value = row.cells.filter((c) => c.length > 0).join(' | ');
      if (value) fields.push(field(`${def.key}.${i++}`, '', value, def.defaultTier));
    }
  }
  return fields;
}

// ── Custom extractors ──────────────────────────────────────────────────────
// Sections whose fields need stable keys and per-field volatility tiers.

type Extractor = (content: SectionContent) => SpecField[];

const extractOperatingSystem: Extractor = ({ lines }) => {
  const fields: SpecField[] = [];
  lines.forEach((line, i) => {
    if (i === 0) {
      fields.push(field('operatingSystem.description', 'Operating System', line, 'soft'));
      return;
    }
    const kv = splitLabelled(line);
    if (!kv) return;
    // Install timestamp never changes but adds nothing to a hardware comparison
    const tier: VolatilityTier = /^installed$/i.test(kv[0]) ? 'skip' : 'soft';
    fields.push(field(`operatingSystem.${slug(kv[0])}`, kv[0], kv[1], tier));
  });
  return fields;
};

const extractSystemModel: Extractor = ({ lines }) => {
  const tiers: Record<string, VolatilityTier> = {
    'system serial number': 'hard',
    'chassis serial number': 'hard',
    'asset tag': 'soft',
    'enclosure type': 'hard',
  };
  const fields: SpecField[] = [];
  lines.forEach((line, i) => {
    if (i === 0) {
      fields.push(field('systemModel.model', 'System Model', line, 'hard'));
      return;
    }
    const kv = splitLabelled(line);
    if (!kv) return;
    fields.push(field(`systemModel.${slug(kv[0])}`, kv[0], kv[1], tiers[kv[0].toLowerCase()] ?? 'soft'));
  });
  return fields;
};

const extractProcessor: Extractor = ({ lines }) =>
  lines.map((line, i) =>
    i === 0
      ? field('processor.name', 'Processor', line, 'hard')
      : field(`processor.detail${i - 1}`, '', line, 'soft'),
  );

const extractMainBoard: Extractor = ({ lines, tables }) => {
  const fields: SpecField[] = [];
  for (const line of lines) {
    const kv = splitLabelled(line);
    if (!kv) continue;
    const label = kv[0].toLowerCase();
    if (label === 'board') fields.push(field('mainBoard.board', 'Board', kv[1], 'hard'));
    else if (label === 'serial number') fields.push(field('mainBoard.serial', 'Board Serial Number', kv[1], 'hard'));
    else fields.push(field(`mainBoard.${slug(kv[0])}`, kv[0], kv[1], 'soft'));
  }
  // Battery health drifts every scan — record for display, never compare
  let b = 0;
  for (const table of tables) {
    for (const row of table) {
      if (row.header) continue;
      const value = row.cells.filter((c) => c.length > 0).join(' | ');
      if (value) fields.push(field(`mainBoard.battery${b++}`, 'Installed Battery', value, 'skip'));
    }
  }
  return fields;
};

const extractMemory: Extractor = ({ lines }) => {
  const fields: SpecField[] = [];
  let slot = 0;
  for (const line of lines) {
    if (/usable installed memory/i.test(line)) {
      fields.push(field('memory.total', 'Installed Memory', line, 'hard'));
      continue;
    }
    const m = line.match(/^Slot '(.+?)' has (.+?)(?:\s*\(serial number (.+?)\))?$/i);
    if (m) {
      fields.push(field(`memory.slot${slot}.size`, `${m[1]} size`, m[2], 'hard'));
      if (m[3]) fields.push(field(`memory.slot${slot}.serial`, `${m[1]} serial`, m[3], 'hard'));
      slot++;
      continue;
    }
    if (/maximum system memory/i.test(line)) {
      fields.push(field('memory.maxCapacity', 'Maximum Memory Capacity', line, 'soft'));
    }
  }
  return fields;
};

const extractLocalStorage: Extractor = ({ lines, tables }) => {
  const fields: SpecField[] = [];
  for (const line of lines) {
    if (/usable local storage capacity/i.test(line)) {
      fields.push(field('localStorage.capacity', 'Usable Capacity', line, 'hard'));
    } else if (/free space/i.test(line)) {
      fields.push(field('localStorage.freeSpace', 'Free Space', line, 'skip'));
    }
  }
  let internal = 0;
  let usb = 0;
  let group: 'internal' | 'usb' = 'internal';
  for (const table of tables) {
    for (const row of table) {
      if (row.header) {
        const joined = row.cells.join(' ');
        if (/usb/i.test(joined)) group = 'usb';
        else if (/internal/i.test(joined)) group = 'internal';
        continue;
      }
      if (row.cells.length < 5) continue;
      const [, model, size, type, serial, , status] = row.cells;
      if (group === 'internal') {
        const k = `localStorage.drive${internal}`;
        if (model) fields.push(field(`${k}.model`, `Drive ${internal} model`, model, 'hard'));
        if (size) fields.push(field(`${k}.size`, `Drive ${internal} size`, size, 'hard'));
        if (type) fields.push(field(`${k}.type`, `Drive ${internal} type`, type, 'hard'));
        if (serial) fields.push(field(`${k}.serial`, `Drive ${internal} serial`, serial, 'hard'));
        if (status) fields.push(field(`${k}.status`, `Drive ${internal} status`, status, 'skip'));
        internal++;
      } else {
        // Removable media comes and goes — never a mismatch signal
        const value = [model, size, serial].filter(Boolean).join(' | ');
        if (value) fields.push(field(`localStorage.usbDrive${usb++}`, 'USB Attached Drive', value, 'skip'));
      }
    }
  }
  return fields;
};

const extractStorageVolumes: Extractor = ({ tables }) => {
  const fields: SpecField[] = [];
  let v = 0;
  for (const table of tables) {
    for (const row of table) {
      if (row.header || row.cells.length < 3) continue;
      const name = row.cells[0].replace(/\s*\*$/, '');
      if (!name) continue;
      const k = `storageVolumes.volume${v}`;
      fields.push(field(`${k}.name`, 'Volume', name, 'soft'));
      if (row.cells[1]) fields.push(field(`${k}.size`, `${name} size`, row.cells[1], 'soft'));
      if (row.cells[2]) fields.push(field(`${k}.free`, `${name} free space`, row.cells[2], 'skip'));
      const flags = row.cells.slice(3).filter((c) => c.length > 0).join(' ');
      if (flags) fields.push(field(`${k}.flags`, `${name} flags`, flags, 'soft'));
      v++;
    }
  }
  return fields;
};

const extractUsers: Extractor = ({ tables }) => {
  const fields: SpecField[] = [];
  let i = 0;
  let group = 'local user accounts';
  for (const table of tables) {
    for (const row of table) {
      if (row.header) {
        const joined = row.cells.join(' ').toLowerCase();
        if (joined.includes('accounts')) group = joined.replace(/last logon/i, '').trim();
        continue;
      }
      if (row.cells.length < 2) continue;
      const [marker, name, lastLogon, privilege] = row.cells;
      if (!name) continue;
      const value = [marker === 'X' ? '[disabled]' : '', name, privilege].filter(Boolean).join(' ');
      fields.push(field(`users.account${i}`, group, value, 'soft'));
      if (lastLogon) fields.push(field(`users.account${i}.lastLogon`, `${name} last logon`, lastLogon, 'skip'));
      i++;
    }
  }
  return fields;
};

const extractDisplay: Extractor = ({ lines }) => {
  let adapter = 0;
  let monitor = 0;
  return lines.map((line) =>
    /\[display adapter\]/i.test(line)
      ? field(`display.adapter${adapter++}`, 'Display Adapter', line.replace(/\s*\[display adapter\]$/i, ''), 'hard')
      : // Monitors are pluggable peripherals — a change is worth a look, not an alarm
        field(`display.monitor${monitor++}`, 'Monitor', line.replace(/\s*\[monitor\]/i, ''), 'soft'),
  );
};

const extractVirusProtection: Extractor = ({ lines, tables }) => {
  // Belarc renders this section as a table in some exports, plain lines in others
  const entries = [
    ...lines,
    ...tables.flat().flatMap((row) => (row.header ? [] : row.cells.filter((c) => c.length > 0))),
  ];
  return entries.map((entry, i) =>
    i === 0
      ? // Version drift is expected as AV auto-updates — warning at most
        field('virusProtection.product', 'Antivirus', entry, 'soft')
      : field(`virusProtection.detail${i - 1}`, '', entry, 'skip'),
  );
};

const ARROW_PREFIX = /^[↑↓]\s*/;

const extractCommunications: Extractor = ({ lines, tables }) => {
  const fields: SpecField[] = [];
  let adapter = -1;
  const pushAdapter = (name: string) => {
    adapter++;
    fields.push(field(`communications.adapter${adapter}.name`, 'Network Adapter', name, 'soft'));
  };
  const rows: TableRow[] = tables.flat();
  for (const row of rows) {
    const joined = row.cells.filter((c) => c.length > 0);
    if (joined.length === 1 && ARROW_PREFIX.test(joined[0])) {
      pushAdapter(joined[0].replace(ARROW_PREFIX, ''));
      continue;
    }
    if (adapter < 0) continue;
    const label = row.cells.find((c) => c.endsWith(':'));
    const value = row.cells[row.cells.length - 1];
    if (label && /physical\s*address/i.test(label) && value) {
      // MACs identify the NIC hardware; IPs/DHCP/status churn and are dropped
      fields.push(field(`communications.adapter${adapter}.mac`, 'Physical Address (MAC)', value, 'hard'));
    }
  }
  for (const line of lines) {
    if (ARROW_PREFIX.test(line)) pushAdapter(line.replace(ARROW_PREFIX, ''));
  }
  return fields;
};

const extractSoftwareLicenses: Extractor = ({ lines, tables }) => {
  const fields: SpecField[] = [];
  let i = 0;
  for (const table of tables) {
    for (const row of table) {
      if (row.header || row.cells.length < 2 || !row.cells[0]) continue;
      fields.push(field(`softwareLicenses.${i++}`, row.cells[0], row.cells[1], 'hard'));
    }
  }
  for (const line of lines) {
    fields.push(field(`softwareLicenses.${i++}`, '', line, 'hard'));
  }
  return fields;
};

const EXTRACTORS: Record<string, Extractor> = {
  operatingSystem: extractOperatingSystem,
  systemModel: extractSystemModel,
  processor: extractProcessor,
  mainBoard: extractMainBoard,
  memory: extractMemory,
  localStorage: extractLocalStorage,
  storageVolumes: extractStorageVolumes,
  users: extractUsers,
  display: extractDisplay,
  virusProtection: extractVirusProtection,
  communications: extractCommunications,
  softwareLicenses: extractSoftwareLicenses,
};

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Main entry point ───────────────────────────────────────────────────────

export function parseBelarc(html: string): ParsedSpecs {
  const root = parse(html);
  const headers = root.querySelectorAll('h2.reportSectionHeader');
  if (headers.length === 0) {
    throw new NotABelarcReportError();
  }

  const sections: Record<string, ParsedSection> = {};

  for (const header of headers) {
    // Header text can carry a rshNote span ("(mouse over ... )") — drop it
    for (const note of header.querySelectorAll('.rshNote')) note.remove();
    const def = findSectionDef(cleanText(header.text));
    if (!def) continue; // deliberately unrecorded section (hotfixes, software usage, ...)

    // A .reportSection div can hold several header+body pairs — pair by sibling
    const body = header.nextElementSibling;
    if (!body || !body.classList.contains('reportSectionBody')) continue;

    const fields = (EXTRACTORS[def.key] ?? ((c: SectionContent) => genericFields(def, c)))(
      extractContent(body),
    );

    const existing = sections[def.key];
    if (existing) existing.fields.push(...fields);
    else sections[def.key] = { key: def.key, name: def.header, fields };
  }

  const headerText = cleanText(root.querySelector('.reportHeader')?.text ?? '');
  const meta = {
    computerName: headerText.match(/Computer Name:\s*(.+?)\s*(?:Profile Date:|$)/)?.[1],
    profileDate: headerText.match(/Profile Date:\s*(.+?)\s*(?:Advisor Version:|$)/)?.[1],
    advisorVersion: headerText.match(/Advisor Version:\s*([\d.]+)/)?.[1],
    missingSections: RECORDED_SECTIONS.filter((s) => !sections[s.key]).map((s) => s.key),
  };

  return { version: 1, sections, meta };
}
