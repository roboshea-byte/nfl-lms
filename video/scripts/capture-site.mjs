import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'public', 'site');
const executablePath = path.join(
  root,
  'node_modules',
  '.remotion',
  'chrome-headless-shell',
  'mac-arm64',
  'chrome-headless-shell-mac-arm64',
  'chrome-headless-shell',
);
const base = process.env.NFL_LMS_CAPTURE_URL || 'http://localhost:3100';
const wait = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

fs.rmSync(output, {recursive: true, force: true});
fs.mkdirSync(output, {recursive: true});

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const makePage = async (context) => {
  const page = await context.newPage();
  await page.setViewport({width: 1600, height: 900, deviceScaleFactor: 1});
  page.on('dialog', async (dialog) => dialog.accept());
  return page;
};

const shot = async (page, filename) => {
  await wait(350);
  await page.screenshot({path: path.join(output, filename), type: 'png'});
  process.stdout.write(`${filename}\n`);
};

const waitForPath = async (page, pathname) => {
  await page.waitForFunction((expected) => location.pathname === expected, {timeout: 10000}, pathname);
  await wait(750);
};

const clickButton = async (page, text, within = '') => {
  const clicked = await page.evaluate(({label, scope}) => {
    const rootNode = scope ? document.querySelector(scope) : document;
    const button = [...rootNode.querySelectorAll('button, a')].find(
      (node) => node.textContent.replace(/\s+/g, ' ').trim().includes(label),
    );
    if (!button) return false;
    button.click();
    return true;
  }, {label: text, scope: within});
  if (!clicked) throw new Error(`Could not find button/link containing “${text}”`);
  await wait(800);
};

try {
  // Create the owner first in a private local data store.
  const ownerContext = await browser.createBrowserContext();
  const owner = await makePage(ownerContext);
  await owner.goto(`${base}/signup#setup=local-owner-setup`, {waitUntil: 'networkidle0'});
  await owner.type('input[name="firstName"]', 'Rob');
  await owner.type('input[name="lastName"]', 'Admin');
  await owner.$eval('input[name="email"]', (node) => { node.value = ''; });
  await owner.type('input[name="email"]', 'owner@example.test');
  await owner.type('input[name="password"]', 'DemoPass123');
  await owner.click('button[type="submit"]');
  try {
    await waitForPath(owner, '/dashboard');
  } catch (error) {
    const message = await owner.$eval('#accountError', (node) => node.textContent);
    throw new Error(`Owner sign-up failed: ${message || error.message}`);
  }

  // Record the real registration and member account flow in a separate session.
  const memberContext = await browser.createBrowserContext();
  const member = await makePage(memberContext);
  await member.goto(`${base}/signup`, {waitUntil: 'networkidle0'});
  await shot(member, '01-register-empty.png');
  await member.type('input[name="firstName"]', 'Alex');
  await member.type('input[name="lastName"]', 'Morgan');
  await member.type('input[name="email"]', 'alex@example.test');
  await member.type('input[name="password"]', 'DemoPass123');
  await shot(member, '02-register-filled.png');
  await member.click('button[type="submit"]');
  await waitForPath(member, '/dashboard');
  await shot(member, '03-member-dashboard.png');
  await member.goto(`${base}/account`, {waitUntil: 'networkidle0'});
  await clickButton(member, 'Add another entry');
  await shot(member, '04-member-account.png');

  // Record the owner assigning admin access using the real controls.
  await owner.goto(`${base}/admin`, {waitUntil: 'networkidle0'});
  await shot(owner, '05-admin-home.png');
  await owner.evaluate(() => setView('members'));
  await wait(900);
  await shot(owner, '06-members-before-role.png');
  await owner.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((node) => node.getAttribute('aria-label') === 'Role for Alex Morgan');
    if (!select) throw new Error('Alex Morgan role selector not found');
    select.value = 'admin';
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await wait(900);
  await shot(owner, '07-members-admin-role.png');

  // Entries and payment approval.
  await owner.evaluate(() => setView('entries'));
  await wait(900);
  await shot(owner, '08-entries-unpaid.png');
  for (const name of ['Alex Morgan 1', 'Rob Admin 1']) {
    const clicked = await owner.evaluate((entryNameText) => {
      const row = [...document.querySelectorAll('.entries-table tbody tr')].find((node) =>
        node.textContent.replace(/\s+/g, ' ').includes(entryNameText),
      );
      const button = row && [...row.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Mark paid');
      if (!button) return false;
      button.click();
      return true;
    }, name);
    if (!clicked) throw new Error(`Mark paid was not found for ${name}`);
    await wait(900);
  }
  await shot(owner, '09-entries-paid.png');

  // Admin pick override, including the real team grid and confirmation modal.
  await owner.evaluate(() => setView('picks'));
  await wait(900);
  await shot(owner, '10-manage-picks.png');
  const pickerOpened = await owner.evaluate(() => {
    const row = [...document.querySelectorAll('tbody tr')].find((node) =>
      node.textContent.replace(/\s+/g, ' ').includes('Alex Morgan'),
    );
    const button = row && [...row.querySelectorAll('button')].find((node) => node.textContent.includes('Choose team'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!pickerOpened) throw new Error('Alex Morgan team picker was not found');
  await wait(600);
  await shot(owner, '11-team-picker.png');
  const teamClicked = await owner.evaluate(() => {
    const card = [...document.querySelectorAll('.teamgrid .tcard')].find((node) =>
      node.querySelector('.nm')?.textContent.trim() === 'Chiefs',
    );
    if (!card) return false;
    card.click();
    return true;
  });
  if (!teamClicked) throw new Error('Chiefs team card was not found');
  await wait(500);
  await shot(owner, '12-pick-confirmation.png');
  await clickButton(owner, 'Save admin pick', '#modalRoot');
  await shot(owner, '13-pick-saved.png');

  // Results, announcements, rollover rules and the searchable admin guide.
  await owner.evaluate(() => setView('results'));
  await wait(900);
  await shot(owner, '14-results.png');
  await owner.evaluate(() => setView('settings'));
  await wait(900);
  await shot(owner, '15-announcement.png');
  await owner.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find((node) => node.textContent.includes('Competition rules'));
    heading?.scrollIntoView({block: 'center'});
  });
  await wait(500);
  await shot(owner, '16-rollover-settings.png');
  await owner.evaluate(() => setView('adminhelp'));
  await wait(900);
  await shot(owner, '17-admin-guide.png');
} finally {
  await browser.close();
}
