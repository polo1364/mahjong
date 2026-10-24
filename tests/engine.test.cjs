const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, source } = require('./game-harness.cjs');

test('deck contains 144 unique physical tiles and four of each normal face and eight unique flowers', () => {
  const { run } = game();
  assert.equal(run('new Set(generateTiles().map(t => t.id)).size'), 144);
  assert.equal(run(`Object.entries(countByKey(generateTiles())).every(([k,n]) => n === (k.startsWith('H')?1:4))`), true);
});
test('deal preserves all tiles and gives only dealer 17 tiles', () => {
  const { run } = game();
  assert.equal(run('S.players.reduce((n,p) => n+p.hand.length+p.flowers.length,0)+S.wall.length+S.deadWall.length'), 144);
  assert.equal(run('S.players.filter(p => p.hand.length===17).length'), 1);
});
test('standard five sets and pair win; incomplete hand does not', () => {
  const { run } = game();
  assert.equal(run(`isWinningNow(tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC DC'), [], null)`), true);
  assert.equal(run(`isWinningNow(tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC'), [], null)`), false);
});
test('discard win scoring completes without ReferenceError', () => {
  const { run } = game();
  assert.doesNotThrow(() => run(`fixture(); S.players[1].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC'); S.fromPlayer=0; calcFanDetails(1, tiles('DC')[0], false);`));
});
test('self draw does not count winning tile twice', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 W2 W2 W2 T3 T3 T3 B4 B4 B4 FE FE FE DC DC'); calcFanDetails(0,S.players[0].hand.at(-1),true).categories.includes('對對胡')`), true);
});
test('claimed pending tile never removes an earlier discard', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[1].discards=tiles('W9'); S.lastDiscard={from:1,tile:tiles('DC')[0]}; removeDiscardFromArea(1); S.players[1].discards.length`), 1);
});
test('passing preserves other players win reactions', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.lastDiscard={from:2,tile:tiles('DC')[0]}; S.waitReact=[{pid:0,type:'pong',tile:S.lastDiscard.tile},{pid:1,type:'hu',tile:S.lastDiscard.tile}]; S.currentReactions=[S.waitReact[0]]; let passedToAI=false; handleAIReaction = rs => { passedToAI=rs.some(r=>r.pid===1 && r.type==='hu'); }; stepNext=()=>{}; handlePassClick(); passedToAI`), true);
});
test('resolved reaction clears stale action state', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.currentReactions=[{type:'pong'}]; S.waitReact=null; hideReactionPanel(); S.currentReactions===null`), true);
});
test('old hand timers cannot execute after a new hand', () => {
  const { run, timers } = game();
  run(`let stale=false; ${source.includes('function scheduleGame(') ? 'scheduleGame' : 'setTimeout'}(() => { stale=true; }, 10); startNewHand(true);`);
  for (const fn of [...timers.values()]) fn();
  assert.equal(run('stale'), false);
});
test('settings reject invalid amounts without changing rules', () => {
  const { run, nodes } = game();
  run(`document.getElementById('baseScorePreset').value='custom'; document.getElementById('baseScoreCustom').value=''; document.getElementById('perFanPreset').value='1000'; document.getElementById('initialPointsPreset').value='100000'; document.getElementById('settingsConfirm').onclick();`);
  assert.equal(run('RULES.points.base'), 2000);
});
test('settings confirm starts exactly one hand', () => {
  const { run } = game();
  assert.equal(run(`let starts=0; startNewHand=()=>starts++; document.getElementById('baseScorePreset').value='2000'; document.getElementById('perFanPreset').value='1000'; document.getElementById('initialPointsPreset').value='100000'; document.getElementById('settingsConfirm').onclick(); starts`), 1);
});
test('no concealed kong without a replacement', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 W1'); S.wall=[]; canConcealedKong(0).length`), 0);
});
test('no open kong after final drawable tile', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1'); S.wall=[]; canKong(0,tiles('W1')[0])`), false);
});
test('waiting list excludes an impossible fifth copy', () => {
  const { run } = game();
  assert.equal(run(`fixture(); calcWaitingTiles(tiles('W1 W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE'),[]).includes('W1')`), false);
});

