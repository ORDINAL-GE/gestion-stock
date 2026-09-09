// Run with PLAYWRIGHT_MODULE set to the installed playwright/index.mjs if needed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('web');
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://localhost:${server.address().port}/passkeys/`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXE ? { executablePath: process.env.BROWSER_EXE } : {}) });
let context;
try {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page); await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(url);
  await page.locator('#start').click(); await page.locator('#approve').click();
  await page.locator('#code').fill('wrong');
  // Native form constraints are not bypassed in the real flow.
  const code = await page.locator('#activation-code').textContent();
  await page.locator('#code').fill(code === '000000' ? '000001' : '000000'); await page.locator('#enroll').click();
  await page.locator('#message.error').filter({ hasText: 'Code incorrect' }).waitFor();
  await page.locator('#code').fill(code); await page.locator('#enroll').click();
  await page.locator('[data-screen="ready"]:visible').waitFor();
  await page.locator('#first-login').click(); await page.locator('[data-screen="session"]:visible').waitFor();
  await page.locator('#check-session').click(); assert.match(await page.locator('#message').textContent(), /encore valide/);
  await page.reload(); await page.locator('[data-screen="session"]:visible').waitFor();
  await page.locator('#logout').click(); await page.locator('#login').click(); await page.locator('[data-screen="session"]:visible').waitFor();
  await page.locator('[data-screen="session"] [data-go="transfer"]').click(); await page.locator('#make-transfer').click();
  const transfer = await page.locator('#export-link').inputValue();
  const publicProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('stock.passkey-prototype.v1')).profile);
  assert.ok(!transfer.includes('privateKey')); assert.ok(publicProfile.publicKey);
  // New browser storage; synthetic authenticator credential transferred only inside the test harness.
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await context2.newPage(); page2.on('pageerror', e => errors.push(e.message));
  const cdp2 = await context2.newCDPSession(page2); await cdp2.send('WebAuthn.enable');
  const { authenticatorId: id2 } = await cdp2.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await cdp2.send('WebAuthn.addCredential', { authenticatorId: id2, credential: credentials[0] });
  await page2.goto(transfer); assert.equal(new URL(page2.url()).hash, '#transfer');
  await page2.locator('#import-profile').click(); await page2.locator('#message').filter({ hasText: 'Fiche publique chargée' }).waitFor();
  await page2.locator('#transfer-login').click(); await page2.locator('[data-screen="session"]:visible').waitFor();
  await page2.locator('[data-screen="session"] summary').click(); await page2.locator('#revoke').click(); await page2.locator('#login').click();
  await page2.locator('#message.error').filter({ hasText: 'révoqué' }).waitFor();
  // Revocation did not silently alter the first storage (explicit limitation of the demo).
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('stock.passkey-prototype.v1')).revoked), false);
  await page2.goBack(); assert.equal(await page2.locator('[data-screen="session"]:visible').count(), 0);
  await context2.close();
  // Restoring a pending request must not create a session after navigation.
  await page.locator('#back').click(); await page.locator('#login').click(); await page.locator('#logout').click();
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false });
  await page.locator('#login').click(); await page.locator('[data-go="diagnostic"]').click();
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('stock.passkey-prototype.session.v1')), null);
  assert.equal(await page.locator('[data-screen="diagnostic"]:visible').count(), 1);
  await page.locator('#back').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'tests/passkeys/mobile-home.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'tests/passkeys/desktop-home.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Browser PASS: activation, invalid code, real virtual WebAuthn create/get, signature verification, session reload/logout, public transfer to isolated storage, local revocation, back navigation, pending-operation cancellation, mobile layout.');
} finally { await context?.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
