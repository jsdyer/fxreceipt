const form = document.getElementById('annual-form');
const yearSelect = document.getElementById('annual-year');
const currencySelect = document.getElementById('annual-currency');
const amountInput = document.getElementById('annual-amount');
const result = document.getElementById('annual-total');
const explanation = document.getElementById('annual-detail');
const rates = new Map();
for (const table of document.querySelectorAll('details[data-year]')) {
  const cells = Array.from(table.querySelectorAll('tbody tr'), row =>
    [row.cells[0].textContent, row.cells[1].textContent]);
  rates.set(table.dataset.year, new Map(cells));
  yearSelect.add(new Option(table.dataset.year, table.dataset.year));
}
const codes = new Set(Array.from(rates.values()).flatMap(year => [...year.keys()]));
const names = new Intl.DisplayNames('en-CA', {type:'currency'});
for (const code of [...codes].sort()) currencySelect.add(new Option(code + ' · ' + names.of(code), code));
const query = new URLSearchParams(location.search);
if (rates.has(query.get('year'))) yearSelect.value = query.get('year');
currencySelect.value = codes.has(query.get('currency')) ? query.get('currency') : 'USD';

function render() {
  const currency = currencySelect.value;
  const year = yearSelect.value;
  const rate = rates.get(year).get(currency);
  if (!rate) {
    result.textContent = 'No annual rate published';
    explanation.textContent = 'The Bank’s annual group contains no ' + currency + ' observation for ' + year + '. Choose another year or currency.';
    return;
  }
  explanation.textContent = '1 ' + currency + ' = ' + rate + ' CAD · ' + year + ' calendar-year average.';
  const amount = amountInput.valueAsNumber;
  const value = amount * Number(rate);
  if (!Number.isFinite(value) || amount < 0) {
    result.textContent = 'Enter a valid non-negative amount.';
    return;
  }
  const format = (number, code) => new Intl.NumberFormat('en-CA', {style:'currency', currency:code, currencyDisplay:'code'}).format(number);
  result.textContent = format(amount, currency) + ' = ' + format(value, 'CAD');
}
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', render);
form.hidden = false;
render();
