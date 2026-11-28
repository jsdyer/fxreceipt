"""Collect the Bank's annual observations, preserving its precision and actual coverage."""
from datetime import date, datetime, timezone
from html import escape
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://www.bankofcanada.ca/valet/observations/group/FX_RATES_ANNUAL/json?start_date=2017-01-01"


def fetch():
    with urlopen(Request(SOURCE, headers={"User-Agent": "CoolCode FX Receipt (+https://coolcode.ca/fxreceipt/)"}), timeout=30) as response:
        content = response.read(2_000_001)
    if len(content) > 2_000_000:
        raise ValueError("Annual series exceeds download limit")
    return json.loads(content)


def normalize(payload):
    if payload["groupDetail"]["metadata"]["frequency"] != "Annual":
        raise ValueError("Expected annual observations")
    series = {}
    for key, detail in payload["seriesDetail"].items():
        match = re.fullmatch(r"FXA([A-Z]{3})CAD", key)
        if not match or detail["label"] != f"{match[1]}/CAD":
            raise ValueError("Unexpected Bank of Canada series")
        series[key] = match[1]
    years = {}
    for row in payload["observations"]:
        observation = date.fromisoformat(row["d"])
        year = str(observation.year)
        if observation.month != 1 or observation.day != 1 or year in years:
            raise ValueError("Duplicate or unexpected annual observation date")
        rates = {}
        for key, cell in row.items():
            if key == "d":
                continue
            currency = series[key]
            value = cell["v"]
            if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.\d+)?", value) or float(value) <= 0:
                raise ValueError("Invalid annual exchange rate")
            rates[currency] = value
        if "USD" not in rates:
            raise ValueError("Annual observation lacks the USD benchmark")
        years[year] = dict(sorted(rates.items()))
    if not years or sorted(map(int, years)) != list(range(2017, max(map(int, years)) + 1)):
        raise ValueError("Incomplete annual exchange rate history")
    return dict(sorted(years.items()))


def refresh(path, download=fetch):
    years = normalize(download())
    if path.exists():
        previous = json.loads(path.read_text(encoding="utf-8"))["years"]
        for year, currencies in previous.items():
            if not set(currencies) <= set(years.get(year, {})):
                raise ValueError("Previously published observations are missing; retaining capture for review")
    data = {"source": SOURCE, "checked_at": datetime.now(timezone.utc).isoformat(), "years": years}
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)
    return data


def build_annual_page(stage, reporting, tool):
    data = json.loads((stage / "annual-rates.json").read_text(encoding="utf-8"))
    years = data["years"]
    latest = max(years)
    status = {"checked_at": data["checked_at"], "latest_year": int(latest),
              "observation_count": sum(len(rates) for rates in years.values())}
    (stage / "annual-status.json").write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    tables = []
    for year, rates in sorted(years.items(), reverse=True):
        rows = "".join(f'<tr><th scope="row">{escape(currency)}</th><td>{escape(rate)}</td></tr>'
                       for currency, rate in sorted(rates.items()))
        tables.append(f'<details data-year="{escape(year)}"><summary>{escape(year)} · {len(rates)} currencies</summary>'
                      '<table><thead><tr><th scope="col">Currency</th><th scope="col">CAD per unit</th></tr></thead>'
                      f'<tbody>{rows}</tbody></table></details>')
    page_path = stage / "annual-rates/index.html"
    page = page_path.read_text(encoding="utf-8")
    replacements = {
        **reporting, "{{TABLES}}": "\n".join(tables), "{{CHECKED}}": escape(data["checked_at"][:10]),
        "{{SOURCE}}": escape(data["source"], quote=True), "{{LATEST}}": escape(latest),
        "{{RATE}}": escape(years[latest]["USD"]), "{{CONVERSION}}": format(100 * float(years[latest]["USD"]), ",.2f"),
        "{{CANONICAL}}": "https://coolcode.ca" + escape(tool["url"], quote=True) + "annual-rates/",
    }
    for marker, value in replacements.items():
        page = page.replace(marker, value)
    page_path.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    data = refresh(ROOT / "web/annual-rates.json")
    print(f"Validated Bank of Canada annual rates for {min(data['years'])} through {max(data['years'])}.")
