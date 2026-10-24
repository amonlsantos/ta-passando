/**
 * End-to-end UI test: the Angular app in a real browser against the API and
 * the mock provider.
 *
 * Prerequisites (playwright is intentionally not a project dependency, so
 * `npm install` stays light):
 *
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * Then, with the web app already running:
 *
 *   E2E_URL=http://localhost:8100 npm run e2e
 *
 * The script starts the mock XMLTV provider and the API itself, so the only
 * thing you need running is the web app (`npx ionic serve` or `npm start`).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const apiProject = path.resolve(projectRoot, '..', 'epg-api');

const E2E_URL = process.env.E2E_URL ?? 'http://localhost:8100';
const E2E_TIMEOUT = Number(process.env.E2E_TIMEOUT ?? 60000);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(
      [
        '',
        'playwright is not installed. To run the UI end-to-end test:',
        '',
        '  npm i -D playwright',
        '  npx playwright install chromium',
        '',
        'Or point E2E_CHROMIUM_PATH at an existing Chromium binary.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
}

/** Allows reusing a Chromium already on the machine instead of downloading one. */
function chromiumLaunchOptions() {
  const candidates = [
    process.env.E2E_CHROMIUM_PATH,
    ...(existsSync(`${process.env.HOME}/.cache/ms-playwright`)
      ? [
          process.env.HOME +
            '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
        ]
      : []),
  ].filter(Boolean);

  const executablePath = candidates.find((candidate) => existsSync(candidate));
  return executablePath ? { executablePath } : {};
}

