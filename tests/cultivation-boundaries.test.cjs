const { test } = require("node:test");
const assert = require("node:assert/strict");
const { game } = require("./game-harness.cjs");

function setup() {
  const h = game(33, { cultivation: true });
  h.run(`
    function physicalFixture(spec) {
      fixture();S.pendingKong=null;S.robKong=false;S.cultivationAwaitingSelfDraw=false;
      S.turn=spec.turn||0;S.lastActor=S.turn;S.lastAction='draw';S.kongCount=0;S.anyOpenMeld=false;
      const pool=generateTiles();
      function take(text) {return (text||'').split(' ').filter(Boolean).map(key=>{const i=pool.findIndex(t=>tileKey(t)===key);if(i<0)throw Error('exhausted '+key);return pool.splice(i,1)[0]});}
      for(let pid=0;pid<4;pid++){
        S.players[pid].hand=take(spec.hands?.[pid]);
        S.players[pid].flowers=take(spec.flowers?.[pid]);
        S.players[pid].melds=(spec.melds?.[pid]||[]).map(m=>({...m,tiles:take(m.tiles)}));
        S.players[pid].passedHu=pid!==0;
      }
      const reserved=take(spec.replacements||'T9');
      for(let pid=0;pid<4;pid++){
        const wanted=(pid===S.turn?17:16)-S.players[pid].melds.length*3;
        while(S.players[pid].hand.length<wanted){const seen=new Set(S.players[pid].hand.map(tileKey));let i=pool.findIndex(t=>t.suit!==SUIT_H&&!seen.has(tileKey(t)));if(i<0)i=pool.findIndex(t=>t.suit!==SUIT_H);S.players[pid].hand.push(pool.splice(i,1)[0]);}
      }
      S.deadWall=[];
      while(S.deadWall.length<16-reserved.length){const i=pool.findIndex(t=>t.suit!==SUIT_H);S.deadWall.push(pool.splice(i,1)[0]);}
      S.deadWall.push(...reserved.reverse());S.wall=pool;S.remain=S.wall.length;
      S.players[S.turn].drawnTile=S.players[S.turn].hand.at(-1);
      S.cultivation=window.MahjongCultivationCombat.create(33);
      S.cultivation.monster.element='earth';S.cultivation.monster.shield=0;
      S.cultivation.monster.hp=S.cultivation.monster.maxHp=100000;
      Object.assign(S.cultivation.monster.nextAttack,{type:'single',charged:false,damage:160,ailment:null,cancelled:false,controlUsed:false,sealAilment:false});
      for(let pid=0;pid<4;pid++)for(const tile of S.players[pid].flowers)cultivationEvent({type:'flower',pid,key:tileKey(tile)});
    }
    function physicalIDs() {
      const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];
      if(S.lastDiscard&&!all.some(t=>t.id===S.lastDiscard.tile.id))all.push(S.lastDiscard.tile);
      return all.map(t=>t.id).sort((a,b)=>a-b);
    }
    function snapshot(){return {gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak};}
    function monsterDue(){S.cultivation.discardCount=4;S.cultivation.enemyDue=S.cultivation.monster.id;}
  `);
  h.timers.clear();
  return h;
}
function conserved(run) {
  assert.equal(run("physicalIDs().length"), 144);
  assert.equal(run("new Set(physicalIDs()).size"), 144);
  assert.equal(run("physicalIDs().every((id,i)=>id===i)"), true);
}

test("legal exposed kong skill consumes three held tiles and replacement without adding a discard tick", () => {
  const { run } = setup();
  run(
    `physicalFixture({turn:3,hands:{0:'W1 W1 W1 W3 W5 W7 W9 T2 T4 T6 T8 B1 B3 B5 B7 DB',3:'W1'},replacements:'T9'});S.cultivation.discardCount=2;discard(3,S.players[3].hand.find(t=>tileKey(t)==='W1'));`,
  );
  conserved(run);
  assert.equal(run("canKong(0,S.lastDiscard.tile)"), true);
  assert.equal(run("S.cultivation.discardCount"), 3);
  run("doKong(0,S.lastDiscard.tile)");
  conserved(run);
  assert.equal(run("S.players[0].melds[0].type"), "kong");
  assert.equal(run("S.players[0].melds[0].tiles.length"), 4);
  assert.equal(run("S.cultivation.discardCount"), 3);
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='W.exposed.1111').length"),
    1,
  );
  assert.equal(run("S.cultivation.log.filter(e=>e.type==='enemy').length"), 0);
});

test("legal added kong casts the advanced skill once and keeps the ordinary discard clock", () => {
  const { run } = setup();
  run(
    `physicalFixture({turn:0,hands:{0:'W1 T1 T2 T3 T4 T5 T6 B1 B2 B3 B4 B5 B6 DC'},melds:{0:[{type:'pong',tiles:'W1 W1 W1'}]},replacements:'T9'});S.cultivation.discardCount=2;`,
  );
  conserved(run);
  assert.equal(run("canAddedKong(0).length"), 1);
  run("offerAddedKong(0,0)");
  conserved(run);
  assert.equal(run("S.players[0].melds[0].added"), true);
  assert.equal(run("S.cultivation.discardCount"), 2);
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='W.added.1111').length"),
    1,
  );
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='W.pong.111').length"),
    0,
  );
});

