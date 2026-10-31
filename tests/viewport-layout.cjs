const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const out = path.join(__dirname, '../artifacts');
const sizes = [[1366,768],[1440,900],[1920,945],[1920,1080],[1024,600],[1024,700],[1024,768],[800,480],[844,390],[740,360],[568,320]];
const report = { checks: 0, errors: [], viewports: [] };
const check = (value, description) => { assert.ok(value, description); report.checks++; };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href);
    await require('./start-screen-helper.cjs').enterGame(page);
    await page.waitForFunction(() => typeof S !== 'undefined' && S && window.MahjongTableLayout);
    await page.evaluate(() => {
      cancelGameTimers();
      window.viewportFixture = () => {
        cancelGameTimers();
        window.MahjongOpening?.cancel('layout-fixture');
        hideReactionPanel();
        const tiles = generateTiles().filter(tile => tile.suit !== 'H');
        S.players.forEach(player => {
          Object.assign(player, {
            hand: tiles.splice(0, 17), melds: [], flowers: [], discards: [], declaredListen: false,
            tingLocked: false, passedHu: false, discardBan: [], drawnTile: null
          });
        });
        Object.assign(S, { phase: 'play', turn: 0, waitReact: null, currentReactions: null, lastDiscard: null, lastPlayed: null });
        renderAll();
        cancelGameTimers();
        // A display fixture stresses public areas without altering rules or production rendering.
        const example = document.querySelector('#yourHand .tile').cloneNode(true);
        example.removeAttribute('onclick'); example.removeAttribute('disabled');
        for (let pid = 0; pid < 4; pid++) {
          const discards = document.getElementById(`discardArea${pid}`);
          discards.replaceChildren();
          for (let n = 0; n < 24; n++) {
            const tile = document.createElement('div');
            tile.className = 'tile mini';
            tile.innerHTML = example.innerHTML;
            tile.setAttribute('aria-label', `測試棄牌 ${n + 1}`);
            discards.append(tile);
          }
          const melds = document.getElementById(`meldArea${pid}`);
          melds.replaceChildren();
          const flowers = document.createElement('div');
          flowers.className = 'flower-row';
          for (let n=0;n<8;n++) flowers.append(discards.firstElementChild.cloneNode(true));
          melds.append(flowers);
          for (let group=0;group<5;group++) {
            const meld = document.createElement('div');
            meld.className = 'meld-group';
            for(let n=0;n<4;n++) meld.append(discards.firstElementChild.cloneNode(true));
            melds.append(meld);
          }
        }
        const logArea = document.getElementById('log');
        logArea.replaceChildren();
        for (let n = 1; n <= 65; n++) {
          const row = document.createElement('div');
          row.textContent = `測試紀錄 ${n}：竹軒打出一萬，等待其他玩家回應。`;
          logArea.append(row);
        }
        MahjongTableLayout.showTool('table');
        MahjongTableLayout.refresh();
      };
    });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(0, 0);
      await page.evaluate(() => viewportFixture());
      await page.waitForTimeout(180);
      const desktop = width > 1000;
      const sideways = width > height && height <= 500;
      const geometry = await page.evaluate(() => {
        const rect = el => {
          const b = el.getBoundingClientRect();
          return { left:b.left, top:b.top, right:b.right, bottom:b.bottom, width:b.width, height:b.height, x:b.x+b.width/2, y:b.y+b.height/2 };
        };
        const own = [...document.querySelectorAll('#yourHand button.tile')].map(rect);
        const center = rect(document.querySelector('.center-area'));
        const zones = [0,1,2,3].map(pid => rect(document.querySelector(`.table-discard-zone-${pid}`)));
        return {
          page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          own, center, zones,
          table: rect(document.getElementById('playersGrid')),
          frame: rect(document.querySelector('.table-frame')),
          controls: [...document.querySelectorAll('#controls button')].map(rect),
          opponents: [1,2,3].map(pid => [...document.querySelectorAll(`#handBack${pid} .tile-back`)].map(rect)),
          handScroll: getComputedStyle(document.getElementById('yourHandArea')).scrollbarWidth,
          overflowing: [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && getComputedStyle(el).position !== 'fixed')
            .map(el => ({ id:el.id, cls:el.className, ...rect(el) })).filter(b => b.bottom > innerHeight + 1 && b.width > 0).slice(0,10)
        };
      });
      check(geometry.page[0] <= width, `${width}: no horizontal page scroll`);
      check(geometry.page[1] <= height, `${width}x${height}: no vertical page scroll (${JSON.stringify(geometry.overflowing)})`);
      check(geometry.frame.left >= 0 && geometry.frame.right <= width && geometry.frame.top >= 0 && geometry.frame.bottom <= height,
        `${width}: complete table fits the viewport`);
      check(geometry.own.length === 17, `${width}: all 17 own tiles`);
      check(new Set(geometry.own.map(b => Math.round(b.top))).size === 1, `${width}: own hand stays on one row`);
      check(geometry.own.every(b => Math.abs(b.width / b.height - 5/7) < .01), `${width}: own 5:7 ratio`);
      check(geometry.handScroll === 'none', `${width}: own hand has no visible scrollbar`);
      check(geometry.controls.every(b => b.left >= 0 && b.right <= width && b.top >= 0 && b.bottom <= height), `${width}: all game buttons within viewport`);
      const coveredText = await page.locator('.player-info-inline .seat-name,.player-info-inline .seat-points').evaluateAll(labels => {
        const covered = [];
        for (const label of labels) {
          if (!label.getClientRects().length) continue;
          const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
          for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
            for (let offset = 0; offset < textNode.length; offset++) {
              if (!textNode.textContent[offset].trim()) continue;
              const range = document.createRange();
              range.setStart(textNode, offset); range.setEnd(textNode, offset + 1);
              const b = range.getBoundingClientRect();
              if (!b.width || !b.height) continue;
              const hit = document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
              if (!label.contains(hit)) covered.push({label:label.textContent, character:textNode.textContent[offset], coveredBy:hit?.getAttribute('class')});
            }
          }
        }
        return covered;
      });
      check(coveredText.length === 0, `${width}x${height}: player names and scores are unobscured (${JSON.stringify(coveredText)})`);
      const coveredMelds = await page.locator('.meld-area .tile').evaluateAll(tiles => {
        const obstacles = [...document.querySelectorAll('.table-discard-zone .tile,.player-info-inline,.public-summary')]
          .map(el => ({el, box:el.getBoundingClientRect()})).filter(({box}) => box.width && box.height);
        return tiles.flatMap(tile => {
          const b = tile.getBoundingClientRect();
          if (!b.width || !b.height) return [];
          return obstacles.filter(({box}) =>
            Math.min(b.right,box.right)-Math.max(b.left,box.left) > 1 &&
            Math.min(b.bottom,box.bottom)-Math.max(b.top,box.top) > 1
          ).map(({el}) => ({area:tile.closest('.meld-area').id, coveredBy:el.id || el.getAttribute('class')}));
        });
      });
      check(coveredMelds.length === 0, `${width}x${height}: visible meld and flower tiles are unobscured (${JSON.stringify(coveredMelds)})`);
      check(await page.locator('#controls button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden').every(button => {
        const b = button.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x+b.width/2, b.y+b.height/2);
        return hit === button || button.contains(hit);
      })), `${width}: game buttons are not covered by the table or hands`);
      for (let pid = 1; pid <= 3; pid++) {
        const backs = await page.locator(`#handBack${pid} .tile-back`).evaluateAll(els => els.map(el => {
          const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
          return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width,height:r.height,
            inRail:r.left >= p.left-1 && r.right <= p.right+1 && r.top >= p.top-1 && r.bottom <= p.bottom+1 };
        }));
        check(backs.length === 17, `${width}: opponent ${pid} all 17 backs retained`);
        check(backs.every(b => b.inRail && b.left >= 0 && b.right <= width && b.top >= 0 && b.bottom <= height), `${width}: opponent ${pid} all 17 backs fit visible rail`);
        const coveredBacks = await page.locator(`#handBack${pid} .tile-back`).evaluateAll((els, horizontal) => els.flatMap((el, index) => {
          const b=el.getBoundingClientRect();
          const hit=document.elementFromPoint(horizontal ? b.left+1.5 : b.left+b.width/2, horizontal ? b.top+b.height/2 : b.top+1.5);
          return hit === el || el.contains(hit) || hit?.contains(el) || hit?.classList.contains('hand-meld-container') ? [] : [{index, id:hit?.id, className:hit?.getAttribute('class')}];
        }), pid === 1);
        check(coveredBacks.length === 0, `${width}: every opponent ${pid} back has an unobstructed visible edge (${JSON.stringify(coveredBacks)})`);
        if (pid !== 1) {
          check(backs.every(b => Math.abs(b.left - backs[0].left) < 1), `${width}: opponent ${pid} stays in one vertical row`);
          check(backs.every((b, index) => index === 0 || b.top > backs[index - 1].top),
            `${width}: opponent ${pid} runs vertically along its table edge`);
        }
      }
      await page.screenshot({ path:path.join(out, `viewport-table-${width}x${height}.png`) });
      // Menus, dialogs and the wide table's geometry are covered by table-menu.cjs and wide-table.cjs.
      report.viewports.push({ width,height, geometry });
      console.log(`PASS ${width}x${height}: viewport fit, hands, seats and controls`);
    }
    check(report.errors.length === 0, 'no browser errors');
    report.passed = true;
    fs.writeFileSync(path.join(out,'viewport-layout.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({ passed:true,checks:report.checks,viewports:sizes.length,errors:report.errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
