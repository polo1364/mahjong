/** Enter via the public start screen without touching a user's browser context. */
async function enterGame(page, { skipOpening = true, waitForPlay = true, mode = 'normal' } = {}) {
  if (await page.locator('#startScreen').isVisible()) {
    await page.locator('#startGameBtn').click();
    await page.locator(mode === 'cultivation' ? '#cultivationModeBtn' : '#normalModeBtn').click();
    if (mode === 'cultivation') await page.locator('#journeyChooseConfirm').click();
  }
  await page.waitForFunction(() => typeof S !== 'undefined' && !!S);
  if (skipOpening) {
    await page.evaluate(() => window.MahjongOpening?.finish('test-skip'));
  }
  if (waitForPlay) await page.waitForFunction(() => S && S.phase !== 'deal');
}

module.exports = { enterGame };
