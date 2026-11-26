"""Deterministic receipt flows and mobile layout at a project subpath (CI)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "fxreceipt")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width":1280,"height":1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                def rate_response(route):
                    if "/currencies" in route.request.url:
                        data = [{"iso_code":code,"name":name,"type":"currency"} for code,name in [("USD","US Dollar"),("CAD","Canadian Dollar"),("EUR","Euro")]]
                    else:
                        assert "amount" not in route.request.url
                        assert "charged" not in route.request.url
                        data = [{"base":"USD","quote":"CAD","date":"2026-01-02","rate":1.425,"providers":[{"key":"TEST","date":"2026-01-02","rate":1.425}]}]
                    route.fulfill(status=200,content_type="application/json",body=json.dumps(data),headers={"Access-Control-Allow-Origin":"*"})
                page.route("https://api.frankfurter.dev/**", rate_response)
                def boc(route):
                    assert "amount" not in route.request.url
                    route.fulfill(json={"observations":[{"d":"2026-01-02","FXUSDCAD":{"v":"1.5"},"FXINRCAD":{"v":"0.02"}}]})
                page.route("https://www.bankofcanada.ca/valet/**", boc)
                page.goto(f"http://127.0.0.1:{server.server_port}/fxreceipt/cad-to-inr/")
                page.wait_for_function("document.getElementById('quick-total').textContent.includes('5,000')")
                assert page.locator("#quick-base").input_value() == "CAD"
                assert page.locator("#quick-quote").input_value() == "INR"
                page.locator("#quick-transfer").click()
                assert page.locator("#base").input_value() == "CAD"
                assert page.locator("#mode").input_value() == "boc"
                page.locator("#charged").fill("5100")
                page.locator("#calculate").click()
                page.locator("#result").wait_for(state="visible")
                assert page.locator("#r-rate").inner_text() == "50"
                assert "Bank of Canada" in page.locator("#r-source").inner_text()
                page.goto(f"http://127.0.0.1:{server.server_port}/fxreceipt/")
                page.wait_for_function("document.getElementById('currencies').options.length === 3")
                page.locator("#amount").fill("100")
                page.locator("#charged").fill("146.25")
                page.locator("#date").fill("2026-01-03")
                page.locator("#calculate").click()
                page.locator("#result").wait_for(state="visible")
                assert "3.75" in page.locator("#difference").inner_text()
                assert "2026-01-02" in page.locator("#r-date").inner_text()
                assert "2026-01-03" in page.locator("#date-note").inner_text() and "2026-01-02" in page.locator("#date-note").inner_text()
                with page.expect_download() as saved:
                    page.locator("#save-json").click()
                data = json.loads(Path(saved.value.path()).read_text())
                assert data["calculation"]["difference"] == 3.75
                page.locator("#amount").fill("200")
                assert page.locator("#result").is_hidden()
                page.locator("#import").set_input_files({"name":"receipt.json","mimeType":"application/json","buffer":json.dumps(data).encode()})
                page.locator("#result").wait_for(state="visible")
                assert page.locator("#amount").input_value() == "100"
                page.locator("#mode").select_option("manual")
                page.locator("#manual-rate").fill("1.425")
                page.locator("#manual-date").fill("2026-01-02")
                page.locator("#manual-source").fill('<img src=x onerror="alert(1)">')
                page.locator("#calculate").click()
                assert page.locator("#result").is_visible()
                assert page.locator("img").count() == 0
                assert '<img' in page.locator("#r-source").inner_text()
                page.locator("#manual-source").fill("User-entered comparison reference")
                page.locator("#calculate").click()
                page.screenshot(path=str(screenshots / "desktop.png"),full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"),full_page=True)
                page.locator("#clear").click()
                assert page.locator("#result").is_hidden()
                assert page.locator("#amount").input_value() == ""
                assert not errors, errors
                browser.close()
            print("Browser checks passed: API/manual comparison, earlier rate date, safe rendering, JSON round-trip, input invalidation and mobile layout")
        finally: server.shutdown()
if __name__ == "__main__": main()
