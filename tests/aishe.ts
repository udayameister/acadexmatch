/* AISHE directory parsing: npx tsx tests/aishe.ts */
import assert from 'assert';
import { readCsv } from '../lib/server/sheet';
import { normaliseAisheCode, parseAisheRows, institutionTypeFor } from '../lib/server/aishe';

assert.equal(normaliseAisheCode('c16544'), 'C-16544');
assert.equal(normaliseAisheCode(' U - 0439 '), 'U-439');
assert.equal(normaliseAisheCode('S/2772'), 'S-2772');
assert.equal(normaliseAisheCode('Anna'), '');

const csv = 'AISHE Directory export\n' +
  'Category,AISHE Code,Institute Name,Name of Affiliated University,\tType of Institute,State,District,Status\n' +
  'College,C-16544,"A R Engineering College, Villupuram","Anna University, Chennai",Affiliated College,Tamil Nadu,Viluppuram,Active\n' +
  'Standlone,S-2772,145 GOVERNMENT POLYTECHNIC COLLEGE,,Technical/Polytechnic,Tamil Nadu,Dharmapuri,Active\n' +
  'College,,No code college,,,Tamil Nadu,Salem,Active\n' +
  'College,C-16544,A R Engineering College,"Anna University, Chennai",Affiliated College,Tamil Nadu,Viluppuram,Active\n';
const p = parseAisheRows(readCsv(csv));
assert.equal(p.records.length, 2);
assert.equal(p.duplicates, 1);
assert.equal(p.skipped.length, 1);
const ar = p.records.find(r => r.code === 'C-16544')!;
assert.equal(ar.name, 'A R Engineering College');
assert.equal(ar.university, 'Anna University, Chennai');
assert.equal(ar.type, 'Affiliated College');
assert.equal(ar.district, 'Viluppuram');
assert.equal(p.records.find(r => r.code === 'S-2772')!.category, 'Standalone');
assert.throws(() => parseAisheRows(readCsv('a,b\n1,2\n')), /header row/);
assert.equal(institutionTypeFor({ type: 'Deemed University-Private', category: 'University' }), 'Deemed-to-be University');
assert.equal(institutionTypeFor({ type: 'Affiliated College', category: 'College' }), 'Autonomous Engineering College');
console.log('aishe: all checks passed');