test('restore reconnects drawn tile identity and resumes AI', () => {
  const { run, timers } = game();
  run(`S.turn=1; S.players[0].drawnTile=S.players[0].hand[0]; let data={gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak}; restoreGame(data);`);
  assert.equal(run('S.players[0].drawnTile === S.players[0].hand[0]'), true);
  assert.ok(timers.size > 0);
});
test('restore rejects malformed state before replacing current hand', () => {
  const { run } = game();
  assert.equal(run(`let old=S; try { restoreGame({gameState:{players:[]}}); } catch {} S===old;`), true);
});
test('locked listening waits survive rendering and permit an unchanged concealed kong', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DC'); S.players[0].declaredListen=true; S.players[0].tingLocked=true; S.players[0].waitKeys=['DC']; canConcealedKong(0).includes('W1')`), true);
});
test('kong replacement preserves all physical tiles and marks the replacement', () => {
  const { run } = game();
  const result = JSON.parse(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 W1'); S.wall=tiles('W2 W3 W4 W5'); S.deadWall=tiles('T1 T2 T3'); doConcealedKong(0,'W1'); JSON.stringify({drawn:tileKey(S.players[0].drawnTile),rinshan:S.players[0].rinshan,wall:S.wall.length,dead:S.deadWall.length,total:S.players[0].hand.length+S.players[0].melds[0].tiles.length+S.wall.length+S.deadWall.length})`));
  assert.deepEqual(result, { drawn:'T3', rinshan:true, wall:3, dead:3, total:11 });
});
test('a resolved win settles exactly once and preserves total score', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 W2 W2 W2 T3 T3 T3 B4 B4 B4 FE FE FE DC DC'); const win=S.players[0].hand.at(-1); doWin(0,-1,win,true); const paid=S.players[0].points; doWin(0,-1,win,true); paid===S.players[0].points && S.players.reduce((n,p)=>n+p.points,0)===400000;`), true);
});
test('AI win takes precedence over player pong', () => {
  const { run } = game();
  assert.equal(run(`fixture(); const t=tiles('DC')[0]; S.lastDiscard={from:2,tile:t}; S.waitReact=[{pid:0,type:'pong',tile:t},{pid:1,type:'hu',tile:t}]; S.currentReactions=[S.waitReact[0]]; let winning=-1; doWin=pid=>winning=pid; handlePongClick(); winning`), 1);
});
test('AI pong takes precedence over player chow', () => {
  const { run } = game();
  assert.equal(run(`fixture(); const t=tiles('W3')[0]; S.lastDiscard={from:2,tile:t}; S.waitReact=[{pid:0,type:'chow',tile:t,patterns:[[1,2,3]]},{pid:1,type:'pong',tile:t}]; let claimed=''; handleAIReaction=(rs,fallback)=>{if(rs.some(r=>r.type==='pong')) claimed='pong';else fallback();}; doChow=()=>claimed='chow'; commitPlayerReaction(S.waitReact[0],[1,2,3]); claimed;`), 'pong');
});
test('computer pong is settled before the player is offered chow', () => {
  const { run } = game();
  assert.equal(run(`fixture(); const t=tiles('W3')[0]; S.lastDiscard={from:2,tile:t}; S.waitReact=[{pid:0,type:'chow',tile:t,patterns:[[1,2,3]]},{pid:1,type:'pong',tile:t}]; let claimed=''; chooseAIReaction=r=>({reaction:r,shanten:0,ukeire:0}); doPong=pid=>claimed='pong'+pid; stepAI=()=>{}; const took=settleAIClaimsBeforeChow(); took+':'+claimed`), 'true:pong1');
  assert.equal(run(`onlyPlayerChow([{pid:0,type:'chow'},{pid:1,type:'pong'}])+','+onlyPlayerChow([{pid:0,type:'pong'},{pid:3,type:'chow'}])`), 'true,false');
});
test('declined computer pong leaves only the player chow and records 過水', () => {
  const { run } = game();
  assert.equal(run(`fixture(); const t=tiles('W3')[0]; S.lastDiscard={from:2,tile:t}; S.waitReact=[{pid:0,type:'chow',tile:t,patterns:[[1,2,3]]},{pid:1,type:'pong',tile:t}]; chooseAIReaction=()=>null; const took=settleAIClaimsBeforeChow(); [took, S.waitReact.map(r=>r.pid+r.type).join(), S.players[1].passedPong.includes('W3')].join('|')`), 'false|0chow|true');
});
test('HTML metacharacters in a player name are escaped', () => {
  const { run } = game();
  assert.equal(run(`escapeHTML('<b>"&')`), '&lt;b&gt;&quot;&amp;');
});
test('all 42 faces share one drawing coordinate system and remain distinct', () => {
  const { run } = game();
  assert.equal(run(`{ const faces=Object.keys(countByKey(generateTiles())).map(k=>tileFace(keyToTile(k))); faces.every(face=>face.includes('viewBox="0 0 40 56"')) && new Set(faces).size===42; }`),true);
});
test('original vector fallback retains readable counts when the crystal renderer is unavailable', () => {
  const { run } = game();
  run('delete window.MahjongCrystalTiles');
  assert.equal(run(`tileFace(keyToTile('B1')).includes('data-bird="one-bamboo"')`),true);
  for(let n=2;n<=9;n++) {
    assert.equal(run(`(tileFace(keyToTile('T${n}')).match(/data-dot=/g)||[]).length`),n);
    assert.equal(run(`(tileFace(keyToTile('B${n}')).match(/data-bamboo=/g)||[]).length`),n);
  }
});
test('25 automated hands finish with valid hand sizes and all 144 physical tiles', () => {
  let wins = 0, draws = 0, actions = 0;
  for (let hand = 0; hand < 25; hand++) {
    const { run, timers } = game(hand + 1);
    run('startNewHand(true)');
    for (let step = 0; step < 700; step++) {
      actions++;
      const state = JSON.parse(run('JSON.stringify(S)'));
      const physical = [...state.wall, ...state.deadWall, ...state.players.flatMap(p => [...p.hand, ...p.flowers, ...p.discards, ...p.melds.flatMap(m => m.tiles)])];
      if (state.lastDiscard && !physical.some(t => t.id === state.lastDiscard.tile.id)) physical.push(state.lastDiscard.tile);
      assert.equal(physical.length,144, `physical count hand ${hand} step ${step}`);
      assert.equal(new Set(physical.map(t=>t.id)).size,144, `duplicate tile hand ${hand} step ${step}`);
      for (const p of state.players) assert.ok([16-p.melds.length*3,17-p.melds.length*3].includes(p.hand.length), `invalid hand size ${p.hand.length}`);
      if (state.phase === 'end') { state.winner === null ? draws++ : wins++; break; }
      if (state.waitReact?.some(r=>r.pid===0) && state.currentReactions) {
        run(`if (S.currentReactions.some(r=>r.type==='hu')) handleHuClick(); else handlePassClick();`);
      } else if (!state.waitReact && state.turn === 0) {
        run(`{ const me=S.players[0]; if (me.hand.length===16-me.melds.length*3) stepNext(); else if (canSelfDraw(0)) doWin(0,-1,me.hand.at(-1),true); else { let tile=me.tingLocked ? me.drawnTile || me.hand.at(-1) : aiChooseDiscard(0); discard(0,tile); } }`);
      } else {
        const entry = timers.entries().next().value;
        assert.ok(entry, `stalled hand ${hand} step ${step}: ${JSON.stringify(state)}`);
        timers.delete(entry[0]); entry[1]();
      }
      assert.ok(step < 699, 'game did not finish');
    }
  }
  console.log(`Simulation: ${wins} wins, ${draws} draws, ${actions} checked states`);
  assert.equal(wins+draws,25);
});

