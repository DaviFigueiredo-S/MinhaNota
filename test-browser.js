'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/calculator-core.js': ['calculator-core.js', 'text/javascript; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
  '/assets/fsa-logo.png': ['assets/fsa-logo.png', 'image/png'],
  '/assets/fsa-favicon.png': ['assets/fsa-favicon.png', 'image/png'],
  '/assets/mascote-fsa-novo.png': ['assets/mascote-fsa-novo.png', 'image/png']
};
const server = http.createServer((request, response) => {
  const file = files[request.url];
  if (!file) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': file[1] });
  response.end(fs.readFileSync(path.join(__dirname, file[0])));
});
const key = 'media-certa-state-v1';

async function testTutorial(browser, origin, viewport) {
  const page = await browser.newPage({ viewport });
  let playerRequests = 0;
  const embed = 'https://www.youtube-nocookie.com/embed/Aaa7PTfnNro?autoplay=1&playsinline=1';
  const watchUrl = 'https://youtu.be/Aaa7PTfnNro';
  await page.route('https://i.ytimg.com/vi/Aaa7PTfnNro/maxresdefault.jpg', (route) => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"/>'
  }));
  await page.route(embed, (route) => {
    playerRequests += 1;
    return route.fulfill({ contentType: 'text/html', body: '<h1>Player de teste</h1>' });
  });
  await page.goto(origin);
  const cover = page.getByRole('link', { name: 'Reproduzir tutorial' });
  const player = page.locator('#tutorial-player');
  assert.equal(await cover.getAttribute('href'), watchUrl);
  assert.equal(await page.getByRole('link', { name: 'Abrir no YouTube' }).getAttribute('href'), watchUrl);
  await cover.scrollIntoViewIfNeeded();
  await cover.locator('img').evaluate((image) => image.decode());
  const box = await cover.boundingBox();
  assert.ok(box.width >= 200 && box.width <= viewport.width);
  assert.ok(box.height >= 200 && box.height <= viewport.height);
  const videoSection = await page.locator('.intro-video').boundingBox();
  const steps = await page.locator('.intro-steps').boundingBox();
  if (viewport.width > 740) {
    assert.ok(steps.x >= videoSection.x + videoSection.width);
    assert.equal(steps.y, videoSection.y);
  } else {
    assert.ok(steps.y >= videoSection.y + videoSection.height);
  }
  const cards = await page.locator('.intro-steps .step-item').all();
  assert.equal(cards.length, 3);
  for (let i = 1; i < cards.length; i += 1) {
    const previous = await cards[i - 1].boundingBox();
    assert.ok((await cards[i].boundingBox()).y >= previous.y + previous.height);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await player.count(), 0);
  assert.equal(playerRequests, 0);

  await cover.focus();
  await page.keyboard.press('Enter');
  await page.frameLocator('#tutorial-player').getByRole('heading', { name: 'Player de teste' }).waitFor();
  assert.equal(await player.getAttribute('src'), embed);
  assert.equal(await player.getAttribute('allowfullscreen'), '');
  assert.equal(await cover.isHidden(), true);
  assert.equal(playerRequests, 1);
  assert.deepEqual(await player.boundingBox(), await page.locator('.tutorial-frame').boundingBox());
  await page.getByRole('button', { name: 'Minhas notas', exact: true }).click();
  assert.equal(await player.count(), 0);
  await page.getByRole('button', { name: 'Como funciona' }).click();
  assert.equal(await cover.isVisible(), true);
  console.log(`PASSOU tutorial (${viewport.width} × ${viewport.height}): vídeo, disposição dos cartões e reprodução por teclado`);
  await page.close();
}

