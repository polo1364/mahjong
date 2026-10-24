/* Approved hero voices; IDs are presentation metadata, never saved gameplay state. */
(function (root) {
  'use strict';
  const all = [
    { id: 'shen-gufeng', name: '沈孤鋒', gender: '男', voice: 'Kevin Tu', voiceId: 'BrbEfHMQu0fyclQR7lfh' },
    { id: 'mu-canglan', name: '沐滄瀾', gender: '男', voice: 'Evan', voiceId: 'kbrsaic1zriFXx1pgRYN' },
    { id: 'yue-zhenshan', name: '岳鎮山', gender: '男', voice: 'Jerry Lin', voiceId: 'YBS7vt5CeZiqlZYGamwR' },
    { id: 'tie-wujiu', name: '鐵無咎', gender: '男', voice: 'Neil Chuang', voiceId: 'auoHciLZJwKTwYUoRTYz' },
    { id: 'yun-zhiwei', name: '雲知微', gender: '男', voice: 'Ian', voiceId: 'tSv4yoTPFFmCMaJpNf0A' },
    { id: 'chi-ling', name: '赤綾', gender: '女', voice: 'Hsin-Yi', voiceId: 'sZB4Q3GDBENMlfIYbV8M' },
    { id: 'su-lingheng', name: '蘇靈蘅', gender: '女', voice: 'Chloe', voiceId: 'cXGZGSG0udxZ0hTfyBnC' },
    { id: 'luo-xuanyu', name: '洛玄玉', gender: '女', voice: 'Ling', voiceId: 'Z8Aisvg1z70p27kGvkZZ' },
    { id: 'ye-shuying', name: '夜疏影', gender: '女', voice: 'Jane', voiceId: '0Aj540a9UWvQPWdx9Zq4' },
    { id: 'hua-jianlu', name: '花見鹿', gender: '女', voice: 'Yu-Ting', voiceId: 'W0geWfW9qmnEg7xuqNoN' }
  ].map(Object.freeze);
  const api = Object.freeze({ all: Object.freeze(all), get: id => all.find(voice => voice.id === id) || null });
  root.MahjongHeroVoices = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
