"""Browser smoke test + screenshots of every view. Usage: python3 tests/smoke.py"""
import os, sys, http.server, threading, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "screenshots")
os.makedirs(OUT, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 950}, device_scale_factor=1.5)
    pg.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"console {m.type}: {m.text}"))
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    pg.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    pg.goto("http://127.0.0.1:8765/index.html")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}/hero.png")
    pg.evaluate("document.body.classList.add('capture')")

    def shot(sel, name, before=None, wait=900):
        el = pg.locator(sel)
        el.scroll_into_view_if_needed()
        pg.evaluate(f"document.querySelector('{sel}').classList.add('in')")
        if before: before()
        pg.wait_for_timeout(wait)
        el.screenshot(path=f"{OUT}/{name}.png")

    shot("#v1", "view1", lambda: pg.click('#v1presets button[data-s="+"]') or pg.wait_for_timeout(300) or pg.evaluate("window.__app.setQubit(1.0, 2.4, {animate:true})"))
    shot("#v2", "view2", lambda: (pg.click("#v2m1000"), pg.click("#v2m100")))
    def v3():
        pg.click('#v3 .gate[data-g="Z"]'); pg.click("#v3play")
    shot("#v3", "view3", v3, wait=1900)
    shot("#v4", "view4", lambda: pg.click("#v4finish"))
    def v5():
        pg.select_option("#v5filter", "all")
    shot("#v5", "view5", v5)
    def v6():
        pg.click('#poll button[data-a="25"]')
    shot("#v6", "view6", v6)
    shot("#v7", "view7", lambda: None, wait=1200)
    def model():
        pg.click("#runChecks")
    shot("#model", "model", model, wait=2500)
    print(pg.inner_text("#checkTime"))
    # extra interactions: v5 errors filter, v4 play a bit
    pg.select_option("#v5filter", "errors")
    rows = pg.locator("#v5table tbody tr").count()
    print("error rows:", rows)
    pg.click("#v4reset"); pg.click("#v4play"); pg.wait_for_timeout(2500)
    print("v4 progress after play:", pg.evaluate("window.__app.ex4.progress"))
    pg.locator("#v4").screenshot(path=f"{OUT}/view4_playing.png")
    # mobile
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    m.goto("http://127.0.0.1:8765/index.html"); m.wait_for_timeout(600)
    sw = m.evaluate("document.documentElement.scrollWidth")
    print("mobile scrollWidth:", sw)
    m.locator("#v5").scroll_into_view_if_needed(); m.evaluate("document.querySelectorAll('.view').forEach(v=>v.classList.add('in'))")
    m.wait_for_timeout(500); m.screenshot(path=f"{OUT}/mobile_v5.png")
    b.close()
srv.shutdown()
print("\n".join(errors) or "no console errors")