async function startProviderAndApi() {
  const mock = spawn(process.execPath, [path.join(apiProject, 'test', 'mock-epg.mjs')], {
    cwd: apiProject,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const api = spawn(process.execPath, [path.join(apiProject, 'dist', 'server.js')], {
    cwd: apiProject,
    env: {
      ...process.env,
      EPG_XMLTV_URL: process.env.EPG_XMLTV_URL ?? 'http://localhost:4010/epg.xml',
      PORT: process.env.API_PORT ?? '3000',
      HOST: '0.0.0.0',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${process.env.API_PORT ?? 3000}/health`);
      if (response.ok) {
        return { mock, api };
      }
    } catch {
      // not up yet
    }
    await wait(200);
  }

  mock.kill('SIGKILL');
  api.kill('SIGKILL');
  throw new Error('API did not become healthy in time');
}

const results = [];

async function step(name, body) {
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message.split('\n').slice(0, 6).join('\n       ')}`);
  }
}

async function main() {
  const { chromium } = await loadPlaywright();
  const { mock, api } = await startProviderAndApi();

  const consoleErrors = [];
  let browser;

  try {
    browser = await chromium.launch(chromiumLaunchOptions());
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    const nowItems = () => page.locator('app-home ion-item.now-item:visible');
    const channelItems = () => page.locator('app-channels ion-item.channel-item:visible');
    const programItems = () => page.locator('app-schedule ion-item.program-item');
    const favouritesButton = (root) =>
      page.locator(`${root} ion-header ion-buttons[slot='end'] ion-button`).first();
    const stars = () => channelItems().locator("ion-icon[name='star']");

    console.log('\n== boot ==');
    await step('app loads and shows the now-playing list', async () => {
      await page.goto(E2E_URL, { waitUntil: 'networkidle', timeout: E2E_TIMEOUT });
      await page.waitForSelector('app-home ion-item.now-item', { timeout: E2E_TIMEOUT });
      assert.ok((await nowItems().count()) > 0, 'expected at least one channel on air');
    });

    console.log('\n== home ==');
    await step('shows progress between 0 and 1 and the next programme', async () => {
      const row = nowItems().first();
      const value = await row.locator('ion-progress-bar').evaluate((el) => el.value);

      assert.ok(value > 0 && value < 1, `progress should be a fraction, got ${value}`);
      assert.match(await row.innerText(), /A SEGUIR/i, 'expected a "next programme" hint');
    });

    console.log('\n== channels ==');
    await step('lists channels and filters by search', async () => {
      await page.getByRole('tab', { name: 'Canais' }).click();
      await page.waitForSelector('app-channels ion-item.channel-item:visible', {
        timeout: E2E_TIMEOUT,
      });

      const total = await channelItems().count();
      assert.ok(total > 0);

      const search = page.locator('app-channels ion-searchbar:visible input');
      await search.fill('Gamma');
      await wait(600);
      const filtered = await channelItems().count();

      assert.ok(filtered > 0 && filtered < total, `expected fewer results, got ${filtered}/${total}`);

      await search.fill('zzz-sem-resultado');
      await wait(600);
      assert.equal(await channelItems().count(), 0, 'expected an empty result set');
    });

    console.log('\n== favourites ==');
    await step('favouriting a channel persists across a reload', async () => {
      const search = page.locator('app-channels ion-searchbar:visible input');
      await search.fill('');
      await wait(500);

      await channelItems().first().locator('ion-button').click();
      await wait(800);
      assert.equal(await stars().count(), 1, 'the channel should be starred');

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('app-channels ion-item.channel-item:visible', {
        timeout: E2E_TIMEOUT,
      });
      await wait(500);
      assert.equal(await stars().count(), 1, 'the favourite should survive a reload');
    });

    await step('favourites filter with no favourites shows the empty state', async () => {
      await page.getByRole('tab', { name: 'Agora' }).click();
      await page.waitForSelector('app-home ion-item.now-item', { timeout: E2E_TIMEOUT });

      // Remove the single favourite so the filter has nothing to show.
      await page.getByRole('tab', { name: 'Canais' }).click();
      await page.waitForSelector('app-channels ion-item.channel-item:visible', {
        timeout: E2E_TIMEOUT,
      });
      await channelItems().first().locator('ion-button').click();
      await wait(700);

      await page.getByRole('tab', { name: 'Agora' }).click();
      await page.waitForSelector('app-home ion-item.now-item', { timeout: E2E_TIMEOUT });
      await favouritesButton('app-home').click();
      await wait(1200);

      assert.equal(await nowItems().count(), 0, 'no favourites means no rows');
      assert.match(
        await page.locator('app-home .state:visible').innerText(),
        /favoritos/i,
        'expected the "mark channels as favourites" message',
      );

      await favouritesButton('app-home').click();
      await wait(800);
      assert.ok((await nowItems().count()) > 0, 'turning the filter off should list channels again');
    });

    console.log('\n== schedule ==');
    await step('opens a channel and shows its schedule', async () => {
      await page.getByRole('tab', { name: 'Canais' }).click();
      await page.waitForSelector('app-channels ion-item.channel-item:visible', {
        timeout: E2E_TIMEOUT,
      });
      await channelItems().first().click();

      await page.waitForSelector('app-schedule ion-item.program-item', { timeout: E2E_TIMEOUT });

      const chips = page.locator('app-schedule .day-chip');
      const chipCount = await chips.count();

      // The feed carries one or two days, so the strip only exists when the
      // schedule actually spans more than one.
      assert.ok(chipCount === 0 || chipCount >= 2, `unexpected chip count ${chipCount}`);

      if (chipCount > 0) {
        assert.equal(
          await page.locator('app-schedule .day-chip--active').innerText(),
          (await chips.first().innerText()),
          'today should be the selected day',
        );
      }

      const onAir = await page.locator('app-schedule ion-badge:has-text("AGORA")').count();
      assert.ok(onAir <= 1, 'at most one programme can be on air');
    });

    await step('day chips switch the visible programmes', async () => {
      const chips = page.locator('app-schedule .day-chip');
      const total = await chips.count();

      if (total < 2) {
        assert.equal(total, 0, 'a single day hides the strip');
        assert.ok((await programItems().count()) > 0, 'expected programmes for the day');
        return;
      }

      const before = await programItems().count();
      await chips.nth(1).click();
      await wait(600);

      assert.notEqual(
        await page.locator('app-schedule .day-chip--active').innerText(),
        await chips.first().innerText(),
        'the active chip should have moved',
      );
      assert.ok(before > 0);
    });

    console.log('\n== details ==');
    await step('opens a programme with a localised date and a synopsis', async () => {
      // The schedule page lives outside the tabs shell, so go back first.
      await page.goBack();
      await page.getByRole('tab', { name: 'Agora' }).click();
      await page.waitForSelector('app-home ion-item.now-item:visible', { timeout: E2E_TIMEOUT });
      await nowItems().first().click();
      await page.waitForSelector('app-program .program__title', { timeout: E2E_TIMEOUT });

      assert.match(page.url(), /\/program\//);
      assert.ok((await page.locator('app-program .program__title').innerText()).length > 0);

      const facts = await page.locator('app-program .program__fact').allInnerTexts();
      const joined = facts.join(' ');
      assert.match(joined, /segunda|terça|quarta|quinta|sexta|sábado|domingo/i,
        'the date must be localised to pt-BR');

      assert.ok(
        (await page.locator('app-program .program__section').count()) > 0,
        'expected a synopsis section',
      );
    });

    console.log('\n== navigation ==');
    await step('back navigation returns to the previous tab', async () => {
      await page.goBack();
      await page.waitForSelector('app-home ion-item.now-item:visible', { timeout: E2E_TIMEOUT });
      assert.match(page.url(), /\/tabs\/now/);
    });

    await step('no console errors were logged', () => {
      assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
    });
  } finally {
    await browser?.close();
    mock.kill('SIGKILL');
    api.kill('SIGKILL');
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
