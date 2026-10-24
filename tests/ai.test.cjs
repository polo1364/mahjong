const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./game-harness.cjs');

test('standard shanten recognizes complete, ready and one-away sixteen-tile shapes',()=>{
  const {run}=game();
  for(const [hand,expected] of [
    ['W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC DC',-1],
    ['W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC',0],
    ['W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 DC DC T8 B8',1],
    ['W1 W1 W1 W2 W2 W2 W3 W3 W3 W4 W5 W6 T1 T2 T3 B5 B5',-1]
  ]) assert.equal(run(`calcShanten(tiles('${hand}'))`),expected,hand);
});

test('shanten counts already exposed sets and is independent of tile order',()=>{
  const {run}=game();
  run(`let h=tiles('W1 W2 W3 T1 T2 T3 B1 B2 B3 DC');let m=[{type:'pong',tiles:tiles('FE FE FE')},{type:'pong',tiles:tiles('DF DF DF')}];`);
  assert.equal(run('calcShanten(h,m)'),0);
  assert.equal(run('calcShanten(h.reverse(),m)'),0);
  assert.ok(run('calcShanten(h,[])')>0);
});

test('discard preserves completed sequences and takes a live two-sided wait',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 T5 T5 DC');tileKey(aiChooseDiscard(0))`),'DC');
});

test('visible exhausted waits lose to a live wait, including own hand copies',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 W9');S.players[1].discards=tiles('T5 T5 T5');tileKey(aiChooseDiscard(0))`),'T5');
});

test('AI takes a chow or pong that reaches ready after its legal discard',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('W1 W2 W4 W5 W6 T1 T2 T3 B1 B2 B3 T5 T5 DC DC FE');S.lastDiscard={from:2,tile:tiles('W3')[0]};`);
  assert.equal(run(`chooseAIReaction({pid:0,type:'chow',tile:S.lastDiscard.tile,patterns:[[1,2,3]]}).shanten`),0);
  assert.equal(run(`tileKey(chooseAIReaction({pid:0,type:'chow',tile:S.lastDiscard.tile,patterns:[[1,2,3]]}).tile)`),'FE');
  run(`S.players[0].hand=tiles('DC DC W1 W2 W3 W4 W5 W6 T1 T2 T3 B4 B5 T5 T5 W9');S.lastDiscard={from:2,tile:tiles('DC')[0]};`);
  assert.equal(run(`chooseAIReaction({pid:0,type:'pong',tile:S.lastDiscard.tile}).shanten`),0);
});

test('AI refuses a pong that destroys the pair and narrows an already good wait',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[0].hand=tiles('DC DC W1 W2 W3 W4 W5 W6 T1 T2 T3 B4 B5 B6 B7 B8');S.lastDiscard={from:2,tile:tiles('DC')[0]};chooseAIReaction({pid:0,type:'pong',tile:S.lastDiscard.tile})`),null);
});

test('discard and claim strategies never access hidden opponent tiles, waits or wall faces',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('DC DC W1 W2 W3 W4 W5 W6 T1 T2 T3 B4 B5 T5 T5 W9');S.lastDiscard={from:2,tile:tiles('DC')[0]};
    for(let i=1;i<4;i++) { const p=S.players[i];p.declaredListen=true;p.melds=[{type:'kong',concealed:true}];
      for(const prop of ['hand','waitKeys','drawnTile']) Object.defineProperty(p,prop,{get(){throw Error('hidden opponent '+prop)}});
      Object.defineProperty(p.melds[0],'tiles',{get(){throw Error('hidden concealed kong')}});
    }
    for(const field of ['wall','deadWall']) S[field]=new Proxy(S[field],{get(target,key){if(key==='length')return target.length;throw Error('hidden wall '+String(key));}});
    canWinOn=()=>{throw Error('opponent win oracle')};`);
  assert.doesNotThrow(()=>run(`chooseAIReaction({pid:0,type:'pong',tile:S.lastDiscard.tile})`));
  run(`S.lastDiscard=null;S.players[0].hand.push(tiles('FN')[0]);`);
  assert.doesNotThrow(()=>run('aiChooseDiscard(0)'));
  run(`S.players[0].hand=tiles('DC DC DC DC W1 W2 W3 T1 T2 T3 B1 B2 B3 FE FE FE DB');`);
  assert.equal(run(`aiKongKeepsShape(0,'DC')`),true);
});

test('decisions remain identical under hidden-state permutations',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 T5 T5 DC');S.players[1].declaredListen=true;let original=tileKey(aiChooseDiscard(0));`);
  for(let i=0;i<12;i++) {
    run(`S.wall.reverse();S.deadWall.reverse();for(let pid=1;pid<4;pid++){S.players[pid].hand=shuffle(generateTiles()).slice(0,16);S.players[pid].waitKeys=[AI_FACE_KEYS[(${i}+pid)%34]];}`);
    assert.equal(run('tileKey(aiChooseDiscard(0))===original'),true);
  }
});

test('claimed tile is counted once in the public inventory',()=>{
  const {run}=game();
  assert.equal(run(`fixture();S.players[0].hand=tiles('DC DC W1');S.lastDiscard={from:2,tile:tiles('DC DC DC')[2]};aiPublicInfo(0).unseen[AI_FACE_KEYS.indexOf('DC')]`),1);
});

test('discard respects claimed-tile bans and a locked ready hand',()=>{
  const {run}=game();
  run(`fixture();const p=S.players[0];p.hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 T5 T5 DC');p.discardBan=['DC'];`);
  assert.notEqual(run('tileKey(aiChooseDiscard(0))'),'DC');
  run(`p.discardBan=[];p.declaredListen=true;p.tingLocked=true;p.drawnTile=p.hand.find(t=>tileKey(t)==='W1');`);
  assert.equal(run('aiChooseDiscard(0)===p.drawnTile'),true);
});

test('AI refuses a concealed kong that breaks a better sequence decomposition',()=>{
  const {run}=game();
  run(`fixture();S.players[0].hand=tiles('W1 W1 W1 W1 W2 W2 W3 W3 T1 T2 T3 B1 B2 B3 FE FE DC');`);
  assert.equal(run(`aiKongKeepsShape(0,'W1')`),false);
});