test('discard completing a triplet is not a concealed pung', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 T2 T2 T2 B3 B3 W4 W5 W6 T6 T7 T8 DB DB'); calcFanDetails(0,tiles('B3')[0],false).categories.includes('三暗刻')`), false);
});

test('concealed kong contributes to concealed pung scoring', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('T2 T2 T2 B3 B3 B3 W4 W5 W6 T6 T7 T8 DB DB'); S.players[0].melds=[{type:'kong',concealed:true,tiles:tiles('W1 W1 W1 W1')}]; calcFanDetails(0,S.players[0].hand.at(-1),true).categories.includes('三暗刻')`), true);
});

test('incompatible chow and concealed pung decompositions do not stack', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 W2 W2 W2 W3 W3 W3 W4 W5 W6 T1 T2 T3 B5 B5'); const cats=calcFanDetails(0,tiles('T1')[0],true).categories; cats.includes('平胡') && cats.includes('三暗刻')`), false);
});

test('all chows requires a two-sided winning sequence, not pair, closed or edge waits', () => {
  const { run } = game();
  run(`fixture(); S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5');`);
  for (const key of ['T5','W2','W3','B7']) {
    assert.equal(run(`calcFanDetails(0,tiles('${key}')[0],true).categories.includes('平胡')`),false,key);
  }
  assert.equal(run(`S.players[0].hand.splice(S.players[0].hand.findIndex(t=>tileKey(t)==='W4'),1); calcFanDetails(0,tiles('W4')[0],false).categories.includes('平胡')`),true);
});

