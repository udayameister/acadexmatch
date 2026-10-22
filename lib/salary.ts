/**
 * Estimated monthly pay under the 7th CPC academic pay matrix (UGC / AICTE scales).
 * An estimate only: actual pay depends on the institution, its rules, the current DA rate and income tax.
 */

export interface PayLevel { key: string; label: string; entry: number; max: number; posts: string }

export const PAY_LEVELS: PayLevel[] = [
  { key: '10', label: 'Academic Level 10', entry: 57700, max: 182400, posts: 'Assistant Professor (entry)' },
  { key: '11', label: 'Academic Level 11', entry: 68900, max: 205500, posts: 'Assistant Professor (senior scale)' },
  { key: '12', label: 'Academic Level 12', entry: 79800, max: 211500, posts: 'Assistant Professor (selection grade)' },
  { key: '13A', label: 'Academic Level 13A', entry: 131400, max: 217100, posts: 'Associate Professor' },
  { key: '14', label: 'Academic Level 14', entry: 144200, max: 218200, posts: 'Professor' },
  { key: '15', label: 'Academic Level 15', entry: 182200, max: 224100, posts: 'Senior Professor' },
];

export type CityClass = 'X' | 'Y' | 'Z';

/** Common cities; class X = HRA 30% cities. `tpta` = higher transport-allowance city. */
export const CITIES: { name: string; cls: CityClass; tpta: boolean }[] = [
  { name: 'Ahmedabad', cls: 'X', tpta: true }, { name: 'Bengaluru', cls: 'X', tpta: true }, { name: 'Chennai', cls: 'X', tpta: true },
  { name: 'Delhi', cls: 'X', tpta: true }, { name: 'Hyderabad', cls: 'X', tpta: true }, { name: 'Kolkata', cls: 'X', tpta: true },
  { name: 'Mumbai', cls: 'X', tpta: true }, { name: 'Pune', cls: 'X', tpta: true },
  { name: 'Coimbatore', cls: 'Y', tpta: true }, { name: 'Jaipur', cls: 'Y', tpta: true }, { name: 'Kochi', cls: 'Y', tpta: true },
  { name: 'Lucknow', cls: 'Y', tpta: true }, { name: 'Nagpur', cls: 'Y', tpta: true }, { name: 'Patna', cls: 'Y', tpta: true },
  { name: 'Surat', cls: 'Y', tpta: true }, { name: 'Indore', cls: 'Y', tpta: true }, { name: 'Kanpur', cls: 'Y', tpta: true },
  { name: 'Kozhikode', cls: 'Y', tpta: true }, { name: 'Ghaziabad', cls: 'Y', tpta: true },
  { name: 'Bhopal', cls: 'Y', tpta: false }, { name: 'Bhubaneswar', cls: 'Y', tpta: false }, { name: 'Chandigarh', cls: 'Y', tpta: false },
  { name: 'Guwahati', cls: 'Y', tpta: false }, { name: 'Madurai', cls: 'Y', tpta: false }, { name: 'Mysuru', cls: 'Y', tpta: false },
  { name: 'Thiruvananthapuram', cls: 'Y', tpta: false }, { name: 'Tiruchirappalli', cls: 'Y', tpta: false }, { name: 'Vellore', cls: 'Y', tpta: false },
  { name: 'Vijayawada', cls: 'Y', tpta: false }, { name: 'Visakhapatnam', cls: 'Y', tpta: false }, { name: 'Warangal', cls: 'Y', tpta: false },
];

/** DA rate in force from 1 January 2026 (central government). Users can change it in the calculator. */
export const DEFAULT_DA_PERCENT = 60;

export function hraPercent(cls: CityClass, daPercent: number): number {
  const table = daPercent >= 50 ? { X: 30, Y: 20, Z: 10 } : daPercent >= 25 ? { X: 27, Y: 18, Z: 9 } : { X: 24, Y: 16, Z: 8 };
  return table[cls];
}

/** Basic pay after `years` annual increments (3%, rounded up to the next ₹100), capped at the level maximum. */
export function basicAfter(level: PayLevel, years: number): number {
  let pay = level.entry;
  for (let i = 0; i < Math.max(0, Math.floor(years)); i++) {
    pay = Math.ceil((pay * 1.03) / 100) * 100;
    if (pay >= level.max) return level.max;
  }
  return pay;
}

export interface SalaryInput {
  levelKey: string;
  years: number;
  cityClass: CityClass;
  higherTaCity: boolean;
  daPercent: number;
  housingProvided: boolean;
  nps: boolean;
  professionalTax: number;
}

export interface SalaryResult {
  basic: number; da: number; hra: number; ta: number; daOnTa: number; gross: number;
  npsDeduction: number; professionalTax: number; deductions: number; takeHome: number; annualGross: number;
  hraPct: number;
}

export function calculateSalary(i: SalaryInput): SalaryResult | null {
  const level = PAY_LEVELS.find(l => l.key === i.levelKey);
  if (!level) return null;
  const basic = basicAfter(level, i.years);
  const da = Math.round((basic * i.daPercent) / 100);
  const hraPct = i.housingProvided ? 0 : hraPercent(i.cityClass, i.daPercent);
  const hra = Math.round((basic * hraPct) / 100);
  // Levels 9 and above: ₹7,200 in higher transport-allowance cities, ₹3,600 elsewhere, plus DA on it.
  const ta = i.higherTaCity ? 7200 : 3600;
  const daOnTa = Math.round((ta * i.daPercent) / 100);
  const gross = basic + da + hra + ta + daOnTa;
  const npsDeduction = i.nps ? Math.round((basic + da) * 0.1) : 0;
  const professionalTax = Math.max(0, Math.round(i.professionalTax || 0));
  const deductions = npsDeduction + professionalTax;
  return { basic, da, hra, ta, daOnTa, gross, npsDeduction, professionalTax, deductions, takeHome: gross - deductions, annualGross: gross * 12, hraPct };
}

/** "Level 12 (…)" / "Academic Level 13A" → "12" / "13A", if the text names a pay level. */
export function levelKeyFrom(text: string | null | undefined): string | null {
  const m = (text || '').match(/level[\s-]*(1[0-5]A?)\b/i);
  return m && PAY_LEVELS.some(l => l.key === m[1].toUpperCase()) ? m[1].toUpperCase() : null;
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
