# FX Receipt

[Use FX Receipt](https://coolcode.ca/fxreceipt/) to compare a foreign purchase with a historical reference rate. Enter the original amount and currency, the final posted charge and its currency, and a comparison date. CAD is a default, not a restriction.

<!-- coolcode:guide -->
Look up a Bank of Canada daily rate for a purchase or select a calendar year to see its published annual average in Canadian dollars. Compare a daily conversion with a posted charge and export the dated receipt.
<!-- /coolcode:guide -->

[USD to CAD](https://coolcode.ca/fxreceipt/usd-to-cad/) and [CAD to INR](https://coolcode.ca/fxreceipt/cad-to-inr/) open with a dated C$ or US$100 example. The converter reads Bank of Canada daily observations over a 90-day window, shows the actual rate date, and offers a saved, labelled fallback when the source cannot respond. Use “Compare this amount with my card charge” to carry the reference to the receipt form. Public currency series and dates leave the browser. Entered amounts and notes stay in the tab.

Enter your purchase and final posted charge, then compare with a dated reference. A positive difference is above that benchmark; it does not prove the difference was a separately charged fee. Save JSON to retain the exact rate and reopen the receipt later.


[Annual average exchange rates](https://coolcode.ca/fxreceipt/annual-rates/) lists the Bank of Canada’s published CAD-per-foreign-unit averages from 2017. Enter a foreign amount to convert it to CAD. The public tables and source links are readable without JavaScript. A missing observation remains unavailable for that currency and year. For an individual transaction, use the daily converter. The CRA describes when it may accept averages for certain income items in [Income Tax Folio S5-F4-C1, section 1.6.1](https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax/income-tax-folios-index/series-5-international-residency/series-5-international-residency-folio-4-foreign-currency/income-tax-folio-s5-f4-c1-income-tax-reporting-currency.html).

## Using it

1. Enter a positive purchase amount, a three-letter purchase currency, the positive actual charge, its currency and a date.
2. Choose Frankfurter's blended reference, Bank of Canada or ECB. The source needs coverage for the chosen pair and date. You may also enter a manual rate and source name.
3. Compare. Rates are expressed in **charge currency per one purchase-currency unit**. The returned reference date is displayed explicitly, including prior-day fallbacks. Provider observations can be older than a blended value date.
4. Download JSON or CSV. Reopen a JSON receipt using **Open a saved receipt JSON**; no new API request is made for its saved reference. Changing a field clears the old comparison until you calculate again.

The effective rate is charge ÷ purchase. Reference amount is purchase × reference rate. Difference is actual charge minus reference amount. Percentage difference uses the reference amount as its denominator. Negative values indicate a charge below that benchmark. Money displays use currency-specific rounding; exports preserve calculation precision. The tool compares one positive purchase at a time, not refunds, tax treatment, settlement reconciliation or guaranteed card-network fees.

## Sources and dates

The live source is the [Frankfurter v2 API](https://frankfurter.dev/), queried only on demand. No key or registration is required. Currency suggestions are fetched dynamically, including historical fiat currencies; an unlisted three-letter code can still be entered. Coverage varies by provider and date. Rates are reference observations, not live quotes. The [methodology](https://frankfurter.dev/methodology/) explains carry-forward observations, blending and revisions. Save JSON to retain the exact reference, observation evidence and retrieval timestamp.

Frankfurter's blended rates may be used and stored freely according to its documentation. Individual providers' observations remain subject to their [terms](https://frankfurter.dev/license/), including any republication requirements. The UI links the live response and shows contributor dates for blended rates. Single-provider endpoints may derive cross rates; these are not guaranteed to be the direct pair as originally published. This app does not make tax or legal rate determinations.

When a provider has no rate, show the error and let the user choose another provider or enter their own reference. There is no silent fallback to a different provider or fabricated value.

## Privacy

Amounts, notes, imported receipt contents and calculations remain in tab memory. Live currency inventory requests contain no transaction input. Rate lookups send only the currency pair, comparison date and provider to the configured Frankfurter-compatible API. The browser necessarily connects to that service. Transactions are neither uploaded to CoolCode nor persisted in browser storage. Saving a file is explicit. The shared CoolCode page counter receives the tool ID, not form input. Manual comparison sends no rate request.

## Expand or customize

Edit **`web/config.json`**. Defaults are convenience values; there are no fixed company, currency or result-count limits.

```json
{
  "apiBase": "https://api.frankfurter.dev/v2/",
  "defaultPurchaseCurrency": "EUR",
  "defaultSettlementCurrency": "CAD",
  "defaultProvider": "boc",
  "currencyTypes": ["currency"],
  "providers": [
    {"key": "", "name": "Frankfurter blended reference"},
    {"key": "boc", "name": "Bank of Canada via Frankfurter"},
    {"key": "ecb", "name": "European Central Bank via Frankfurter"},
    {"key": "nbp", "name": "National Bank of Poland via Frankfurter"}
  ]
}
```

`providers` can have any number of supported provider or dataset keys. Adding an entry automatically adds its selector option and route. Confirm new providers' coverage and reuse terms in the [provider directory](https://frankfurter.dev/providers/). You can point `apiBase` to your own HTTPS, CORS-enabled compatible instance; the trailing slash is recommended. The app handles three-letter currency codes and monetary currency formatting. Metals/crypto need a deliberate unit-formatting extension, not just adding non-currency assets to the list. No inventory is hardcoded: all currency suggestions are downloaded at page load, and failed suggestion loading still permits typed codes.

After editing, run the checks below and push to `main`. **FX Receipt · Check and publish** rebuilds and deploys the config. The daily lookup continues to run on demand. Reload the browser after publishing to load the new configuration. The existing source ID still needs to be in the shared CoolCode Worker allowlist once at first launch.

### Annual data

The Bank publishes its annual exchange rates on the last business day of the year. FX Receipt checks the [full Valet annual group](https://www.bankofcanada.ca/valet/observations/group/FX_RATES_ANNUAL/json?start_date=2017-01-01) at 10:27 UTC on the first day of each month. The visitor’s annual lookup uses only the published local copy. All supplied currencies and years appear automatically.

Run `python3 scripts/annual.py` to check and refresh locally, or manually run the Pages workflow on main. The collector validates series direction, positive values, annual dates and completeness before replacing `web/annual-rates.json`. Unexpected losses of historical observations require source review. The check time in [annual-status.json](https://coolcode.ca/fxreceipt/annual-status.json) records the successful source retrieval. Its latest year is the last annual observation. Changes are recorded under the GitHub Actions bot’s noreply identity after validation and browser tests. The schedule guard covers itself and the Pages collector.

## Development

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

The application is dependency-free native JavaScript, HTML and CSS. Python's standard library builds the static project offline. `tests/browser_smoke.py` exercises a deterministic rate response, manual calculation, CSV/JSON save, input invalidation, import and a narrow viewport in CI. No server or API credential is needed by visitors. GitHub Pages publishes `dist/`; never commit that directory or add a CNAME. The public project path is `/fxreceipt/`.