test('concealed kong prevents all-exposed scoring', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('DB'); S.players[0].melds=['W1','W2','T3','B4','FE'].map((k,i)=>({type:i===0?'kong':'pong',concealed:i===0,tiles:tiles(Array(i===0?4:3).fill(k).join(' '))})); calcFanDetails(0,tiles('DB')[0],false).categories.includes('全求人')`),false);
});

test('claiming a winning discard as a pong cannot become self draw', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.players[0].hand=tiles('W1 W1 W1 T2 T2 T2 B3 B3 W4 W5 W6 T6 T7 T8 DB DB'); const t=tiles('B3')[0]; S.lastDiscard={from:2,tile:t}; doPong(0,t); doWin(0,-1,S.players[0].hand.at(-1),true); S.phase`),'play');
});

test('dealer first-discard ready is heaven ready, not earth ready', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.drawCount=0; S.anyOpenMeld=false; updateTianDiTing(0); S.players[0].tianTing`),true);
});

test('an already discarded hand cannot score earth or human opening win', () => {
  const { run } = game();
  assert.equal(run(`fixture(); S.drawCount=4; S.anyOpenMeld=false; S.players[1].discards=tiles('W9'); S.players[1].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC DC'); calcFanDetails(1,S.players[1].hand.at(-1),true).categories.includes('地胡')`),false);
});

