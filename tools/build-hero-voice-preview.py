"""Build an offline audition page using the exact game clips (no remote previews)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
contract = json.loads((ROOT/'art-source/audio/voice-heroes-v1/contract.json').read_text('utf-8'))
old = (ROOT/'artifacts/hero-voice-audition.html').read_text('utf-8')
style = old.split('<style>', 1)[1].split('</style>', 1)[0]
page = '''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>雀仙門・角色報牌與出招試聽</title><style>'''+style+'''
select{display:block;width:100%;min-width:0;margin:12px 0;padding:10px 6px;font:inherit;font-size:14px;color:#e7eee9;background:#102a30;border:1px solid #799181;border-radius:7px}.voice{min-height:0}.play{width:100%;margin-bottom:12px}.card .status{min-height:36px}a{overflow-wrap:anywhere}
</style></head><body><main><header><div class="eyebrow">雀仙門 ／ 修仙模式正式配音</div>
<h1>十位道友・報牌與出招</h1><p>5 位男聲、5 位女聲，每人 42 種牌名與 26 種出招及提示，共 680 段。</p>
<p class="note">吃碰槓胡使用短促出招咒語；報牌保持自然清楚。聽牌念「凝神」、補花提示念「靈華」，畫面操作名稱照舊。此處直接播放遊戲內的本機音檔，已統一響度。</p>
<p><a href="../index.html">返回遊戲</a></p></header><nav class="toolbar" aria-label="性別篩選">
<button data-filter="all" aria-pressed="true">全部 10 位</button><button data-filter="男" aria-pressed="false">男聲 5 位</button><button data-filter="女" aria-pressed="false">女聲 5 位</button><button id="stop">停止播放</button></nav>
<section class="grid" id="voices" aria-label="正式角色語音"></section>
<p class="foot">同類出招在遊戲中輪替四種咒語；各角色使用自己的聲線。下方提供每一段實際音檔，方便逐項比較。</p>
</main><script src="../hero-voices.js"></script><script>
'use strict';
const lines=__LINES__;
const actionLabels={'chow':'吃','pong':'碰','kong':'明槓／加槓','concealed-kong':'暗槓','win':'胡','self-draw':'自摸','ready':'聽牌','flower':'補花'};
function stopAll(except){document.querySelectorAll('audio').forEach(a=>{if(a!==except)a.pause();});}
for(const hero of MahjongHeroVoices.all){
 const card=document.createElement('article');card.className='card';card.dataset.gender=hero.gender;
 const portrait=document.createElement('div');portrait.className='portrait';
 const img=document.createElement('img');img.src='../assets/cultivation-journey/heroes/'+hero.id+'.png';img.alt=hero.name+'立繪';img.loading='lazy';
 const badge=document.createElement('span');badge.className='badge';badge.textContent=hero.gender+'聲';portrait.append(img,badge);
 const body=document.createElement('div');body.className='content';
 const title=document.createElement('h2');title.textContent=hero.name;
 const voice=document.createElement('p');voice.className='voice';voice.textContent=hero.voice;
 const select=document.createElement('select');select.setAttribute('aria-label',hero.name+'試聽台詞');
 const groups={};for(const label of ['出招咒語','修仙提示','五行牌名']){const group=document.createElement('optgroup');group.label=label;groups[label]=group;select.append(group);}
 for(const line of lines){const option=document.createElement('option');option.value=line.id;const action=actionLabels[line.id.replace(/-[1-4]$/,'')];option.textContent=(action?action+' · ':'')+line.text;groups[line.id.startsWith('tile-')?'五行牌名':['ready','flower'].includes(line.id)?'修仙提示':'出招咒語'].append(option);}
 select.value='win-1';
 const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.setAttribute('aria-label',hero.name+'語音播放');
 const button=document.createElement('button');button.className='play';button.textContent='播放出招';
 const status=document.createElement('p');status.className='status';status.setAttribute('aria-live','polite');
 function update(){audio.pause();audio.src='../assets/audio/voice-heroes-v1/'+hero.id+'/'+select.value+'.mp3';status.textContent=select.selectedOptions[0].textContent;button.textContent='播放 '+lines.find(l=>l.id===select.value).text;}
 select.addEventListener('change',update);button.addEventListener('click',()=>{stopAll(audio);audio.currentTime=0;audio.play().catch(()=>{status.textContent='請使用下方播放控制重試';});});
 audio.addEventListener('play',()=>{stopAll(audio);status.textContent='播放中 · '+select.selectedOptions[0].textContent;});
 audio.addEventListener('ended',()=>{status.textContent='播放完畢 · '+select.selectedOptions[0].textContent;});
 audio.addEventListener('error',()=>{status.textContent='音檔載入失敗';});update();
 body.append(title,voice,select,button,audio,status);card.append(portrait,body);document.querySelector('#voices').append(card);
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{stopAll();document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('.card').forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.gender!==button.dataset.filter;});}));
document.querySelector('#stop').addEventListener('click',()=>stopAll());document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
</script></body></html>'''
page = page.replace('__LINES__', json.dumps(contract['lines'], ensure_ascii=False))
target = ROOT/'artifacts/hero-voice-production.html'
if target.exists():
    raise FileExistsError(target)
target.write_text(page, encoding='utf-8')
print(target)
