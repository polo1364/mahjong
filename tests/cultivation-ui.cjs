/* Browser presentation checks; combat effects are tested by cultivation-combat tests. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enterGame } = require('./start-screen-helper.cjs');
const root = path.join(__dirname, '..');
const output = path.join(root, 'artifacts');
const result = { checks: [], viewports: [], errors: [] };
const check = (value, name) => { assert.ok(value, name); result.checks.push(name); };
const sizes = [[1440, 900], [943, 889], [390, 844], [320, 568], [844, 390], [568, 320]];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.addInitScript(() => localStorage.setItem('qinghe_feedback_v1', JSON.stringify({ sound: false, reduced: true })));
      await page.goto(process.env.MAHJONG_URL || 'http://127.0.0.1:8765');
      await enterGame(page);
      await page.evaluate(() => cancelGameTimers());
      for (const file of ['cultivation-skills.js', 'cultivation-combat.js', 'cultivation-ui.js']) {
        if (!await page.locator(`script[src="${file}"]`).count()) await page.addScriptTag({ path: path.join(root, file) });
      }
      if (!await page.locator('link[href="cultivation.css"]').count()) await page.addStyleTag({ path: path.join(root, 'cultivation.css') });
      const setup = await page.evaluate(() => {
        window.normalStateSnapshot = JSON.parse(JSON.stringify(S));
        S.names = ['青冥', '浮生', '扶搖', '太初'];
        S.cultivation = {
          version: 1, players: [0, 1, 2, 3].map((_, pid) => ({ hp: 920 - pid * 120, maxHp: 1000,
            shield: 150, shieldTurns: 3, damage: [1200, 3200, 3200, 980][pid], aggro: [1200, 600, 1600, 200][pid], weakDiscards: 0,
            activeSeals: pid === 1 ? MahjongCultivationFinishers.curses([{id:'closed'}]) : [],
            statuses: pid === 0 || pid === 1 ? [{ kind: 'guard', duration: 3 }, { kind: 'counter', duration: 2 }] : [] })),
          monster: { id: 'preview-1', index: 2, name: '赤焰妖狐', element: 'fire', hp: 1120, maxHp: 1725,
            nextAttack: { type: 'single', charged: true, damage: 224 }, statuses: [] }, discardCount: 2, kills: [{ pid: 2 }],
          log: [{ type: 'skill', pid: 2, name: '秘術', skillId: 'FE.concealed', secret: true }]
        };
        const before = JSON.stringify(S);
        MahjongCultivationUI.render(S);
        MahjongCultivationUI.render(S);
        return { unchanged: before === JSON.stringify(S), count: MahjongCultivationSkills.all.length };
      });
      check(setup.unchanged, `${width}: render does not mutate game/combat state`);
      check(setup.count === 170, `${width}: complete 170 skill records`);
      check(await page.locator('.cult-player-stats').count() === 4, `${width}: idempotent four player HUDs`);
      await page.locator('.cult-seal-trigger').click();
      check(await page.locator('#cultivationInformation').innerText().then(t=>t.includes('本局結束解除')&&t.includes('閉脈')), `${width}: top player seal details accessible`);
      await page.locator('#cultivationInformation button').click();
      check(await page.locator('.cult-seal-trigger').evaluate(el=>el===document.activeElement), `${width}: seal dialog restores focus`);
      check(await page.locator('#playerInfo2').evaluate(node => node.classList.contains('cult-targeted')), `${width}: highest aggro target marked`);
      check(await page.locator('#cultivationMonster').innerText().then(text => text.includes('扶搖') && text.includes('再出牌 2 次')), `${width}: target and countdown visible`);
      check(await page.locator('#cultivationLog').textContent().then(text => text.includes('秘術') && !text.includes('龍鱗長生')), `${width}: concealed opponent skill stays secret`);
      await page.evaluate(() => MahjongTableLayout.refresh());
      await page.waitForTimeout(80);
      const geometry = await page.evaluate(() => {
        const table = document.getElementById('playersGrid').getBoundingClientRect();
        const tiles = [...document.querySelectorAll('#yourHand button.tile')].map(node => node.getBoundingClientRect());
        const monster = document.getElementById('cultivationMonster').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.cult-player-stats')].map(node => node.getBoundingClientRect());
        const topInfo = document.querySelector('.top-area > .player-info-inline').getBoundingClientRect();
        const clear = box => box.right <= topInfo.left || box.left >= topInfo.right || box.bottom <= topInfo.top || box.top >= topInfo.bottom;
        return { rows: new Set(tiles.map(tile => Math.round(tile.top))).size,
          topClear: [...document.querySelectorAll('#handBack1 .tile-back,#tableMenuBtn')].every(node=>clear(node.getBoundingClientRect())),
          handInside: tiles.every(tile => tile.left >= table.left - 1 && tile.right <= table.right + 1),
          monsterInside: monster.left >= table.left && monster.right <= table.right && monster.top >= table.top && monster.bottom <= table.bottom,
          cardsInside: cards.every(card => card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight),
          sideTileMinHeight: Math.min(...[...document.querySelectorAll('#handBack2 .tile-back,#handBack3 .tile-back')].map(tile => tile.getBoundingClientRect().height)),
          noOverflow: document.documentElement.scrollWidth <= innerWidth, width: innerWidth, height: innerHeight };
      });
      check(geometry.rows === 1 && geometry.handInside, `${width}: full hand stays inside table on one row`);
      check(geometry.topClear, `${width}: top seal card covers neither hand backs nor settings`);
      check(geometry.monsterInside && geometry.cardsInside && geometry.noOverflow, `${width}: combat HUD inside viewport`);
      check(geometry.sideTileMinHeight >= 5, `${width}: standing side hands retain visible thickness`);
      result.viewports.push(geometry);
      await page.screenshot({ path: path.join(output, `cultivation-table-${width}x${height}.png`) });
      await page.locator('#tableMenuBtn').click();
      await page.locator('#tmTab-cult').click();
      await page.locator('#cultivationCatalogOpen').click();
      await page.locator('#cultivationSkillSearch').fill('星火燎原');
      check(await page.locator('#cultivationSkillList .cult-skill-card').count() === 1, `${width}: catalog searches skill names`);
      await page.locator('#cultivationSkillSearch').fill('');
      await page.locator('#cultivationAction').selectOption('finish');
      check((await page.locator('#cultivationSkillCount').innerText()).includes('38'), `${width}: all 38 finisher entries available through pagination`);
      await page.locator('#cultivationSkillSearch').fill('');
      await page.locator('#cultivationFamily').selectOption('W');
      await page.locator('#cultivationAction').selectOption('chow');
      check(await page.locator('#cultivationSkillList .cult-skill-card').count() === 7, `${width}: catalog filters all seven red-crystal chows`);
      if (width === 1440) await page.screenshot({ path: path.join(output, 'cultivation-skill-catalog.png') });
      await page.locator('#cultivationCodexClose').click();
      await page.locator('#tableMenuClose').click();
      await page.evaluate(() => {
        document.getElementById('tableMenuBtn').focus();
        MahjongCultivationUI.chooseSkills([{ action: 'chow', keys: ['W1', 'W2', 'W3'], label: '赤晶 123', value: 1 },
          { action: 'concealed', key: 'FE', label: '青龍暗槓', value: 2 }], option => { window.selectedCultivationSkill = option.value; }, () => { window.cancelledCultivationSkill = true; });
      });
      check(await page.locator('#cultivationChoice').isVisible(), `${width}: accessible choice dialog opens`);
      check(await page.locator('.cult-choice-option').first().innerText().then(text => text.includes('星火燎原')), `${width}: legal option has actual skill preview`);
      await page.keyboard.press('Escape');
      check(await page.evaluate(() => window.cancelledCultivationSkill && document.activeElement.id === 'tableMenuBtn'), `${width}: Escape restores focus without choosing`);
      await page.evaluate(() => MahjongCultivationUI.chooseSkills([{ action: 'chow', keys: ['W1', 'W2', 'W3'], value: 1 }], option => { window.selectedCultivationSkill = option.value; }));
      await page.locator('.cult-choice-option').click();
      check(await page.evaluate(() => window.selectedCultivationSkill === 1 && !document.getElementById('cultivationChoice')), `${width}: choose commits exactly one option`);
      await page.evaluate(() => {
        S.phase = 'end'; S.winner = 0; S.fromPlayer = -1; S.winTile = null; S.flowerWin = null;
        S.resultDetail = { fan: 3, categories: ['自摸'] };
        S.cultivation.ended = true; S.cultivation.result = { reason: 'hu' };
        showHandsAndContinue(); MahjongCultivationUI.showResult(S);
      });
      check(await page.locator('.cult-result .rs-head').innerText().then(text => text.includes('並列首席') && text.includes('浮生') && text.includes('扶搖')), `${width}: damage tie wins instead of Hu player`);
      check(await page.locator('.cult-result .result-player.winner').count() === 2, `${width}: both damage leaders highlighted`);
      await page.waitForTimeout(60);
      const resultRows = await page.evaluate(() => [...document.querySelectorAll('.cult-result .rs-tiles')].every(rail => {
        const tiles = [...rail.querySelectorAll('.tile')].map(tile => tile.getBoundingClientRect());
        const box = rail.getBoundingClientRect();
        return tiles.every(tile => tile.left >= box.left - 1 && tile.right <= box.right + 1);
      }));
      check(resultRows, `${width}: all revealed hand tiles fit result rows`);
      check(await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.cult-result .result-player')];
        return document.querySelector('.cult-result .result-footer').getBoundingClientRect().top >= rows[rows.length - 1].getBoundingClientRect().bottom;
      }), `${width}: result action never overlays revealed tiles`);
      await page.screenshot({ path: path.join(output, `cultivation-result-${width}x${height}.png`) });
      await page.evaluate(() => { hideReactionPanel(); S = normalStateSnapshot; renderAll(); MahjongCultivationUI.render(S); });
      check(await page.locator('.cult-player-stats,#cultivationMonster').count() === 0, `${width}: normal mode removes combat HUD`);
      await page.close();
    }
    // Public mode entry and legal button/tile actions, with only animation pacing shortened.
    result.live = [];
    for (const [width, height] of [[1440, 900], [320, 568], [568, 320]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on('pageerror', error => result.errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('qinghe_feedback_v1', JSON.stringify({ sound: false, reduced: true }));
        let seed = 56221;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      });
      await page.goto(process.env.MAHJONG_URL || 'http://127.0.0.1:8765');
      await page.locator('#startGameBtn').click();
      await page.locator('#cultivationModeBtn').click();
      await page.waitForFunction(() => S?.cultivation);
      await page.evaluate(() => { MahjongPrefs.pace = 0.005; MahjongOpening.finish('test-skip'); });
      await page.waitForFunction(() => S.phase !== 'deal');
      for (let step = 0; step < 240; step++) {
        const done = await page.evaluate(() => {
          if (S.phase === 'end' || S.players.reduce((n, p) => n + p.discards.length, 0) >= 12) return true;
          const choice = document.querySelector('#cultivationChoice .cult-choice-option');
          if (choice) { choice.click(); return false; }
          for (const id of ['btnHu', 'btnPong', 'btnKong', 'btnPass']) {
            const button = document.getElementById(id);
            if (button && !button.disabled) { button.click(); return false; }
          }
          if (S.turn === 0 && !S.waitReact) document.querySelector('#yourHand button.tile:not(:disabled)')?.click();
          return false;
        });
        if (done) break;
        await page.waitForTimeout(20);
      }
      await page.evaluate(() => { cancelGameTimers(); MahjongEffects.clear(); MahjongTableLayout.refresh(); });
      await page.waitForTimeout(50);
      const live = await page.evaluate(() => {
        const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const hud = [...document.querySelectorAll('#cultivationMonster,.player-info-inline')].map(node => ({ id: node.id, box: node.getBoundingClientRect() }));
        const rivers = [...document.querySelectorAll('.table-discard-zone .tile')];
        return { phase: S.phase, seq: S.cultivation.seq, discards: S.players.reduce((n, p) => n + p.discards.length, 0),
          damage: S.cultivation.players.map(p => p.damage), hp: S.cultivation.players.map(p => p.hp),
          overlaps: rivers.flatMap(tile => hud.filter(item => overlap(tile.getBoundingClientRect(), item.box)).map(item => item.id)),
          width: innerWidth, height: innerHeight };
      });
      check(live.seq > 8 && live.discards > 4 && live.damage.some(damage => damage > 0), `${width}: real cultivation entry advances legal game and combat`);
      check(live.overlaps.length === 0, `${width}: real discard rivers do not overlap monster or player HUDs`);
      result.live.push(live);
      await page.screenshot({ path: path.join(output, `cultivation-live-${width}x${height}.png`) });
      await page.close();
    }
    check(result.errors.length === 0, 'no browser page errors');
    fs.writeFileSync(path.join(output, 'cultivation-ui.json'), JSON.stringify(result, null, 2));
    console.log(`${result.checks.length} cultivation UI checks passed across ${sizes.length} viewports.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
