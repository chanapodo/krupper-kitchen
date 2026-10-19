/** Canonical units so quantities from different recipes can be added up. */
const UNIT_MAP: Record<string, { unit: string; factor: number }> = {
  'גרם': { unit: 'גרם', factor: 1 },
  'גר׳': { unit: 'גרם', factor: 1 },
  'ג': { unit: 'גרם', factor: 1 },
  'ק"ג': { unit: 'גרם', factor: 1000 },
  'קילו': { unit: 'גרם', factor: 1000 },
  'מ"ל': { unit: 'מ"ל', factor: 1 },
  'ליטר': { unit: 'מ"ל', factor: 1000 },
  'יח׳': { unit: '', factor: 1 },
  "יח'": { unit: '', factor: 1 },
  'יחידות': { unit: '', factor: 1 },
  '': { unit: '', factor: 1 },
  'כוס': { unit: 'כוס', factor: 1 },
  'כוסות': { unit: 'כוס', factor: 1 },
  'כף': { unit: 'כף', factor: 1 },
  'כפות': { unit: 'כף', factor: 1 },
  'כפית': { unit: 'כפית', factor: 1 },
  'כפיות': { unit: 'כפית', factor: 1 },
  'קופסה': { unit: 'קופסה', factor: 1 },
  'קופסאות': { unit: 'קופסה', factor: 1 },
};

export function canon(qty: number | undefined, unit: string | undefined): { qty?: number; unit: string } {
  const u = (unit ?? '').trim().replace(/["״]/g, '"').replace(/['׳]/g, '׳');
  const m = UNIT_MAP[u];
  if (!m) return { qty, unit: u };
  return { qty: qty === undefined ? undefined : qty * m.factor, unit: m.unit };
}

/** Pretty-print a canonical quantity ("1.5 ק״ג", "3", "2 כוסות"). */
export function formatQty(qty: number | undefined, unit: string | undefined): string {
  if (qty === undefined || qty === null || Number.isNaN(qty)) return unit ? unit : '';
  const u = unit ?? '';
  const round = (n: number) => Math.round(n * 100) / 100;
  if (u === 'גרם' && qty >= 1000) return `${round(qty / 1000)} ק"ג`;
  if (u === 'מ"ל' && qty >= 1000) return `${round(qty / 1000)} ליטר`;
  return u ? `${round(qty)} ${u}` : `${round(qty)}`;
}
