export function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Enter a valid calendar date.');
  return value;
}
export function currency(value) {
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Enter a three-letter currency code, such as USD or CAD.');
  return code;
}
export function positive(value, label) {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value).trim())) throw new Error(`Enter a positive number for ${label}.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER / 100) throw new Error(`${label} must be greater than zero and within the supported numeric range.`);
  return n;
}
export function transaction(raw, today = new Date().toISOString().slice(0, 10)) {
  const date = isoDate(raw.date);
  if (date > today) throw new Error('Choose today or an earlier date; future reference rates do not exist.');
  const base = currency(raw.base), quote = currency(raw.quote);
  if (base === quote) throw new Error('Choose two different currencies for a foreign-exchange comparison.');
  return {date, base, quote, amount: positive(raw.amount, 'purchase amount'), charged: positive(raw.charged, 'actual charge'), note: String(raw.note || '').slice(0, 500)};
}
export function rateURL(config, input, provider = '') {
  const base = new URL(config.apiBase);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('The configured API must be an HTTPS base URL.');
  if (provider && !/^[a-z0-9.-]+$/i.test(provider)) throw new Error('Invalid provider key.');
  const path = provider ? `providers/${encodeURIComponent(provider)}/rates` : 'rates';
  const url = new URL(path, base.href.endsWith('/') ? base.href : `${base.href}/`);
  url.search = new URLSearchParams({base: input.base, quotes: input.quote, date: input.date, expand: 'providers'}).toString();
  return url.href;
}
export function referenceFromAPI(payload, input, source) {
  if (!Array.isArray(payload)) throw new Error('The rate service returned an unexpected response.');
  const matches = payload.filter(x => String(x.base).toUpperCase() === input.base && String(x.quote).toUpperCase() === input.quote);
  if (matches.length !== 1) throw new Error('No single matching reference rate is available for that pair and date. Try another provider or enter a reference manually.');
  const row = matches[0];
  const date = isoDate(row.date);
  if (date > input.date) throw new Error('The service returned a reference dated after your selected date.');
  const rate = positive(row.rate, 'reference rate');
  const observations = (Array.isArray(row.providers) ? row.providers : []).map(p => {
    const date = isoDate(p.date);
    if (date > input.date) throw new Error('A provider observation is later than the selected date.');
    return {key: String(p.key), date, rate: positive(p.rate, 'provider rate'), excluded: p.excluded === true};
  });
  return {kind: 'api', provider: String(source.provider || ''), label: String(source.label), rate, date, requestedDate: input.date, retrievedAt: source.retrievedAt, url: source.url, observations};
}
export function manualReference(input, raw) {
  const date = isoDate(raw.date);
  if (date > input.date) throw new Error('The reference date must be on or before the purchase date.');
  const label = String(raw.label || '').trim();
  if (!label) throw new Error('Give the manual reference a source name.');
  return {kind: 'manual', provider: null, label: label.slice(0, 250), rate: positive(raw.rate, 'reference rate'), date, requestedDate: input.date, retrievedAt: null, url: null, observations: []};
}
export function compare(input, reference, createdAt = new Date().toISOString()) {
  const referenceAmount = input.amount * reference.rate;
  const effectiveRate = input.charged / input.amount;
  const difference = input.charged - referenceAmount;
  const spreadPercent = difference / referenceAmount * 100;
  if (![referenceAmount, effectiveRate, difference, spreadPercent].every(Number.isFinite) || referenceAmount <= 0) throw new Error('These inputs exceed the supported calculation range.');
  return {schemaVersion: 1, tool: 'fxreceipt', createdAt, transaction: input, reference, calculation: {referenceAmount, effectiveRate, difference, spreadPercent}, interpretation: 'Difference from a dated reference, not proof of a separately charged fee. Settlement timing and the card/network rate can differ.'};
}
export function importReceipt(raw, today) {
  if (!raw || raw.schemaVersion !== 1 || raw.tool !== 'fxreceipt' || !raw.reference) throw new Error('This is not a supported FX Receipt JSON file.');
  const input = transaction(raw.transaction || {}, today);
  const r = raw.reference;
  let ref;
  if (r.kind === 'manual') ref = manualReference(input, {date: r.date, label: r.label, rate: r.rate});
  else if (r.kind === 'api') {
    const url = new URL(r.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe source URL in receipt.');
    if (!Number.isFinite(Date.parse(r.retrievedAt))) throw new Error('Receipt has an invalid retrieval date.');
    ref = referenceFromAPI([{base: input.base, quote: input.quote, date: r.date, rate: r.rate, providers: r.observations}], input, r);
  } else throw new Error('Unknown reference type.');
  const receipt = compare(input, ref, Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString());
  return receipt;
}
export function money(value, code) {
  return new Intl.NumberFormat('en-CA', {style: 'currency', currency: code, currencyDisplay: 'code'}).format(value);
}
export function csv(receipt) {
  const t = receipt.transaction, r = receipt.reference, c = receipt.calculation;
  const rows = [['purchase_date','purchase_currency','purchase_amount','charge_currency','actual_charge','reference_rate','reference_date','effective_rate','reference_amount','difference','difference_percent','reference_source','source_url','retrieved_at','receipt_created_at','note'],[t.date,t.base,t.amount,t.quote,t.charged,r.rate,r.date,c.effectiveRate,c.referenceAmount,c.difference,c.spreadPercent,r.label,r.url||'',r.retrievedAt||'',receipt.createdAt,t.note]];
  return rows.map(row=>row.map(v=>`"${String(typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replaceAll('"','""')}"`).join(',')).join('\r\n');
}
