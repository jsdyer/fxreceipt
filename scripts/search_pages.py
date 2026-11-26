"""Generate crawlable working examples from the same form as the main page."""
from html import escape
import json
import re


def render_pages(stage, tool, pages):
    source = (stage / "index.html").read_text(encoding="utf-8")
    for path, title, description, defaults in pages:
        folder = stage / path
        folder.mkdir(exist_ok=True)
        url = "https://coolcode.ca" + tool["url"] + (path + "/" if path else "")
        page = re.sub(r"<title>.*?</title>", lambda _: "<title>" + escape(title) + " · CoolCode</title>", source, count=1)
        page = re.sub(r'<meta name="description" content="[^"]*">', lambda _: '<meta name="description" content="' + escape(description) + '">', page, count=1)
        page = re.sub(r'<link rel="canonical"[^>]*>|<meta property="og:[^>]*>', "", page)
        head = '<link rel="canonical" href="' + escape(url) + '">'
        for prop, value in (("title", title), ("type", "website"), ("url", url), ("description", description)):
            head += '<meta property="og:' + prop + '" content="' + escape(value) + '">'
        schema = {"@context":"https://schema.org","@type":"WebApplication","name":title,"url":url,"description":description,"operatingSystem":"Any","applicationCategory":"UtilitiesApplication","offers":{"@type":"Offer","price":"0","priceCurrency":"CAD"}}
        page = page.replace("</head>", head + '<script type="application/ld+json">' + json.dumps(schema).replace("<", "\\u003c") + "</script></head>", 1)
        if path:
            page = re.sub(r'((?:href|src)=")\./', r'\1../', page)
            page = re.sub(r"(<h1(?: [^>]*)?>).*?</h1>", lambda m: m[1] + escape(title) + "</h1>", page, count=1, flags=re.S)
            page = page.replace("<!-- example-intro -->", '<p class="example-intro">' + escape(description) + '</p>', 1)
            attrs = "".join(' data-' + key + '="' + escape(value) + '"' for key, value in defaults.items())
            page = page.replace("<body", "<body" + attrs, 1)
        snapshot = json.loads((stage / "boc-snapshot.json").read_text())
        last = snapshot["rows"][-1]
        base, quote = defaults.get("base", "USD"), defaults.get("quote", "CAD")
        rate = (1 if base == "CAD" else last[base]) / (1 if quote == "CAD" else last[quote])
        printed = f"100.00 {base} = {100 * rate:,.2f} {quote}"
        page = page.replace("Loading conversion…", printed)
        page = page.replace('id="quick-detail" role="status"></p>', 'id="quick-detail" role="status">Saved Bank of Canada rate for ' + escape(last["date"]) + '. The converter checks for newer observations when opened.</p>')
        if path:
            page = re.sub(r'(<select id="quick-base">)(.*?)(</select>)', lambda m: m[1] + m[2].replace(" selected", "").replace('value="' + base + '"','value="' + base + '" selected') + m[3], page)
            page = re.sub(r'(<select id="quick-quote">)(.*?)(</select>)', lambda m: m[1] + m[2].replace(" selected", "").replace('value="' + quote + '"','value="' + quote + '" selected') + m[3], page)
        (folder / "index.html").write_text(page, encoding="utf-8")

PAGES = [('',
  'Currency Converter & Card Charge Comparison',
  'Convert USD, CAD or INR at the Bank of Canada daily reference rate, check the dated history and '
  'compare it with the amount charged to your card.',
  {}),
 ('usd-to-cad',
  'USD to CAD Currency Converter',
  'See what US$100 converts to in Canadian dollars and compare it with the actual amount on a '
  'Canadian card statement. Edit either currency, date or amount.',
  {'base': 'USD', 'quote': 'CAD'}),
 ('cad-to-inr',
  'CAD to INR Currency Converter',
  'Convert C$100 to Indian rupees. The Bank publishes Canadian dollars per rupee, so this view '
  'uses the reciprocal of that day’s published rate.',
  {'base': 'CAD', 'quote': 'INR'})]
