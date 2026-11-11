/**
 * Reads an entry-list CSV (as exported from Excel / Google Sheets) into
 * entries, with problems that block saving and warnings to double-check.
 * Pure functions: used in the browser for the preview AND on the server
 * before saving, so both apply exactly the same rules.
 */
import { normaliseEntryNumber } from "../gallery";

export interface ParsedEntry {
  /** 1-based line number in the file, for messages. */
  row: number;
  number: string;
  competitors: string[];
  vehicle: string | null;
  className: string | null;
}

export interface EntryListResult {
  entries: ParsedEntry[];
  /** Must be fixed before saving. */
  problems: string[];
  /** Worth checking, but saving is allowed. */
  warnings: string[];
}

export const MAX_ENTRIES = 1000;
const NUMBER_RE = /^[A-Z0-9]{1,12}$/;

/** RFC 4180 CSV: quoted fields, doubled quotes, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = [",", ";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Column = "number" | "driver" | "codriver" | "vehicle" | "className";

const HEADERS: Record<Column, string[]> = {
  number: ["no", "number", "carno", "carnumber", "carnum", "entryno", "entrynumber", "racenumber", "num", "#", "competitionnumber"],
  driver: ["driver", "drivername", "competitor", "drivers"],
  codriver: ["codriver", "codrivername", "navigator", "passenger", "codrivers"],
  vehicle: ["car", "vehicle", "make", "model", "makemodel", "makeandmodel", "carmodel", "carmake", "makeampmodel"],
  className: ["class", "category", "cls", "carclass"],
};

function headerKey(h: string): string {
  return h.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9#]/g, "");
}

function mapHeaders(header: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const key = headerKey(h);
    for (const col of Object.keys(HEADERS) as Column[]) {
      if (map[col] === undefined && HEADERS[col].includes(key)) {
        map[col] = i;
        return;
      }
    }
  });
  return map;
}

export function parseEntryList(text: string): EntryListResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const rows = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return { entries: [], problems: ["The file is empty."], warnings };

  const cols = mapHeaders(rows[0]);
  if (cols.number === undefined) {
    return {
      entries: [],
      problems: [
        `Couldn't find the car number column. The first row must be headings such as: No, Driver, Co-driver, Car, Class. Found: ${rows[0].join(", ")}`,
      ],
      warnings,
    };
  }

  const cell = (r: string[], c: Column) => {
    const i = cols[c];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  const entries: ParsedEntry[] = [];
  const firstRowOf = new Map<string, number>();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const raw = cell(r, "number");
    const number = normaliseEntryNumber(raw);
    if (!number) {
      problems.push(`Row ${line}: no car number.`);
      return;
    }
    if (!NUMBER_RE.test(number)) {
      problems.push(`Row ${line}: "${raw}" isn't a valid car number (letters and digits only, up to 12).`);
      return;
    }
    const seen = firstRowOf.get(number);
    if (seen) {
      problems.push(`Car ${number} is listed twice (rows ${seen} and ${line}).`);
      return;
    }
    firstRowOf.set(number, line);
    entries.push({
      row: line,
      number,
      competitors: [cell(r, "driver"), cell(r, "codriver")].filter(Boolean),
      vehicle: cell(r, "vehicle") || null,
      className: cell(r, "className") || null,
    });
  });

  if (entries.length > MAX_ENTRIES) problems.push(`The list has ${entries.length} cars; the most allowed is ${MAX_ENTRIES}.`);
  if (entries.length === 0 && problems.length === 0) problems.push("No cars found under the headings.");

  // Look-alike numbers such as 32 / 032: allowed, but worth confirming.
  const groups = new Map<string, string[]>();
  for (const e of entries) {
    const key = e.number.replace(/^0+(?=.)/, "");
    groups.set(key, [...(groups.get(key) ?? []), e.number]);
  }
  for (const nums of groups.values()) {
    if (nums.length > 1) {
      warnings.push(`${nums.join(" and ")} are different cars. Check that's right – they will be searched separately.`);
    }
  }
  const missing = (["driver", "vehicle", "className"] as Column[]).filter((c) => cols[c] === undefined);
  if (missing.length) {
    const names = { driver: "Driver", vehicle: "Car", className: "Class", codriver: "Co-driver", number: "No" };
    warnings.push(`No ${missing.map((m) => names[m]).join(" / ")} column found – those details will be left blank.`);
  }
  return { entries, problems, warnings };
}

export const ENTRY_CSV_TEMPLATE = "No,Driver,Co-driver,Car,Class\n1,First Driver,First Co-driver,Ford Escort Mk2,Historic\n032,Second Driver,Second Co-driver,Peugeot 208 Rally4,Class 3\n";

/** Lower-case-with-dashes web address from an event name. */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "event"
  );
}
