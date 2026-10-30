/* Cultivation wording at presentation boundaries; scoring records and IDs stay unchanged. */
(function (root) {
  'use strict';
  const words = {
    '四君子花槓': '君子誅邪', '四季花槓': '四時輪轉', '門清自摸': '無漏真仙',
    '槓上開花': '破關綻靈', '碰碰胡': '五嶽鎮魔', '對對胡': '五嶽鎮魔',
    '平胡': '流雲歸一', '天胡': '太初開天', '地胡': '地脈升仙', '人胡': '紅塵證道',
    '胡牌台型': '決勝法式', '花胡': '靈華決勝', '搶槓': '截陣', '搶胡': '截陣', '副露': '已施法印',
    '明槓': '開陣', '暗槓': '藏陣', '加槓': '續陣', '補槓': '續陣', '開槓': '開陣',
    '自摸': '天成', '點胡': '決勝', '胡牌': '決勝', '胡了': '決勝',
    '吃牌': '引氣', '碰牌': '聚靈', '槓牌': '開陣', '吃了': '引氣', '碰了': '聚靈', '槓了': '開陣',
    '天聽': '先天洞玄', '地聽': '地脈知微', '獨聽': '一線問道', '聽牌': '凝神', '報聽': '凝神',
    '吃': '引氣', '碰': '聚靈', '槓': '開陣', '杠': '開陣', '胡': '決勝'
  };
  const pattern = new RegExp(Object.keys(words).sort((a, b) => b.length - a.length).join('|'), 'g');
  const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function format(value, names = []) {
    const saved = [];
    let text = String(value ?? '');
    const protectedNames = [...new Set(names.filter(name => typeof name === 'string' && name))].sort((a, b) => b.length - a.length);
    if (protectedNames.length) {
      // A short name such as 胡 must not mask the start of the rule term 胡牌.
      const mention = new RegExp(`(^|[^\\p{L}\\p{N}]|查看|輪到|由)(${protectedNames.map(escaped).join('|')})(?=$|[^\\p{L}\\p{N}]|的|施放|造成|恢復|受到|擊敗|使用|自摸|點胡|搶槓|胡牌)`, 'gu');
      text = text.replace(mention, (_, prefix, name) => `${prefix}\u0000${saved.push(name) - 1}\u0000`);
    }
    return text.replace(pattern, word => words[word]).replace(/\u0000(\d+)\u0000/g, (_, index) => saved[Number(index)]);
  }
  function names(state) {
    if (state?.cultivation?.version >= 2)
      return state.cultivation.players.map(player => root.MahjongCultivationHeroes?.get(player.heroId)?.name).filter(Boolean);
    return [...(state?.names || []), ...(state?.players || []).map(player => player.name)].filter(Boolean);
  }
  const originals = new WeakMap();
  const identity = '.log-actor,.seat-name,.score-name,.rs-name,[data-cultivation-preserve],[contenteditable="true"]';
  const actionLabel = '#controls,.rs-tag,.log-badge,option';
  const attributes = ['aria-label', 'aria-description', 'title', 'placeholder', 'alt'];
  function render(element, active, options = {}) {
    if (!element) return;
    function update(node, key, current, write, protectedNames) {
      let entries = originals.get(node);
      const previous = entries?.get(key);
      const original = previous && current === previous.translated ? previous.original : current;
      // Keep the actual table controls recognizable in both modes, including screen-reader labels.
      const control = (node.nodeType === 3 ? node.parentElement : node)?.closest('#controls');
      const translated = active && !control ? format(original, protectedNames) : original;
      if (translated !== current) write(translated);
      if (active && translated !== original) {
        if (!entries) { entries = new Map(); originals.set(node, entries); }
        entries.set(key, { original, translated });
      } else entries?.delete(key);
    }
    function visit(node) {
      if (node.nodeType === 3) {
        const protectedNames = node.parentElement?.closest(actionLabel) ? [] : options.names || [];
        update(node, 'text', node.nodeValue, value => { node.nodeValue = value; }, protectedNames);
        return;
      }
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|SVG|TEXTAREA)$/.test(node.tagName) || node.matches(identity)) return;
      for (const attribute of attributes) {
        if (node.hasAttribute(attribute)) update(node, attribute, node.getAttribute(attribute), value => node.setAttribute(attribute, value), node.closest(actionLabel) ? [] : options.names || []);
      }
      // User-entered values and all data attributes remain untouched.
      if (node.tagName !== 'INPUT') [...node.childNodes].forEach(visit);
    }
    visit(element);
  }
  const api = Object.freeze({ format, names, render });
  root.MahjongCultivationTerms = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
