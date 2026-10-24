/* Journey V2 hero catalog. */
(function(root){ "use strict";
const all = [
  {
    "id": "shen-gufeng",
    "name": "沈孤鋒",
    "role": "劍修",
    "stats": {
      "damage": 104,
      "defense": 100,
      "healing": 98,
      "shield": 98
    },
    "passive": {
      "name": "劍意",
      "description": "第3、6、9…次自己的出牌，普攻基礎加10，每局最多5次。"
    },
    "image": "assets/cultivation-journey/heroes/shen-gufeng.png"
  },
  {
    "id": "chi-ling",
    "name": "赤綾",
    "role": "火修",
    "stats": {
      "damage": 105,
      "defense": 98,
      "healing": 98,
      "shield": 98
    },
    "passive": {
      "name": "燃心",
      "description": "每隻怪首次攻擊技能基礎加5%，整招最多25；每局重置。"
    },
    "image": "assets/cultivation-journey/heroes/chi-ling.png"
  },
  {
    "id": "mu-canglan",
    "name": "沐滄瀾",
    "role": "水修",
    "stats": {
      "damage": 102,
      "defense": 98,
      "healing": 102,
      "shield": 98
    },
    "passive": {
      "name": "回潮",
      "description": "成功吃後回復25，每局最多3次。"
    },
    "image": "assets/cultivation-journey/heroes/mu-canglan.png"
  },
  {
    "id": "su-lingheng",
    "name": "蘇靈蘅",
    "role": "醫修",
    "stats": {
      "damage": 96,
      "defense": 100,
      "healing": 108,
      "shield": 96
    },
    "passive": {
      "name": "返生靈息",
      "description": "有效治療的15%儲為下一普攻；儲存上限30，每局產生上限60。"
    },
    "image": "assets/cultivation-journey/heroes/su-lingheng.png"
  },
  {
    "id": "yue-zhenshan",
    "name": "岳鎮山",
    "role": "體修",
    "stats": {
      "damage": 98,
      "defense": 106,
      "healing": 96,
      "shield": 100
    },
    "passive": {
      "name": "鎮岳",
      "description": "自己是最高仇恨有效目標時，額外減少3%怪物傷害。"
    },
    "image": "assets/cultivation-journey/heroes/yue-zhenshan.png"
  },
  {
    "id": "luo-xuanyu",
    "name": "洛玄玉",
    "role": "盾修",
    "stats": {
      "damage": 96,
      "defense": 102,
      "healing": 98,
      "shield": 104
    },
    "passive": {
      "name": "凝玉",
      "description": "護盾實際吸收的15%儲為下一普攻；儲存上限30，每局產生上限60。"
    },
    "image": "assets/cultivation-journey/heroes/luo-xuanyu.png"
  },
  {
    "id": "tie-wujiu",
    "name": "鐵無咎",
    "role": "反擊",
    "stats": {
      "damage": 100,
      "defense": 104,
      "healing": 98,
      "shield": 98
    },
    "passive": {
      "name": "回鋒",
      "description": "兩次自己出牌之間首次受怪物攻擊後反擊15基礎，每局最多5次。"
    },
    "image": "assets/cultivation-journey/heroes/tie-wujiu.png"
  },
  {
    "id": "ye-shuying",
    "name": "夜疏影",
    "role": "隱修",
    "stats": {
      "damage": 102,
      "defense": 98,
      "healing": 100,
      "shield": 100
    },
    "passive": {
      "name": "斂影",
      "description": "新增仇恨乘92%；挑釁仍保證取得最高仇恨。"
    },
    "image": "assets/cultivation-journey/heroes/ye-shuying.png"
  },
  {
    "id": "yun-zhiwei",
    "name": "雲知微",
    "role": "術修",
    "stats": {
      "damage": 100,
      "defense": 100,
      "healing": 100,
      "shield": 100
    },
    "passive": {
      "name": "變訣",
      "description": "與上次不同種類的吃碰槓若有直接攻擊，整招基礎加10，每局最多6次。"
    },
    "image": "assets/cultivation-journey/heroes/yun-zhiwei.png"
  },
  {
    "id": "hua-jianlu",
    "name": "花見鹿",
    "role": "花修",
    "stats": {
      "damage": 100,
      "defense": 100,
      "healing": 100,
      "shield": 100
    },
    "passive": {
      "name": "靈華",
      "description": "每張新公開花回復15、護盾15，每局最多3次。"
    },
    "image": "assets/cultivation-journey/heroes/hua-jianlu.png"
  }
];
for (const hero of all) { Object.freeze(hero.stats); Object.freeze(hero.passive); Object.freeze(hero); }
const api = Object.freeze({all:Object.freeze(all),get:(id)=>all.find(hero=>hero.id===id)||null});
root.MahjongCultivationHeroes=api; if(typeof module!=="undefined" && module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
