const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(process.env.MAHJONG_SOURCE || path.join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function game(seed = 1, { cultivation = false, heroId = null, equipment = false, scriptOverrides = {} } = {}) {
  const nodes = new Map();
  const makeNode = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, remove() {}, focus() {}, click() { this.onclick?.(); }, querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', options: [] });
  const timers = new Map();
  let id = 0;
  const context = vm.createContext({ console, structuredClone, setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key), setInterval() {},
    document: { getElementById: key => { if (!nodes.has(key)) nodes.set(key, makeNode()); return nodes.get(key); }, createElement: makeNode, head: makeNode(), body: makeNode(), addEventListener() {}, querySelectorAll: () => [] },
    window: { addEventListener() {}, AudioContext: function() {} }, confirm: () => true });
  vm.runInContext(`let seed=${seed}; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};`, context);
  if (html.includes('src="tile-names.js"')) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../tile-names.js'), 'utf8'), context);
  }
  if (html.includes('src="crystal-tiles.js"')) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../crystal-tiles.js'), 'utf8'), context);
  }
  for (const file of ['cultivation-skills.js', 'cultivation-finishers.js', 'cultivation-heroes.js', 'cultivation-monster-skills.js', 'cultivation-monsters.js', 'cultivation-progression.js', 'cultivation-expedition.js', 'cultivation-equipment.js', 'cultivation-items.js', 'cultivation-economy.js', 'cultivation-combat.js']) {
    if (html.includes(`src="${file}"`) || html.includes(`src="${file}?`)) vm.runInContext(Object.hasOwn(scriptOverrides, file) ? scriptOverrides[file] : fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  const logMessage = run('log');
  // Legacy fixtures still begin as V1. Only explicit new-journey actions pick a V2 hero.
  run(`window.MahjongCultivationJourneyUI = { chooseHero(done) { done('shen-gufeng'); }, close() {}, showPreparation() {} };`);
  if (cultivation) run(`window.crypto = { getRandomValues(values) { values[0] = ${seed}; return values; } };`);
  run(`renderAll = () => {}; log = () => {}; playSound = () => {}; showEffect = () => {}; clearAutoSave = async () => {}; autoSaveGame = async () => {}; gameMode = '${cultivation ? 'cultivation' : 'normal'}'; startNewHand(true, null, ${JSON.stringify(heroId ? { heroId, equipment } : {})});`);
  timers.clear();
  run(`S.turn = 0; S.dealer = 0; S.drawCount = 12;
    function tiles(keys) { const pool = generateTiles(); return keys.split(' ').map(k => { const index = pool.findIndex(t => tileKey(t) === k); return pool.splice(index, 1)[0]; }); }
    function fixture() { S.players.forEach(p => { Object.assign(p, {hand:[], melds:[], flowers:[], discards:[], waitKeys:[], declaredListen:false, tingLocked:false, tianTing:false, diTing:false, draws:3, rinshan:false, passedHu:false, passedPong:[], lastDiscardKey:null, discardBan:[], drawnTile:null}); }); S.phase = 'play'; S.flowerWin=null; S.lastAction='draw'; S.lastActor=0; S.lastDiscard = null; S.waitReact = null; S.currentReactions = null; }
  `);
  return { run, timers, nodes, logMessage };
}


module.exports = { game, source };