test('one-payment discard settlement and three-payer self draw across dealer, streak and stake combinations', () => {
  for (const [base,perFan] of [[2000,1000],[500,100]])
  for (const streak of [0,1,2]) for (const winner of [0,1]) for (const from of [-1,0,1,2,3]) {
    if (from === winner) continue;
    const { run } = game();
    const selfDraw=from===-1;
    run(`fixture(); S.dealer=0; S.dealerStreak=${streak}; S.turn=${winner}; S.lastAction='draw'; S.lastActor=${winner};
      RULES.points.base=${base}; RULES.points.perFan=${perFan};
      let scoreLog=[]; log=message=>scoreLog.push(message);
      S.players[${winner}].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5${selfDraw?' T5':''}');
      doWin(${winner},${from},tiles('T5')[0],${selfDraw});`);
    const dealerFan=2*streak+1;
    const fan=(selfDraw?4:2)+(winner===0?dealerFan:0);
    const payment=base+fan*perFan;
    const expected=[100000,100000,100000,100000];
    if(selfDraw) {
      for(let pid=0;pid<4;pid++) if(pid!==winner) {
        const paid=payment+(winner!==0 && pid===0?dealerFan*perFan:0);
        expected[pid]-=paid;expected[winner]+=paid;
      }
    } else {
      const paid=payment+(winner!==0 && from===0?dealerFan*perFan:0);
      expected[from]-=paid;expected[winner]+=paid;
      assert.ok(run(`scoreLog.some(message=>message.includes('放槍者付 ${payment.toLocaleString()}'))`));
    }
    assert.equal(run('S.resultDetail.fan'),fan);
    assert.deepEqual(JSON.parse(run('JSON.stringify(S.players.map(p=>p.points))')),expected);
    assert.equal(expected.reduce((sum,points)=>sum+points,0),400000);
    run(`doWin(${winner},${from},tiles('T5')[0],${selfDraw});`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(S.players.map(p=>p.points))')),expected,'no double settlement');
  }
});

test('seat wind follows current dealer while round wind remains unchanged', () => {
  const { run } = game();
  run(`fixture(); seatNames=['東','西','北','南']; S.dealer=3; S.round=1; S.players[3].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DB DB');`);
  assert.equal(run(`calcFanDetails(3,S.players[3].hand.at(-1),true).categories.includes('門風')`),true);
  assert.equal(run(`calcFanDetails(3,S.players[3].hand.at(-1),true).categories.includes('圈風')`),true);
  run(`S.players[0].hand=S.players[3].hand;`);
  assert.equal(run(`calcFanDetails(0,S.players[0].hand.at(-1),true).categories.includes('門風')`),false);
});

test('eight pairs and flowers are never ordinary winning hands', () => {
  const {run}=game();
  for(const hand of ['W1 W1 W3 W3 W5 W5 W7 W7 W9 W9 T2 T2 T4 T4 B6 B6','W1 W1 W3 W3 W5 W5 W7 W7 W9 W9 T2 T2 T4 T4 B6 B6 B6','W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE H1 H2'])
    assert.equal(run(`isWinningNow(tiles('${hand}'),[],null)`),false);
  assert.equal(run(`validMeld({type:'chow',tiles:tiles('W1 W2 W4')})`),false);
});

test('100 deals retain 144 unique tiles, sixteen reserved, and no flowers in hands',()=>{
  for(let seed=1;seed<=100;seed++) {
    const {run}=game(seed);
    run('startNewHand(true)');
    assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers])];all.length===144&&new Set(all.map(t=>t.id)).size===144&&S.deadWall.length===16&&S.players.every((p,i)=>p.hand.length===(i===S.dealer?17:16)&&p.hand.every(t=>t.suit!=='H'));}`),true);
  }
});

test('drawing chains flowers from the tail, retaining the replacement tile',()=>{
  const {run}=game();
  assert.deepEqual(JSON.parse(run(`fixture(); S.wall=tiles('W7 W8 W9 H1'); S.deadWall=tiles('T5 H2'); drawTile(0); JSON.stringify([S.players[0].flowers.map(tileKey),S.players[0].hand.map(tileKey),tileKey(S.players[0].drawnTile),S.players[0].rinshan,S.wall.length,S.deadWall.length])`)),[['H1','H2'],['T5'],'T5',true,1,2]);
});

test('a flower on the last drawable tile ends in a draw without taking the reserve',()=>{
  const {run}=game();
  assert.deepEqual(JSON.parse(run(`fixture(); S.wall=tiles('H1');S.deadWall=tiles('W1 W2');drawTile(0);JSON.stringify([S.phase,S.winner,S.players[0].flowers.length,S.deadWall.length])`)),['end',null,1,2]);
});

for(const [kind,flowers,other,from,expected] of [
  ['八仙過海','H1 H2 H3 H4 H5 H6 H7 H8','',-1,[133000,89000,89000,89000]],
  ['七搶一','H1 H2 H3 H4 H5 H6 H7','H8',1,[111000,89000,100000,100000]]
]) test(`${kind} settles eight tai plus dealer, once, with the correct payers`,()=>{
  const {run}=game();
  run(`fixture();S.players[0].flowers=tiles('${flowers}');S.players[1].flowers=${other?`tiles('${other}')`:'[]'};resolveFlowerWin();`);
  assert.equal(run('S.resultDetail.fan'),9);
  assert.equal(run('S.fromPlayer'),from);
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.players.map(p=>p.points))')),expected);
  run('resolveFlowerWin()');
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.players.map(p=>p.points))')),expected);
});

test('revealing the seventh flower triggers a win even if the eighth was revealed earlier',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[0].flowers=tiles('H1 H2 H3 H4 H5 H6');S.players[1].flowers=tiles('H8');S.wall=tiles('W9 H7');drawTile(0);S.flowerWin.kind`),'七搶一');
  assert.equal(run('S.players[0].hand.length'),0);
});

