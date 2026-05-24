// Slice-1 visual smoke test for the Codex shell.
// Renders mobile (360) and desktop (1024) viewports, captures screenshots
// and console errors, asserts no horizontal overflow.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4174/';
const OUT = resolve('./screens');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 1900 },
  { name: 'mobile-414', width: 414, height: 1900 },
  { name: 'desktop-1024', width: 1024, height: 1100 },
];

const executablePath =
  process.env.CHROMIUM_PATH ??
  `${process.env.HOME}/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`;

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const report = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (err) => consoleMsgs.push({ type: 'pageerror', text: err.message }));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15_000 });
  // Let the Motion entrance orchestration finish (~1000 ms) before measuring.
  await page.waitForTimeout(1100);

  const dims = await page.evaluate(() => ({
    inner: { w: window.innerWidth, h: window.innerHeight },
    doc: { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight },
    body: { sw: document.body.scrollWidth, sh: document.body.scrollHeight },
  }));

  const overflowX = dims.doc.sw > dims.inner.w || dims.body.sw > dims.inner.w;
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts).slice(0, 6).map((f) => `${f.family} ${f.weight} ${f.style}`);
  });

  const screenshotPath = `${OUT}/${vp.name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });

  // Resources panel probe: open via the floating trigger and verify the
  // dialog renders, contains curated links + the map, and respects the
  // viewport (no horizontal overflow inside the panel either).
  let resourcesFlow = null;
  const trigger = page.getByRole('button', { name: /Open resources panel/i }).first();
  if ((await trigger.count()) > 0) {
    resourcesFlow = { opened: false, links: 0, hasMap: false, panelOverflow: false };
    await trigger.click();
    try {
      await page.waitForSelector('[role="dialog"][aria-labelledby="resources-title"]', { timeout: 1500 });
      resourcesFlow.opened = true;
    } catch {}
    if (resourcesFlow.opened) {
      // Let the open spring settle before measuring or screenshotting.
      await page.waitForTimeout(550);
      resourcesFlow.links = await page.locator('a.resource-link').count();
      resourcesFlow.hasMap = false; // map removed per human feedback (not worth it)
      // Panel must respect viewport — its scrollWidth should not exceed innerWidth.
      const panelWidth = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return null;
        return { scroll: d.scrollWidth, client: d.clientWidth, win: window.innerWidth };
      });
      if (panelWidth && panelWidth.scroll > panelWidth.win + 1) {
        resourcesFlow.panelOverflow = true;
      }
      await page.screenshot({
        path: `${OUT}/${vp.name}-resources.png`,
        fullPage: false,
      });
      // Close so subsequent probes start clean.
      await page.getByRole('button', { name: /Close resources/i }).click();
      await page.waitForTimeout(350);
    }
  }

  // State-machine probe (only on the desktop pass to keep the smoke quick):
  // click the first sample chip and confirm we see the "thinking" pane,
  // then either an answered or an error pane (a backend may or may not be up).
  let stateFlow = null;
  if (vp.name === 'desktop-1024') {
    stateFlow = { thinking: false, answered: false, error: false };
    const firstChip = page.locator('button[type="button"]').filter({ hasText: '€700' }).first();
    if ((await firstChip.count()) > 0) {
      await firstChip.click();
      try {
        await page.waitForSelector('[aria-busy="true"]', { timeout: 1500 });
        stateFlow.thinking = true;
      } catch {}
      try {
        // Live backend round-trip can take 4-12s including TLS+cold-start.
        await page.waitForSelector('[role="alert"], #answer-heading', { timeout: 15000 });
        const isError = (await page.locator('[role="alert"]').count()) > 0;
        const isAnswered = (await page.locator('#answer-heading').count()) > 0;
        stateFlow.error = isError;
        stateFlow.answered = isAnswered;
        await page.screenshot({
          path: `${OUT}/${vp.name}-after-chip.png`,
          fullPage: false,
        });
      } catch {}
    }
  }

  // Mocked-backend probe: confirms the AnswerColumn renders correctly with
  // a real {answer, sources, verticale} payload (markdown, drop-cap,
  // bibliography, verticale eyebrow). Runs on desktop only.
  let mockedFlow = null;
  if (vp.name === 'desktop-1024') {
    const ctx2 = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const mocked = await ctx2.newPage();
    await mocked.route('**/ask', async (route) => {
      // Small delay so the ThinkingColumn is observable; matches the
      // 200-1000 ms range we expect from a real /ask round-trip.
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer:
            'Near Bocconi, **€700/month** is workable in *Ticinese* and the southern edge of *Porta Romana*. Expect a single room in a shared flat; full studios start around €950.\n\n- Tram 9 / 15 reach the campus in under 15 min from these zones.\n- Look for offers via Bocconi Housing Service (signposted at the Welcome Desk).\n- Avoid agency fees > 10%.',
          sources: [
            'data/relocation/affitti-milano-zone-bocconi.md',
            'data/relocation/welcome-desk-housing-service.md',
            'data/relocation/atm-tram-linee-9-15.md',
          ],
          verticale: 'relocation',
        }),
      });
    });
    await mocked.goto(URL, { waitUntil: 'networkidle', timeout: 15_000 });
    mockedFlow = { thinking: false, answered: false, error: false };
    const chip = mocked
      .locator('button[type="button"]')
      .filter({ hasText: '€700' })
      .first();
    if ((await chip.count()) > 0) {
      await chip.click();
      try {
        await mocked.waitForSelector('[aria-busy="true"]', { timeout: 1500 });
        mockedFlow.thinking = true;
      } catch {}
      try {
        await mocked.waitForSelector('#answer-heading', { timeout: 8000 });
        mockedFlow.answered = true;
        await mocked.screenshot({
          path: `${OUT}/${vp.name}-answered.png`,
          fullPage: false,
        });
      } catch {}
    }
    await ctx2.close();
  }

  report.push({
    viewport: vp,
    inner: dims.inner,
    docScrollWidth: dims.doc.sw,
    bodyScrollWidth: dims.body.sw,
    overflowX,
    consoleErrors: consoleMsgs.filter((m) => m.type === 'error' || m.type === 'pageerror'),
    consoleWarnings: consoleMsgs.filter((m) => m.type === 'warning'),
    fontsLoaded,
    screenshot: screenshotPath,
    stateFlow,
    mockedFlow,
    resourcesFlow,
  });

  await ctx.close();
}

await browser.close();

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

let ok = true;
for (const r of report) {
  console.log(`\n=== ${r.viewport.name} (${r.viewport.width}×${r.viewport.height}) ===`);
  console.log(
    `  innerWidth=${r.inner.w}  docScrollWidth=${r.docScrollWidth}  bodyScrollWidth=${r.bodyScrollWidth}`,
  );
  console.log(`  overflowX=${r.overflowX}`);
  console.log(`  fontsLoaded[0..6]: ${r.fontsLoaded.join(', ') || '(none)'}`);
  console.log(`  errors: ${r.consoleErrors.length}, warnings: ${r.consoleWarnings.length}`);
  for (const e of r.consoleErrors) console.log(`    ! ${e.type}: ${e.text}`);
  if (r.stateFlow) {
    const f = r.stateFlow;
    console.log(`  stateFlow: thinking=${f.thinking}  answered=${f.answered}  error=${f.error}`);
  }
  if (r.mockedFlow) {
    const f = r.mockedFlow;
    console.log(`  mockedFlow: thinking=${f.thinking}  answered=${f.answered}`);
    if (!f.thinking || !f.answered) ok = false;
  }
  if (r.resourcesFlow) {
    const f = r.resourcesFlow;
    console.log(
      `  resourcesFlow: opened=${f.opened}  links=${f.links}  panelOverflow=${f.panelOverflow}`,
    );
    if (!f.opened || f.links < 5 || f.panelOverflow) ok = false;
  }
  // Real failures: layout overflow, or console errors that aren't the
  // deliberate /ask round-trip we just attempted. ERR_CONNECTION_REFUSED /
  // failed-to-fetch is expected when the smoke runs without a backend up;
  // the ErrorPane should already be on screen in that case.
  const isAskNetworkError = (text) =>
    /ERR_CONNECTION_REFUSED|Failed to fetch|Failed to load resource/i.test(text);
  const unexpectedErrors = r.consoleErrors.filter((e) => {
    if (!r.stateFlow) return true;
    if (!r.stateFlow.error) return true;
    return !isAskNetworkError(e.text);
  });
  if (r.overflowX || unexpectedErrors.length > 0) ok = false;
  // stateFlow uses the real backend (which may be offline). The hard
  // requirement is that the chip click reaches *some* terminal state
  // (answered or error); the in-flight thinking pane is a soft signal
  // because a fast-failing fetch may skip past it. The mockedFlow below
  // enforces the full thinking → answered transition with a synthetic delay.
  if (r.stateFlow && !(r.stateFlow.answered || r.stateFlow.error)) ok = false;
}
console.log(`\nSMOKE: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
