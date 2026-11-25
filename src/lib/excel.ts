import ExcelJS from 'exceljs';
import { normEmp, IST, DATE } from './http';

export interface ImportRow { emp_id: string; emp_name: string; onboarded_on: string | null; onboarded_raw: string | null; location: string | null }
export interface ParseResult { rows: ImportRow[]; problems: { row: number; reason: string }[]; headerRow: number; columns: Record<string, string> }

const ALIASES: Record<keyof Omit<ImportRow, 'onboarded_raw'>, string[]> = {
  emp_id: ['empid', 'employeeid', 'empno', 'employeeno', 'employeenumber', 'empcode', 'employeecode', 'associateid', 'id'],
  emp_name: ['empname', 'employeename', 'name', 'fullname', 'associatename'],
  onboarded_on: ['onboardeddate', 'onboarddate', 'onboardingdate', 'dateofonboarding', 'dateofjoining', 'doj', 'joiningdate', 'joineddate', 'date'],
  location: ['onboardedlocation', 'onboardlocation', 'onboardinglocation', 'location', 'baselocation', 'city', 'office'],
};
const key = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y > 1990 && y < 2100
    ? dt.toISOString().slice(0, 10) : null;
};

/** Excel date cell, serial number, or text like 25-11-2026, 25/11/2026, 2026-11-25, 25-Nov-2026, Nov 25, 2026. Day-first (India). */
export function parseDate(v: unknown): { on: string | null; raw: string | null } {
  if (v === null || v === undefined || v === '') return { on: null, raw: null };
  if (v instanceof Date) return { on: isNaN(+v) ? null : v.toISOString().slice(0, 10), raw: null };
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return { on: new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10), raw: null };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return { on: iso(+m[1], +m[2], +m[3]), raw: null };
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/);
  if (m) { const on = iso(+m[3], +m[2], +m[1]); return { on, raw: on ? null : s }; }
  m = s.match(/^(\d{1,2})[-/ ]?([a-z]{3,9})[-/ ,]*(\d{2,4})$/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    const on = iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]); return { on, raw: on ? null : s };
  }
  m = s.match(/^([a-z]{3,9})[ -](\d{1,2}),?[ -](\d{2,4})$/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) { const on = iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]); return { on, raw: on ? null : s }; }
  return { on: null, raw: s.slice(0, 60) };
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result as unknown;
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
  }
  return v;
}

function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; continue; }
    if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out;
}

/** Read an uploaded .xlsx / .csv into rows. Finds the header row (first 15 rows) by column names. */
export async function parseImport(buf: Buffer, filename: string): Promise<ParseResult> {
  let grid: unknown[][] = [];
  if (/\.csv$/i.test(filename)) {
    grid = parseCsv(buf.toString('utf8').replace(/^﻿/, ''));
  } else {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new Error('Could not read the file. Please upload an Excel .xlsx (or .csv) file.'); }
    // first sheet that has a recognisable header
    for (const ws of wb.worksheets) {
      const g: unknown[][] = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => { const vals = r.values as ExcelJS.CellValue[]; g[n - 1] = vals.slice(1).map(cellValue); });
      if (g.slice(0, 15).some((r) => r && findCols(r))) { grid = g; break; }
      if (!grid.length) grid = g;
    }
  }
  let headerRow = -1; let cols: ReturnType<typeof findCols> = null;
  for (let i = 0; i < Math.min(15, grid.length); i++) { const c = grid[i] && findCols(grid[i]); if (c) { headerRow = i; cols = c; break; } }
  if (!cols) throw new Error('Could not find the header row. The sheet needs columns: Emp ID, Emp Name, Onboarded Date, Onboarded Location.');

  const rows: ImportRow[] = []; const problems: ParseResult['problems'] = []; const seen = new Map<string, number>();
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i]; if (!r || r.every((x) => x === null || x === undefined || String(x).trim() === '')) continue;
    const emp = normEmp(r[cols.emp_id]);
    const name = String(r[cols.emp_name] ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const excelRow = i + 1;
    if (!emp) { problems.push({ row: excelRow, reason: 'Emp ID is empty' }); continue; }
    if (!name) { problems.push({ row: excelRow, reason: `${emp}: Emp Name is empty` }); continue; }
    if (seen.has(emp)) { problems.push({ row: excelRow, reason: `${emp} is repeated (first on row ${seen.get(emp)}) — kept the first` }); continue; }
    seen.set(emp, excelRow);
    const d = cols.onboarded_on >= 0 ? parseDate(r[cols.onboarded_on]) : { on: null, raw: null };
    if (d.raw) problems.push({ row: excelRow, reason: `${emp}: couldn't read date "${d.raw}" — saved as text` });
    const loc = cols.location >= 0 ? String(r[cols.location] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    rows.push({ emp_id: emp, emp_name: name, onboarded_on: d.on, onboarded_raw: d.raw, location: loc || null });
  }
  const hdr = grid[headerRow];
  const columns: Record<string, string> = {};
  for (const [k, idx] of Object.entries(cols)) if (idx >= 0) columns[k] = String(hdr[idx] ?? '');
  return { rows, problems, headerRow: headerRow + 1, columns };
}

