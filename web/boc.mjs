// Bank of Canada publishes Canadian dollars per one unit of foreign currency.
export const SERIES = Object.freeze({USD: 'FXUSDCAD', INR: 'FXINRCAD'});
export const SOURCE = 'https://www.bankofcanada.ca/valet/observations/' + Object.values(SERIES).join(',') + '/json';

export function historyURL(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid comparison date.');
  const start = new Date(date + 'T00:00:00Z');
  if (start.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid comparison date.');
  start.setUTCDate(start.getUTCDate() - 90);
  return SOURCE + '?' + new URLSearchParams({start_date:start.toISOString().slice(0, 10), end_date:date});
}

export function observations(payload) {
  if (!Array.isArray(payload?.observations)) throw new Error('Bank of Canada returned an unreadable series.');
  const dates = new Map();
  for (const data of payload.observations) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.d)) continue;
    const row = {date:data.d};
    for (const [currency, code] of Object.entries(SERIES)) {
      const value = Number(data[code]?.v);
      if (Number.isFinite(value) && value > 0) row[currency] = value;
    }
    if (Object.keys(row).length > 1) dates.set(row.date, row);
  }
  return [...dates.values()].sort((a,b) => a.date.localeCompare(b.date));
}

export function seriesFor(rows, base, quote, date) {
  if (base === quote) throw new Error('Choose two different currencies.');
  const points = [];
  for (const row of rows) {
    if (row.date > date) continue;
    const x = base === 'CAD' ? 1 : row[base];
    const y = quote === 'CAD' ? 1 : row[quote];
    if (x > 0 && y > 0) points.push({date:row.date, rate:x / y});
  }
  if (!points.length) throw new Error('No matching Bank of Canada observations are available for that date. Try a later date.');
  return points;
}

export async function bankHistory(date, signal) {
  const source = historyURL(date);
  try {
    const response = await fetch(source, {signal, credentials:'omit', referrerPolicy:'no-referrer'});
    if (!response.ok) throw new Error('Source unavailable');
    return {rows:observations(await response.json()), source, retained:false, retrievedAt:new Date().toISOString()};
  } catch {
    const response = await fetch(new URL('./boc-snapshot.json', import.meta.url));
    if (!response.ok) throw new Error('Live and saved Bank of Canada observations are unavailable.');
    const snapshot = await response.json();
    return {rows:snapshot.rows, source:snapshot.source, retained:true, retrievedAt:snapshot.retrieved};
  }
}
