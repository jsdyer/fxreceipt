import {historyURL, observations, seriesFor} from './boc.mjs';
import {money} from './model.mjs';

const el = id => document.getElementById(id);
const today = new Date().toLocaleDateString('en-CA', {timeZone:'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit'});
const rateLabel = new Intl.NumberFormat('en-CA', {maximumSignificantDigits:7});
let rows = [], loadedDate = '', source = '', retained = false, controller;
const params = document.body.dataset;
el('quick-base').value = params.base || 'USD';
el('quick-quote').value = params.quote || 'CAD';
el('quick-date').value = today;
el('quick-date').max = today;

function reset(message) {
  el('quick-total').textContent = '—';
  el('quick-detail').textContent = message;
  el('quick-history').hidden = true;
  el('quick-transfer').disabled = true;
}

function render() {
  const amount = el('quick-amount').valueAsNumber;
  const base = el('quick-base').value, quote = el('quick-quote').value;
  try {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');
    const points = seriesFor(rows,base,quote,el('quick-date').value);
    const last = points.at(-1);
    if (!Number.isFinite(last.rate * amount)) throw new Error('Enter a smaller amount.');
    el('quick-total').textContent = money(amount,base) + ' = ' + money(amount * last.rate,quote);
    const note = retained ? 'Using the saved edition. ' : '';
    el('quick-detail').textContent = note + '1 ' + base + ' = ' + rateLabel.format(last.rate) + ' ' + quote + ' on ' + last.date + '.';
    el('quick-source').href = source;
    el('quick-source').textContent = 'Inspect Bank of Canada observations';
    el('quick-transfer').disabled = false;
    el('quick-transfer').onclick = () => {
      el('amount').value = String(amount);
      el('base').value = base;
      el('quote').value = quote;
      el('date').value = el('quick-date').value;
      el('mode').value = 'manual';
      el('mode').dispatchEvent(new Event('change', {bubbles:true}));
      el('manual-date').value = last.date;
      el('manual-rate').value = String(last.rate);
      el('manual-source').value = 'Bank of Canada · ' + source;
      el('charged').focus();
    };
    const values = points.map(point => point.rate);
    const min = Math.min(...values), max = Math.max(...values);
    const path = values.map((v,i) => (2 + 296 * i / Math.max(1,points.length-1)).toFixed(2) + ',' +
      (max === min ? 35 : 68 - 65 * (v - min) / (max - min)).toFixed(2)).join(' ');
    el('quick-line').setAttribute('points', path);
    el('quick-period').textContent = points[0].date + ' to ' + last.date + ' · ' + points.length +
      ' observations · low ' + rateLabel.format(min) + ' / high ' + rateLabel.format(max) + ' ' + quote + ' per ' + base;
    el('quick-history').hidden = false;
  } catch (error) { reset(error.message); }
}

async function loadDate() {
  const date = el('quick-date').value;
  controller?.abort();
  const request = new AbortController();
  controller = request;
  if (!date || date > today) { reset('Choose today or an earlier date.'); return; }
  if (loadedDate === date && rows.length && !retained) { render(); return; }
  let url;
  try { url = historyURL(date); } catch (error) { reset(error.message); return; }
  reset('Loading Bank of Canada observations…');
  const timer = setTimeout(() => request.abort(), 10000);
  try {
    const response = await fetch(url, {signal:request.signal, credentials:'omit', referrerPolicy:'no-referrer'});
    if (!response.ok) throw new Error('Source unavailable');
    const current = observations(await response.json());
    if (request !== controller) return;
    rows = current;
    source = url;
    retained = false;
  } catch {
    try {
      const response = await fetch(new URL('./boc-snapshot.json', import.meta.url));
      if (!response.ok) throw new Error();
      const snapshot = await response.json();
      if (request !== controller) return;
      // Never present a frozen edition as current or use its observations after the requested date.
      rows = snapshot.rows;
      source = snapshot.source;
      retained = true;
    } catch {
      if (request === controller) { loadedDate = ''; rows = []; reset('Live and saved Bank of Canada observations are unavailable.'); }
      return;
    }
  } finally { clearTimeout(timer); }
  if (request !== controller) return;
  loadedDate = date;
  render();
}

el('quick-form').addEventListener('submit', event => {event.preventDefault();loadDate();});
el('quick-date').addEventListener('change', loadDate);
for (const id of ['quick-base','quick-quote','quick-amount']) el(id).addEventListener('input', () => {
  if (loadedDate === el('quick-date').value) render();
});
el('quick-swap').addEventListener('click', () => {
  const from = el('quick-base').value;
  el('quick-base').value = el('quick-quote').value;
  el('quick-quote').value = from;
  if (loadedDate === el('quick-date').value) render();
});
loadDate();
