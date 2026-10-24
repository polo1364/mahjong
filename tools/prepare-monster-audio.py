"""Layer existing generated SFX into 35 reproducible monster attacks; preserve source audio."""
from pathlib import Path
import subprocess, json, hashlib, re
root=Path(__file__).resolve().parents[1]
jobs=json.loads(subprocess.check_output(['node','-e',"const K=require('./cultivation-monster-skills.js'),P=require('./cultivation-monster-presentation.js');console.log(JSON.stringify(K.all.map(s=>({...s,sounds:P.recipes[s.motion].sounds}))));"],cwd=root))
report=[]
for index,job in enumerate(jobs):
    files=[root/'assets/cultivation-vfx'/(name+'.mp3') for name in job['sounds']]
    target=root/job['audio']
    args=['ffmpeg','-hide_banner','-loglevel','error','-y']
    for source in files: args+=['-i',str(source)]
    # Distinct temporal envelope, impact rhythm and material layering. Not a recolored/shared cue.
    strike=.54+(index%4)*.055
    second=strike+(.22 if job['hits']==2 else .14)
    filters=[f'[0:a]atrim=0:0.65,asetpts=PTS-STARTPTS,volume=0.40,afade=t=in:d=0.04,afade=t=out:st=0.4:d=0.25,lowpass=f={1800+index*70}[charge]',
             f'[1:a]atrim=start={.03*(index%5)}:duration=0.75,asetpts=PTS-STARTPTS,volume=1,afade=t=out:st=0.5:d=0.25,adelay={int(strike*1000)}|{int(strike*1000)}[hit]',
             f'[2:a]atrim=0:1.0,asetpts=PTS-STARTPTS,volume=0.45,afade=t=out:st=0.45:d=0.55,adelay={int(second*1000)}|{int(second*1000)}[tail]']
    inputs='[charge][hit][tail]'
    if job['hits']==2:
        filters[1]=filters[1].replace('[hit]','[hitraw]')
        filters+=['[hitraw]asplit=2[hit][double]', '[double]volume=0.85,adelay=230|230[second]']
        inputs+='[second]'
    filters+=[f'{inputs}amix=inputs={4 if job["hits"]==2 else 3}:normalize=0,apad=whole_dur=2.1,atrim=0:2.1,loudnorm=I=-20:TP=-3:LRA=6,afade=t=out:st=1.85:d=0.25[out]']
    subprocess.run(args+['-filter_complex',';'.join(filters),'-map','[out]','-ar','44100','-ac','2','-b:a','160k',str(target)],check=True)
    check=subprocess.run(['ffmpeg','-hide_banner','-i',str(target),'-af','loudnorm=I=-20:TP=-3:LRA=6:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    measured=json.JSONDecoder().raw_decode(check.stderr[check.stderr.rfind('{'):])[0]
    assert float(measured['input_tp'])<=-2.5
    report.append({'id':job['id'],'file':job['audio'],'sources':[str(f.relative_to(root)) for f in files],'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'decoded':True,'duration':2.1,'loudness':measured})
assert len(set(r['sha256'] for r in report))==35
(root/'artifacts/monster-audio-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'decoded':len(report),'unique':len(set(r['sha256'] for r in report)),'lufs_min':min(float(r['loudness']['input_i']) for r in report),'lufs_max':max(float(r['loudness']['input_i']) for r in report)}))