function findCols(r: unknown[]) {
  const keys = r.map(key);
  const pick = (names: string[], taken: number[]) => {
    for (const n of names) { const i = keys.indexOf(n); if (i >= 0 && !taken.includes(i)) return i; }
    return -1;
  };
  const emp_id = pick(ALIASES.emp_id, []);
  const emp_name = pick(ALIASES.emp_name, [emp_id]);
  if (emp_id < 0 || emp_name < 0) return null;
  const onboarded_on = pick(ALIASES.onboarded_on, [emp_id, emp_name]);
  const location = pick(ALIASES.location, [emp_id, emp_name, onboarded_on]);
  return { emp_id, emp_name, onboarded_on, location };
}

// ---------------- outputs ----------------

function styleHeader(ws: ExcelJS.Worksheet, row = 1) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
  r.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: row }];
}

export async function templateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Onboarded');
  ws.columns = [
    { header: 'Emp ID', width: 14 }, { header: 'Emp Name', width: 30 },
    { header: 'Onboarded Date', width: 16, style: { numFmt: 'dd-mmm-yyyy' } }, { header: 'Onboarded Location', width: 22 },
  ];
  ws.addRow(['1000001', 'Sample Name', new Date(Date.UTC(2026, 10, 24)), 'Chennai']);
  styleHeader(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ReportPerson {
  emp_id: string; emp_name: string; onboarded_on: string | null; onboarded_raw: string | null; location: string | null;
  checked_in_at: Date | null; collected_at: Date | null; collected_by: string | null;
}

export async function reportXlsx(people: ReportPerson[], generatedBy: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Onboard Goodies';
  const total = people.length, collected = people.filter((p) => p.collected_at).length;

  // Summary
  const s = wb.addWorksheet('Summary');
  s.columns = [{ width: 28 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
  s.addRow(['Onboard goodies — distribution report']).font = { bold: true, size: 14 };
  s.addRow([`Generated ${IST(new Date())} IST by ${generatedBy}`]).font = { italic: true, color: { argb: 'FF64748B' } };
  s.addRow([]);
  s.addRow(['Total on list', total]); s.addRow(['Collected', collected]); s.addRow(['Pending', total - collected]);
  s.addRow(['Collected %', total ? Math.round((collected / total) * 1000) / 10 : 0]);
  for (let i = 4; i <= 7; i++) s.getRow(i).getCell(1).font = { bold: true };

  const group = (title: string, keyOf: (p: ReportPerson) => string, sortKeys?: (a: string, b: string) => number) => {
    s.addRow([]);
    const h = s.addRow([title, 'Total', 'Collected', 'Pending', 'Collected %']);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    const m = new Map<string, { t: number; c: number }>();
    for (const p of people) { const k = keyOf(p); const g = m.get(k) ?? { t: 0, c: 0 }; g.t++; if (p.collected_at) g.c++; m.set(k, g); }
    for (const k of [...m.keys()].sort(sortKeys)) { const g = m.get(k)!; s.addRow([k, g.t, g.c, g.t - g.c, g.t ? Math.round((g.c / g.t) * 1000) / 10 : 0]); }
  };
  group('By onboarded location', (p) => p.location || '(no location)');
  group('By onboarded date', (p) => p.onboarded_on ?? p.onboarded_raw ?? '(no date)', (a, b) => a.localeCompare(b));
  // pretty-print ISO dates in the date table
  s.eachRow((r) => { const v = r.getCell(1).value; if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) r.getCell(1).value = DATE(v); });

  const sheet = (name: string, list: ReportPerson[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [
      { header: 'Emp ID', key: 'id', width: 14 }, { header: 'Emp Name', key: 'name', width: 30 },
      { header: 'Onboarded Date', key: 'date', width: 16 }, { header: 'Onboarded Location', key: 'loc', width: 22 },
      { header: 'Status', key: 'status', width: 12 }, { header: 'Collected At (IST)', key: 'at', width: 22 },
      { header: 'Collected By', key: 'by', width: 18 },
    ];
    for (const p of list) {
      const r = ws.addRow({
        id: p.emp_id, name: p.emp_name, date: p.onboarded_on ? DATE(p.onboarded_on) : p.onboarded_raw ?? '',
        loc: p.location ?? '', status: p.collected_at ? 'Collected' : 'Pending', at: IST(p.collected_at), by: p.collected_by ?? '',
      });
      r.getCell('status').font = { bold: true, color: { argb: p.collected_at ? 'FF047857' : 'FFB45309' } };
    }
    styleHeader(ws);
    ws.autoFilter = { from: 'A1', to: 'G1' };
  };
  sheet('All', people);
  sheet('Pending', people.filter((p) => !p.collected_at));
  sheet('Collected', people.filter((p) => p.collected_at).sort((a, b) => +new Date(a.collected_at!) - +new Date(b.collected_at!)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
