/* Administrator data export: fields in the chosen order, row sorting, filter, CSV and a valid Excel file.
 * Run: npx tsx tests/admin-export.ts */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-export-'));
  process.chdir(dir);
  Object.assign(process.env, { ACAD_STORAGE: 'file', AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnop' });
  delete process.env.DB_HOST;
  fs.mkdirSync('data', { recursive: true });
  const users = [
    { id: 'u1', name: 'Zara Iyer', email: 'zara@example.com', role: 'candidate', createdAt: '2026-11-01T10:00:00Z', passwordHash: 'SECRET-HASH', salt: 'SECRET-SALT', phone: '+919800000001' },
    { id: 'u2', name: 'Arun Kumar', email: 'arun@example.com', role: 'candidate', createdAt: '2026-11-05T10:00:00Z', passwordHash: 'SECRET-HASH', salt: 'SECRET-SALT', plan: 'premium' },
    { id: 'u3', name: 'Meera, "HR" Rao', email: 'meera@college.ac.in', role: 'institute_admin', createdAt: '2026-10-20T10:00:00Z', passwordHash: 'SECRET-HASH', salt: 'SECRET-SALT' },
  ];
  const profiles = [
    { id: 'p1', userId: 'u1', name: 'Zara Iyer', email: 'zara@example.com', apiScore: 120, location: { city: 'Chennai', state: 'Tamil Nadu' }, netSletStatus: { isQualified: true, examType: 'UGC-NET (JRF)', rollNumber: 'ROLL-SECRET' }, phdStatus: { isCompleted: true }, publications: [{}, {}], experience: [] },
    { id: 'p2', userId: 'u2', name: 'Arun Kumar', email: 'arun@example.com', apiScore: 310, location: { city: 'Pune', state: 'Maharashtra' }, netSletStatus: { isQualified: false }, phdStatus: { isCompleted: false }, publications: [], experience: [] },
    { id: 'p3', userId: 'u9', name: 'No Score', email: 'n@example.com', location: { city: '', state: 'Kerala' }, netSletStatus: { isQualified: false }, phdStatus: { isCompleted: false } },
  ];
  fs.writeFileSync(path.join('data', 'db.json'), JSON.stringify({ acad_users_v3: users, acad_candidate_profiles_v3: profiles }));
  const ex0 = await import('../lib/server/adminExport');
  // The store adds its default administrator account; leave it out of the user checks.
  const ex = { ...ex0, exportRows: async (q: Parameters<typeof ex0.exportRows>[0]) => { const o = await ex0.exportRows(q); if (q.dataset === 'users') o.rows = o.rows.filter(r => !r.some(v => v === 'info@acadexmatch.com' || v === 'Platform Administrator')); return o; } };
  const x = await import('../lib/server/xlsx');

  // Catalog: no secrets offered.
  const cat = ex.exportCatalog();
  const allKeys = cat.flatMap(d => d.fields.map(f => `${d.key}.${f.key}`.toLowerCase()));
  assert(!allKeys.some(k => /password|hash|salt|token|roll/.test(k)), 'no secret fields');
  assert(cat.find(d => d.key === 'users')!.personal);

  // Fields in the chosen order, rows sorted.
  let r = await ex.exportRows({ dataset: 'users', fields: ['email', 'name', 'role'], sort: [{ field: 'name', dir: 'asc' }] });
  assert.deepEqual(r.header, ['Email', 'Name', 'Role']);
  assert.deepEqual(r.rows.map(row => row[1]), ['Arun Kumar', 'Meera, "HR" Rao', 'Zara Iyer']);
  assert.equal(r.rows[2][2], 'Candidate');
  r = await ex.exportRows({ dataset: 'users', fields: ['name', 'createdAt'], sort: [{ field: 'createdAt', dir: 'desc' }] });
  assert.deepEqual(r.rows.map(row => row[0]), ['Arun Kumar', 'Zara Iyer', 'Meera, "HR" Rao'], 'newest first');
  // Numbers sort as numbers; blanks last in both directions; two-level sort.
  r = await ex.exportRows({ dataset: 'candidates', fields: ['name', 'apiScore', 'state'], sort: [{ field: 'apiScore', dir: 'desc' }] });
  assert.deepEqual(r.rows.map(row => row[0]), ['Arun Kumar', 'Zara Iyer', 'No Score']);
  r = await ex.exportRows({ dataset: 'candidates', fields: ['name', 'apiScore'], sort: [{ field: 'apiScore', dir: 'asc' }] });
  assert.deepEqual(r.rows.map(row => row[0]), ['Zara Iyer', 'Arun Kumar', 'No Score'], 'blanks last when ascending too');
  r = await ex.exportRows({ dataset: 'candidates', fields: ['name', 'net', 'publications'] });
  assert.equal(r.rows[0][1], 'UGC-NET (JRF)');
  assert.equal(r.rows[0][2], 2);
  // Filter.
  r = await ex.exportRows({ dataset: 'candidates', fields: ['name'], search: 'tamil' });
  assert.deepEqual(r.rows, [['Zara Iyer']]);
  // Default fields when none chosen; unknown fields ignored; nothing chosen is an error.
  r = await ex.exportRows({ dataset: 'users', fields: [] });
  assert(r.header.includes('Email') && !r.header.includes('User ID'));
  await assert.rejects(ex.exportRows({ dataset: 'users', fields: ['passwordHash'] }), /at least one field/);
  await assert.rejects(ex.exportRows({ dataset: 'nope', fields: [] }), /Unknown/);
  const full = await ex.exportRows({ dataset: 'users', fields: cat.find(d => d.key === 'users')!.fields.map(f => f.key) });
  assert(!JSON.stringify(full).includes('SECRET'), 'no hashes or salts in any field');
  const fullC = await ex.exportRows({ dataset: 'candidates', fields: cat.find(d => d.key === 'candidates')!.fields.map(f => f.key) });
  assert(!JSON.stringify(fullC).includes('ROLL-SECRET'), 'no NET roll numbers');

  // CSV: BOM, quoting, formula injection neutralised.
  const csv = x.buildCsv(['Name', 'Note', 'Score'], [['Meera, "HR" Rao', '=HYPERLINK("http://x")', 5], ['A', null, -3]]);
  assert(csv.startsWith('﻿Name,Note,Score\r\n'));
  assert(csv.includes('"Meera, ""HR"" Rao"'));
  assert(csv.includes(`"'=HYPERLINK(""http://x"")"`), 'formula neutralised');
  assert(csv.endsWith('A,,-3'), 'negative numbers kept');

  // Excel: opens with openpyxl, header bold & frozen, numbers numeric, order kept.
  r = await ex.exportRows({ dataset: 'candidates', fields: ['name', 'apiScore', 'phd', 'state'], sort: [{ field: 'name', dir: 'asc' }] });
  const file = path.join(dir, 'out.xlsx');
  fs.writeFileSync(file, x.buildXlsx('Candidate profiles', r.header, r.rows));
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.active
print(json.dumps({"title": ws.title, "rows": [[c.value for c in row] for row in ws.iter_rows()], "bold": ws["A1"].font.bold, "freeze": ws.freeze_panes, "filter": ws.auto_filter.ref}))`;
  const out = JSON.parse(execFileSync('python3', ['-c', py, file]).toString());
  assert.equal(out.title, 'Candidate profiles');
  assert.deepEqual(out.rows[0], ['Name', 'API score', 'Ph.D. completed', 'State']);
  assert.deepEqual(out.rows[1], ['Arun Kumar', 310, 'No', 'Maharashtra']);
  assert.deepEqual(out.rows[3], ['Zara Iyer', 120, 'Yes', 'Tamil Nadu']);
  assert.equal(out.rows[2][1], null, 'blank stays blank');
  assert.equal(out.bold, true);
  assert.equal(out.freeze, 'A2');
  assert.equal(out.filter, 'A1:D4');
  // Big sheet with odd characters.
  const big = Array.from({ length: 3000 }, (_, i) => [`Row ${i} <&> "₹" தமிழ் \u0001`, i]);
  fs.writeFileSync(file, x.buildXlsx('Big', ['Text', 'N'], big));
  const n = JSON.parse(execFileSync('python3', ['-c', 'import openpyxl,sys,json;ws=openpyxl.load_workbook(sys.argv[1]).active;print(json.dumps([ws.max_row, ws["A3001"].value]))', file]).toString());
  assert.deepEqual(n, [3001, 'Row 2999 <&> "₹" தமிழ் ']);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('admin-export: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
