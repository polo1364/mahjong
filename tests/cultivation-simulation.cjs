/* Fixed-seed combat balance probe. This does not simulate legal Mahjong draws. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
let Combat = require("../cultivation-combat.js");
const Skills = require("../cultivation-skills.js");
const baseline = process.argv.includes("--baseline");
if (baseline) {
  // Compare only the numeric counter adjustment, using exactly the same engine.
  const catalog = JSON.parse(JSON.stringify(Skills.all));
  for (const skill of catalog)
    for (const effect of skill.effects) {
      if (
        effect.op === "buff" &&
        [
          "counter",
          "shieldCounter",
          "shieldBreakDamage",
          "guardCounter",
        ].includes(effect.kind) &&
        effect.amount > 0
      )
        effect.amount = Math.round(effect.amount / 1.3);
      if (skill.id === "B.concealed.3333" && effect.kind === "guardCounter")
        effect.scale.ratio = 1;
    }
  const get = (id) => catalog.find((skill) => skill.id === id) || null;
  const baselineSkills = {
    get,
    find(action, keys) {
      const skill = Skills.find(action, keys);
      return skill ? get(skill.id) : null;
    },
  };
  const moduleObject = { exports: {} };
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cultivation-combat.js"),
    "utf8",
  );
  new Function("module", "require", source)(moduleObject, file => file === './cultivation-skills.js' ? baselineSkills : require('../cultivation-finishers.js'));
  Combat = moduleObject.exports;
}
const styles = [
  {
    id: "burst",
    label: "爆發",
    skills: [
      "W.chow.789",
      "W.chow.234",
      "B.pong.999",
      "W.pong.999",
      "W.exposed.7777",
      "B.concealed.1111",
      "W.added.9999",
    ],
  },
  {
    id: "sustain",
    label: "續航",
    skills: [
      "W.chow.123",
      "W.chow.456",
      "T.pong.222",
      "DF.pong",
      "W.exposed.4444",
      "T.concealed.2222",
      "DF.added",
    ],
  },
  {
    id: "counter",
    label: "護盾反擊",
    skills: [
      "W.chow.567",
      "B.chow.345",
      "W.pong.777",
      "B.pong.333",
      "B.exposed.7777",
      "B.concealed.3333",
      "W.added.7777",
    ],
  },
  {
    id: "stealth",
    label: "低仇恨",
    skills: [
      "W.chow.678",
      "B.chow.678",
      "W.pong.666",
      "T.pong.444",
      "T.exposed.4444",
      "B.concealed.1111",
      "W.added.6666",
    ],
  },
];
function eventFor(id, pid) {
  const s = Skills.get(id);
  if (s.family === "honor")
    return { type: "meld", pid, action: s.action, key: s.combo };
  return {
    type: "meld",
    pid,
    action: s.action,
    keys: [...s.combo].map((n) => s.family + n),
  };
}
function run(seed) {
  let state = Combat.create(seed);
  let rng = seed >>> 0;
  const next = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const bySeat = Array.from(
    { length: 4 },
    (_, seat) => styles[(seat + seed) % 4],
  );
  const counts = [0, 0, 0, 0];
  const dispatch = (event) => {
    state = Combat.apply(state, { id: state.seq + 1, ...event }).state;
  };
  const huPid = Math.floor(next() * 4);
  const limit = 64 + Math.floor(next() * 24);
  for (let turn = 0; turn < limit && !state.ended; turn++) {
    const pid = turn % 4;
    const style = bySeat[pid];
    const ownTurn = counts[pid]++;
    dispatch({
      type: "discard",
      pid,
      key:
        ["W", "T", "B"][Math.floor(next() * 3)] + (1 + Math.floor(next() * 9)),
    });
    // Each style receives the same meld count and action tiers; actual tile odds are outside this probe.
    if (ownTurn % 3 === 1) {
      const skillIndex = Math.min(6, Math.floor(ownTurn / 3));
      dispatch(eventFor(style.skills[skillIndex], pid));
    }
    if (state.enemyDue && !state.ended)
      dispatch({ type: "enemy", monsterId: state.monster.id });
  }
  if (!state.ended)
    dispatch({ type: "finish", pid: huPid, fan: 2 + (seed % 6), reason: "hu" });
  const winners = state.result.ranking
    .filter((row) => row.rank === 1)
    .map((row) => row.pid);
  return {
    seed,
    reason: state.result.reason,
    huPid,
    huWon: state.result.reason === "hu" && winners.includes(huPid),
    monsterKills: state.kills.length,
    players: state.players.map((p, pid) => ({
      pid,
      style: bySeat[pid].id,
      damage: p.damage,
      weakCount: p.weakCount,
      kills: state.kills.filter((k) => k.pid === pid).length,
      won: winners.includes(pid),
    })),
  };
}
const runs = Array.from({ length: 120 }, (_, index) => run(1001 + index));
assert.deepEqual(run(1001), runs[0], "seed replay differs");
assert.ok(
  runs.every((r) =>
    r.players.every((p) => Number.isFinite(p.damage) && p.damage >= 0),
  ),
);
const summary = styles.map((style) => {
  const players = runs.flatMap((r) =>
    r.players.filter((p) => p.style === style.id),
  );
  const total = (key) => players.reduce((n, p) => n + p[key], 0);
  return {
    style: style.id,
    label: style.label,
    samples: players.length,
    meanDamage: Math.round(total("damage") / players.length),
    meanWeakCount: +(total("weakCount") / players.length).toFixed(2),
    meanKills: +(total("kills") / players.length).toFixed(2),
    wins: players.filter((p) => p.won).length,
  };
});
const huRuns = runs.filter((r) => r.reason === "hu");
const report = {
  schema: 1,
  tuning: baseline
    ? "before counter +30%, guard-reflect 1.2"
    : "counter +30%, guard-reflect 1.2 (cap unchanged)",
  seedRange: [1001, 1120],
  runCount: runs.length,
  method:
    "Isolated combat probe with equal meld action tiers and counts; not Mahjong draw probabilities or real-game win-rate validation.",
  summary,
  huWinnerCount: huRuns.filter((r) => r.huWon).length,
  huFinishedCount: huRuns.length,
  huWinRate: huRuns.length
    ? +(huRuns.filter((r) => r.huWon).length / huRuns.length).toFixed(3)
    : 0,
  defeats: runs.filter((r) => r.reason === "defeat").length,
  meanMonsterKills: +(
    runs.reduce((n, r) => n + r.monsterKills, 0) / runs.length
  ).toFixed(2),
  runs,
};
const directory = path.join(__dirname, "..", "artifacts");
const filename = baseline
  ? "cultivation-simulation-before-tuning"
  : "cultivation-simulation";
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(
  path.join(directory, filename + ".json"),
  JSON.stringify(report, null, 2) + "\n",
);
const rows = summary
  .map(
    (r) =>
      `| ${r.label} | ${r.meanDamage} | ${r.meanWeakCount} | ${r.meanKills} | ${r.wins}/${r.samples} |`,
  )
  .join("\n");
fs.writeFileSync(
  path.join(directory, filename + ".md"),
  `# 修仙戰鬥固定種子模擬\n\n120 場，種子 1001–1120；四種打法輪替座位，給予相同組牌次數與操作層級。此為隔離戰鬥模擬，不模擬合法抽牌機率，不代表正式麻將勝率。\n\n| 打法 | 平均傷害 | 平均虛弱次數 | 平均擊殺 | 傷害第一 |\n|---|---:|---:|---:|---:|\n${rows}\n\n胡牌者傷害第一：${report.huWinnerCount}/${report.huFinishedCount}；全員虛弱：${report.defeats} 場；平均擊殺 ${report.meanMonsterKills} 隻。\n\n此版本數值為測試起點。各打法的傷害、生存與排名差異請見上表；不能由這份隔離模擬斷言完整牌局已平衡。後續須結合實際可取得牌組與玩家遊玩資料再調整。\n`,
);
console.log(JSON.stringify({ ...report, runs: undefined }, null, 2));