async function testFileTutorial(browser) {
  const context = await browser.newContext();
  const watchUrl = 'https://youtu.be/Aaa7PTfnNro';
  await context.route('https://i.ytimg.com/**', (route) => route.abort());
  await context.route(watchUrl, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>YouTube</h1>' }));
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
  const cover = page.getByRole('link', { name: 'Assistir no YouTube', exact: true });
  const newTab = context.waitForEvent('page');
  await cover.click();
  await (await newTab).waitForURL(watchUrl);
  assert.equal(await page.locator('#tutorial-player').count(), 0);
  console.log('PASSOU tutorial via file://: clique abre o YouTube em nova aba');
  await context.close();
}

async function run(browser, origin, label, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 410 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await context.newPage();
  await page.route('https://i.ytimg.com/**', (route) => route.abort());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const at = (selector) => page.locator(selector);
  const fill = (selector, value) => at(selector).fill(value);
  const contains = async (selector, text) => assert.ok((await at(selector).innerText()).includes(text), `${label}: ${selector} deveria conter ${text}`);
  const result = '#result-panel';
  const table = '#scenario-content';
  const button = '#toggle-simulator';
  const bottomButton = '#close-simulator';
  const rows = () => at('#scenario-table-body tr').count();
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const copyAndRead = async () => {
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await at('#copy-summary').click();
    await page.waitForFunction(async () => Boolean(await navigator.clipboard.readText()));
    return page.evaluate(() => navigator.clipboard.readText());
  };

  await page.goto(origin);
  assert.match(await page.title(), /^MinhaNota/);
  assert.equal(await at('[data-view="intro"]').getAttribute('aria-current'), 'page');
  await contains('.brand-copy', 'MinhaNota');
  const headerLogo = at('img.brand-mark');
  await headerLogo.evaluate((img) => img.decode());
  assert.equal(await headerLogo.isVisible(), true);
  const faviconSize = await at('link[rel="icon"]').evaluate(async (link) => {
    const image = new Image();
    image.src = link.href;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  assert.deepEqual(faviconSize, [64, 64]);
  assert.equal(await at('#save-status, #history-details').count(), 0);
  for (const [name, url] of [
    ['Instagram de @odavifs_', 'https://www.instagram.com/odavifs_/'],
    ['LinkedIn de Davi Figueiredo', 'https://www.linkedin.com/in/davifigueiredos/']
  ]) {
    const link = page.getByRole('link', { name });
    assert.equal(await link.getAttribute('href'), url);
    assert.equal(await link.locator('svg').isVisible(), true);
  }
  await contains('#intro-title', 'Sua média, sem enrolação');
  await contains('.intro-lead', 'Descubra quanto precisa tirar na P2 para passar na FSA');
  await at('.mascot-image').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.mascot-image').naturalWidth > 0);
  await contains('.rule-example', '4,750');
  await page.getByRole('button', { name: 'Preencher minhas notas' }).click();
  assert.equal(await at('#notes-page-title').evaluate((node) => node === document.activeElement), true);
  assert.equal(await at('#assessment-mode-select').inputValue(), 'none');
  await contains('#assessment-mode-select option:checked', 'Não tenho nenhumas dessas alternativas');
  assert.equal(await at('#field-PI').isHidden(), true);
  await fill('#grade-P1', '1,0');
  await fill('#grade-ATV', '7.0');
  await page.evaluate(() => scrollTo(0, 0));
  await contains(result, 'Você precisa de 7,38 na P2');
  assert.equal(await at('#hypotheses-title, #simulator-P2, #simulator-ATV').count(), 0);
  await contains(result, 'Pontos parciais: 1,800');
  assert.equal(await at(table).isHidden(), true);
  assert.equal(await at(bottomButton).isHidden(), true);
  assert.equal(await at(button).getAttribute('aria-expanded'), 'false');
  const gradesBox = await at('.grades-card').boundingBox();
  const resultBox = await at('.simulator-card').boundingBox();
  const answerBox = await at('.result-answer').boundingBox();
  assert.ok(resultBox.y >= gradesBox.y + gradesBox.height);
  assert.equal(resultBox.x, gradesBox.x);
  assert.equal(resultBox.width, gradesBox.width);
  if (viewport.width > 680) {
    assert.ok(answerBox.y + answerBox.height <= viewport.height, `${label}: resposta termina em ${answerBox.y + answerBox.height}px`);
    assert.equal((await at('#grade-P1').boundingBox()).y, (await at('#grade-ATV').boundingBox()).y);
  }
  assert.ok((await at(button).boundingBox()).height >= 44);
  await noOverflow();
  const screenshotDir = process.env.MEDIA_CERTA_TEST_SCREENSHOTS;
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`) });
  }

  await at(button).focus();
  await page.keyboard.press('Enter');
  assert.equal(await at(button).getAttribute('aria-expanded'), 'true');
  assert.equal(await at(button).evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');
  await contains(button, 'Ocultar os 21 cenários');
  await contains(bottomButton, 'Ocultar os 21 cenários');
  assert.equal(await rows(), 21);
  await contains('.first-pass', '7,5');
  await contains('.first-pass', 'Primeira aprovação da tabela');
  await contains('#scenario-summary', '6 dos 21 cenários simulados atingem a média');
  await noOverflow();

  await fill('#grade-ATV', '8,0');
  await contains(result, '6,88');
  await contains('.first-pass', '7,0');
  await fill('#grade-ATV', '7,0');
  assert.equal(await at(button).getAttribute('aria-expanded'), 'true');
  await fill('#grade-P2', '7.37');
  await contains(result, '4,748');
  await contains(result, 'Abaixo da média');
  await fill('#grade-P2', '7,38');
  await contains(result, '4,752');
  await contains(result, '5,0');
  await contains(result, 'Aprovado');
  assert.ok(!(await at(result).innerText()).includes('Projeção'));
  await fill('#grade-P2', '7,381');
  assert.equal(await at('#grade-P2').getAttribute('aria-invalid'), 'true');
  await contains('#issue-P2', 'duas casas decimais');
  await contains(result, 'Corrija as notas');
  assert.equal(await at(button).getAttribute('aria-expanded'), 'true');
  await fill('#grade-P2', '');
  assert.equal(await rows(), 21);
  await at(button).focus();
  await page.keyboard.press('Space');
  assert.equal(await at(table).isHidden(), true);
  await contains(result, 'Você precisa de 7,38 na P2');
  if (viewport.width <= 410) {
    await at(button).tap();
    assert.equal(await rows(), 21);
    await at(bottomButton).tap();
  } else {
    await at(button).click();
    await at(bottomButton).focus();
    await page.keyboard.press('Enter');
  }
  assert.equal(await at(table).isHidden(), true);
  assert.equal(await at(button).evaluate((node) => node === document.activeElement), true);
  await contains(result, 'Você precisa de 7,38 na P2');

  await fill('#discipline-name', 'Banco de Dados II');
  const plainSummary = await copyAndRead();
  await contains('#toast-region', 'Resumo copiado');
  assert.equal(plainSummary, 'Banco de Dados II · Preciso de 7,38 na P2 com ATV 7,0');

  await at('#save-snapshot').click();
  await contains('#discipline-summary', '7,38 na P2 · Projeção');
  await fill('#grade-P2', '7,38');
  await at('#save-snapshot').click();
  assert.equal(await at('.discipline-list li').count(), 1);
  assert.equal(await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)).history.length, key), 2);
  await contains('#discipline-summary', 'Média final 5,0');
  assert.match(await copyAndRead(), /Média final 5,0 · média bruta 4,752 · Aprovado/);
  await page.reload();
  assert.equal(await at('#view-intro').isVisible(), true);
  assert.equal(await at('#view-notes').isHidden(), true);
  await at('[data-view="notes"]').click();
  assert.equal(await at(table).isHidden(), true);
  assert.equal(await at('#grade-P2').inputValue(), '7,38');
  assert.equal(await at('#discipline-name').inputValue(), 'Banco de Dados II');
  await contains('#discipline-summary', 'Média final 5,0');

  await fill('#grade-P2', '');
  await fill('#grade-P1', '10');
  await fill('#grade-ATV', '10');
  await contains(result, 'P2 igual a zero já é suficiente');
  await fill('#grade-P1', '0');
  await fill('#grade-ATV', '0');
  await contains(result, 'média final máxima projetada é 4,0');
  assert.match(await copyAndRead(), /média não é alcançável/);
  await fill('#grade-ATV', '');
  await contains(result, 'ATV em branco: 0 na projeção');
  await contains(result, 'Pendentes: P2, ATV');
  await fill('#grade-P2', '0');
  await contains(result, 'Média final · Projeção');
  await contains(result, '0,000');
  await fill('#grade-P1', '');
  await contains(result, 'P1 em branco: 0 na projeção');
  await fill('#grade-P1', '-2');
  assert.equal(await at('#grade-P1').getAttribute('aria-invalid'), 'true');
  await fill('#grade-P1', '10,01');
  await contains('#issue-P1', '0 a 10');
  await fill('#grade-P1', '5');
  await fill('#grade-ATV', '8');
  await fill('#grade-P2', '9,8');
  await at('#assessment-mode-select').selectOption('presentation');
  await contains('#p2-effective-note', '10,000');
  await contains(result, '7,600');
  await at('#assessment-mode-select').selectOption('pi');
  await contains(result, 'PI pendente: faixa de 0 a 10');
  await at(button).click();
  assert.equal(await rows(), 21);
  await contains('#scenario-table-body', 'Depende da PI');
  await noOverflow();
  if (screenshotDir && label === 'mobile') {
    await at('#scenario-title').evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(screenshotDir, 'mobile-tabela.png') });
  }
  await fill('#grade-PI', '7');
  assert.equal(await at(button).getAttribute('aria-expanded'), 'true');
  await contains(result, '7,420');

  // Formato de produção: disciplina antiga em outro subjectId e registro sem nome.
  await page.evaluate((storageKey) => {
    const data = JSON.parse(localStorage.getItem(storageKey));
    const hypotheses = { P2: '7,38', ATV: '8,0' };
    data.subjects.push({ id: 'old', name: 'Minha disciplina', grades: {}, mode: 'pi', hypotheses });
    data.history.push({ id: 'old-unnamed', subjectId: 'old', label: 'Minha disciplina', mode: 'none', grades: { P1: 1, ATV: 7, P2: '' }, hypotheses });
    data.history.push({ id: 'old-named', subjectId: 'old', label: 'Programação', mode: 'none', grades: { P1: 1, ATV: 7, P2: '7,381' } });
    localStorage.setItem(storageKey, JSON.stringify(data));
    localStorage.setItem('media-certa-intro-seen-v1', 'true');
  }, key);
  await page.reload();
  assert.equal(await at('#view-intro').isVisible(), true);
  await at('[data-view="notes"]').click();
  assert.equal(await at('#assessment-mode-select').inputValue(), 'pi');
  await page.getByRole('button', { name: 'Abrir cenário de Sem disciplina' }).click();
  await contains(result, '7,38 na P2');
  assert.equal(await copyAndRead(), 'Preciso de 7,38 na P2 com ATV 7,0');
  const legacyHypotheses = await page.evaluate((storageKey) => {
    const data = JSON.parse(localStorage.getItem(storageKey));
    return [data.subjects.find((subject) => subject.id === 'old').hypotheses,
      data.history.find((entry) => entry.id === 'old-unnamed').hypotheses];
  }, key);
  assert.deepEqual(legacyHypotheses, [{ P2: '7,38', ATV: '8,0' }, { P2: '7,38', ATV: '8,0' }]);
  await page.getByRole('button', { name: 'Abrir cenário de Programação' }).click();
  assert.equal(await at('#grade-P2').inputValue(), '7,381');
  assert.equal(await at('#grade-P2').getAttribute('aria-invalid'), 'false');
  await contains(result, 'Aprovado');
  assert.equal(await at('.discipline-list li').count(), 3);
  assert.equal(await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)).history.length, key), 4);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Sem permissão')) } });
  });
  await at('#copy-summary').click();
  await at('#manual-copy-text').waitFor({ state: 'visible' });
  assert.match(await at('#manual-copy-text').inputValue(), /Programação · Média final 5,0/);
  assert.equal(await at('#manual-copy-text').evaluate((el) => el.selectionEnd), (await at('#manual-copy-text').inputValue()).length);
  assert.deepEqual(errors, []);
  await noOverflow();
  console.log(`PASSOU ${label} (${viewport.width} × ${viewport.height}): layout, cálculo, teclado, tabela, clipboard e histórico persistente`);
  await context.close();
}

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await testTutorial(browser, origin, { width: 1440, height: 900 });
    await testTutorial(browser, origin, { width: 320, height: 820 });
    await testTutorial(browser, origin, { width: 844, height: 390 });
    await testFileTutorial(browser);
    await run(browser, origin, 'desktop', { width: 1440, height: 900 });
    await run(browser, origin, 'tablet', { width: 820, height: 1180 });
    await run(browser, origin, 'mobile', { width: 390, height: 844 });
    await run(browser, origin, 'estreito', { width: 320, height: 820 });
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