test("fourth discard chow resolves before due monster and conserves the full physical deck", () => {
  const { run } = setup();
  run(
    `physicalFixture({turn:2,hands:{0:'W1 W2 W5 W7 W9 T2 T4 T6 T8 B1 B3 B5 B7 FE FN DB',2:'W3'}});S.cultivation.discardCount=3;discard(2,S.players[2].hand.find(t=>tileKey(t)==='W3'));`,
  );
  assert.equal(
    run('canChow(0,S.lastDiscard.tile).some(p=>p.join()==="1,2,3")'),
    true,
  );
  assert.equal(run("S.cultivation.log.some(e=>e.type==='enemy')"), false);
  conserved(run);
  run("doChow(0,S.lastDiscard.tile,[1,2,3])");
  conserved(run);
  assert.equal(
    run(
      "{const e=S.cultivation.log;e.findIndex(x=>x.skillId==='W.chow.123')<e.findIndex(x=>x.type==='enemy')}",
    ),
    true,
  );
  assert.equal(run("S.cultivation.log.filter(e=>e.type==='enemy').length"), 1);
});

test("exposed kong chained flowers end in eight-flower Hu before due monster; claimed tile exists only once", () => {
  const { run } = setup();
  run(
    `physicalFixture({turn:3,hands:{0:'W1 W1 W1 W3 W5 W7 W9 T2 T4 T6 T8 B1 B3 B5 B7 DB',3:'W1'},flowers:{0:'H1 H2 H3 H4 H5 H6'},replacements:'H7 H8'});S.cultivation.discardCount=3;discard(3,S.players[3].hand.find(t=>tileKey(t)==='W1'));doKong(0,S.lastDiscard.tile);`,
  );
  conserved(run);
  assert.equal(run("S.phase"), "end");
  assert.equal(run("S.flowerWin.kind"), "八仙過海");
  assert.equal(run("S.lastDiscard"), null);
  assert.equal(run("S.players[0].melds[0].tiles.length"), 4);
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='H7.flower').length"),
    1,
  );
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='H8.flower').length"),
    1,
  );
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='formation.eight').length"),
    1,
  );
  assert.equal(run("S.cultivation.log.some(e=>e.type==='enemy')"), false);
  run("let saved=snapshot();restoreGame(saved,'cultivation')");
  conserved(run);
});

test("restoring fourth-discard pending chow reproduces combat exactly without replaying its basic attack", () => {
  const { run, timers } = setup();
  run(
    `physicalFixture({turn:2,hands:{0:'W1 W2 W5 W7 W9 T2 T4 T6 T8 B1 B3 B5 B7 FE FN DB',2:'W3'}});S.cultivation.discardCount=3;discard(2,S.players[2].hand.find(t=>tileKey(t)==='W3'));let saved=snapshot();let pendingCombat=JSON.stringify(S.cultivation);doChow(0,S.lastDiscard.tile,[1,2,3]);let expected=JSON.stringify(S.cultivation);restoreGame(saved,'cultivation');`,
  );
  timers.clear();
  conserved(run);
  assert.equal(run("JSON.stringify(S.cultivation)===pendingCombat"), true);
  assert.equal(run("S.cultivation.enemyDue===S.cultivation.monster.id"), true);
  run("doChow(0,S.lastDiscard.tile,[1,2,3])");
  conserved(run);
  assert.equal(run("JSON.stringify(S.cultivation)===expected"), true);
  assert.equal(
    run("S.cultivation.log.filter(e=>e.skillId==='basic').length"),
    1,
  );
  assert.equal(run("S.cultivation.log.filter(e=>e.type==='enemy').length"), 1);
});

for (const acceptHu of [true, false])
  test(
    "pending rob-kong save restores " +
      (acceptHu
        ? "Hu without added-kong damage"
        : "pass then added-kong skill exactly once"),
    () => {
      const { run, timers } = setup();
      run(
        `physicalFixture({turn:1,hands:{0:'W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC DC',1:'W1 T4 T5 T6 T7 T8 T9 B4 B5 B6 B7 B8 B9 DB'},melds:{1:[{type:'pong',tiles:'W1 W1 W1'}]},replacements:'W9'});monsterDue();offerAddedKong(1,0);let saved=snapshot();let before=JSON.stringify(S.cultivation);`,
      );
      conserved(run);
      assert.equal(run("S.pendingKong.pid"), 1);
      assert.equal(run("S.waitReact.length"), 1);
      assert.equal(run("S.waitReact[0].pid"), 0);
      const action = acceptHu ? "handleHuClick()" : "handlePassClick()";
      run(
        `${action};let expected=JSON.stringify(S.cultivation);restoreGame(saved,'cultivation')`,
      );
      timers.clear();
      assert.equal(run("JSON.stringify(S.cultivation)===before"), true);
      conserved(run);
      assert.equal(run("S.pendingKong.pid"), 1);
      run(action);
      conserved(run);
      assert.equal(run("JSON.stringify(S.cultivation)===expected"), true);
      assert.equal(
        run("S.cultivation.log.filter(e=>e.skillId==='W.added.1111').length"),
        acceptHu ? 0 : 1,
      );
      assert.equal(
        run("S.cultivation.log.filter(e=>e.type==='enemy').length"),
        acceptHu ? 0 : 1,
      );
      assert.equal(
        run("S.players[1].melds[0].type"),
        acceptHu ? "pong" : "kong",
      );
    },
  );