for(const [pid,own] of [[0,'H1 H5'],[3,'H2 H6'],[1,'H3 H7'],[2,'H4 H8']]) test(`correct flowers follow current seat ${pid}`,()=>{
  const {run}=game();
  run(`fixture();S.players[${pid}].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5');let original=calcFanDetails(${pid},tiles('T5')[0],true).fan;S.players[${pid}].flowers=tiles('${own}');`);
  assert.equal(run(`calcFanDetails(${pid},tiles('T5')[0],true).fan-original`),2);
  run(`S.players[${pid}].flowers=tiles('H1 H2 H3 H4');`);
  assert.equal(run(`calcFanDetails(${pid},tiles('T5')[0],true).fan-original`),2,'flower set replaces the matching individual flower');
});

test('zero-tai legal discard win pays only the base',()=>{
  const {run}=game();
  run(`fixture();S.turn=1;S.players[1].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B4 B5 B7 B7');S.players[1].melds=[{type:'pong',tiles:tiles('T9 T9 T9')}];doWin(1,2,tiles('B6')[0],false);`);
  assert.equal(run('S.resultDetail.fan'),0);
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.players.map(p=>p.points))')),[100000,102000,98000,100000]);
});

test('closed self draw is three tai; regular declared ready has no added tai',()=>{
  const {run}=game();
  run(`fixture();S.players[1].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5');`);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],true).fan`),3);
  run('S.players[1].declaredListen=true');
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],true).fan`),3);
});

test('four concealed pungs are five tai, do not stack the three-pung tier',()=>{
  const {run}=game();
  const result=JSON.parse(run(`fixture();S.players[1].hand=tiles('W1 W1 W1 T2 T2 T2 B3 B3 B3 W8 W8 W8 T5 T6 T7 B5 B5');JSON.stringify(calcFanDetails(1,tiles('T5')[0],true))`));
  assert.equal(result.fan,8);assert.ok(result.categories.includes('四暗刻'));assert.ok(!result.categories.includes('三暗刻'));
});

test('pinfu is two tai plus closed hand; flowers and self draw disqualify pinfu',()=>{
  const {run}=game();
  run(`fixture();S.players[1].hand=tiles('W1 W2 W3 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5');`);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],false).fan`),3);
  run(`S.players[1].flowers=tiles('H1');`);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],false).categories.includes('平胡')`),false);
  run(`S.players[1].flowers=[];S.players[1].hand.push(tiles('W4')[0]);`);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],true).categories.includes('平胡')`),false);
});

test('an apparent pair wait with another valid winning face is not single wait',()=>{
  const {run}=game();
  run(`fixture();S.players[1].hand=tiles('W1 W2 W3 T1 T2 T3 B1 B2 B3 B7 B8 B9 W2 W3 W4 W4');`);
  assert.ok(run(`calcWaitingTiles(S.players[1].hand,[]).length`)>1);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],false).categories.includes('獨聽')`),false);
});

