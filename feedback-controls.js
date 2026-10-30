/* Presentation preferences are separate from the saved mahjong hand. */
(function () {
  'use strict';
  const key = 'qinghe_feedback_v1';
  const style = document.getElementById('effectStyle');
  const volume = document.getElementById('soundVolume');
  const reduced = document.getElementById('reduceEffects');
  const voice = document.getElementById('voiceAnnouncements');
  const ambience = document.getElementById('ambienceSound');
  const music = document.getElementById('backgroundMusic');
  const cue = document.getElementById('feedbackCue');
  const voiceCue = document.getElementById('voiceCue');
  const status = document.getElementById('feedbackStatus');
  let heroVoiceSelect = null;
  let syncHeroCalls = () => {};
  const cultivationMode = () => typeof S !== 'undefined' && !!S?.cultivation;
  const previewHeroId = () => heroVoiceSelect?.value || S?.cultivation?.players?.[0]?.heroId;
  if (window.MahjongHeroVoices && document.getElementById('tileVoicePreview')) {
    const group = document.createElement('div'); group.className = 'hero-voice-preview';
    const label = document.createElement('label'); label.htmlFor = 'heroVoiceSelect'; label.textContent = '修仙角色聲線';
    heroVoiceSelect = document.createElement('select'); heroVoiceSelect.id = 'heroVoiceSelect';
    const self = document.createElement('option'); self.value = ''; self.textContent = '目前自己的角色'; heroVoiceSelect.append(self);
    for (const hero of window.MahjongHeroVoices.all) {
      const option = document.createElement('option'); option.value = hero.id;
      option.textContent = `${hero.name}・${hero.gender}聲`; heroVoiceSelect.append(option);
    }
    const row = document.createElement('div'); row.className = 'feedback-preview';
    const calls = document.createElement('select'); calls.id = 'heroVoiceCall'; calls.setAttribute('aria-label', '修仙出招咒語');
    const legacyCalls = [['chow','吃・疾風／御劍／引雷／逐月'],['pong','碰・破山／震岳／穿雲／裂空'],
      ['kong','槓・天罡／雷動／龍吟／破陣'],['concealed-kong','暗槓・藏鋒／潛龍／無影／伏雷'],
      ['win','胡・誅邪／天誅／歸元／斬妖'],['self-draw','自摸・天啟／凌霄／化神／飛昇'],['ready','聽牌・凝神'],['flower','補花・靈華']];
    const cultivationCalls = [['chow','引氣'],['pong','聚靈'],['kong','開陣'],['concealed-kong','藏陣'],
      ['added','續陣'],['win','決勝'],['self-draw','天成'],['rob-kong','截陣'],['ready','凝神']];
    const actions = { chow: 'chow', pong: 'pong', kong: 'exposed', 'concealed-kong': 'concealed',
      added: 'added', win: 'win', 'self-draw': 'self-draw', 'rob-kong': 'rob-kong' };
    const note = document.createElement('p');
    let displayedMode = null;
    syncHeroCalls = () => {
      const cultivation = cultivationMode();
      if (displayedMode === cultivation) return;
      const selected = calls.value;
      const entries = cultivation ? cultivationCalls : legacyCalls;
      calls.replaceChildren(...entries.map(([value, text]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = text; return option;
      }));
      calls.value = entries.some(([value]) => value === selected) ? selected : entries[0][0];
      note.textContent = cultivation ? '下方報牌試聽也使用所選角色；出招試聽使用角色專屬喊聲。'
        : '下方報牌試聽也使用所選角色；每次試聽出招會輪替同類咒語。';
      displayedMode = cultivation;
    };
    syncHeroCalls();
    const button = document.createElement('button'); button.id = 'previewHeroCall'; button.textContent = '試聽出招';
    button.addEventListener('click', () => {
      if (soundEnabled && voiceEnabled && Number(volume.value) > 0) {
        syncHeroCalls();
        const heroId = previewHeroId(), action = cultivationMode() ? actions[calls.value] : null;
        window.MahjongVoice?.stopAll();
        const played = action ? window.MahjongVoice?.playSkill('call:' + action, { heroId }) : playVoice(calls.value, { heroId });
        status.textContent = played ? '正在試聽出招 · ' + (window.MahjongHeroVoices.get(heroId)?.name || '目前角色')
          : action && !window.MahjongHeroSkillVoices?.get(heroId, 'call:' + action)?.file ? '此角色的出招語音尚未製作。'
          : '出招語音暫時無法播放，請稍後再試。';
      } else status.textContent = '請開啟聲音與語音報牌，並提高音量後試聽。';
    });
    row.append(calls, button); group.append(label, heroVoiceSelect, row, note);
    document.getElementById('tileVoicePreview').append(group);
  }
  // One shared dictionary supplies tile labels; round/dealer names retain their seat wording.
  if (window.MahjongTileNames) {
    const roundAndDealerOptions = [...voiceCue.options].filter(option => !option.value.startsWith('tile-'));
    const tileOptions = window.MahjongTileNames.entries.map(({ key, name }) => {
      const option = document.createElement('option');
      option.value = 'tile-' + key.toLowerCase();
      option.textContent = name;
      return option;
    });
    voiceCue.replaceChildren(...tileOptions, ...roundAndDealerOptions);
  }
  const descriptions = {
    jade: '玉環舒展，金箔隨牌勢散開。',
    ink: '墨筆橫掃，朱印落定，留白收勢。',
    neon: '光軌聚合，幾何線框亮起後消散。',
    off: '保留牌桌操作與文字紀錄，關閉裝飾特效。'
  };
  const effectKinds = {
    chow: 'chow', pong: 'pong', kong: 'kong', 'concealed-kong': 'concealedKong',
    flower: 'flower', ready: 'ready', win: 'win', 'self-draw': 'selfDraw', 'draw-game': 'drawGame'
  };
  // Sound starts on unless the player turned it off before; browsers still hold audio until the first click or key.
  let soundPreference = true;
  music.checked = true;
  voice.checked = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    soundPreference = saved.sound !== false;
    if (Object.hasOwn(descriptions, saved.style)) style.value = saved.style;
    if (typeof saved.volume === 'number' && Number.isFinite(saved.volume)) {
      volume.value = String(Math.max(0, Math.min(100, saved.volume)));
    }
    reduced.checked = saved.reduced === true;
    // Voice now starts on. Older saves recorded the old default as off, so only a save
    // made since this change (voiceChosen) counts as the player's own choice.
    voice.checked = saved.voiceChosen === true ? saved.voice === true : true;
    ambience.checked = saved.ambience === true;
    music.checked = saved.music !== false;
  } catch (_) { /* Storage may be disabled, or an old preference may be malformed. */ }

  function apply(save) {
    window.MahjongEffects?.setStyle(style.value);
    window.MahjongEffects?.setReduced(reduced.checked);
    document.documentElement.classList.toggle('feedback-reduced', reduced.checked);
    window.MahjongAudio?.setVolume(Number(volume.value) / 100);
    window.MahjongCultivationEffects?.syncPreferences();
    window.MahjongVoice?.setVolume(Number(volume.value) / 100);
    voiceEnabled = voice.checked;
    window.MahjongVoice?.setEnabled(soundEnabled && voiceEnabled);
    window.MahjongAudio?.setAmbience(ambience.checked);
    window.MahjongMusic?.setEnabled(music.checked);
    const effectDescription = document.getElementById('effectDescription');
    if (effectDescription) effectDescription.textContent = descriptions[style.value];
    document.getElementById('volumeValue').textContent = volume.value + '%';
    if (save) try {
      localStorage.setItem(key, JSON.stringify({ style: style.value, volume: Number(volume.value), reduced: reduced.checked, voice: voice.checked, voiceChosen: true, ambience: ambience.checked, music: music.checked, sound: soundEnabled }));
    } catch (_) { status.textContent = '本次設定已套用；瀏覽器未允許保存偏好。'; }
  }
  style.addEventListener('change', () => apply(true));
  volume.addEventListener('input', () => apply(true));
  reduced.addEventListener('change', () => apply(true));
  voice.addEventListener('change', () => apply(true));
  ambience.addEventListener('change', () => apply(true));
  music.addEventListener('change', () => apply(true));
  document.getElementById('previewFeedback').addEventListener('click', () => {
    window.MahjongVoice?.stopAll();
    const kind = effectKinds[cue.value];
    if (kind) showEffect(kind);
    if (soundEnabled && Number(volume.value) > 0) {
      playSound(cue.value);
      if (kind) playVoice(cue.value);
      status.textContent = '正在試聽 · ' + cue.selectedOptions[0].textContent;
    } else {
      status.textContent = kind ? '已預覽特效；開啟聲音並提高音量即可試聽。' : '此動作只有音效；開啟聲音並提高音量即可試聽。';
    }
  });
  document.getElementById('previewVoice').addEventListener('click', () => {
    if (soundEnabled && voiceEnabled && Number(volume.value) > 0) {
      window.MahjongVoice?.stopAll();
      playVoice(voiceCue.value, { heroId: previewHeroId() });
      status.textContent = '正在試聽語音 · ' + voiceCue.selectedOptions[0].textContent;
    } else status.textContent = '請開啟聲音、勾選語音，並提高音量後試聽。';
  });
  window.addEventListener('mahjong-voice-status', event => {
    if (event.detail.type !== 'error') return;
    const option = [...voiceCue.options, ...cue.options].find(item => item.value === event.detail.cue);
    status.textContent = '語音音檔暫時無法播放：' + (option?.textContent || '報牌') + '。請確認本機語音檔案與瀏覽器播放權限。';
  });
  document.getElementById('soundBtn').addEventListener('click', () => {
    status.textContent = soundEnabled ? '聲音已開啟，可選擇動作試聽。' : '聲音已關閉，特效仍可預覽。';
    apply(true);
  });
  apply(false);
  setSoundEnabled(soundPreference);
  window.MahjongFeedbackControls = Object.freeze({ syncMode: () => syncHeroCalls() });
})();