test('big four winds includes wind bonuses and honors exclude all-pungs overlap',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('FE FE FE FS FS FS FW FW FW FN FN FN DC DC DC DB DB');`);
  const cats=JSON.parse(run(`JSON.stringify(calcFanDetails(0,tiles('DB')[0],true).categories)`));
  assert.ok(cats.includes('大四喜'));assert.ok(cats.includes('字一色'));
  for(const name of ['門風','圈風','對對胡']) assert.ok(!cats.includes(name),name);
});

test('full begging is two tai and does not double-count single wait',()=>{
  const {run}=game();
  run(`fixture();S.players[1].hand=tiles('DB');S.players[1].melds=['W1 W2 W3','W4 W5 W6','T1 T2 T3','T7 T8 T9','B1 B2 B3'].map(keys=>({type:'chow',tiles:tiles(keys)}));`);
  assert.equal(run(`calcFanDetails(1,tiles('DB')[0],false).fan`),2);
  assert.equal(run(`calcFanDetails(1,tiles('DB')[0],false).categories.includes('獨聽')`),false);
  run(`S.players[1].hand.push(tiles('DB')[0]);`);
  assert.equal(run(`calcFanDetails(1,tiles('DB')[0],true).categories.includes('半求人')`),true);
});

test('passing Hu prevents discard win and self draw until a nonwinning hand is discarded',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5');S.lastDiscard={from:2,tile:tiles('T5')[0]};S.waitReact=[{pid:0,type:'hu',tile:S.lastDiscard.tile}];markPassedReactions(0);S.waitReact=null;`);
  assert.equal(run(`canWinOn(0,tiles('T5')[0])`),false);
  run(`S.players[0].hand.push(tiles('T5')[0]);`);
  assert.equal(run('canSelfDraw(0)'),false);
  run(`S.players[0].hand.pop();S.players[0].hand.push(tiles('W9')[0]);discard(0,S.players[0].hand.at(-1));`);
  assert.equal(run('S.players[0].passedHu'),false);
});

test('passing pong blocks the same tile until the player discards again',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('DC DC W1');S.lastDiscard={from:2,tile:tiles('DC')[0]};S.waitReact=[{pid:0,type:'pong',tile:S.lastDiscard.tile}];markPassedReactions(0);`);
  assert.equal(run(`canPong(0,tiles('DC')[0])`),false);
  run('S.players[0].passedPong=[]');assert.equal(run(`canPong(0,tiles('DC')[0])`),true);
});

test('chow forbids swapping either end of the consumed two-tile run',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('W1 W2 W3 W4 T8');S.lastDiscard={from:2,tile:tiles('W1')[0]};doChow(0,S.lastDiscard.tile,[1,2,3]);`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(S.players[0].discardBan)')),['W1','W4']);
  assert.equal(run(`canDiscardTile(0,S.players[0].hand.find(t=>tileKey(t)==='W4'))`),false);
});

test('pong and chow are disallowed when they leave no legal discard',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[0].hand=tiles('W1 W1 W1 W1');canPong(0,tiles('W1')[0])`),false);
  assert.equal(run(`S.players[0].hand=tiles('W1 W2 W3 W4');S.lastDiscard={from:2,tile:tiles('W1')[0]};canChow(0,S.lastDiscard.tile).length`),0);
});

test('upwind discard cannot be open-konged; other opponents can',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('DC DC DC W1');S.lastDiscard={from:2,tile:tiles('DC')[0]};`);
  assert.equal(run('canKong(0,S.lastDiscard.tile)'),false);
  assert.equal(run('S.lastDiscard.from=1;canKong(0,S.lastDiscard.tile)'),true);
});

test('last three drawable tiles prohibit claims but permit a concealed replacement',()=>{
  const {run}=game();
  run(`fixture();S.wall=tiles('W7 W8 W9');S.players[0].hand=tiles('DC DC DC DC W1 W2 W4');S.lastDiscard={from:2,tile:tiles('W3')[0]};`);
  assert.equal(run('canChow(0,S.lastDiscard.tile).length'),0);
  assert.equal(run(`canPong(0,tiles('DC')[0])`),false);
  assert.equal(run(`canKong(0,tiles('DC')[0])`),false);
  assert.equal(run(`canConcealedKong(0).includes('DC')`),true);
});

test('a fourth kong remains legal and chow/pong cannot be immediately followed by a kong',()=>{
  const {run}=game();
  run(`fixture();S.kongCount=3;S.players[0].hand=tiles('DC DC DC DC W1');`);
  assert.equal(run(`canConcealedKong(0).includes('DC')`),true);
  for(const action of ['pong','chow']) assert.equal(run(`S.lastAction='${action}';S.lastActor=0;canConcealedKong(0).length`),0);
});

test('old saves and altered tile identities cannot replace the active hand',()=>{
  const {run}=game();
  run(`let original=S;let data={gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak};delete data.gameState.rulesetVersion;`);
  assert.throws(()=>run('restoreGame(data)'),/舊版/);assert.equal(run('S===original'),true);
  run(`data.gameState=clone(S);data.gameState.wall[0].id=999;`);
  assert.throws(()=>run('restoreGame(data)'));assert.equal(run('S===original'),true);
});

test('new flower save round-trips without changing physical IDs or passed-Hu state',()=>{
  const {run}=game();
  run(`S.players[0].passedHu=true;let ids=JSON.stringify(S.players.map(p=>p.flowers));restoreGame({gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak});`);
  assert.equal(run('JSON.stringify(S.players.map(p=>p.flowers))===ids&&S.players[0].passedHu'),true);
});

test('heaven/earth ready cannot first be declared after any kong',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.drawCount=0;S.kongCount=1;S.anyOpenMeld=false;updateTianDiTing(0);S.players[0].tianTing||S.players[0].diTing`),false);
});

test('small three dragons includes its dragon bonuses without adding them again',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[1].hand=tiles('DC DC DC DF DF DF DB DB W1 W2 W3 T1 T2 T3 B5 B6');calcFanDetails(1,tiles('B4')[0],false).fan`),5);
});

test('big three dragons from three exposed pungs is exactly eight tai',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[1].hand=tiles('W1 W2 W3 T2 T3 B5 B5');S.players[1].melds=['DC','DF','DB'].map(k=>({type:'pong',tiles:tiles([k,k,k].join(' '))}));calcFanDetails(1,tiles('T1')[0],false).fan`),8);
});

test('small four winds may add matching wind and compatible concealed pungs',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[1].hand=tiles('FE FE FE FS FS FS FN FN FN FW FW W1 W2 W3 T2 T3');calcFanDetails(1,tiles('T1')[0],false).fan`),12);
});

test('pure suit adds eight tai and a closed discard win adds one',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[1].hand=tiles('W1 W1 W1 W3 W4 W4 W5 W6 W6 W7 W8 W9 W9 W9 W5 W5');calcFanDetails(1,tiles('W2')[0],false).fan`),9);
});

test('human cannot declare ready when every ready discard is prohibited',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 W9');S.players[0].discardBan=S.players[0].hand.filter(t=>isListening(S.players[0].hand.filter(x=>x!==t),[])).map(tileKey);document.getElementById('btnListen').onclick();`);
  assert.equal(run('S.players[0].declaredListen'),false);
});

test('earth and human opening wins are limited to the first untouched draw/discard window',()=>{
  const {run}=game();
  run(`fixture();S.anyOpenMeld=false;S.kongCount=0;S.players[1].draws=1;S.players[1].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5');`);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],true).fan`),16);
  run('S.players[1].draws=2');assert.equal(run(`calcFanDetails(1,tiles('W4')[0],true).fan`),3);
  run(`S.players[1].draws=0;S.players[1].hand.splice(S.players[1].hand.findIndex(t=>tileKey(t)==='W4'),1);`);
  assert.equal(run(`calcFanDetails(1,tiles('W4')[0],false).fan`),10,'human 8 + pinfu 2, no closed hand bonus');
  run('S.anyOpenMeld=true');assert.equal(run(`calcFanDetails(1,tiles('W4')[0],false).fan`),3);
});

test('heaven win excludes closed-self, single wait and replacement bonuses',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.drawCount=0;S.players[0].rinshan=true;S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5');calcFanDetails(0,tiles('T5')[0],true).fan`),25);
});

test('last-tile win is one additional tai and rob-kong never adds river-bottom',()=>{
  const {run}=game();
  run(`fixture();S.players[1].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5');S.wall=[];`);
  assert.equal(run(`calcFanDetails(1,tiles('T5')[0],false).fan`),3);
  run('S.robKong=true');assert.equal(run(`calcFanDetails(1,tiles('T5')[0],false).fan`),3);
  assert.equal(run(`calcFanDetails(1,tiles('T5')[0],false).categories.includes('河底撈魚')`),false);
});
