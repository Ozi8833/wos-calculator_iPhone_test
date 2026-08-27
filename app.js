/* ==========================================================================
   Whiteout Survival Insertion Calculator & Multi-March Tracker (v10.0 Logic)
   ========================================================================== */

// --- Global Application State (v1.00.13) ---
const state = {
  timezone: 'UTC', // 'UTC' or 'LOCAL'
  syncOffsetMs: 0,
  mode: 'live', // 'live' or 'snapshot'
  audioUnlocked: false,
  audioCtx: null,
  marchList: [],
  history: [],
  enemyPresets: [],
  selectedGapIndex: 0,
  selectedGapKey: null,
  strategyNote: '',
  lastDeletedPreset: null,
  settings: {
    skipSplash: false,
    stickyHeader: true,
    showResultMetrics: true,
    customBg: '',
    themeBg: '#080c14',
    themeAccent: '#00f0ff',
    themeText: '#e6f1ff'
  },
  calc: {
    mode: 'normal',
    expression: '',
    tokens: []
  }
};

// --- Enemy Preset LocalStorage Helpers ---
function saveEnemyPreset(tag, name, marchSec) {
  if (!tag && !name) return;
  const key = `${tag.trim()}:${name.trim()}`;
  const existing = state.enemyPresets.find(p => p.key === key);
  if (!existing) {
    state.enemyPresets.unshift({ key, tag: tag.trim(), name: name.trim(), marchSec });
    if (state.enemyPresets.length > 20) state.enemyPresets.pop();
  } else {
    existing.marchSec = marchSec;
  }
  localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
}

function deleteSelectedPreset(marchId) {
  const cardElem = document.querySelector(`.march-card[data-id="${marchId}"]`);
  if (!cardElem) return;
  const selectElem = cardElem.querySelector('select');
  if (!selectElem || selectElem.value === '') {
    alert('削除するプリセットをドロップダウンから選択してください。');
    return;
  }
  const idx = parseInt(selectElem.value, 10);
  const deletedItem = state.enemyPresets.splice(idx, 1)[0];
  if (deletedItem) {
    state.lastDeletedPreset = deletedItem;
    state.marchList.forEach(m => {
      if (m.selectedPresetIndex === idx) delete m.selectedPresetIndex;
    });
    localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
    renderMarchCards();
    calculateInsertion();
    alert(`プリセット [${deletedItem.tag || ''}] ${deletedItem.name || ''} を削除しました！「↩️ 復元」ボタンで戻せます。`);
  }
}

function undoDeletePreset() {
  if (!state.lastDeletedPreset) {
    alert('復元できる直前の削除データはありません。');
    return;
  }
  const restored = state.lastDeletedPreset;
  state.enemyPresets.unshift(restored);
  state.lastDeletedPreset = null;
  localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
  renderMarchCards();
  calculateInsertion();
  alert(`プリセット [${restored.tag || ''}] ${restored.name || ''} を復元しました！`);
}

// --- Custom Preset Picker Modal Controller ---
let currentTargetMarchIdForPreset = null;
let presetSortMode = 'recent'; // 'recent' | 'tag' | 'name'

function setPresetSortMode(mode) {
  presetSortMode = mode;

  // Update sort button active states
  const btnRecent = document.getElementById('preset-sort-recent');
  const btnTag = document.getElementById('preset-sort-tag');
  const btnName = document.getElementById('preset-sort-name');

  if (btnRecent) btnRecent.className = `btn-game btn-xs ${mode === 'recent' ? 'btn-primary active' : 'btn-secondary'} preset-sort-btn`;
  if (btnTag) btnTag.className = `btn-game btn-xs ${mode === 'tag' ? 'btn-primary active' : 'btn-secondary'} preset-sort-btn`;
  if (btnName) btnName.className = `btn-game btn-xs ${mode === 'name' ? 'btn-primary active' : 'btn-secondary'} preset-sort-btn`;

  renderPresetPickerList();
}

function openPresetPickerModal(marchId) {
  currentTargetMarchIdForPreset = marchId;
  const modal = document.getElementById('preset-picker-modal');
  const listElem = document.getElementById('preset-picker-list');
  if (!modal || !listElem) return;

  renderPresetPickerList();
  modal.classList.add('open');
}

function closePresetPickerModal() {
  const modal = document.getElementById('preset-picker-modal');
  if (modal) modal.classList.remove('open');
}

function renderPresetPickerList() {
  const listElem = document.getElementById('preset-picker-list');
  if (!listElem) return;
  listElem.innerHTML = '';

  if (state.enemyPresets.length === 0) {
    listElem.innerHTML = `
      <div class="text-center text-gray-400 py-8 text-sm">
        保存済みの敵プリセットはありません。<br>
        「同盟タグ」「領主名」を入力後、<span class="text-amber-400 font-bold">「💾 保存」</span> ボタンを押すと登録されます。
      </div>
    `;
    return;
  }

  // Create indexed copy for sorting while retaining original array index for deletion
  let indexedPresets = state.enemyPresets.map((p, originalIdx) => ({ preset: p, originalIdx }));

  if (presetSortMode === 'tag') {
    indexedPresets.sort((a, b) => {
      const tagA = (a.preset.tag || '').toUpperCase();
      const tagB = (b.preset.tag || '').toUpperCase();
      return tagA.localeCompare(tagB, 'ja');
    });
  } else if (presetSortMode === 'name') {
    indexedPresets.sort((a, b) => {
      const nameA = (a.preset.name || '').toUpperCase();
      const nameB = (b.preset.name || '').toUpperCase();
      return nameA.localeCompare(nameB, 'ja');
    });
  }

  indexedPresets.forEach(({ preset: p, originalIdx }) => {
    const item = document.createElement('div');
    item.className = 'preset-item-card';
    item.innerHTML = `
      <div class="flex-1 cursor-pointer" onclick="selectPresetFromModal(${originalIdx})">
        <div class="font-bold text-cyan-300 text-sm flex items-center gap-2">
          ${p.tag ? `<span class="bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono">[${p.tag}]</span>` : ''}
          <span>${p.name || '領主名なし'}</span>
        </div>
        <div class="text-xs text-gray-400 font-mono mt-0.5">
          行軍時間: <span class="text-yellow-300 font-bold">${formatCountdownMMSSs(p.marchSec)}</span>
        </div>
      </div>
      <button class="preset-delete-btn" onclick="deletePresetFromModal(event, ${originalIdx})" title="このプリセットを削除">
        <i class="fa-solid fa-trash-can text-lg"></i>
      </button>
    `;
    listElem.appendChild(item);
  });
}

function selectPresetFromModal(presetIdx) {
  const p = state.enemyPresets[presetIdx];
  if (!p) return;

  const march = state.marchList.find(m => m.id === currentTargetMarchIdForPreset);
  if (march) {
    march.allianceTag = p.tag;
    march.governorName = p.name;
    march.marchTimeSec = p.marchSec;
    renderMarchCards();
    calculateInsertion();
  }
  closePresetPickerModal();
}

function deletePresetFromModal(event, presetIdx) {
  event.stopPropagation();
  const deletedItem = state.enemyPresets.splice(presetIdx, 1)[0];
  if (deletedItem) {
    state.lastDeletedPreset = deletedItem;
    localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
    renderPresetPickerList();
    renderMarchCards();
    calculateInsertion();
  }
}

function loadEnemyPresets() {
  const saved = localStorage.getItem('wos_enemy_presets');
  if (saved) {
    try { state.enemyPresets = JSON.parse(saved); } catch (e) {}
  }
  const savedNote = localStorage.getItem('wos_strategy_note');
  if (savedNote) state.strategyNote = savedNote;
}

// --- Dynamic March Management (v1.00.13 with Preset Buttons & Big Controls) ---
let marchIdCounter = 1;

function createMarchCardData(tag = '', name = '', marchSec = 90) {
  const id = marchIdCounter++;
  return {
    id: id,
    allianceTag: tag,
    governorName: name,
    rallyTimeSec: 300, // default 5m
    marchTimeSec: marchSec,
    isRunning: false,
    remainingRallySec: 300,
    hasBeenStarted: false
  };
}

function renderMarchCards() {
  const container = document.getElementById('march-list-container');
  container.innerHTML = '';

  state.marchList.forEach((march, index) => {
    const card = document.createElement('div');
    card.className = 'glass-card march-card';
    card.dataset.id = march.id;

    const isRunning = march.isRunning;

    // Preset dropdown options
    let presetOptionsHtml = '<option value="">-- 💾 プリセット呼出 --</option>';
    state.enemyPresets.forEach((p, pIdx) => {
      const isSelected = march.selectedPresetIndex === pIdx;
      presetOptionsHtml += `<option value="${pIdx}" ${isSelected ? 'selected' : ''}>[${p.tag}] ${p.name} (${formatCountdownMMSSs(p.marchSec)})</option>`;
    });

    const hideAdjust = state.settings.hideAdjustButtons || false;

    card.innerHTML = `
      <div class="march-header">
        <div class="march-title">
          <i class="fa-solid fa-crosshairs"></i> 相手 ${index + 1}
        </div>
        <div class="flex items-center gap-2">
          <!-- Adjust Buttons Toggle Button -->
          <button class="btn-game btn-xs btn-secondary flex items-center gap-1" onclick="toggleCardAdjustButtons()" title="調整ボタンの表示/非表示">
            <i class="fa-solid ${hideAdjust ? 'fa-sliders' : 'fa-sliders text-cyan-400'}"></i> ${hideAdjust ? '調整表示' : '調整隠す'}
          </button>
          <!-- Individual Start Button (no pause) -->
          ${march.isRunning ? `
            <span class="btn-game btn-xs btn-secondary" style="opacity:0.6;cursor:default;">
              <i class="fa-solid fa-circle-play mr-1"></i> 稼働中
            </span>
          ` : `
            <button class="btn-game btn-xs btn-primary" onclick="startMarchTimer(${march.id})">
              <i class="fa-solid fa-play mr-1"></i> スタート
            </button>
          `}
          ${state.marchList.length > 2 ? `
            <button class="btn-game btn-xs btn-danger" onclick="removeMarchCard(${march.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Quick Preset Selector Bar -->
      <div class="flex gap-1.5 mb-2">
        <button class="btn-game btn-xs btn-primary flex-1 justify-between px-3" style="min-height:36px;" onclick="openPresetPickerModal(${march.id})" title="敵プリセットを選択・管理">
          <span><i class="fa-solid fa-folder-open mr-1 text-yellow-300"></i> プリセット呼出 / 削除 (${state.enemyPresets.length}件)</span>
          <i class="fa-solid fa-chevron-down text-xs opacity-70"></i>
        </button>
        <button class="btn-game btn-xs btn-accent" style="min-height:36px;" onclick="saveCurrentMarchAsPreset(${march.id})" title="この編成を保存">
          <i class="fa-solid fa-floppy-disk mr-1"></i> 保存
        </button>
        ${state.lastDeletedPreset ? `
          <button class="btn-game btn-xs btn-secondary" style="min-height:36px;" onclick="undoDeletePreset()" title="直前に削除したデータを復元">
            <i class="fa-solid fa-rotate-left mr-1"></i> 復元
          </button>
        ` : ''}
      </div>

      <div class="form-grid">
        <div class="input-group">
          <label>同盟タグ</label>
          <input type="text" class="game-input alliance-input text-transform-uppercase" 
                 value="${march.allianceTag}" placeholder="ABC" 
                 oninput="this.value = this.value.toUpperCase(); updateMarchData(${march.id}, 'allianceTag', this.value)">
        </div>
        <div class="input-group">
          <label>領主名</label>
          <input type="text" class="game-input gov-input" 
                 value="${march.governorName}" placeholder="PlayerName"
                 oninput="updateMarchData(${march.id}, 'governorName', this.value)">
        </div>
      </div>

      <div class="time-input-row">
        <div class="input-group">
          <label>集結残り時間 (MM:SS)</label>
          <input type="text" class="game-input text-digital rally-input" 
                 value="${formatCountdownMMSSs(march.remainingRallySec)}" 
                 onchange="onRallyInputChange(${march.id}, this.value)">
        </div>
        <div class="input-group">
          <label>行軍時間 (MM:SS)</label>
          <input type="text" class="game-input text-digital march-input" 
                 value="${formatCountdownMMSSs(march.marchTimeSec)}" 
                 onchange="onMarchInputChange(${march.id}, this.value)">
        </div>
      </div>

      <div class="time-input-row">
        <div class="input-group">
          <label class="text-cyan-300 font-bold"><i class="fa-solid fa-bullseye"></i> 着弾時刻 (HH:MM:SS.s)</label>
          <input type="text" class="game-input text-digital land-time-input border-cyan-500/50" 
                 placeholder="例: 19:05:30.0"
                 value="${getProjectedLandTimeStr(march)}" 
                 onchange="onLandTimeInputChange(${march.id}, this.value)">
        </div>
      </div>

      <!-- Collapsible Adjust Buttons Section -->
      <div class="card-adjust-buttons-container ${hideAdjust ? 'hidden' : ''}">
        <!-- Direct Sync Minutes / Seconds Buttons -->
        <div class="text-xs font-extrabold text-cyan-400 mt-2 mb-1">🎯 ゲーム時刻 ダイレクト同期</div>
        <div class="grid grid-cols-6 gap-1 mb-1.5">
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 5)">5分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 4)">4分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 3)">3分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 2)">2分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 1)">1分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 0)">0分</button>
        </div>
        <div class="grid grid-cols-6 gap-1 mb-2">
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 50)">50s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 40)">40s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 30)">30s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 20)">20s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 10)">10s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 0)">0s</button>
        </div>

        <!-- Fine Millisecond Tuning Buttons (±1.0s / ±0.1s only) -->
        <div class="text-xs font-bold text-gray-400 mb-1">⏱ 秒 / コンマ秒 加算・減算</div>
        <div class="card-fine-tune">
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, -1.0)">◀ 1.0s</button>
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, -0.1)">◀ 0.1s</button>
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, 0.1)">0.1s ▶</button>
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, 1.0)">1.0s ▶</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  const countBadge = document.getElementById('march-count-badge');
  if (countBadge) {
    countBadge.textContent = state.marchList.length;
  }

  attachFocusAutoEndCursor();
}

function getProjectedLandDate(march) {
  if (march.targetLandDate) {
    return march.targetLandDate;
  }
  if (march.startTimestamp && march.initialRallySec !== undefined) {
    return new Date(march.startTimestamp + (march.initialRallySec + march.marchTimeSec) * 1000);
  }
  if (march.isRunning) {
    const refNow = getAdjustedNowTime();
    return new Date(refNow.getTime() + (march.remainingRallySec + march.marchTimeSec) * 1000);
  }
  if (!march.frozenLandDate) {
    const refNow = getAdjustedNowTime();
    march.frozenLandDate = new Date(refNow.getTime() + (march.remainingRallySec + march.marchTimeSec) * 1000);
  }
  return march.frozenLandDate;
}

function getProjectedLandTimeStr(march) {
  return formatTimeHHMMSSs(getProjectedLandDate(march));
}

function onLandTimeInputChange(marchId, valStr) {
  const march = state.marchList.find(m => m.id === marchId);
  if (!march || !valStr || !valStr.trim()) return;

  const rawStr = valStr.trim();
  const now = getAdjustedNowTime();
  const isUTC = state.timezone === 'UTC';
  let targetH = isUTC ? now.getUTCHours() : now.getHours();
  let targetM = isUTC ? now.getUTCMinutes() : now.getMinutes();
  let targetS = 0;
  let hasParsed = false;

  const parts = rawStr.split(':');
  if (parts.length === 3) {
    targetH = parseInt(parts[0], 10) || 0;
    targetM = parseInt(parts[1], 10) || 0;
    targetS = parseFloat(parts[2]) || 0;
    hasParsed = true;
  } else if (parts.length === 2) {
    targetM = parseInt(parts[0], 10) || 0;
    targetS = parseFloat(parts[1]) || 0;
    hasParsed = true;
  }

  if (hasParsed) {
    const targetLandDate = new Date(now);
    let secWhole = Math.floor(targetS);
    let secMs = Math.round((targetS - secWhole) * 1000);

    if (isUTC) {
      targetLandDate.setUTCHours(targetH, targetM, secWhole, secMs);
    } else {
      targetLandDate.setHours(targetH, targetM, secWhole, secMs);
    }

    if (targetLandDate.getTime() < now.getTime() - 60000) {
      if (isUTC) {
        targetLandDate.setUTCDate(targetLandDate.getUTCDate() + 1);
      } else {
        targetLandDate.setDate(targetLandDate.getDate() + 1);
      }
    }

    march.targetLandDate = targetLandDate;
    delete march.frozenLandDate;
    delete march.startTimestamp;
    delete march.initialRallySec;
    march.hasBeenStarted = false;

    const totalNeededSec = (targetLandDate.getTime() - now.getTime()) / 1000;
    const rallySecNeeded = Math.max(0, totalNeededSec - march.marchTimeSec);
    march.remainingRallySec = rallySecNeeded;

    renderMarchCards();
    calculateInsertion();
  }
}

function startMarchTimer(id, skipRender = false) {
  initAudio();
  const march = state.marchList.find(m => m.id === id);
  if (march && !march.isRunning) {
    const now = getAdjustedNowTime();
    if (march.targetLandDate) {
      // If targetLandDate is locked, recalculate remainingRallySec at exact start time
      const totalNeededSec = (march.targetLandDate.getTime() - now.getTime()) / 1000;
      march.remainingRallySec = Math.max(0, totalNeededSec - march.marchTimeSec);
    } else {
      // Clear frozenLandDate so getProjectedLandDate computes live dynamically while running
      delete march.frozenLandDate;
    }
    march.isRunning = true;
    march.hasBeenStarted = true;
    march.startTimestamp = now.getTime();
    march.initialRallySec = march.remainingRallySec;
    delete march.marchRemainingToLand;
    if (!skipRender) {
      renderMarchCards();
      calculateInsertion();
    }
  }
}

function saveMyMarchTime(valStr) {
  if (!valStr) return;
  localStorage.setItem('wos_my_march_time', valStr);
}

function loadMyMarchTime() {
  const saved = localStorage.getItem('wos_my_march_time');
  if (saved) {
    const simpleMyInput = document.getElementById('simple-my-march');
    if (simpleMyInput) {
      simpleMyInput.value = saved;
    }
    const myInput = document.getElementById('my-march-time');
    if (myInput) {
      myInput.value = saved;
    }
  }
}

function addMarchCard(tag = '', name = '') {
  state.marchList.push(createMarchCardData(tag, name));
  renderMarchCards();
  calculateInsertion();
}

function removeMarchCard(id) {
  if (state.marchList.length <= 2) return;
  state.marchList = state.marchList.filter(m => m.id !== id);
  delete state.selectedGapKey;
  state.selectedGapIndex = 0;
  renderMarchCards();
  calculateInsertion();
}

function applyEnemyPresetToMarch(marchId, presetIndex) {
  if (presetIndex === '') return;
  const idx = parseInt(presetIndex, 10);
  const p = state.enemyPresets[idx];
  if (!p) return;
  const march = state.marchList.find(m => m.id === marchId);
  if (march) {
    march.allianceTag = p.tag;
    march.governorName = p.name;
    march.marchTimeSec = p.marchSec;
    march.selectedPresetIndex = idx;
    renderMarchCards();
    calculateInsertion();
  }
}

function saveCurrentMarchAsPreset(marchId) {
  const march = state.marchList.find(m => m.id === marchId);
  if (!march) return;

  const cardElem = document.querySelector(`.march-card[data-id="${marchId}"]`);
  let tag = march.allianceTag;
  let name = march.governorName;

  if (cardElem) {
    const tagInput = cardElem.querySelector('.alliance-input');
    const nameInput = cardElem.querySelector('.gov-input');
    if (tagInput && tagInput.value) tag = tagInput.value.trim().toUpperCase();
    if (nameInput && nameInput.value) name = nameInput.value.trim();
  }

  if (tag || name) {
    march.allianceTag = tag;
    march.governorName = name;
    saveEnemyPreset(tag, name, march.marchTimeSec);
    renderMarchCards();
    calculateInsertion();
    alert(`敵プリセット [${tag || ''}] ${name || ''} を正常に保存しました！`);
  } else {
    alert('保存するには同盟タグまたは領主名を入力してください。');
  }
}

function clearAllMarches() {
  if (confirm('追加されている相手行軍を初期状態（相手1・相手2）に一括リセットしますか？')) {
    state.marchList = [
      createMarchCardData('', ''),
      createMarchCardData('', '')
    ];
    state.selectedGapIndex = 0;
    renderMarchCards();
    calculateInsertion();
  }
}

// --- Web Audio API Alert Beep Generator ---
function initAudio() {
  try {
    if (!state.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        state.audioCtx = new AudioCtxClass();
      }
    }
    if (state.audioCtx) {
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }
      // iOS Mobile Safari audio unlock: Play a 1-sample silent buffer synchronously
      if (!state.audioUnlocked) {
        const buffer = state.audioCtx.createBuffer(1, 1, 22050);
        const source = state.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(state.audioCtx.destination);
        source.start(0);
        state.audioUnlocked = true;
        console.log('🔊 AudioContext unlocked successfully with iOS silent buffer');
      }
    }
    requestScreenWakeLock();
  } catch (e) {
    console.warn('initAudio error:', e);
  }
}

function playBeep(freq = 880, type = 'sine', duration = 0.15) {
  if (!state.audioCtx || !state.audioUnlocked) return;
  try {
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.start();
    osc.stop(state.audioCtx.currentTime + duration);
  } catch (e) {
    console.error('Audio play error', e);
  }
}


// --- Screen Wake Lock Manager (v1.05.01) ---
let wakeLockInstance = null;

async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLockInstance) {
      wakeLockInstance = await navigator.wakeLock.request('screen');
      console.log('💡 Screen WakeLock acquired: Display will stay on');
      wakeLockInstance.addEventListener('release', () => {
        wakeLockInstance = null;
        console.log('💡 Screen WakeLock released');
      });
    }
  } catch (err) {
    console.warn('WakeLock request failed or unsupported:', err);
  }
}

async function releaseScreenWakeLock() {
  if (wakeLockInstance) {
    try {
      await wakeLockInstance.release();
    } catch (e) {}
    wakeLockInstance = null;
  }
}

// Re-acquire wake lock on visibility change (when user returns to app)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    if (simpleLaunchState.isRunning) {
      await requestScreenWakeLock();
    }
  }
});

// --- Toast / Snackbar Notification Helper (v1.05.01) ---
function showToast(message, type = 'success', duration = 2200) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); z-index: 999999; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 90vw; width: max-content;';
    document.body.appendChild(container);
  }

  // Clear existing toasts for instant responsive feel on repeated clicks
  container.innerHTML = '';

  const toast = document.createElement('div');
  let iconHtml = '<i class="fa-solid fa-circle-check text-green-400"></i>';
  if (type === 'warn') iconHtml = '<i class="fa-solid fa-triangle-exclamation text-yellow-400"></i>';
  if (type === 'error') iconHtml = '<i class="fa-solid fa-circle-xmark text-red-400"></i>';
  if (type === 'info') iconHtml = '<i class="fa-solid fa-circle-info text-cyan-400"></i>';

  toast.className = `toast-item toast-${type} show`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0) scale(1)';
  toast.innerHTML = `${iconHtml} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, duration);
}

// --- Vibration Feedback Helper (v1.05.01) ---
function triggerVibration(pattern) {
  try {
    if ('vibrate' in navigator && isSimpleVibrationEnabled) {
      navigator.vibrate(pattern);
    }
  } catch (e) {}
}

// --- Time Utilities (0.1s Precision) ---
function getAdjustedNowTime() {
  return new Date(Date.now() + state.syncOffsetMs);
}

function formatTimeHHMMSSs(dateObj) {
  let d = dateObj || getAdjustedNowTime();
  let hours = state.timezone === 'UTC' ? d.getUTCHours() : d.getHours();
  let minutes = state.timezone === 'UTC' ? d.getUTCMinutes() : d.getMinutes();
  let seconds = state.timezone === 'UTC' ? d.getUTCSeconds() : d.getSeconds();
  let ms = state.timezone === 'UTC' ? d.getUTCMilliseconds() : d.getMilliseconds();
  let sFraction = Math.floor(ms / 100);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${sFraction}`;
}

function isNegativeTimeRaw(str) {
  if (!str) return false;
  return String(str).trim().includes('-');
}

function parseSecondsFromMMSS(str) {
  if (!str) return 0;
  let sStr = String(str).trim();
  let parts = sStr.split(':');
  let totalSec = 0;
  if (parts.length >= 2) {
    let m = Math.abs(parseFloat(parts[0])) || 0;
    let s = Math.abs(parseFloat(parts[1])) || 0;
    totalSec = m * 60 + s;
  } else {
    totalSec = Math.abs(parseFloat(sStr)) || 0;
  }
  return isNaN(totalSec) || totalSec < 0 ? 0 : Math.round(totalSec * 10) / 10;
}

function parseSecondsFromHHMMSS(str) {
  if (!str) return 0;
  let parts = String(str).trim().split(':');
  let totalSec = 0;
  if (parts.length === 3) {
    let h = Math.abs(parseFloat(parts[0])) || 0;
    let m = Math.abs(parseFloat(parts[1])) || 0;
    let s = Math.abs(parseFloat(parts[2])) || 0;
    totalSec = h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    let m = Math.abs(parseFloat(parts[0])) || 0;
    let s = Math.abs(parseFloat(parts[1])) || 0;
    totalSec = m * 60 + s;
  } else {
    totalSec = Math.abs(parseFloat(str)) || 0;
  }
  return isNaN(totalSec) || totalSec < 0 ? 0 : Math.round(totalSec * 10) / 10;
}

function formatCountdownMMSS(totalSec) {
  totalSec = Math.round(totalSec * 10) / 10;
  if (totalSec < 0) totalSec = 0;
  let m = Math.floor(totalSec / 60);
  let s = Math.floor(totalSec % 60);
  if (s >= 60) {
    m += 1;
    s = 0;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimeHHMMSS(dateObj) {
  let d = dateObj || getAdjustedNowTime();
  let hours = state.timezone === 'UTC' ? d.getUTCHours() : d.getHours();
  let minutes = state.timezone === 'UTC' ? d.getUTCMinutes() : d.getMinutes();
  let seconds = state.timezone === 'UTC' ? d.getUTCSeconds() : d.getSeconds();

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatCountdownMMSSs(totalSec) {
  totalSec = Math.round(totalSec * 10) / 10;
  if (totalSec < 0) totalSec = 0;
  let m = Math.floor(totalSec / 60);
  let s = Math.floor(totalSec % 60);
  let frac = Math.round((totalSec % 1) * 10);
  if (frac >= 10) {
    s += 1;
    frac = 0;
  }
  if (s >= 60) {
    m += 1;
    s = 0;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${frac}`;
}

// --- Cursor Auto-Move to End on Focus ---
function attachFocusAutoEndCursor() {
  document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    input.addEventListener('focus', (e) => {
      let val = e.target.value;
      setTimeout(() => {
        if (typeof e.target.setSelectionRange === 'function') {
          e.target.setSelectionRange(val.length, val.length);
        }
      }, 0);
    });
  });
}

function onRallyInputChange(id, valStr) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    item.remainingRallySec = parseSecondsFromMMSS(valStr);
    renderMarchCards();
    calculateInsertion();
  }
}

function onMarchInputChange(id, valStr) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    item.marchTimeSec = parseSecondsFromMMSS(valStr);
    renderMarchCards();
    calculateInsertion();
  }
}

function adjustMarchTimer(id, deltaSec) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    const nextVal = item.remainingRallySec + deltaSec;
    item.remainingRallySec = Math.max(0, Math.round(nextVal * 10) / 10);
    renderMarchCards();
    calculateInsertion();
  }
}

function setMarchRallyMinute(id, targetMinute) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    const currentSecs = item.remainingRallySec % 60;
    item.remainingRallySec = Math.round((targetMinute * 60 + currentSecs) * 10) / 10;
    renderMarchCards();
    calculateInsertion();
  }
}

function setMarchRallySecond(id, targetSecond) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    const currentMins = Math.floor(item.remainingRallySec / 60);
    item.remainingRallySec = Math.round((currentMins * 60 + targetSecond + 0.9) * 10) / 10;
    renderMarchCards();
    calculateInsertion();
  }
}

// --- History Storage & Auto Complete ---
function saveEnemyHistory(tag, name) {
  if (!tag && !name) return;
  const key = `${tag.trim()}:${name.trim()}`;
  if (!state.history.some(h => h.key === key)) {
    state.history.unshift({ key, tag: tag.trim(), name: name.trim(), timestamp: Date.now() });
    if (state.history.length > 20) state.history.pop();
    localStorage.setItem('wos_enemy_history', JSON.stringify(state.history));
  }
}

function loadEnemyHistory() {
  const saved = localStorage.getItem('wos_enemy_history');
  if (saved) {
    try { state.history = JSON.parse(saved); } catch (e) {}
  }
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.history.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-4 text-xs">保存された履歴はありません</div>';
    return;
  }

  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-black/40 p-2 rounded border border-cyan-900/40 text-xs cursor-pointer hover:border-cyan-400';
    div.innerHTML = `
      <div>
        <span class="font-bold text-yellow-400">[${item.tag || '??? '}]</span>
        <span class="text-gray-200 ml-1">${item.name || '不明'}</span>
      </div>
      <button class="btn-game btn-xs btn-primary">適用</button>
    `;
    div.onclick = () => {
      addMarchCard(item.tag, item.name);
      closeHistoryModal();
    };
    container.appendChild(div);
  });
}

// --- Insertion Calculation & Risk Engine (v1.00.13 with Auto-Sort & Multi-Gap Selection) ---
let lastBeepSec = -1;

function calculateInsertion() {
  if (state.marchList.length < 2) return;

  const now = getAdjustedNowTime();

  // 1. Calculate projected land Date for ALL marches using unified helper
  const marchLandData = state.marchList.map((m, originalIdx) => {
    let landDate;
    if (state.mode === 'live') {
      landDate = getProjectedLandDate(m);
    } else {
      const baseStr = document.getElementById('snapshot-base-time').value || '12:00:00';
      const baseSec = parseSecondsFromHHMMSS(baseStr);
      const baseDate = new Date(now);
      baseDate.setUTCHours(Math.floor(baseSec / 3600), Math.floor((baseSec % 3600) / 60), Math.floor(baseSec % 60), 0);
      landDate = new Date(baseDate.getTime() + (m.remainingRallySec + m.marchTimeSec) * 1000);
    }
    return {
      march: m,
      originalIdx: originalIdx,
      landDate: landDate
    };
  });

  // 2. Auto-Sort Marches by Chronological Landing Time
  const sortedLandData = [...marchLandData].sort((a, b) => a.landDate.getTime() - b.landDate.getTime());

  // Check if order is inverted compared to input list
  let isOrderInverted = false;
  for (let i = 0; i < sortedLandData.length; i++) {
    if (sortedLandData[i].originalIdx !== i) {
      isOrderInverted = true;
      break;
    }
  }

  const sortNoticeElem = document.getElementById('auto-sort-notice');
  if (sortNoticeElem) {
    const sequenceStr = sortedLandData.map(d => `相手 ${d.originalIdx + 1}`).join(' ➔ ');
    sortNoticeElem.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> 着弾順を自動整列中 (実際の到達順: ${sequenceStr})`;
    sortNoticeElem.classList.toggle('hidden', !isOrderInverted);
  }

  // 3. Build Available Gaps (Between Adjacent Sorted Marches)
  const myMarchStr = document.getElementById('my-march-time').value || '01:30';
  const myMarchSec = parseSecondsFromMMSS(myMarchStr);

  const allGaps = [];
  for (let i = 0; i < sortedLandData.length - 1; i++) {
    const e1 = sortedLandData[i];
    const e2 = sortedLandData[i + 1];
    const deltaSec = Math.max(0, (e2.landDate.getTime() - e1.landDate.getTime()) / 1000);
    
    // Both marches in gap MUST be currently actively running for gap to be actively running
    const gapBothRunning = e1.march.isRunning && e2.march.isRunning;

    // Both marches in gap started check
    const gapBothStarted = (e1.march.hasBeenStarted || e1.march.isRunning) && 
                           (e2.march.hasBeenStarted || e2.march.isRunning);

    // Latest launch max date for this specific gap (launch deadline)
    const launchMaxDate = new Date(e2.landDate.getTime() - 300 - myMarchSec * 1000);
    // Gap is expired when both marches were started AND current time has passed the latest launch deadline
    const isExpired = gapBothStarted && (now.getTime() >= launchMaxDate.getTime());

    // Both marches started AND currently inside valid active launch window (before deadline)
    const gapBothStartedActive = gapBothStarted && !isExpired && (e1.landDate.getTime() > now.getTime() || e2.landDate.getTime() > now.getTime());

    let riskLevel = 'safe';
    let riskIcon = '🟢';
    if (deltaSec < 1.1) { riskLevel = 'danger'; riskIcon = '🔴'; }
    else if (deltaSec < 3.0) { riskLevel = 'warn'; riskIcon = '🟡'; }

    const gapKey = `${e1.originalIdx}_${e2.originalIdx}`;

    allGaps.push({
      index: i,
      gapKey: gapKey,
      rank1: i + 1,
      rank2: i + 2,
      enemy1: e1,
      enemy2: e2,
      deltaSec: deltaSec,
      riskLevel: riskLevel,
      riskIcon: riskIcon,
      isExpired: isExpired,
      bothRunning: gapBothRunning,
      bothStarted: gapBothStartedActive
    });
  }

  // Filter Gaps (v1.01.04 Dual-Protection Architecture):
  // 1. Active Gaps: Both marches were started AND BOTH still active (future landDate) AND launch deadline not passed
  let displayGaps = allGaps.filter(g => g.bothStarted && !g.isExpired);

  // 2. Exception Rule (Action A): If current user selected gap has become EXPIRED, keep it visible in displayGaps
  if (state.selectedGapKey) {
    const selectedExpiredGap = allGaps.find(g => g.gapKey === state.selectedGapKey && g.isExpired);
    if (selectedExpiredGap && !displayGaps.some(g => g.gapKey === state.selectedGapKey)) {
      displayGaps.unshift(selectedExpiredGap);
    }
  }

  // 3. Fallback Rule: Fallback to allGaps for static display ONLY if ALL marches are currently unstarted/idle
  const anyMarchRunning = state.marchList.some(m => m.isRunning);
  if (displayGaps.length === 0 && !anyMarchRunning) {
    displayGaps = allGaps;
  }

  // Selection Logic (v1.01.00 Rule):
  // 1. If state.selectedGapKey exists in displayGaps, maintain selection
  // 2. Otherwise (initial or after deletion), auto-select earliest landing gap (displayGaps[0])
  let activeGapIndex = -1;
  if (state.selectedGapKey) {
    activeGapIndex = displayGaps.findIndex(g => g.gapKey === state.selectedGapKey);
  }

  if (activeGapIndex >= 0) {
    state.selectedGapIndex = activeGapIndex;
  } else {
    state.selectedGapIndex = 0;
    if (displayGaps[0]) {
      state.selectedGapKey = displayGaps[0].gapKey;
    }
  }

  // Render Gap Selector Tabs (Big Buttons)
  renderGapSelectorTabs(displayGaps);

  const activeGap = displayGaps[state.selectedGapIndex] || displayGaps[0];
  const enemy1 = activeGap.enemy1;
  const enemy2 = activeGap.enemy2;
  const enemy1LandDate = enemy1.landDate;
  const enemy2LandDate = enemy2.landDate;
  const gapDeltaSec = activeGap.deltaSec;

  // Update Target Labels (Show rank + enemy number)
  document.getElementById('label-target-enemy1').textContent = `${activeGap.rank1}着 (相手 ${enemy1.originalIdx + 1}) 着弾:`;
  document.getElementById('label-target-enemy2').textContent = `${activeGap.rank2}着 (相手 ${enemy2.originalIdx + 1}) 着弾:`;

  // Earliest Launch (Enemy 1 + 0.3s)
  const launchMinDate = new Date(enemy1LandDate.getTime() + 300 - myMarchSec * 1000);
  // Latest Launch (Enemy 2 - 0.3s)
  const launchMaxDate = new Date(enemy2LandDate.getTime() - 300 - myMarchSec * 1000);
  // Middle Recommended Launch
  const launchMidDate = new Date(launchMinDate.getTime() + (launchMaxDate.getTime() - launchMinDate.getTime()) / 2);

  // Window Span in seconds (max - min)
  const windowSpanSec = Math.max(0, (launchMaxDate.getTime() - launchMinDate.getTime()) / 1000);

  // Countdown to Earliest Launch
  const launchMinCountdownSec = (launchMinDate.getTime() - now.getTime()) / 1000;
  const launchMaxCountdownSec = (launchMaxDate.getTime() - now.getTime()) / 1000;

  // Update UI Elements
  document.getElementById('res-enemy1-land').textContent = formatTimeHHMMSSs(enemy1LandDate);
  document.getElementById('res-enemy2-land').textContent = formatTimeHHMMSSs(enemy2LandDate);
  document.getElementById('res-gap-delta').textContent = `${gapDeltaSec.toFixed(1)}s`;
  document.getElementById('res-window-span').textContent = `${windowSpanSec.toFixed(1)}秒間`;

  document.getElementById('res-launch-min').textContent = formatTimeHHMMSSs(launchMinDate);
  document.getElementById('res-launch-mid').textContent = formatTimeHHMMSSs(launchMidDate);
  document.getElementById('res-launch-max').textContent = formatTimeHHMMSSs(launchMaxDate);

  // Main scheduled launch time display set to Earliest Launch
  document.getElementById('launch-scheduled-time').textContent = formatTimeHHMMSSs(launchMinDate);

  const countdownElem = document.getElementById('launch-countdown');
  const miniTimerElem = document.getElementById('mini-launch-timer');
  const miniTimeElem = document.getElementById('mini-launch-time');
  const miniHeaderElem = document.getElementById('header-mini-launch');
  const miniFillElem = document.getElementById('mini-launch-fill');
  const statusElem = document.getElementById('window-status-text');
  const fillElem = document.getElementById('launch-window-fill');

  const miniSelectedGapElem = document.getElementById('mini-selected-gap');
  if (miniSelectedGapElem) {
    miniSelectedGapElem.innerHTML = `🎯 <span>相手${enemy1.originalIdx + 1}➔相手${enemy2.originalIdx + 1} (${gapDeltaSec.toFixed(1)}s)</span>`;
  }

  if (miniTimeElem) {
    miniTimeElem.textContent = formatTimeHHMMSSs(launchMinDate);
  }

  const isGapStarted = (enemy1.march.hasBeenStarted || enemy1.march.isRunning) && (enemy2.march.hasBeenStarted || enemy2.march.isRunning);
  const isPastDeadline = (launchMaxCountdownSec <= 0);

  // Set Main Countdown Text & Status Bar State (Clean Unified Architecture)
  if (!isGapStarted) {
    // 1. UNSTARTED WAITING STATE: Both marches have not been started yet
    const staticMinCountdownSec = (enemy1.march.remainingRallySec + enemy1.march.marchTimeSec + 0.3) - myMarchSec;
    const staticCountdownStr = formatCountdownMMSSs(Math.max(0, staticMinCountdownSec));
    countdownElem.textContent = staticCountdownStr;
    miniTimerElem.textContent = staticCountdownStr;
    statusElem.className = "text-xs text-center font-bold text-cyan-300 mt-1";
    statusElem.textContent = `⏸ タイマー待機中 (対象相手の「▶ スタート」で進行します)`;
    fillElem.style.left = '0%';
    fillElem.style.width = '0%';
    if (miniFillElem) miniFillElem.style.width = '0%';
    miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-300 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/30";
  } else if (isPastDeadline) {
    // 2. EXPIRED STATE: Marches were started, and current time has passed latest launch deadline
    countdownElem.textContent = "00:00.0";
    miniTimerElem.textContent = "00:00.0";
    statusElem.className = "text-xs text-center font-bold text-red-400 mt-1";
    statusElem.textContent = `❌ 発車タイミングを過ぎました`;
    miniHeaderElem.className = "mt-1 text-xs font-bold text-red-400 contrast-plate px-2 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10";
    fillElem.style.left = '0%';
    fillElem.style.width = '100%';
    if (miniFillElem) miniFillElem.style.width = '100%';
  } else {
    // 3. ACTIVE COUNTDOWN STATE: Marches were started, and deadline is in the future
    const displayCountdownSec = Math.max(0, launchMinCountdownSec);
    const countdownStr = formatCountdownMMSSs(displayCountdownSec);
    countdownElem.textContent = countdownStr;
    miniTimerElem.textContent = countdownStr;

    if (launchMinCountdownSec > 0) {
      // Before earliest launch
      statusElem.className = "text-xs text-center font-bold text-green-300 mt-1";
      statusElem.textContent = `🟢 最速発車まで あと ${formatCountdownMMSSs(launchMinCountdownSec)} (猶予 ${windowSpanSec.toFixed(1)}秒間)`;
      fillElem.style.left = '0%';
      fillElem.style.width = '0%';
      if (miniFillElem) miniFillElem.style.width = '0%';
      miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-300 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/30";
    } else {
      // Currently INSIDE the launch window!
      statusElem.className = "text-xs text-center font-bold text-yellow-300 animate-pulse mt-1";
      statusElem.textContent = `🔥【今すぐ発車可能！】 締め切りまで 残り ${launchMaxCountdownSec.toFixed(1)}秒！`;
      miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-400 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/50 bg-yellow-500/20 animate-pulse";

      // Fill from left to right as time passes inside window (0% -> 100%)
      let elapsedTimeInWindow = windowSpanSec - launchMaxCountdownSec;
      let percentFilled = Math.max(0, Math.min(100, (elapsedTimeInWindow / windowSpanSec) * 100));
      fillElem.style.left = '0%';
      fillElem.style.width = `${percentFilled}%`;
      if (miniFillElem) miniFillElem.style.width = `${percentFilled}%`;
    }
  }

  // Countdown Alert Color Changes (5s / 3s) & Audio Beep (Only when started)
  countdownElem.classList.remove('warning-5s', 'danger-3s');

  if (isGapStarted && !isPastDeadline) {
    const targetTriggerSec = (launchMinCountdownSec > 0) ? launchMinCountdownSec : launchMaxCountdownSec;

    if (targetTriggerSec <= 5 && targetTriggerSec > 3) {
      countdownElem.classList.add('warning-5s');
    } else if (targetTriggerSec <= 3 && targetTriggerSec > 0) {
      countdownElem.classList.add('danger-3s');
    }

    // Audio Beep Notification (plays at 5, 4, 3, 2, 1, 0)
    const currentWholeSec = Math.floor(targetTriggerSec);
    if (targetTriggerSec <= 5 && targetTriggerSec >= 0 && currentWholeSec !== lastBeepSec) {
      lastBeepSec = currentWholeSec;
      playBeep(currentWholeSec === 0 ? 1200 : (currentWholeSec <= 3 ? 980 : 880), 'sine', 0.18);
    }
  }

  // Risk Level Auto Assessment (Only displayed when active / valid)
  const riskBadge = document.getElementById('risk-badge');
  
  if (!isGapStarted || launchMaxCountdownSec < 0) {
    // Hide risk badge when not started or when launch deadline has passed
    riskBadge.style.display = 'none';
  } else {
    riskBadge.style.display = 'inline-flex';
    riskBadge.className = 'risk-badge safe-text';

    if (gapDeltaSec >= 3.0) {
      riskBadge.classList.add('risk-safe');
      riskBadge.innerHTML = `<i class="fa-solid fa-shield-check"></i> 🟢 安全 (発車猶予 ${windowSpanSec.toFixed(1)}s 成功率極高)`;
    } else if (gapDeltaSec >= 1.1) {
      riskBadge.classList.add('risk-warn');
      riskBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 🟡 注意 (発車猶予 ${windowSpanSec.toFixed(1)}s 微調整推奨)`;
    } else {
      riskBadge.classList.add('risk-danger');
      riskBadge.innerHTML = `<i class="fa-solid fa-radiation"></i> 🔴 危険 (着弾差 ${gapDeltaSec.toFixed(1)}s - 同秒判定重複リスク)`;
    }
  }
}

// Cache key for gap tabs DOM diffing
let lastGapsSignature = '';

// Render Multi-March Gap Selector Tab Buttons
function renderGapSelectorTabs(gaps) {
  const container = document.getElementById('gap-selector-container');
  if (!container) return;

  const currentSig = gaps.map(g => `${g.rank1}:${g.enemy1.originalIdx}-${g.rank2}:${g.enemy2.originalIdx}-${g.deltaSec.toFixed(1)}-exp:${g.isExpired}`).join('|') + `_sel:${state.selectedGapIndex}`;
  if (currentSig === lastGapsSignature && container.children.length === gaps.length) {
    return; // Skip DOM recreation if unchanged
  }
  lastGapsSignature = currentSig;
  container.innerHTML = '';

  gaps.forEach((gap, idx) => {
    const btn = document.createElement('button');
    const isActive = idx === state.selectedGapIndex;
    const isExpired = gap.isExpired;

    btn.className = `gap-tab-btn ${isActive ? 'active' : ''} ${isExpired ? 'expired' : ''}`;

    btn.innerHTML = `
      ${isActive ? '🎯 ' : ''}相手${gap.enemy1.originalIdx + 1} <i class="fa-solid fa-arrow-right-long text-xs text-cyan-400 mx-1"></i> 相手${gap.enemy2.originalIdx + 1}
      <span class="ml-1 font-mono">${gap.deltaSec.toFixed(1)}s ${isExpired ? '🏁 経過済' : gap.riskIcon}</span>
    `;

    const selectHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.selectedGapIndex = idx;
      state.selectedGapKey = gap.gapKey;
      lastGapsSignature = ''; // Force redraw on click
      calculateInsertion();
    };
    btn.addEventListener('click', selectHandler);
    btn.addEventListener('pointerdown', selectHandler);

    container.appendChild(btn);
  });
}

// --- Mode Switcher ---
function setMode(modeName) {
  state.mode = modeName;
  document.getElementById('mode-tab-live').classList.toggle('active', modeName === 'live');
  document.getElementById('mode-tab-snapshot').classList.toggle('active', modeName === 'snapshot');
  document.getElementById('snapshot-panel').classList.toggle('hidden', modeName !== 'snapshot');
  calculateInsertion();
}

// --- Global Clock Loop ---
function startClockLoop() {
  setInterval(() => {
    // Update live clock display
    try {
      const now = getAdjustedNowTime();
      const clockElem = document.getElementById('live-clock');
      if (clockElem) {
        clockElem.textContent = formatTimeHHMMSSs(now);
      }
    } catch (e) {
      console.error('Clock display error:', e);
    }

    // Update active timers if live mode is counting down
    if (state.mode === 'live') {
      let cardStateChanged = false;
      state.marchList.forEach(m => {
        if (m.isRunning) {
          if (m.remainingRallySec > 0) {
            m.remainingRallySec = Math.max(0, Math.round((m.remainingRallySec - 0.1) * 10) / 10);
            if (m.remainingRallySec <= 0) {
              m.remainingRallySec = 0;
              m.isRunning = false;
              cardStateChanged = true;
            }
          } else {
            m.isRunning = false;
            cardStateChanged = true;
          }
        }
      });

      if (cardStateChanged) {
        renderMarchCards();
      }

      // Update inputs without disrupting focus
      document.querySelectorAll('.rally-input').forEach((input, index) => {
        if (document.activeElement !== input && state.marchList[index]) {
          input.value = formatCountdownMMSSs(state.marchList[index].remainingRallySec);
        }
      });
      document.querySelectorAll('.land-time-input').forEach((input, index) => {
        if (document.activeElement !== input && state.marchList[index]) {
          input.value = getProjectedLandTimeStr(state.marchList[index]);
        }
      });
    }

    try {
      calculateInsertion();
      updateSimpleCountdown();
    } catch (e) {
      console.error('Calculate insertion error:', e);
    }
  }, 100);
}

// --- Alliance Chat Copy Format & Modular Text Generator (v1.02.26) ---
function buildAllianceChatText(mode, data) {
  const tzStr = state.timezone === 'UTC' ? 'UTC' : 'JST';
  if (mode === 'simple') {
    const statusModeName = data.statusMode === 'rally' ? '相手集結中' : '相手行軍中';
    return `⚔️【ホワサバ 差し込み発車指示】 (${tzStr})
🎯 モード：${statusModeName}
⏰ 自分の発車予定時刻：${data.launchTimeStr} (${tzStr})
🚀 発車まであと：${data.countdownStr}
※相手着弾直後 (0.3秒後) に合わせた自動計算指示です。`;
  }

  // Default multi-march format
  return `⚔️【差し込み防衛通知】 (${tzStr})
敵1: ${data.e1Tag}${data.e1Name} (着弾 ${data.e1Land})
敵2: ${data.e2Tag}${data.e2Name} (着弾 ${data.e2Land})
-----------------------------------
🎯 発車猶予ウィンドウ: ${data.windowSpan}
・最速発車: ${data.launchMin}
・推奨中央: ${data.launchMid} (カウント ${data.countdown})
・最遅発車: ${data.launchMax}`;
}

function copySimpleAllianceChat() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.targetLaunchDate) {
    alert('「差し込み計算スタート！」を押して計算を完了させてからコピーしてください。');
    return;
  }

  const launchTimeStr = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  const now = getAdjustedNowTime();
  const diffSec = Math.max(0, (simpleLaunchState.targetLaunchDate.getTime() - now.getTime()) / 1000);
  const countdownStr = formatCountdownMMSSs(diffSec);

  const text = buildAllianceChatText('simple', {
    statusMode: simpleLaunchState.statusMode,
    launchTimeStr: launchTimeStr,
    countdownStr: countdownStr
  });

  navigator.clipboard.writeText(text).then(() => {
    alert('同盟チャット用指示文をクリップボードにコピーしました！');
  }).catch(err => {
    console.error('Clipboard copy error:', err);
    alert('コピーに失敗しました。');
  });
}

function copyChatFormat() {
  const e1 = state.marchList[0] || {};
  const e2 = state.marchList[1] || {};

  const e1Tag = e1.allianceTag ? `[${e1.allianceTag}] ` : '';
  const e1Name = e1.governorName || '敵1';
  const e2Tag = e2.allianceTag ? `[${e2.allianceTag}] ` : '';
  const e2Name = e2.governorName || '敵2';

  const e1Land = document.getElementById('res-enemy1-land')?.textContent || '--:--:--';
  const e2Land = document.getElementById('res-enemy2-land')?.textContent || '--:--:--';
  const launchMin = document.getElementById('res-launch-min')?.textContent || '--:--:--';
  const launchMid = document.getElementById('res-launch-mid')?.textContent || '--:--:--';
  const launchMax = document.getElementById('res-launch-max')?.textContent || '--:--:--';
  const windowSpan = document.getElementById('res-window-span')?.textContent || '0.0秒';
  const countdown = document.getElementById('launch-countdown')?.textContent || '00:00.0';

  const text = buildAllianceChatText('multi', {
    e1Tag, e1Name, e1Land,
    e2Tag, e2Name, e2Land,
    launchMin, launchMid, launchMax, windowSpan, countdown
  });

  navigator.clipboard.writeText(text).then(() => {
    alert('同盟チャット用定型文をコピーしました！');
  }).catch(err => {
    prompt('以下のテキストをコピーしてください:', text);
  });
}

// --- Triple Mode Calculator & Time Converter Engine (v1.03.42) ---
const calcHistory = [];
let calcActiveResultSec = 0; // Cached total seconds for transfer/converter

function switchCalcTab(mode) {
  state.calc.mode = mode;
  
  const tabNormal = document.getElementById('calc-tab-normal');
  const tabTime = document.getElementById('calc-tab-time');
  const tabConv = document.getElementById('calc-tab-converter');
  const tabSpeedup = document.getElementById('calc-tab-speedup');
  const shortcuts = document.getElementById('calc-time-shortcuts');
  const convPanel = document.getElementById('calc-converter-panel');
  const speedupPanel = document.getElementById('calc-speedup-panel');
  const keypad = document.getElementById('calc-keypad');
  const historyPanel = document.getElementById('calc-history-panel');

  const displayTitle = document.getElementById('calc-display-title');
  const displayHelpBtn = document.getElementById('calc-display-help-btn');
  const displaySubhint = document.getElementById('calc-display-subhint');

  if (tabNormal) tabNormal.className = `btn-game btn-xs ${mode === 'normal' ? 'btn-primary active' : 'btn-secondary'} font-bold px-2 py-1 text-xs`;
  if (tabTime) tabTime.className = `btn-game btn-xs ${mode === 'time' ? 'btn-primary active' : 'btn-secondary'} font-bold px-2 py-1 text-xs`;
  if (tabConv) tabConv.className = `btn-game btn-xs ${mode === 'converter' ? 'btn-primary active' : 'btn-secondary'} font-bold px-2 py-1 text-xs`;
  if (tabSpeedup) tabSpeedup.className = `btn-game btn-xs ${mode === 'speedup' ? 'btn-primary active' : 'btn-secondary'} font-bold px-2 py-1 text-xs text-yellow-300`;

  if (shortcuts) shortcuts.style.display = mode === 'time' ? 'block' : 'none';
  if (convPanel) convPanel.style.display = mode === 'converter' ? 'block' : 'none';
  if (speedupPanel) speedupPanel.style.display = mode === 'speedup' ? 'block' : 'none';
  if (historyPanel) historyPanel.style.display = (mode === 'normal' || mode === 'time') ? 'block' : 'none';

  // Dynamic Display Header Syncing for each mode
  if (displayTitle && displayHelpBtn && displaySubhint) {
    if (mode === 'time') {
      displayTitle.textContent = '⏱️ 時間計算 入力式';
      displayHelpBtn.setAttribute('onclick', "toggleHelpTooltip(event, 'calc-keypad-time')");
      displayHelpBtn.style.display = 'inline-flex';
      displaySubhint.textContent = 'コロン(:)で時分秒計算';
    } else if (mode === 'converter') {
      displayTitle.textContent = '🔄 相互変換 入力欄';
      displayHelpBtn.setAttribute('onclick', "toggleHelpTooltip(event, 'calc-keypad-converter')");
      displayHelpBtn.style.display = 'inline-flex';
      displaySubhint.textContent = '秒/分/時 または コロン入力';
    } else if (mode === 'speedup') {
      displayTitle.textContent = '⚡️ 加速計算 入力欄';
      displayHelpBtn.setAttribute('onclick', "toggleHelpTooltip(event, 'calc-keypad-speedup')");
      displayHelpBtn.style.display = 'inline-flex';
      displaySubhint.textContent = '短縮したい時間を入力';
    } else {
      displayTitle.textContent = '🔢 通常電卓';
      displayHelpBtn.style.display = 'none';
      displaySubhint.textContent = '四則演算 (+ - × ÷)';
    }
  }

  state.calc.expression = '';
  renderCalcKeypad();
  updateCalcDisplay();
  if (mode === 'converter' || mode === 'speedup') {
    updateTimeConverterOutput(0);
  }
  renderCalcHistory();
}

function renderCalcKeypad() {
  const container = document.getElementById('calc-keypad');
  if (!container) return;
  container.innerHTML = '';

  let keys = [];
  if (state.calc.mode === 'normal') {
    keys = ['C', '⌫', '÷', '×', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];
  } else if (state.calc.mode === 'time') {
    // Time mode: numbers, operators, colon, clear
    keys = ['C', '⌫', ':', '+', '7', '8', '9', '-', '4', '5', '6', '=', '1', '2', '3', '0'];
  } else {
    // Converter / Speedup mode: input numbers / clear / units
    keys = ['C', '⌫', ':', '秒', '7', '8', '9', '分', '4', '5', '6', '時', '1', '2', '3', '0'];
  }

  keys.forEach(key => {
    const btn = document.createElement('button');
    const isOp = ['+', '-', '×', '÷', '='].includes(key);
    const isAccent = ['時', '分', '秒', ':'].includes(key);
    btn.className = `btn-game calc-btn ${isOp ? 'btn-accent' : (isAccent ? 'bg-cyan-950/80 border border-cyan-500/50 text-cyan-300' : '')}`;
    btn.textContent = key;
    btn.onclick = () => handleCalcKey(key);
    container.appendChild(btn);
  });
}

function handleCalcKey(key) {
  const units = ['時', '分', '秒', ':'];
  const ops = ['+', '-', '×', '÷'];
  let expr = state.calc.expression;

  if (key === 'C') {
    state.calc.expression = '';
  } else if (key === '⌫') {
    state.calc.expression = expr.slice(0, -1);
  } else if (key === '=') {
    evaluateCalc();
    return;
  } else if (units.includes(key)) {
    // 1. Cannot start with units (except colon for :30 seconds shorthand)
    if (!expr && key !== ':') {
      return;
    }

    const lastChar = expr.slice(-1);

    // 2. If the last character is already a unit, replace it directly
    if (units.includes(lastChar)) {
      expr = expr.slice(0, -1);
    }

    // 3. For time operators '+', '-', we look at the current active segment (after last operator)
    const segments = expr.split(/[+\-×÷]/);
    const curSegment = segments[segments.length - 1] || '';

    if (key === ':') {
      // Cannot mix colon with Kanji units (時/分/秒)
      if (curSegment.includes('時') || curSegment.includes('分') || curSegment.includes('秒')) {
        return;
      }
      // Cannot put colon immediately after colon
      if (lastChar === ':') {
        return;
      }
      // Maximum 2 colons per segment (HH:MM:SS)
      const colonCount = (curSegment.match(/:/g) || []).length;
      if (colonCount >= 2) {
        return;
      }
      state.calc.expression = expr + key;
    } else {
      // Kanji units: '時', '分', '秒'
      // Cannot mix Kanji units if segment already has a colon
      if (curSegment.includes(':')) {
        return;
      }

      // Check chronological order & deduplication:
      // '時' can only be entered if no '時', '分', or '秒' already exists in current segment
      if (key === '時') {
        if (curSegment.includes('時') || curSegment.includes('分') || curSegment.includes('秒')) {
          return;
        }
      }
      // '分' can only be entered if no '分' or '秒' already exists
      else if (key === '分') {
        if (curSegment.includes('分') || curSegment.includes('秒')) {
          return;
        }
      }
      // '秒' can only be entered if no '秒' already exists
      else if (key === '秒') {
        if (curSegment.includes('秒')) {
          return;
        }
      }

      state.calc.expression = expr + key;
    }
  } else if (ops.includes(key)) {
    if (!expr && key !== '-') return;
    const lastChar = expr.slice(-1);
    if (ops.includes(lastChar)) {
      state.calc.expression = expr.slice(0, -1) + key;
    } else if (lastChar === ':') {
      return; // Cannot put operator immediately after colon
    } else {
      state.calc.expression = expr + key;
    }
  } else if (key === '.') {
    // Dot guard (Normal Calc mode): max 1 dot per numerical segment
    const segments = expr.split(/[+\-×÷]/);
    const curSegment = segments[segments.length - 1] || '';
    if (curSegment.includes('.') || curSegment.includes('時') || curSegment.includes('分') || curSegment.includes('秒') || curSegment.includes(':')) {
      return;
    }
    state.calc.expression = expr + (curSegment ? '.' : '0.');
  } else {
    // Number input (0-9)
    const lastChar = expr.slice(-1);

    // 1. Guard: Cannot append numbers after '秒' (秒 is terminal smallest unit)
    if (lastChar === '秒') {
      return;
    }

    // 2. Guard: Max digit length per number segment (max 10 digits to prevent overflow)
    const segments = expr.split(/[+\-×÷時分秒:]/);
    const curNumberSegment = segments[segments.length - 1] || '';
    if (curNumberSegment.length >= 10) {
      return;
    }

    // 3. Leading zero cleanup (e.g. '0' then '5' becomes '5', avoiding '0005')
    if (curNumberSegment === '0' && key !== '0') {
      state.calc.expression = expr.slice(0, -1) + key;
    } else if (curNumberSegment === '0' && key === '0') {
      return; // Ignore repetitive leading zeros
    } else {
      state.calc.expression = expr + key;
    }
  }

  updateCalcDisplay();
  if (state.calc.mode === 'converter' || state.calc.mode === 'speedup') {
    const totalSec = parseFlexibleInputToSeconds(state.calc.expression);
    updateTimeConverterOutput(totalSec);
  }
}

// Smart Rollover & Irregular Seconds/Minutes Parser (Plan A Auto Rollover)
function normalizeTimeRollover(totalSeconds) {
  let isNeg = totalSeconds < 0;
  let sec = Math.abs(totalSeconds);

  let hours = Math.floor(sec / 3600);
  let mins = Math.floor((sec % 3600) / 60);
  let secs = Math.floor(sec % 60);
  let ms = (sec - Math.floor(sec)).toFixed(1).replace('0.', '.');
  if (ms === '.0') ms = '';

  let hmsStr = '';
  if (hours > 0) hmsStr += `${hours}時間`;
  if (mins > 0 || hours > 0) hmsStr += `${mins}分`;
  hmsStr += `${secs}${ms}秒`;

  const totalMin = Math.floor(sec / 60);
  const msColonStr = `${String(totalMin).padStart(2, '0')}:${String(secs).padStart(2, '0')}${ms}`;

  return {
    isNeg,
    totalSeconds,
    hours,
    mins,
    secs,
    hmsStr: isNeg ? `-${hmsStr}` : hmsStr,
    msColonStr: isNeg ? `-${msColonStr}` : msColonStr,
    rawSecStr: isNeg ? `-${sec.toFixed(1)}` : `${sec.toFixed(1)}`
  };
}

// Time Expression Parser (Supports "1000分", "2時間30分", "50秒", "10000秒", "1時30分40秒")
function parseTimeExpressionToSeconds(expr) {
  if (!expr) return 0;
  const tokenRegex = /(\d+(\.\d+)?)\s*(時間|時|分|秒)?|([+-])/g;
  let match;
  let totalSec = 0;
  let currentSign = 1;
  let hasFoundAnyUnit = false;

  while ((match = tokenRegex.exec(expr)) !== null) {
    const numStr = match[1];
    const unit = match[3];
    const op = match[4];

    if (op) {
      currentSign = (op === '-') ? -1 : 1;
      continue;
    }

    if (numStr !== undefined) {
      let val = parseFloat(numStr) || 0;
      let termSec = 0;

      if (unit === '時間' || unit === '時') {
        termSec = val * 3600;
        hasFoundAnyUnit = true;
      } else if (unit === '分') {
        termSec = val * 60;
        hasFoundAnyUnit = true;
      } else if (unit === '秒') {
        termSec = val;
        hasFoundAnyUnit = true;
      } else {
        termSec = val; // Default to seconds if no unit
      }

      totalSec += currentSign * termSec;
    }
  }

  return totalSec;
}

// Parses string like "14:30:00", "01:30", "64", "64:64", "2時間30分", "1000分", "10000秒" into exact seconds
function parseFlexibleInputToSeconds(expr) {
  if (!expr) return 0;
  let clean = expr.trim();

  // If Japanese units "時", "分", "秒"
  if (/時|分|秒/.test(clean)) {
    return parseTimeExpressionToSeconds(clean);
  }

  // If contains HH:MM:SS or MM:SS colons
  if (clean.includes(':')) {
    const parts = clean.split(':').map(p => parseFloat(p) || 0);
    if (parts.length === 3) {
      // HH:MM:SS (supports irregular rollover e.g. 01:64:64)
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      // MM:SS (supports irregular rollover e.g. 64:64)
      return parts[0] * 60 + parts[1];
    }
  }

  // If pure number (defaults to seconds)
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// Parses formula e.g. "14:30:00 + 02:15 - 30"
function parseTimeFormulaExpression(expr) {
  if (!expr) return 0;
  
  // Tokenize by + or -
  const tokens = [];
  let currentToken = '';
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '+' || char === '-') {
      if (currentToken.trim()) {
        tokens.push(currentToken.trim());
      }
      tokens.push(char);
      currentToken = '';
    } else {
      currentToken += char;
    }
  }
  if (currentToken.trim()) {
    tokens.push(currentToken.trim());
  }

  let totalSeconds = 0;
  let currentSign = 1;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '+') {
      currentSign = 1;
    } else if (token === '-') {
      currentSign = -1;
    } else {
      const termSec = parseFlexibleInputToSeconds(token);
      totalSeconds += currentSign * termSec;
    }
  }

  return totalSeconds;
}

function updateCalcDisplay() {
  const display = document.getElementById('calc-display');
  const hint = document.getElementById('calc-display-hint');
  if (!display) return;

  const expr = state.calc.expression;
  display.textContent = expr || '0';

  if (hint) {
    if (state.calc.mode === 'time' && expr) {
      const sec = parseTimeFormulaExpression(expr);
      const normalized = normalizeTimeRollover(sec);
      hint.textContent = `(＝ ${normalized.hmsStr} / ${normalized.msColonStr})`;
    } else if ((state.calc.mode === 'converter' || state.calc.mode === 'speedup') && expr) {
      const sec = parseFlexibleInputToSeconds(expr);
      const normalized = normalizeTimeRollover(sec);
      hint.textContent = `(＝ ${normalized.hmsStr})`;
    } else {
      hint.textContent = '';
    }
  }
}

function evaluateCalc() {
  let expr = state.calc.expression;
  if (!expr) return;

  try {
    let resultStr = '';
    if (state.calc.mode === 'normal') {
      let evalExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');
      let res = eval(evalExpr);
      resultStr = String(res);
      calcActiveResultSec = parseFloat(res) || 0;
    } else {
      // Time mode: Smart calculation with Auto Rollover (Plan A)
      let totalSec = parseTimeFormulaExpression(expr);
      calcActiveResultSec = totalSec;
      const normalized = normalizeTimeRollover(totalSec);

      // If user had time format with hours, format with HH:MM:SS, else MM:SS
      if (normalized.hours > 0 || expr.split(':').length === 3) {
        const hh = String(normalized.hours).padStart(2, '0');
        const mm = String(normalized.mins).padStart(2, '0');
        const ss = String(normalized.secs).padStart(2, '0');
        resultStr = `${hh}:${mm}:${ss}`;
      } else {
        resultStr = normalized.msColonStr;
      }
    }

    // Add to history
    saveCalcHistory(expr, resultStr);
    state.calc.expression = resultStr;
    updateCalcDisplay();
  } catch (e) {
    state.calc.expression = 'Error';
    updateCalcDisplay();
  }
}

// Injects current live clock (UTC or JST) into Time Calculator
function insertCurrentTimeIntoCalc() {
  const now = getAdjustedNowTime();
  const timeStr = formatTimeHHMMSS(now);
  if (state.calc.expression && !['+', '-'].includes(state.calc.expression.slice(-1))) {
    state.calc.expression += ' + ';
  }
  state.calc.expression += timeStr;
  updateCalcDisplay();
}

// Quick Preset Slot button (+5分, +1分, +30秒, +0.3秒, -0.3秒)
function appendCalcTimeShortcut(secondsDelta) {
  const isPos = secondsDelta >= 0;
  const op = isPos ? ' + ' : ' - ';
  const absSec = Math.abs(secondsDelta);
  
  let formatted = '';
  if (absSec === 300) formatted = '05:00';
  else if (absSec === 60) formatted = '01:00';
  else if (absSec === 30) formatted = '00:30';
  else formatted = `${absSec}秒`;

  state.calc.expression = (state.calc.expression || '00:00') + op + formatted;
  updateCalcDisplay();
}

// Live Time Converter Updater (Outputs HMS / MS / Total Seconds & Speedups)
function updateTimeConverterOutput(totalSec) {
  const normalized = normalizeTimeRollover(totalSec);
  calcActiveResultSec = totalSec;

  const hmsElem = document.getElementById('conv-res-hms');
  const msElem = document.getElementById('conv-res-ms');
  const secElem = document.getElementById('conv-res-sec');

  if (hmsElem) hmsElem.textContent = normalized.hmsStr || '0時間0分0秒';
  if (msElem) msElem.textContent = `${normalized.mins + normalized.hours * 60}分${normalized.secs}秒 (${normalized.msColonStr})`;
  if (secElem) secElem.textContent = `${normalized.rawSecStr} 秒`;

  updateSpeedupOptimizer();
}

// WOS Speedup Optimization Engine (v1.03.44: Multi-item optimal mix + Single item breakdown)
function updateSpeedupOptimizer() {
  const totalSec = Math.max(0, calcActiveResultSec);
  const use8h = document.getElementById('speedup-use-8h')?.checked ?? true;
  const use1h = document.getElementById('speedup-use-1h')?.checked ?? true;
  const use5m = document.getElementById('speedup-use-5m')?.checked ?? true;
  const use1m = document.getElementById('speedup-use-1m')?.checked ?? true;

  // Helper function to format single item count with excess note (v1.03.47 Clean 2-Row Split)
  const formatSingleItemWithExcess = (unitSec) => {
    if (totalSec <= 0) {
      return { num: '0個', statusHtml: '', text: '0個' };
    }
    const count = Math.ceil(totalSec / unitSec);
    const totalProvidedSec = count * unitSec;
    const excessSec = totalProvidedSec - totalSec;

    if (excessSec <= 0) {
      return {
        num: `${count.toLocaleString()}個`,
        statusHtml: '<span class="text-[10px] text-cyan-400 font-bold font-mono">(✨ぴったり)</span>',
        text: `${count}個 (✨ぴったり)`
      };
    } else {
      const normalizedExcess = normalizeTimeRollover(excessSec);
      const excessStr = normalizedExcess.hmsStr;
      return {
        num: `${count.toLocaleString()}個`,
        statusHtml: `<span class="text-[10px] text-red-400 font-bold font-mono" title="過剰時間">(+${excessStr}過剰⚠️)</span>`,
        text: `${count}個 (+${excessStr}過剰⚠️)`
      };
    }
  };

  const res8h = formatSingleItemWithExcess(8 * 3600);
  const res1h = formatSingleItemWithExcess(3600);
  const res5m = formatSingleItemWithExcess(300);
  const res1m = formatSingleItemWithExcess(60);

  const s8hNum = document.getElementById('speedup-single-8h-num');
  const s8hStatus = document.getElementById('speedup-single-8h-status');
  const s1hNum = document.getElementById('speedup-single-1h-num');
  const s1hStatus = document.getElementById('speedup-single-1h-status');
  const s5mNum = document.getElementById('speedup-single-5m-num');
  const s5mStatus = document.getElementById('speedup-single-5m-status');
  const s1mNum = document.getElementById('speedup-single-1m-num');
  const s1mStatus = document.getElementById('speedup-single-1m-status');

  if (s8hNum) s8hNum.textContent = res8h.num;
  if (s8hStatus) s8hStatus.innerHTML = res8h.statusHtml;

  if (s1hNum) s1hNum.textContent = res1h.num;
  if (s1hStatus) s1hStatus.innerHTML = res1h.statusHtml;

  if (s5mNum) s5mNum.textContent = res5m.num;
  if (s5mStatus) s5mStatus.innerHTML = res5m.statusHtml;

  if (s1mNum) s1mNum.textContent = res1m.num;
  if (s1mStatus) s1mStatus.innerHTML = res1m.statusHtml;

  // 2. Multi-Item Optimal Mix (Greedy matching with terminal round-up by smallest selected unit)
  let rem = totalSec;
  let count8h = 0;
  let count1h = 0;
  let count5m = 0;
  let count1m = 0;

  // Determine available units in descending order
  const availableUnits = [];
  if (use8h) availableUnits.push({ key: '8h', sec: 8 * 3600 });
  if (use1h) availableUnits.push({ key: '1h', sec: 3600 });
  if (use5m) availableUnits.push({ key: '5m', sec: 300 });
  if (use1m) availableUnits.push({ key: '1m', sec: 60 });

  if (availableUnits.length > 0 && totalSec > 0) {
    for (let i = 0; i < availableUnits.length; i++) {
      const u = availableUnits[i];
      const isLast = (i === availableUnits.length - 1);

      if (isLast) {
        // Last available unit rounds UP to fully cover remaining time
        const c = Math.ceil(rem / u.sec);
        if (u.key === '8h') count8h += c;
        else if (u.key === '1h') count1h += c;
        else if (u.key === '5m') count5m += c;
        else if (u.key === '1m') count1m += c;
        rem -= c * u.sec;
      } else {
        // Higher units take integer quotients
        const c = Math.floor(rem / u.sec);
        if (c > 0) {
          if (u.key === '8h') count8h += c;
          else if (u.key === '1h') count1h += c;
          else if (u.key === '5m') count5m += c;
          else if (u.key === '1m') count1m += c;
          rem -= c * u.sec;
        }
      }
    }
  }

  const totalProvidedSec = (count8h * 8 * 3600) + (count1h * 3600) + (count5m * 300) + (count1m * 60);
  const excessSec = totalProvidedSec - totalSec;
  const totalCount = count8h + count1h + count5m + count1m;

  const totalCountElem = document.getElementById('speedup-total-count');
  const c8hElem = document.getElementById('speedup-count-8h');
  const c1hElem = document.getElementById('speedup-count-1h');
  const c5mElem = document.getElementById('speedup-count-5m');
  const c1mElem = document.getElementById('speedup-count-1m');
  const remElem = document.getElementById('speedup-rem-note');

  if (totalCountElem) totalCountElem.textContent = `合計 ${totalCount.toLocaleString()} 個`;
  if (c8hElem) c8hElem.textContent = count8h.toLocaleString();
  if (c1hElem) c1hElem.textContent = count1h.toLocaleString();
  if (c5mElem) c5mElem.textContent = count5m.toLocaleString();
  if (c1mElem) c1mElem.textContent = count1m.toLocaleString();

  if (remElem) {
    if (totalSec <= 0 || availableUnits.length === 0) {
      remElem.textContent = '';
    } else if (excessSec > 0) {
      const normExcess = normalizeTimeRollover(excessSec);
      remElem.textContent = `(+${normExcess.hmsStr}過剰⚠️)`;
      remElem.className = 'text-[11px] text-red-400 text-right mt-1 font-mono font-bold';
    } else {
      remElem.textContent = '(✨ぴったり)';
      remElem.className = 'text-[11px] text-cyan-400 text-right mt-1 font-mono font-bold';
    }
  }
}

// Copy Speedup Optimization Breakdown to Clipboard
function copySpeedupOptimizationResult() {
  const totalSec = Math.max(0, calcActiveResultSec);
  const normalized = normalizeTimeRollover(totalSec);

  const use8h = document.getElementById('speedup-use-8h')?.checked ?? true;
  const use1h = document.getElementById('speedup-use-1h')?.checked ?? true;
  const use5m = document.getElementById('speedup-use-5m')?.checked ?? true;
  const use1m = document.getElementById('speedup-use-1m')?.checked ?? true;

  let rem = totalSec;
  let count8h = 0;
  let count1h = 0;
  let count5m = 0;
  let count1m = 0;

  const availableUnits = [];
  if (use8h) availableUnits.push({ key: '8h', sec: 8 * 3600 });
  if (use1h) availableUnits.push({ key: '1h', sec: 3600 });
  if (use5m) availableUnits.push({ key: '5m', sec: 300 });
  if (use1m) availableUnits.push({ key: '1m', sec: 60 });

  if (availableUnits.length > 0 && totalSec > 0) {
    for (let i = 0; i < availableUnits.length; i++) {
      const u = availableUnits[i];
      const isLast = (i === availableUnits.length - 1);

      if (isLast) {
        const c = Math.ceil(rem / u.sec);
        if (u.key === '8h') count8h += c;
        else if (u.key === '1h') count1h += c;
        else if (u.key === '5m') count5m += c;
        else if (u.key === '1m') count1m += c;
        rem -= c * u.sec;
      } else {
        const c = Math.floor(rem / u.sec);
        if (c > 0) {
          if (u.key === '8h') count8h += c;
          else if (u.key === '1h') count1h += c;
          else if (u.key === '5m') count5m += c;
          else if (u.key === '1m') count1m += c;
          rem -= c * u.sec;
        }
      }
    }
  }

  const totalProvidedSec = (count8h * 8 * 3600) + (count1h * 3600) + (count5m * 300) + (count1m * 60);
  const excessSec = totalProvidedSec - totalSec;
  const totalCount = count8h + count1h + count5m + count1m;

  const formatSingleForCopy = (unitSec) => {
    if (totalSec <= 0) return '0個';
    const count = Math.ceil(totalSec / unitSec);
    const itemExcessSec = (count * unitSec) - totalSec;
    if (itemExcessSec <= 0) return `${count}個 (✨ぴったり)`;
    const excessStr = normalizeTimeRollover(itemExcessSec).hmsStr;
    return `${count}個 (+${excessStr}過剰⚠️)`;
  };

  const optStatusStr = excessSec > 0 ? `(+${normalizeTimeRollover(excessSec).hmsStr}過剰⚠️)` : '(✨ぴったり)';

  let text = `⚡️【ホワサバ時間加速 必要個数計算】
🎯 対象時間: ${normalized.hmsStr} (${normalized.rawSecStr}秒)
---------------------------------
【✨ 選択加速の最適組み合わせ】
・8時間加速: ${count8h}個
・1時間加速: ${count1h}個
・5分加速: ${count5m}個
・1分加速: ${count1m}個
合計: ${totalCount}個 ${optStatusStr}
---------------------------------
【🎯 単体使用時の必要個数】
・8時間加速だけ: ${formatSingleForCopy(8 * 3600)}
・1時間加速だけ: ${formatSingleForCopy(3600)}
・5分加速だけ: ${formatSingleForCopy(300)}
・1分加速だけ: ${formatSingleForCopy(60)}`;

  navigator.clipboard.writeText(text).then(() => {
    alert(`📋 【コピー完了】\n加速アイテム計算の内訳をクリップボードにコピーしました！`);
  }).catch(() => {
    alert('コピーに失敗しました。');
  });
}

// Copy Converter Output Value
function copyConverterValue(type) {
  const normalized = normalizeTimeRollover(calcActiveResultSec);
  let text = '';
  if (type === 'hms') text = normalized.hmsStr;
  else if (type === 'ms') text = normalized.msColonStr;
  else if (type === 'sec') text = normalized.rawSecStr;

  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert(`📋 【コピー完了】\n「${text}」をクリップボードにコピーしました！`);
  });
}

// Transfers calculated / converted time directly to Simple Mode fields ('my' | 'enemy' | 'rem')
function transferCalcResultToSimple(targetField) {
  let sec = calcActiveResultSec;
  if (!sec && state.calc.expression) {
    sec = parseTimeFormulaExpression(state.calc.expression);
  }

  const normalized = normalizeTimeRollover(sec);
  const colonVal = normalized.msColonStr;

  let fieldName = '';
  if (targetField === 'my') {
    const input = document.getElementById('simple-my-march');
    if (input) input.value = colonVal;
    saveMyMarchTime(colonVal);
    fieldName = '自分の行軍時間';
  } else if (targetField === 'enemy') {
    const input = document.getElementById('simple-enemy-march');
    if (input) input.value = colonVal;
    fieldName = '相手の行軍時間';
  } else if (targetField === 'rem') {
    const input = document.getElementById('simple-remaining-time');
    if (input) input.value = colonVal;
    fieldName = '集結/行軍 残り時間';
  }

  alert(`📤 【反映完了】\n${fieldName} に「${colonVal}」をセットしました！`);
  closeCalcModal();
}

function transferConverterToSimple(targetField) {
  transferCalcResultToSimple(targetField);
}

// Transfer Converter output directly into Time Calculation mode input by selected format ('hms' | 'ms' | 'sec')
function transferConverterToTimeCalc(type = 'hms') {
  const normalized = normalizeTimeRollover(calcActiveResultSec);
  let valueToSet = '';

  if (type === 'hms') {
    // Format as H:MM:SS (e.g. 1666:40:00 or 02:46:40)
    const pad = (n) => String(n).padStart(2, '0');
    valueToSet = `${normalized.hours}:${pad(normalized.mins)}:${pad(normalized.secs)}`;
  } else if (type === 'ms') {
    // Format as MM:SS (e.g. 100000:00 or 166:40)
    valueToSet = normalized.msColonStr;
  } else if (type === 'sec') {
    // Format as raw seconds integer
    valueToSet = String(Math.floor(normalized.totalSec));
  }

  switchCalcTab('time');
  state.calc.expression = valueToSet;
  updateCalcDisplay();
}

function saveCalcHistory(expr, result) {
  calcHistory.unshift({
    id: Date.now(),
    expr: expr,
    result: result,
    note: ''
  });
  if (calcHistory.length > 20) calcHistory.pop();
  persistCalcHistory();
  renderCalcHistory();
}

function persistCalcHistory() {
  localStorage.setItem('wos_calc_history', JSON.stringify(calcHistory));
}

function loadCalcHistory() {
  const saved = localStorage.getItem('wos_calc_history');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        calcHistory.length = 0;
        calcHistory.push(...parsed);
      }
    } catch (e) {}
  }
}

function renderCalcHistory() {
  const container = document.getElementById('calc-history-list');
  if (!container) return;
  container.innerHTML = '';

  if (calcHistory.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-2">計算履歴はありません</div>';
    return;
  }

  calcHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'calc-history-item';
    div.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="text-gray-300 font-mono">${item.expr} = <strong class="text-cyan-300">${item.result}</strong></span>
        <div class="flex gap-1">
          <button class="btn-game btn-xs btn-secondary text-[11px] px-1.5 py-0.5" onclick="useHistoryResult('${item.result}')">再利用</button>
          <button class="btn-game btn-xs bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-[10px] px-1 py-0.5" onclick="transferHistoryToSimple('${item.result}')">反映</button>
        </div>
      </div>
      <input type="text" class="game-input text-xs" style="height:26px;" placeholder="メモを入力... (例: 砦差し込み用)" 
             value="${item.note || ''}" onchange="updateCalcHistoryNote(${item.id}, this.value)">
    `;
    container.appendChild(div);
  });
}

function transferHistoryToSimple(resStr) {
  const sec = parseFlexibleInputToSeconds(resStr);
  calcActiveResultSec = sec;
  transferCalcResultToSimple('my');
}

function updateCalcHistoryNote(id, noteVal) {
  const item = calcHistory.find(i => i.id === id);
  if (item) {
    item.note = noteVal;
    persistCalcHistory();
  }
}

function useHistoryResult(res) {
  state.calc.expression += res;
  updateCalcDisplay();
}

function clearCalcHistory() {
  calcHistory.length = 0;
  localStorage.removeItem('wos_calc_history');
  renderCalcHistory();
}

// --- 6 Preset Themes Engine & Contrast Safety ---
const THEMES = {
  cyber: { bg: '#080c14', accent: '#00f0ff', text: '#e6f1ff', card: 'rgba(15, 23, 42, 0.75)' },
  magma: { bg: '#1a0508', accent: '#ff3b5c', text: '#ffe6e8', card: 'rgba(38, 10, 16, 0.75)' },
  tactical: { bg: '#05140b', accent: '#00ff88', text: '#e6fff2', card: 'rgba(10, 35, 18, 0.75)' },
  royal: { bg: '#12071a', accent: '#ffb700', text: '#fff8e6', card: 'rgba(28, 14, 40, 0.75)' },
  frost: { bg: '#0a1220', accent: '#38bdf8', text: '#f0f9ff', card: 'rgba(15, 28, 48, 0.75)' },
  light: { bg: '#f1f5f9', accent: '#0284c7', text: '#0f172a', card: 'rgba(255, 255, 255, 0.85)' }
};

function toggleCardAdjustButtons(forceHide) {
  const currentHide = state.settings.hideAdjustButtons || false;
  const nextHide = forceHide !== undefined ? forceHide : !currentHide;
  state.settings.hideAdjustButtons = nextHide;
  saveAppSettings();
  renderMarchCards();
}

function toggleResultMetrics(forceState) {
  const isVisible = forceState !== undefined ? forceState : !(state.settings.showResultMetrics !== false);
  state.settings.showResultMetrics = isVisible;
  updateResultMetricsUI();
  saveAppSettings();
}

function updateResultMetricsUI() {
  const isVisible = state.settings.showResultMetrics !== false;
  const container = document.getElementById('result-metrics-container');
  const icon = document.getElementById('icon-toggle-result-metrics');
  const label = document.getElementById('label-toggle-result-metrics');
  const settingCheckbox = document.getElementById('setting-show-result-metrics');

  if (container) {
    container.style.display = isVisible ? 'grid' : 'none';
  }
  if (icon) {
    icon.className = isVisible ? 'fa-solid fa-eye mr-1' : 'fa-solid fa-eye-slash mr-1';
  }
  if (label) {
    label.textContent = isVisible ? '詳細表示' : '詳細非表示';
  }
  if (settingCheckbox) {
    settingCheckbox.checked = isVisible;
  }
}

function toggleClockControls(forceState) {
  const container = document.getElementById('clock-controls-container');
  const icon = document.getElementById('clock-controls-icon');
  if (!container) return;

  const isCollapsed = forceState !== undefined ? forceState : !container.classList.contains('collapsed');
  container.classList.toggle('collapsed', isCollapsed);

  if (icon) {
    icon.className = isCollapsed ? 'fa-solid fa-chevron-down text-cyan-400' : 'fa-solid fa-chevron-up text-cyan-400';
  }

  // Synchronize CSS class for 100% smooth bezier transition without stutter or delay
  const appContainer = document.getElementById('app-container');
  if (appContainer) {
    appContainer.classList.toggle('clock-open', !isCollapsed);
  }

  state.settings.clockControlsCollapsed = isCollapsed;
  saveAppSettings();
  if (typeof updateAllToggleButtonsUI === 'function') {
    updateAllToggleButtonsUI();
  }
}

function toggleCardVisibility(cardKey, isVisible) {
  state.settings.cardVisibility = state.settings.cardVisibility || {};
  state.settings.cardVisibility[cardKey] = isVisible;
  saveAppSettings();

  const elementMap = {
    'header-mini': ['header-mini-launch'],
    'my-march': ['card-my-march'],
    'enemy-list': ['section-enemy-marches'],
    'result': ['result-card'],
    'simple': ['card-simple-trial'],
    'simple-sub-info': ['simple-sub-info', 'simple-status-label'],
    'alliance-multi': ['card-alliance-multi'],
    'floating-memo': ['floating-memo-window']
  };

  const elemIds = elementMap[cardKey];
  if (elemIds) {
    elemIds.forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
        elem.style.display = isVisible ? '' : 'none';
      }
    });
  }

  // Link btn-jump-result display with 'result' card visibility (v1.02.37)
  if (cardKey === 'result') {
    const jumpBtn = document.getElementById('btn-jump-result');
    if (jumpBtn) {
      jumpBtn.style.display = isVisible ? '' : 'none';
    }
  }
}

function saveAppSettings() {
  localStorage.setItem('wos_app_settings', JSON.stringify(state.settings));
}

function loadAppSettings() {
  const saved = localStorage.getItem('wos_app_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
    } catch (e) {}
  }
  const bgInput = document.getElementById('theme-bg');
  const accentInput = document.getElementById('theme-accent');
  const textInput = document.getElementById('theme-text');
  if (bgInput && state.settings.themeBg) bgInput.value = state.settings.themeBg;
  if (accentInput && state.settings.themeAccent) accentInput.value = state.settings.themeAccent;
  if (textInput && state.settings.themeText) textInput.value = state.settings.themeText;

  applyThemeColors(state.settings.cardBgOverride);
  updateResultMetricsUI();

  // Apply card visibility settings (v1.02.23 & v1.02.27)
  const defaultVisibility = {
    'header-mini': false,
    'my-march': false,
    'enemy-list': false,
    'result': false,
    'simple': true,
    'simple-sub-info': false,
    'alliance-multi': false,
    'floating-memo': false
  };

  state.settings.cardVisibility = { ...defaultVisibility, ...(state.settings.cardVisibility || {}) };

  ['header-mini', 'my-march', 'enemy-list', 'result', 'simple', 'simple-sub-info', 'alliance-multi', 'floating-memo'].forEach(key => {
    const isVisible = !!state.settings.cardVisibility[key];
    const checkbox = document.getElementById(`setting-show-card-${key}`);
    if (checkbox) checkbox.checked = isVisible;
    toggleCardVisibility(key, isVisible);
  });

  // Default simple adjust buttons hidden to true if not explicitly set (v1.02.43)
  const isSimpleAdjustHidden = state.settings.hideSimpleAdjustButtons !== false;
  toggleSimpleAdjustButtons(isSimpleAdjustHidden);

  // Default clock controls collapsed to true if not explicitly set to false (v1.02.29)
  const isClockCollapsed = state.settings.clockControlsCollapsed !== false;
  toggleClockControls(isClockCollapsed);

  // Restore simple audio mute state (v1.03.09)
  const isAudioMuted = localStorage.getItem('wos_simple_audio_muted') === 'true';
  setSimpleAudioMuteState(isAudioMuted);

  // Restore alliance features visibility state (v1.03.65: default false for clean individual use)
  const isAllianceVisible = state.settings.showAllianceFeatures === true;
  setAllianceFeatureVisible(isAllianceVisible);
}

// Button Design Theme Management (Neon / Emerald / Gold)
function setButtonTheme(themeKey) {
  state.settings.buttonTheme = themeKey || 'neon';
  saveAppSettings();
  applyButtonTheme();
}

function applyButtonTheme() {
  const currentTheme = state.settings.buttonTheme || 'neon';
  document.body.setAttribute('data-btn-theme', currentTheme);

  // Update Settings Modal Options Active State
  ['neon', 'emerald', 'gold'].forEach(key => {
    const btn = document.getElementById(`btn-theme-opt-${key}`);
    if (btn) {
      if (key === currentTheme) {
        btn.classList.add('active', 'border-2');
        if (key === 'neon') btn.className = "btn-game btn-xs border-2 border-cyan-400 text-cyan-300 font-black py-1.5 text-center flex flex-col items-center justify-center gap-0.5 rounded-lg bg-cyan-950/90 shadow-[0_0_12px_rgba(0,240,255,0.6)]";
        if (key === 'emerald') btn.className = "btn-game btn-xs border-2 border-emerald-400 text-emerald-300 font-black py-1.5 text-center flex flex-col items-center justify-center gap-0.5 rounded-lg bg-emerald-950/90 shadow-[0_0_12px_rgba(16,185,129,0.6)]";
        if (key === 'gold') btn.className = "btn-game btn-xs border-2 border-yellow-400 text-yellow-300 font-black py-1.5 text-center flex flex-col items-center justify-center gap-0.5 rounded-lg bg-yellow-950/90 shadow-[0_0_12px_rgba(251,191,36,0.6)]";
      } else {
        btn.className = "btn-game btn-xs border border-gray-700 text-gray-400 font-bold py-1.5 text-center flex flex-col items-center justify-center gap-0.5 rounded-lg bg-black/40";
      }
    }
  });

  // Re-apply states to toggle buttons
  updateAllToggleButtonsUI();
}

function updateAllToggleButtonsUI() {
  // 1. Alliance Mode Button
  const isAllianceVisible = state.settings.showAllianceFeatures === true;
  const btnAlliance = document.getElementById('btn-toggle-alliance-mode');
  const iconAlliance = document.getElementById('icon-toggle-alliance-mode');
  const labelAlliance = document.getElementById('label-toggle-alliance-mode');
  if (btnAlliance) {
    btnAlliance.className = `btn-game btn-xs btn-toggle-base ${isAllianceVisible ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center justify-center gap-0.5 whitespace-nowrap py-1 text-[11px] flex-1`;
  }
  if (iconAlliance) {
    iconAlliance.className = isAllianceVisible ? "fa-solid fa-users" : "fa-solid fa-users-slash opacity-60";
  }
  if (labelAlliance) {
    labelAlliance.textContent = isAllianceVisible ? "一斉指示ON" : "一斉指示OFF";
  }

  // 2. Audio Mute Button
  const btnSound = document.getElementById('btn-toggle-simple-sound');
  const iconSound = document.getElementById('icon-toggle-simple-sound');
  const labelSound = document.getElementById('label-toggle-simple-sound');
  if (btnSound) {
    btnSound.className = `btn-game btn-xs btn-toggle-base ${!isSimpleAudioMuted ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center justify-center gap-0.5 whitespace-nowrap py-1 text-[11px] flex-1`;
  }
  if (iconSound) {
    iconSound.className = !isSimpleAudioMuted ? "fa-solid fa-volume-high" : "fa-solid fa-volume-xmark opacity-60";
  }
  if (labelSound) {
    labelSound.textContent = !isSimpleAudioMuted ? "音声ON" : "音声OFF";
  }

  // 2.5 Vibration Toggle Button (1:1 identical clone of Audio Mute Button)
  const btnVibe = document.getElementById('btn-toggle-simple-vibe');
  const iconVibe = document.getElementById('icon-toggle-simple-vibe');
  const labelVibe = document.getElementById('label-toggle-simple-vibe');
  if (btnVibe) {
    btnVibe.className = `btn-game btn-xs btn-toggle-base ${isSimpleVibrationEnabled ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center justify-center gap-0.5 whitespace-nowrap py-1 text-[11px] flex-1`;
  }
  if (iconVibe) {
    iconVibe.className = isSimpleVibrationEnabled ? "fa-solid fa-mobile-screen-button text-cyan-400" : "fa-solid fa-mobile-screen-button opacity-60";
  }
  if (labelVibe) {
    labelVibe.textContent = isSimpleVibrationEnabled ? "バイブON" : "バイブOFF";
  }

  // 3. Adjust Buttons Toggle
  const containerAdjust = document.getElementById('simple-adjust-buttons-container');
  const isAdjustShown = containerAdjust ? !containerAdjust.classList.contains('hidden') : false;
  const btnAdjust = document.getElementById('btn-toggle-simple-adjust');
  const iconAdjust = document.getElementById('icon-toggle-simple-adjust');
  const labelAdjust = document.getElementById('label-toggle-simple-adjust');
  if (btnAdjust) {
    btnAdjust.className = `btn-game btn-xs btn-toggle-base ${isAdjustShown ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center justify-center gap-0.5 whitespace-nowrap py-1 text-[11px] flex-1`;
  }
  if (iconAdjust) {
    iconAdjust.className = isAdjustShown ? "fa-solid fa-sliders" : "fa-solid fa-sliders opacity-60";
  }
  if (labelAdjust) {
    labelAdjust.textContent = isAdjustShown ? "時間調整ON" : "時間調整OFF";
  }

  // 4. Clock Controls Toggle in Header
  const containerClock = document.getElementById('clock-controls-container');
  const isClockOpen = containerClock ? !containerClock.classList.contains('collapsed') : false;
  const btnClock = document.getElementById('btn-toggle-clock-controls');
  const iconClock = document.getElementById('clock-controls-icon');
  const labelClock = document.getElementById('label-toggle-clock-controls');
  if (btnClock) {
    btnClock.className = `btn-game btn-xs btn-toggle-base ${isClockOpen ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center gap-1 font-bold whitespace-nowrap`;
  }
  if (iconClock) {
    iconClock.className = isClockOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down opacity-60';
  }
  if (labelClock) {
    labelClock.textContent = isClockOpen ? "時計調整ON" : "時計調整OFF";
  }

  // 5. Alliance Timeline Card Collapse Toggle
  const btnTimeline = document.getElementById('btn-toggle-alliance-timeline');
  const iconTimeline = document.getElementById('icon-toggle-alliance-timeline');
  const labelTimeline = document.getElementById('label-toggle-alliance-timeline');
  const isTimelineOpen = typeof isAllianceTimelineCollapsed !== 'undefined' ? !isAllianceTimelineCollapsed : true;
  if (btnTimeline) {
    btnTimeline.className = `btn-game btn-xs btn-toggle-base ${isTimelineOpen ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center gap-0.5 whitespace-nowrap px-2 font-bold`;
  }
  if (iconTimeline) {
    iconTimeline.className = isTimelineOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down opacity-60';
  }
  if (labelTimeline) {
    labelTimeline.textContent = isTimelineOpen ? 'タイムラインON' : 'タイムラインOFF';
  }

  // 6. Alliance Group Area Toggle
  const groupsArea = document.getElementById('alliance-groups-area');
  const isGroupsOpen = groupsArea ? !groupsArea.classList.contains('hidden') : true;
  const btnGroups = document.getElementById('btn-toggle-alliance-groups');
  const iconGroups = document.getElementById('icon-toggle-alliance-groups');
  const labelGroups = document.getElementById('label-toggle-alliance-groups');
  if (btnGroups) {
    btnGroups.className = `btn-game btn-xs btn-toggle-base ${isGroupsOpen ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center gap-0.5 whitespace-nowrap px-2 py-1 text-[11px] font-bold`;
  }
  if (iconGroups) {
    iconGroups.className = isGroupsOpen ? 'fa-solid fa-layer-group text-yellow-400' : 'fa-solid fa-layer-group opacity-60';
  }
  if (labelGroups) {
    labelGroups.textContent = isGroupsOpen ? 'グループON' : 'グループOFF';
  }

  // 7. Alliance Member Quick Add Area Toggle
  const quickAddArea = document.getElementById('alliance-quick-add-area');
  const isQuickAddOpen = quickAddArea ? !quickAddArea.classList.contains('hidden') : false;
  const btnQuickAdd = document.getElementById('btn-toggle-quick-add');
  const iconQuickAdd = document.getElementById('icon-toggle-quick-add');
  const labelQuickAdd = document.getElementById('label-toggle-quick-add');
  if (btnQuickAdd) {
    btnQuickAdd.className = `btn-game btn-xs btn-toggle-base ${isQuickAddOpen ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center gap-0.5 whitespace-nowrap px-2 py-1 text-[11px] font-bold`;
  }
  if (iconQuickAdd) {
    iconQuickAdd.className = isQuickAddOpen ? 'fa-solid fa-user-plus' : 'fa-solid fa-user-plus opacity-60';
  }
  if (labelQuickAdd) {
    labelQuickAdd.textContent = isQuickAddOpen ? '個別追加ON' : '個別追加OFF';
  }

  // 8. Alliance Batch Import Area Toggle
  const batchImportArea = document.getElementById('alliance-batch-import-area');
  const isBatchImportOpen = batchImportArea ? !batchImportArea.classList.contains('hidden') : false;
  const btnBatchImport = document.getElementById('btn-toggle-alliance-batch-import');
  const iconBatchImport = document.getElementById('icon-toggle-alliance-batch-import');
  const labelBatchImport = document.getElementById('label-toggle-alliance-batch-import');
  if (btnBatchImport) {
    btnBatchImport.className = `btn-game btn-xs btn-toggle-base ${isBatchImportOpen ? 'btn-toggle-on' : 'btn-toggle-off'} flex items-center justify-center gap-0.5 whitespace-nowrap py-1 px-2 text-[11px] font-bold`;
  }
  if (iconBatchImport) {
    iconBatchImport.className = isBatchImportOpen ? 'fa-solid fa-file-import' : 'fa-solid fa-file-import opacity-60';
  }
  if (labelBatchImport) {
    labelBatchImport.textContent = isBatchImportOpen ? '一括登録ON' : '一括登録OFF';
  }
}

// v1.03.09 Audio Mute Control for Simple Mode

// v1.05.01 Vibration ON/OFF Control
let isSimpleVibrationEnabled = localStorage.getItem('wos_simple_vibration_enabled') !== 'false';

function setSimpleVibrationState(enabled) {
  isSimpleVibrationEnabled = enabled;
  localStorage.setItem('wos_simple_vibration_enabled', enabled ? 'true' : 'false');
  updateAllToggleButtonsUI();
}

function toggleSimpleVibration() {
  setSimpleVibrationState(!isSimpleVibrationEnabled);
}

let isSimpleAudioMuted = false;

function setSimpleAudioMuteState(muted) {
  isSimpleAudioMuted = muted;
  localStorage.setItem('wos_simple_audio_muted', muted ? 'true' : 'false');
  updateAllToggleButtonsUI();
}

function toggleSimpleAudioMute() {
  initAudio();
  setSimpleAudioMuteState(!isSimpleAudioMuted);
}

function applyPresetTheme(themeKey) {
  const t = THEMES[themeKey] || THEMES.cyber;
  state.settings.themeBg = t.bg;
  state.settings.themeAccent = t.accent;
  state.settings.themeText = t.text;
  state.settings.cardBgOverride = t.card;

  const bgInput = document.getElementById('theme-bg');
  const accentInput = document.getElementById('theme-accent');
  const textInput = document.getElementById('theme-text');
  if (bgInput) bgInput.value = t.bg;
  if (accentInput) accentInput.value = t.accent;
  if (textInput) textInput.value = t.text;

  applyThemeColors(t.card);
  saveAppSettings();
}

function getLuminance(hexColor) {
  let rgb = parseInt(hexColor.replace('#',''), 16);
  let r = (rgb >> 16) & 0xff;
  let g = (rgb >> 8) & 0xff;
  let b = (rgb >> 0) & 0xff;

  let a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function applyThemeColors(cardBgOverride) {
  const bgLuminance = getLuminance(state.settings.themeBg);
  document.documentElement.style.setProperty('--bg-color', state.settings.themeBg);
  document.documentElement.style.setProperty('--accent-color', state.settings.themeAccent);
  if (cardBgOverride) {
    document.documentElement.style.setProperty('--card-bg', cardBgOverride);
  }
  
  // Strict Contrast Safety Enforcement (WCAG 4.5:1 Guarantee with Inverse Plates)
  if (bgLuminance > 0.45) {
    // Light background => Dark inverse plates for text readability
    document.documentElement.style.setProperty('--text-shadow-color', 'rgba(255,255,255,0.8)');
    document.documentElement.style.setProperty('--text-color', '#0f172a');
    document.documentElement.style.setProperty('--text-plate-bg', 'rgba(15, 23, 42, 0.95)');
    document.documentElement.style.setProperty('--text-plate-border', '#0284c7');
  } else {
    // Dark background => Dark glass plates with glowing neon border
    document.documentElement.style.setProperty('--text-shadow-color', 'rgba(0,0,0,0.85)');
    document.documentElement.style.setProperty('--text-color', state.settings.themeText || '#e6f1ff');
    document.documentElement.style.setProperty('--text-plate-bg', 'rgba(8, 12, 20, 0.85)');
    document.documentElement.style.setProperty('--text-plate-border', 'rgba(0, 240, 255, 0.4)');
  }
}

// --- Modal Openers & Controls ---
function openSettingsModal() { document.getElementById('settings-modal').classList.add('open'); }
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('open'); }
function openCalcModal() { renderCalcHistory(); document.getElementById('calc-modal').classList.add('open'); switchCalcTab('time'); }
function closeCalcModal() { document.getElementById('calc-modal').classList.remove('open'); }
function openHistoryModal() { renderHistoryList(); document.getElementById('history-modal').classList.add('open'); }
function closeHistoryModal() { document.getElementById('history-modal').classList.remove('open'); }

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// --- DOM Initializer & Startup Control ---
function initApp() {
  loadAppSettings();
  loadEnemyHistory();
  loadEnemyPresets();
  loadCalcHistory();
  loadMyMarchTime();

  if (state.marchList.length < 2) {
    state.marchList = [
      createMarchCardData('', ''),
      createMarchCardData('', '')
    ];
  }

  renderMarchCards();
  calculateInsertion();
  startClockLoop();
  updateTimezoneUI();
  applyButtonTheme();

  // Global iOS Audio & WakeLock unlock on any user tap/touch
  const unlockAudioOnTouch = () => {
    initAudio();
    document.removeEventListener('touchstart', unlockAudioOnTouch);
    document.removeEventListener('pointerdown', unlockAudioOnTouch);
  };
  document.addEventListener('touchstart', unlockAudioOnTouch, { passive: true });
  document.addEventListener('pointerdown', unlockAudioOnTouch, { passive: true });

  // Tap to start splash handler (Button & Overlay)
  const hideSplash = () => {
    initAudio();
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => splash.style.display = 'none', 600);
    }
  };

  const startBtn = document.getElementById('btn-start');
  const splashContainer = document.getElementById('splash-screen');
  if (startBtn) {
    startBtn.addEventListener('click', hideSplash);
    startBtn.addEventListener('pointerdown', hideSplash);
  }
  if (splashContainer) {
    splashContainer.addEventListener('click', hideSplash);
  }

  // Timezone toggle handler
  document.getElementById('btn-tz-toggle')?.addEventListener('click', () => {
    toggleTimezoneBadge();
  });

  // Time fine-tune buttons
  document.querySelectorAll('.tune-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let offsetVal = btn.dataset.offset;
      if (offsetVal === 'reset') {
        state.syncOffsetMs = 0;
      } else {
        state.syncOffsetMs += parseFloat(offsetVal) * 1000;
      }
      const offsetValElem = document.getElementById('offset-val');
      if (offsetValElem) {
        offsetValElem.textContent = `${state.syncOffsetMs >= 0 ? '+' : ''}${(state.syncOffsetMs / 1000).toFixed(1)}s`;
      }
      calculateInsertion();
    });
  });

  // Preset seconds jump
  document.querySelectorAll('.preset-jump-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let targetSec = parseInt(btn.dataset.sec, 10);
      let now = new Date();
      let curSec = now.getSeconds();
      let diffSec = targetSec - curSec;
      state.syncOffsetMs = diffSec * 1000;
      const offsetValElem = document.getElementById('offset-val');
      if (offsetValElem) {
        offsetValElem.textContent = `${state.syncOffsetMs >= 0 ? '+' : ''}${(state.syncOffsetMs / 1000).toFixed(1)}s`;
      }
      calculateInsertion();
    });
  });

  // My march time save handler
  document.getElementById('my-march-time')?.addEventListener('change', (e) => {
    saveMyMarchTime(e.target.value);
  });
  document.getElementById('simple-my-march')?.addEventListener('change', (e) => {
    saveMyMarchTime(e.target.value);
    if (simpleLaunchState.isCalculated) recalculateSimpleLaunchStateOnMarchChange();
  });
  document.getElementById('simple-my-march')?.addEventListener('input', (e) => {
    saveMyMarchTime(e.target.value);
    if (simpleLaunchState.isCalculated) recalculateSimpleLaunchStateOnMarchChange();
  });
  document.getElementById('simple-enemy-march')?.addEventListener('change', (e) => {
    if (simpleLaunchState.isCalculated) recalculateSimpleLaunchStateOnMarchChange();
  });
  document.getElementById('simple-enemy-march')?.addEventListener('input', (e) => {
    if (simpleLaunchState.isCalculated) recalculateSimpleLaunchStateOnMarchChange();
  });

  // Global Start All Timer (batch starts all currently non-running marches)
  document.getElementById('btn-start-all')?.addEventListener('click', () => {
    initAudio();
    state.marchList.forEach(m => {
      if (!m.isRunning) {
        startMarchTimer(m.id, true);
      }
    });
    renderMarchCards();
    calculateInsertion();
  });

  // Add March Button
  document.getElementById('btn-add-march')?.addEventListener('click', () => {
    addMarchCard();
  });

  // Copy Chat Button
  document.getElementById('btn-share-chat')?.addEventListener('click', copyChatFormat);

  // Bottom Navigation & Modal Listeners
  document.getElementById('btn-open-calc')?.addEventListener('click', openCalcModal);
  document.getElementById('btn-open-history')?.addEventListener('click', openHistoryModal);
  document.getElementById('btn-open-settings')?.addEventListener('click', openSettingsModal);

  // Clear History
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    state.history = [];
    localStorage.removeItem('wos_enemy_history');
    renderHistoryList();
  });

  // Theme & Settings Handlers
  document.getElementById('theme-bg')?.addEventListener('input', (e) => {
    state.settings.themeBg = e.target.value;
    applyThemeColors();
    saveAppSettings();
  });

  document.getElementById('theme-accent')?.addEventListener('input', (e) => {
    state.settings.themeAccent = e.target.value;
    applyThemeColors();
    saveAppSettings();
  });

  document.getElementById('theme-text')?.addEventListener('input', (e) => {
    state.settings.themeText = e.target.value;
    applyThemeColors();
    saveAppSettings();
  });

  // Big Clear All Marches Button Listener
  document.getElementById('btn-clear-all-marches')?.addEventListener('click', clearAllMarches);

  // Strategy Note Modal Listeners
  document.getElementById('btn-toggle-note')?.addEventListener('click', openStrategyNoteModal);

  // Settings Checkbox Listeners
  document.getElementById('setting-show-result-metrics')?.addEventListener('change', (e) => {
    toggleResultMetrics(e.target.checked);
  });

  // Alliance Modal Backdrop Close Listeners
  ['alliance-member-modal', 'alliance-selection-modal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    }
  });

  // Local Storage and App state fully initialized
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Floating Jump Button Helper
function jumpToResultCard() {
  const elem = document.getElementById('result-card');
  if (elem) elem.scrollIntoView({ behavior: 'smooth' });
}

// --- Global Timezone Switcher & Reactive UI Engine ---
function toggleTimezoneBadge() {
  state.timezone = state.timezone === 'UTC' ? 'LOCAL' : 'UTC';
  updateTimezoneUI();
  calculateInsertion();
  renderMarchCards();
  if (typeof updateSimpleCountdown === 'function') {
    updateSimpleCountdown();
  }
  if (typeof updateAllianceTimeline === 'function') {
    updateAllianceTimeline();
  }
}

// --- Dynamic Local Timezone Resolver (Guaranteed 3-4 char length & emoji) ---
function getLocalTimezoneInfo() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz === 'Asia/Tokyo' || tz.includes('Tokyo') || tz.includes('Japan')) {
      return { code: 'JST', flag: '🇯🇵', label: 'JST (日本時間)' };
    }
    if (tz.includes('Seoul') || tz.includes('Korea')) {
      return { code: 'KST', flag: '🇰🇷', label: 'KST (韓国時間)' };
    }
    if (tz.includes('Taipei') || tz.includes('Taiwan')) {
      return { code: 'CST', flag: '🇹🇼', label: 'CST (台湾時間)' };
    }
    if (tz.includes('Hong_Kong')) {
      return { code: 'HKT', flag: '🇭🇰', label: 'HKT (香港時間)' };
    }
    if (tz.includes('Shanghai') || tz.includes('Beijing') || tz.includes('China')) {
      return { code: 'CST', flag: '🇨🇳', label: 'CST (中国時間)' };
    }
    if (tz.includes('London') || tz.includes('Dublin')) {
      return { code: 'GMT', flag: '🇬🇧', label: 'GMT (英国時間)' };
    }
    if (tz.includes('Los_Angeles') || tz.includes('Vancouver') || tz.includes('Tijuana')) {
      return { code: 'PST', flag: '🇺🇸', label: 'PST (太平洋時間)' };
    }
    if (tz.includes('New_York') || tz.includes('Toronto')) {
      return { code: 'EST', flag: '🇺🇸', label: 'EST (東部時間)' };
    }
    if (tz.includes('Chicago')) {
      return { code: 'CST', flag: '🇺🇸', label: 'CST (中部時間)' };
    }
    if (tz.includes('Denver') || tz.includes('Phoenix')) {
      return { code: 'MST', flag: '🇺🇸', label: 'MST (山岳部時間)' };
    }
    if (tz.includes('Honolulu') || tz.includes('Hawaii')) {
      return { code: 'HST', flag: '🇺🇸', label: 'HST (ハワイ時間)' };
    }
    if (tz.includes('Paris') || tz.includes('Berlin') || tz.includes('Rome') || tz.includes('Madrid')) {
      return { code: 'CET', flag: '🇪🇺', label: 'CET (中欧時間)' };
    }
    if (tz.includes('Sydney') || tz.includes('Melbourne')) {
      return { code: 'AEST', flag: '🇦🇺', label: 'AEST (豪州東部)' };
    }
    // Fallback: Use standard short timeZoneName if available or 'LOCAL'
    const shortName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || 'LOCAL';
    const cleanCode = (shortName.length <= 4 && !shortName.includes('+') && !shortName.includes('-')) ? shortName : 'LOCAL';
    return { code: cleanCode, flag: '📍', label: `${cleanCode} (現地時間)` };
  } catch (e) {
    return { code: 'LOCAL', flag: '📍', label: 'LOCAL (現地時間)' };
  }
}

function updateTimezoneUI() {
  const localInfo = getLocalTimezoneInfo();
  const btn = document.getElementById('btn-tz-toggle');
  if (btn) {
    if (state.timezone === 'UTC') {
      btn.className = "btn-game btn-xs font-mono whitespace-nowrap bg-yellow-950/90 border border-yellow-400 text-yellow-300 shadow-[0_0_10px_rgba(251,191,36,0.4)] font-black";
      btn.innerHTML = `<i class="fa-solid fa-globe text-yellow-400"></i> UTC`;
    } else {
      btn.className = "btn-game btn-xs font-mono whitespace-nowrap bg-cyan-950/90 border border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.4)] font-black";
      btn.innerHTML = `<span>${localInfo.flag}</span> ${localInfo.code}`;
    }
  }

  const badges = [
    { elem: document.getElementById('tz-indicator-badge'), fullText: true },
    { elem: document.getElementById('simple-tz-badge'), fullText: false },
    { elem: document.getElementById('floating-tz-badge'), fullText: false }
  ];

  badges.forEach(({ elem, fullText }) => {
    if (!elem) return;
    if (state.timezone === 'UTC') {
      elem.className = "px-2 py-0.5 rounded-full text-xs font-black tracking-wide border shadow-md transition-all flex items-center gap-1 bg-yellow-950/90 border-yellow-400 text-yellow-300 shadow-yellow-500/20";
      elem.innerHTML = `<span>🌐 ${fullText ? 'UTC (世界標準時)' : 'UTC'}</span>`;
    } else {
      elem.className = "px-2 py-0.5 rounded-full text-xs font-black tracking-wide border shadow-md transition-all flex items-center gap-1 bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-cyan-500/20";
      elem.innerHTML = `<span>${localInfo.flag} ${fullText ? localInfo.label : localInfo.code}</span>`;
    }
  });
}

// Strategy Note Modal Handlers
function openStrategyNoteModal() {
  const modal = document.getElementById('strategy-note-modal');
  const textarea = document.getElementById('strategy-note-text');
  if (textarea) textarea.value = state.strategyNote;
  if (modal) modal.classList.add('open');
}

function closeStrategyNoteModal() {
  const modal = document.getElementById('strategy-note-modal');
  if (modal) modal.classList.remove('open');
}

function saveStrategyNote() {
  const textarea = document.getElementById('strategy-note-text');
  if (textarea) {
    state.strategyNote = textarea.value;
    localStorage.setItem('wos_strategy_note', state.strategyNote);
    closeStrategyNoteModal();
    alert('作戦メモを保存しました！');
  }
}

// === v1.02.02 TRIAL: Super Simple Launch Mode Controller ===
let simpleLaunchState = {
  statusMode: 'rally', // 'rally' or 'march'
  isCalculated: false,
  calcStartTime: null,
  startRemSec: 180,
  enemyLandDate: null,
  targetLaunchDate: null,
  myMarchSec: 90,
  enemyMarchSec: 135
};

function toggleSimpleAdjustButtons(forceState) {
  const container = document.getElementById('simple-adjust-buttons-container');
  const icon = document.getElementById('icon-toggle-simple-adjust');
  const label = document.getElementById('label-toggle-simple-adjust');

  if (!container) return;

  const isHidden = forceState !== undefined ? forceState : !container.classList.contains('hidden');
  container.classList.toggle('hidden', isHidden);

  if (icon) {
    icon.className = isHidden ? 'fa-solid fa-sliders' : 'fa-sliders text-cyan-400';
  }
  state.settings.hideSimpleAdjustButtons = isHidden;
  saveAppSettings();
  updateAllToggleButtonsUI();
}

// v1.03.64 Alliance Features (Chat Copy & Timeline) Visibility Switch
function toggleAllianceFeature() {
  const currentVisible = state.settings.showAllianceFeatures === true;
  setAllianceFeatureVisible(!currentVisible);
}

function setAllianceFeatureVisible(isVisible) {
  state.settings.showAllianceFeatures = isVisible;
  saveAppSettings();

  const copyContainer = document.getElementById('group-simple-alliance-controls');
  const timelineCard = document.getElementById('card-alliance-timeline');
  const btnToggle = document.getElementById('btn-toggle-alliance-mode');
  const iconToggle = document.getElementById('icon-toggle-alliance-mode');
  const labelToggle = document.getElementById('label-toggle-alliance-mode');
  const settingCheckbox = document.getElementById('setting-show-alliance-features');

  if (copyContainer) {
    copyContainer.style.display = isVisible ? 'block' : 'none';
  }
  if (timelineCard) {
    timelineCard.style.display = isVisible ? 'block' : 'none';
  }
  if (settingCheckbox) {
    settingCheckbox.checked = isVisible;
  }
  updateAllToggleButtonsUI();
}

function setSimpleStatusMode(mode) {
  simpleLaunchState.statusMode = mode;
  const btnRally = document.getElementById('btn-simple-mode-rally');
  const btnMarch = document.getElementById('btn-simple-mode-march');
  const labelRem = document.getElementById('label-simple-remaining-time');
  const groupEnemyMarch = document.getElementById('group-simple-enemy-march');

  if (mode === 'rally') {
    if (btnRally) btnRally.className = "btn-game btn-sm flex-1 font-bold btn-primary active shadow";
    if (btnMarch) btnMarch.className = "btn-game btn-sm flex-1 font-bold btn-secondary";
    if (labelRem) labelRem.innerHTML = '相手の集結残り時間 (MM:SS) <span class="help-icon-btn" onclick="toggleHelpTooltip(event, \'enemy-rem\')" title="解説を見る">❓</span>';
    if (groupEnemyMarch) groupEnemyMarch.style.display = "block";
  } else {
    if (btnRally) btnRally.className = "btn-game btn-sm flex-1 font-bold btn-secondary";
    if (btnMarch) btnMarch.className = "btn-game btn-sm flex-1 font-bold btn-primary active shadow";
    if (labelRem) labelRem.innerHTML = '相手の行軍残り時間 (MM:SS) <span class="help-icon-btn" onclick="toggleHelpTooltip(event, \'enemy-rem\')" title="解説を見る">❓</span>';
    if (groupEnemyMarch) groupEnemyMarch.style.display = "none";
  }
}

function setSimpleRemainingMinute(targetMins) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  let curSec = parseSecondsFromMMSS(elem.value);
  let secondsOnly = curSec % 60;
  let newTotalSec = targetMins * 60 + secondsOnly;
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated) {
    recalculateSimpleLaunchState(newTotalSec);
  }
}

function setSimpleRemainingSecond(targetSecs) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  let curSec = parseSecondsFromMMSS(elem.value);
  let minutesOnly = Math.floor(curSec / 60);
  let newTotalSec = minutesOnly * 60 + targetSecs;
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated) {
    recalculateSimpleLaunchState(newTotalSec);
  }
}

function adjustSimpleRemainingTime(deltaSec) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  let curSec;
  if (simpleLaunchState.isCalculated && simpleLaunchState.calcStartTime) {
    const now = getAdjustedNowTime();
    const elapsedSec = (now.getTime() - simpleLaunchState.calcStartTime.getTime()) / 1000;
    curSec = Math.max(0, simpleLaunchState.startRemSec - elapsedSec);
  } else {
    curSec = parseSecondsFromMMSS(elem.value);
  }

  let newTotalSec = Math.max(0, Math.round((curSec + deltaSec) * 10) / 10);
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated) {
    recalculateSimpleLaunchState(newTotalSec);
  }
}

function recalculateSimpleLaunchState(newRemSec) {
  const now = getAdjustedNowTime();
  const myStr = document.getElementById('simple-my-march')?.value || '01:30';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '02:15';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);

  let rallyFinishDate;
  let enemyLandDate;
  if (simpleLaunchState.statusMode === 'rally') {
    rallyFinishDate = new Date(now.getTime() + newRemSec * 1000);
    enemyLandDate = new Date(rallyFinishDate.getTime() + enemySec * 1000);
  } else {
    rallyFinishDate = null;
    enemyLandDate = new Date(now.getTime() + newRemSec * 1000);
  }

  const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - mySec * 1000);

  simpleLaunchState.calcStartTime = now;
  simpleLaunchState.startRemSec = newRemSec;
  simpleLaunchState.rallyFinishDate = rallyFinishDate;
  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  updateSimpleCountdown();
  updateAllianceTimeline(true);
}

// v1.04.08 Realtime Automatic Recalculation on March Time Updates
function recalculateSimpleLaunchStateOnMarchChange() {
  if (!simpleLaunchState.isCalculated) return;

  const now = getAdjustedNowTime();
  const myStr = document.getElementById('simple-my-march')?.value || '01:30';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '02:15';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);

  let enemyLandDate;
  if (simpleLaunchState.statusMode === 'rally') {
    // If rallyFinishDate exists, keep the exact rally finish time and shift land time by new enemy march
    if (simpleLaunchState.rallyFinishDate) {
      enemyLandDate = new Date(simpleLaunchState.rallyFinishDate.getTime() + enemySec * 1000);
    } else if (simpleLaunchState.calcStartTime && typeof simpleLaunchState.startRemSec === 'number') {
      const finishMs = simpleLaunchState.calcStartTime.getTime() + simpleLaunchState.startRemSec * 1000;
      simpleLaunchState.rallyFinishDate = new Date(finishMs);
      enemyLandDate = new Date(finishMs + enemySec * 1000);
    } else {
      enemyLandDate = simpleLaunchState.enemyLandDate;
    }
  } else {
    // Marching mode: enemyLandDate is the destination time
    enemyLandDate = simpleLaunchState.enemyLandDate;
  }

  // Recalculate user's target launch date
  const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - mySec * 1000);

  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  updateSimpleCountdown();
  updateAllianceTimeline(true);
}

function triggerSimpleEnemyLaunch() {
  initAudio();
  const myStr = document.getElementById('simple-my-march')?.value || '';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '';
  const remStr = document.getElementById('simple-remaining-time')?.value || '';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);
  const remSec = parseSecondsFromMMSS(remStr);

  // 1. Validation for raw negative inputs
  if (isNegativeTimeRaw(myStr) || isNegativeTimeRaw(enemyStr) || isNegativeTimeRaw(remStr)) {
    alert('⚠️ 【入力確認】マイナス（負の数）の時間は入力できません。正しく時間を設定してください。');
    return;
  }

  // 2. Validation for empty or 00:00 march times
  if (mySec <= 0) {
    alert('⚠️ 【入力確認】「自分の行軍時間」をご確認ください。\n行軍時間に 00:00 または空欄は設定できません。(例: 01:30)');
    document.getElementById('simple-my-march')?.focus();
    return;
  }

  if (simpleLaunchState.statusMode === 'rally' && enemySec <= 0) {
    alert('⚠️ 【入力確認】「相手の行軍時間」をご確認ください。\n行軍時間に 00:00 または空欄は設定できません。(例: 02:15)');
    document.getElementById('simple-enemy-march')?.focus();
    return;
  }

  const now = getAdjustedNowTime();
  let rallyFinishDate;
  let enemyLandDate;

  if (simpleLaunchState.statusMode === 'rally') {
    // [集結中] 相手集結完了時刻 = ボタン押下時刻 + 相手の集結残り時間
    rallyFinishDate = new Date(now.getTime() + remSec * 1000);
    // [集結中] 相手着弾時刻 = 相手集結完了時刻 + 相手の行軍時間
    enemyLandDate = new Date(rallyFinishDate.getTime() + enemySec * 1000);
  } else {
    // [行軍中] 相手着弾時刻 = ボタン押下時刻 + 相手の行軍残り時間
    rallyFinishDate = null;
    enemyLandDate = new Date(now.getTime() + remSec * 1000);
  }

  // 自分の発車時刻 = 相手着弾時刻 + 0.3s - 自分の行軍時間
  const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - mySec * 1000);

  // 2. Check if calculated launch time is already in the past (out of time) (v1.03.21 Multi-factor clear explanation)
  const diffSec = (targetLaunchDate.getTime() - now.getTime()) / 1000;
  if (diffSec < -1.0) {
    // Check if any selected alliance member has a launch time in the future
    const selectedMembers = allianceMembers.filter(m => m.selected !== false);
    const hasLaunchableAllianceMember = selectedMembers.some(m => {
      const memberLaunchMs = enemyLandDate.getTime() + 300 - m.marchSec * 1000;
      return (memberLaunchMs - now.getTime()) / 1000 > -1.0;
    });

    if (!hasLaunchableAllianceMember) {
      const passedSec = Math.abs(diffSec).toFixed(1);
      const confirmLaunch = confirm(`⚠️ 【発車不可アラート（すでに手遅れです）】\n\n以下の原因が考えられます：\n① 自分の行軍時間（または集結時間）の設定が長すぎる\n② 相手の着弾までの残り時間が短すぎる（過去の時刻）\n\n※【 ${passedSec} 秒過去 】を経過しており全員間に合いません。\nこのまま差し込みタイマーを開始しますか？`);
      if (!confirmLaunch) return;
    }
  }

  simpleLaunchState.isCalculated = true;
  simpleLaunchState.calcStartTime = new Date(now.getTime());
  simpleLaunchState.startRemSec = remSec;
  simpleLaunchState.rallyFinishDate = rallyFinishDate;
  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  updateSimpleCountdown();
  updateAllianceTimeline();
}

function updateSimpleCountdown() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.targetLaunchDate || !simpleLaunchState.enemyLandDate) return;

  const now = getAdjustedNowTime();

  // 1. Check if the LAST member's launch time has passed (v1.04.09 1.5s Quick Completion & Alliance Toggle Check)
  let maxLaunchTimeMs = simpleLaunchState.targetLaunchDate.getTime();
  const isAllianceEnabled = state.settings.showAllianceFeatures === true;

  if (isAllianceEnabled) {
    const selectedMembers = allianceMembers.filter(m => m.selected !== false);
    if (selectedMembers.length > 0) {
      selectedMembers.forEach(m => {
        const memberLaunchMs = simpleLaunchState.enemyLandDate.getTime() + 300 - m.marchSec * 1000;
        if (memberLaunchMs > maxLaunchTimeMs) {
          maxLaunchTimeMs = memberLaunchMs;
        }
      });
    }
  }

  // If the last launch time + 1.5s buffer has passed, automatically complete & reset cleanly!
  if (now.getTime() > maxLaunchTimeMs + 1500) {
    resetSimpleLaunchCalculation();
    return;
  }

  // 2. Live Countdown of Remaining Time Input (Display MM:SS of enemy arrival countdown)
  const remInput = document.getElementById('simple-remaining-time');
  const elapsedSec = (now.getTime() - simpleLaunchState.calcStartTime.getTime()) / 1000;
  const currentRemSec = Math.max(0, simpleLaunchState.startRemSec - elapsedSec);

  if (remInput && document.activeElement !== remInput) {
    remInput.value = formatCountdownMMSS(currentRemSec);
  }

  // 3. Ultra Prominent Projected Launch Time Display (Display HH:MM:SS of targetLaunchDate)
  const landTimeVal = document.getElementById('simple-land-time-val');
  if (landTimeVal) {
    landTimeVal.textContent = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  }
  const floatingLandTimeVal = document.getElementById('floating-land-time-val');
  if (floatingLandTimeVal) {
    floatingLandTimeVal.textContent = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  }

  // 4. Launch Deadline Countdown Display & 10s Countdown Beep Audio (v1.03.09)
  const statusLabel = document.getElementById('simple-status-label');
  const countdownVal = document.getElementById('simple-countdown-val');
  const subInfo = document.getElementById('simple-sub-info');

  if (!statusLabel || !countdownVal || !subInfo) return;

  const modeText = simpleLaunchState.statusMode === 'rally' ? '集結完了後発車' : '行軍着弾';
  const diffSec = (simpleLaunchState.targetLaunchDate.getTime() - now.getTime()) / 1000;

  // 10s Countdown Audio Beep & Vibration Logic (v1.05.01)
  if (diffSec > 0 && diffSec <= 10.05) {
    const currentCeilSec = Math.ceil(diffSec);
    if (simpleLaunchState.lastBeepSecond !== currentCeilSec) {
      simpleLaunchState.lastBeepSecond = currentCeilSec;
      if (!isSimpleAudioMuted) {
        if (currentCeilSec === 1) {
          playBeep(1200, 'sine', 0.25);
        } else {
          playBeep(880, 'sine', 0.12);
        }
      }
      // Trigger vibration synced with countdown beeps
      if (isSimpleVibrationEnabled) {
        if (currentCeilSec === 1) {
          triggerVibration([80, 50, 80]); // 2 quick pulses at 1s
        } else {
          triggerVibration(80); // Short rhythmic buzz for 10s ~ 2s
        }
      }
    }
  }

  const btnReset = document.getElementById('btn-simple-reset');
  if (btnReset) btnReset.classList.remove('hidden');

  if (diffSec > 0) {
    statusLabel.textContent = `🔥 自分の発車ボタンを押すまで あと：`;
    statusLabel.className = "text-xs text-yellow-300 font-bold mt-2 mb-1 animate-pulse";
    countdownVal.textContent = formatCountdownMMSSs(diffSec);
    countdownVal.className = "text-2xl sm:text-3xl font-black text-digital text-cyan-300 animate-pulse";
    subInfo.textContent = `相手着弾直後 (0.3秒後) に自動合わせ中 (${modeText})`;
  } else if (diffSec > -1.0) {
    // Launch Deadline Reached (0s Window): Play Big Launch Chime once
    if (simpleLaunchState.lastBeepSecond !== 0) {
      simpleLaunchState.lastBeepSecond = 0;
      if (!isSimpleAudioMuted) {
        playBeep(1760, 'triangle', 0.4); // Major high chime on launch!
      }
      if (isSimpleVibrationEnabled) {
        triggerVibration([200, 100, 300]); // Strong double buzz on launch!
      }
    }

    statusLabel.textContent = "🟢 今すぐ発車せよ！！ (発車推奨ウィンドウ中)";
    statusLabel.className = "text-sm text-green-400 font-black mt-2 mb-1 animate-bounce";
    countdownVal.textContent = "00:00.0";
    countdownVal.className = "text-2xl sm:text-3xl font-black text-digital text-green-400";
    subInfo.textContent = "即座にゲーム画面で発車ボタンをタップ！";
  } else {
    // User's own launch time passed, but calculation is still active for alliance members
    statusLabel.textContent = "⚠️ 自分の発車予定時刻は経過しました";
    statusLabel.className = "text-xs text-yellow-400 font-bold mt-2 mb-1";
    countdownVal.textContent = "経過済み";
    countdownVal.className = "text-xl sm:text-2xl font-black text-yellow-400";
    subInfo.textContent = "同盟タイムラインのスケジュールを進行中";
  }

  updateAllianceTimeline();
}

// v1.03.13 Forced Stop & Clean Reset Calculation
function resetSimpleLaunchCalculation() {
  const startSec = simpleLaunchState.startRemSec || 180;
  
  simpleLaunchState.isCalculated = false;
  delete simpleLaunchState.calcStartTime;
  delete simpleLaunchState.enemyLandDate;
  delete simpleLaunchState.targetLaunchDate;
  delete simpleLaunchState.lastBeepSecond;

  const remInput = document.getElementById('simple-remaining-time');
  if (remInput) {
    remInput.value = formatCountdownMMSS(startSec);
  }

  // Explicitly reset all display elements to default blank states
  const landTimeVal = document.getElementById('simple-land-time-val');
  if (landTimeVal) landTimeVal.textContent = "--:--:--";

  const floatingLandTimeVal = document.getElementById('floating-land-time-val');
  if (floatingLandTimeVal) floatingLandTimeVal.textContent = "--:--:--";

  const statusLabel = document.getElementById('simple-status-label');
  if (statusLabel) {
    statusLabel.textContent = "時間を設定して「差し込み計算スタート」を押してください";
    statusLabel.className = "text-xs text-cyan-300 font-bold mt-2 mb-1";
  }

  const countdownVal = document.getElementById('simple-countdown-val');
  if (countdownVal) {
    countdownVal.textContent = "--:--.-";
    countdownVal.className = "text-2xl font-black text-digital text-cyan-300";
  }

  const subInfo = document.getElementById('simple-sub-info');
  if (subInfo) {
    subInfo.textContent = "相手着弾 0.3秒後 直後に自動合わせ";
  }

  const btnReset = document.getElementById('btn-simple-reset');
  if (btnReset) btnReset.classList.add('hidden');

  // Cleanly clear and hide timeline card
  updateAllianceTimeline();
}

// v1.03.04 Alliance Departure Timeline Implementation (Selection by Name)
let isAllianceTimelineCollapsed = false;
let selectedTimelineMemberName = null;

function toggleAllianceTimelineCard() {
  const content = document.getElementById('alliance-timeline-content');
  if (!content) return;

  isAllianceTimelineCollapsed = !isAllianceTimelineCollapsed;
  if (isAllianceTimelineCollapsed) {
    content.classList.add('hidden');
  } else {
    content.classList.remove('hidden');
  }
  updateAllToggleButtonsUI();
}

function selectTimelineRowMember(name) {
  const encodedName = decodeURIComponent(name);
  if (selectedTimelineMemberName === encodedName) {
    selectedTimelineMemberName = null;
  } else {
    selectedTimelineMemberName = encodedName;
  }
  updateAllianceTimeline(true);
}

function updateAllianceTimeline(forceRender = false) {
  const selectedBadge = document.getElementById('timeline-selected-count');
  const hintElem = document.getElementById('alliance-timeline-status-hint');
  const tableContainer = document.getElementById('alliance-timeline-table-container');
  const tbody = document.getElementById('alliance-timeline-tbody');

  const selectedMembers = allianceMembers.filter(m => m.selected !== false);
  if (selectedBadge) selectedBadge.textContent = selectedMembers.length;

  if (!tbody) return;

  if (!simpleLaunchState.isCalculated || !simpleLaunchState.enemyLandDate) {
    if (hintElem) {
      hintElem.classList.remove('hidden');
      hintElem.textContent = '「🎯 差し込み計算スタート！」を押すとリアルタイム発車スケジュールが表示されます';
    }
    if (tableContainer) tableContainer.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  if (selectedMembers.length === 0) {
    if (hintElem) {
      hintElem.classList.remove('hidden');
      hintElem.textContent = '⚠️ 送信対象のメンバーが選択されていません。「👥 送信選択」から選択してください';
    }
    if (tableContainer) tableContainer.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  if (hintElem) hintElem.classList.add('hidden');
  if (tableContainer) tableContainer.classList.remove('hidden');

  // If table is already populated and not forced, only toggle selected classes without overwriting DOM
  const existingRows = tbody.querySelectorAll('tr[data-member-name]');
  if (!forceRender && existingRows.length === selectedMembers.length) {
    existingRows.forEach(tr => {
      const name = tr.getAttribute('data-member-name');
      if (name === selectedTimelineMemberName) {
        tr.classList.add('timeline-row-selected');
      } else {
        tr.classList.remove('timeline-row-selected');
      }
    });
    return;
  }

  const enemyLandDate = simpleLaunchState.enemyLandDate;

  // Calculate launch times
  const memberWithDates = selectedMembers.map(m => {
    const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - m.marchSec * 1000);
    return {
      member: m,
      targetLaunchDate: targetLaunchDate,
      launchTimeMs: targetLaunchDate.getTime()
    };
  });

  // Sort by earliest departure time first
  memberWithDates.sort((a, b) => a.launchTimeMs - b.launchTimeMs);

  const minLaunchTimeMs = memberWithDates[0].launchTimeMs;
  let html = '';

  memberWithDates.forEach((item, index) => {
    const m = item.member;
    const launchTimeStr = formatTimeHHMMSS(item.targetLaunchDate);
    const diffFromFastestSec = (item.launchTimeMs - minLaunchTimeMs) / 1000;
    
    let diffStr = '';
    let diffClass = '';

    if (index === 0) {
      diffStr = '🌟 最速基準';
      diffClass = 'text-yellow-400 font-bold';
    } else {
      diffStr = `+${diffFromFastestSec.toFixed(1)}s`;
      diffClass = 'text-cyan-300 font-bold';
    }

    const isRowSelected = selectedTimelineMemberName === m.name;
    const selectedClass = isRowSelected ? 'timeline-row-selected' : '';
    const rowBg = index === 0 ? 'bg-yellow-950/30' : (index % 2 === 0 ? 'bg-black/30' : 'bg-cyan-950/20');

    const safeName = encodeURIComponent(m.name);

    html += `
      <tr data-member-name="${m.name}" class="${rowBg} ${selectedClass} hover:bg-cyan-900/40 transition-colors cursor-pointer select-none" onclick="selectTimelineRowMember('${safeName}')">
        <td class="p-1.5 text-center font-bold text-gray-400 text-[10px]">${index + 1}</td>
        <td class="p-1.5 font-bold text-cyan-200 truncate max-w-[100px]">${m.name}</td>
        <td class="p-1.5 text-center text-gray-400 text-[10px]">(${formatCountdownMMSS(m.marchSec)})</td>
        <td class="p-1.5 text-center font-bold text-yellow-300">${launchTimeStr}</td>
        <td class="p-1.5 text-right ${diffClass}">${diffStr}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// --- Floating Draggable Mini Memo Window Helpers (v1.02.21 & v1.02.22) ---
function toggleFloatingMemoBody() {
  const body = document.getElementById('floating-memo-body');
  const btn = document.getElementById('btn-toggle-floating-body');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.innerHTML = isHidden ? '&minus;' : '&#43;';
}

function toggleFloatingMemoLandTime() {
  const box = document.getElementById('floating-land-time-box');
  const btn = document.getElementById('btn-toggle-floating-land-time');
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (btn) {
    btn.className = isHidden 
      ? 'btn-game btn-xs bg-yellow-950/80 border border-yellow-500/50 text-yellow-300 px-1.5 py-0.5 text-[11px]'
      : 'btn-game btn-xs bg-gray-800 border border-gray-600 text-gray-400 px-1.5 py-0.5 text-[11px] opacity-60';
  }
  localStorage.setItem('wos_floating_memo_land_time_show', isHidden ? 'true' : 'false');
}

function toggleFloatingMemoFromCard() {
  const windowElem = document.getElementById('floating-memo-window');
  if (!windowElem) return;
  const isCurrentlyVisible = windowElem.style.display !== 'none';
  const newVisibleState = !isCurrentlyVisible;

  // Sync setting
  toggleCardVisibility('floating-memo', newVisibleState);
  const cb = document.getElementById('setting-show-card-floating-memo');
  if (cb) cb.checked = newVisibleState;

  // Reset position to safe area if opening for first time or out of view
  if (newVisibleState) {
    const rect = windowElem.getBoundingClientRect();
    if (rect.top < 60 || rect.top > window.innerHeight - 50 || rect.left < 0 || rect.left > window.innerWidth - 50) {
      windowElem.style.top = '140px';
      windowElem.style.left = '16px';
      windowElem.style.right = 'auto';
    }
  }
}

function saveFloatingMemoText(text) {
  localStorage.setItem('wos_floating_memo_text', text || '');
}

function initFloatingMemoWindow() {
  const windowElem = document.getElementById('floating-memo-window');
  const headerElem = document.getElementById('floating-memo-header');
  const textareaElem = document.getElementById('floating-memo-textarea');
  const landTimeBox = document.getElementById('floating-land-time-box');
  const landTimeBtn = document.getElementById('btn-toggle-floating-land-time');

  if (!windowElem || !headerElem) return;

  // Restore land time box visibility
  const showLandTime = localStorage.getItem('wos_floating_memo_land_time_show');
  if (landTimeBox && showLandTime === 'false') {
    landTimeBox.style.display = 'none';
    if (landTimeBtn) {
      landTimeBtn.className = 'btn-game btn-xs bg-gray-800 border border-gray-600 text-gray-400 px-1.5 py-0.5 text-[11px] opacity-60';
    }
  }

  // Restore text
  const savedText = localStorage.getItem('wos_floating_memo_text');
  if (textareaElem && savedText !== null) {
    textareaElem.value = savedText;
  }

  // Restore position if saved
  const savedPos = localStorage.getItem('wos_floating_memo_pos');
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      if (pos.left !== undefined && pos.top !== undefined) {
        // Ensure position is within safe viewport bounds (at least top 60px to clear header)
        const safeTop = Math.max(60, Math.min(pos.top, window.innerHeight - 100));
        const safeLeft = Math.max(0, Math.min(pos.left, window.innerWidth - 100));
        windowElem.style.left = safeLeft + 'px';
        windowElem.style.top = safeTop + 'px';
        windowElem.style.right = 'auto';
      }
    } catch (e) {}
  }

  // Drag logic (Pointer Events for touch & mouse)
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onPointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('textarea')) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    const rect = windowElem.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    try {
      headerElem.setPointerCapture(e.pointerId);
    } catch (err) {}
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    // Boundaries (minTop 60px so it never gets stuck under fixed header)
    const maxLeft = Math.max(0, window.innerWidth - windowElem.offsetWidth);
    const maxTop = Math.max(60, window.innerHeight - windowElem.offsetHeight);
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(60, Math.min(newTop, maxTop));

    windowElem.style.left = newLeft + 'px';
    windowElem.style.top = newTop + 'px';
    windowElem.style.right = 'auto';
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try {
      headerElem.releasePointerCapture(e.pointerId);
    } catch (err) {}
    localStorage.setItem('wos_floating_memo_pos', JSON.stringify({
      left: windowElem.offsetLeft,
      top: windowElem.offsetTop
    }));
  };

  headerElem.addEventListener('pointerdown', onPointerDown);
  headerElem.addEventListener('pointermove', onPointerMove);
  headerElem.addEventListener('pointerup', onPointerUp);
  headerElem.addEventListener('pointercancel', onPointerUp);

  // iOS/Android Touch Drag Scroll Prevention
  headerElem.addEventListener('touchmove', (e) => {
    if (isDragging && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });
}

// Call initFloatingMemoWindow on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFloatingMemoWindow);
} else {
  initFloatingMemoWindow();
}

// --- Alliance Multi Mass Departure Mode (v1.04.00 Group & Keypad & Search Enhanced) ---
let allianceData = {
  activeGroupId: 'default',
  groups: [
    {
      id: 'default',
      name: '🏰 メイン部隊',
      members: [] // Array of { id, name, marchSec, selected }
    }
  ]
};

// Legacy fallback array accessor for backwards compatibility
let allianceMembers = [];

function saveAllianceData() {
  localStorage.setItem('wos_alliance_groups_data_v2', JSON.stringify(allianceData));
  const curGroup = getActiveAllianceGroup();
  allianceMembers = curGroup ? curGroup.members : [];
  updateAllianceMemberBadges();
}

function loadAllianceMembers() {
  const savedV2 = localStorage.getItem('wos_alliance_groups_data_v2');
  if (savedV2) {
    try {
      const parsed = JSON.parse(savedV2);
      if (parsed && Array.isArray(parsed.groups) && parsed.groups.length > 0) {
        allianceData = parsed;
      }
    } catch (e) {}
  } else {
    // Migration from v1 legacy
    const savedLegacy = localStorage.getItem('wos_alliance_members');
    let legacyMembers = [];
    if (savedLegacy) {
      try {
        legacyMembers = JSON.parse(savedLegacy);
      } catch (e) {}
    }
    if (!Array.isArray(legacyMembers) || legacyMembers.length === 0) {
      legacyMembers = [
        { id: '1', name: '山田', marchSec: 90, selected: true },
        { id: '2', name: '佐藤', marchSec: 105, selected: true },
        { id: '3', name: '田中', marchSec: 130, selected: true }
      ];
    }
    allianceData = {
      activeGroupId: 'default',
      groups: [
        {
          id: 'default',
          name: '🏰 メイン部隊',
          members: legacyMembers
        }
      ]
    };
    saveAllianceData();
  }

  const curGroup = getActiveAllianceGroup();
  allianceMembers = curGroup ? curGroup.members : [];
  updateAllianceMemberBadges();
}

function getActiveAllianceGroup() {
  let group = allianceData.groups.find(g => g.id === allianceData.activeGroupId);
  if (!group && allianceData.groups.length > 0) {
    group = allianceData.groups[0];
    allianceData.activeGroupId = group.id;
  }
  return group;
}

function setActiveAllianceGroup(groupId) {
  allianceData.activeGroupId = groupId;
  saveAllianceData();
  renderAllianceGroupTabs();
  renderAllianceMemberList();
  renderAllianceSelectionList();
  updateAllianceTimeline();
}

function promptCreateAllianceGroup() {
  const name = prompt('新規グループ名を入力してください (例: 砦A班、王城突入班 など):');
  if (!name || !name.trim()) return;

  const newGroup = {
    id: 'grp_' + Date.now().toString(36),
    name: name.trim(),
    members: []
  };

  // Copy member names from current group with default or existing times for convenience
  const curGroup = getActiveAllianceGroup();
  if (curGroup && curGroup.members.length > 0) {
    const copyTimes = confirm('現在のグループのメンバー一覧（' + curGroup.members.length + '名）をコピーして作成しますか？\n（[キャンセル]を押すと空のグループを作成します）');
    if (copyTimes) {
      newGroup.members = curGroup.members.map(m => ({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: m.name,
        marchSec: m.marchSec,
        selected: true
      }));
    }
  }

  allianceData.groups.push(newGroup);
  allianceData.activeGroupId = newGroup.id;
  saveAllianceData();
  renderAllianceGroupTabs();
  renderAllianceMemberList();
  renderAllianceSelectionList();
}

function promptRenameAllianceGroup() {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  const newName = prompt('グループ名を変更:', curGroup.name);
  if (newName && newName.trim()) {
    curGroup.name = newName.trim();
    saveAllianceData();
    renderAllianceGroupTabs();
  }
}

function deleteCurrentAllianceGroup() {
  if (allianceData.groups.length <= 1) {
    alert('⚠️ グループが1つしかないため削除できません。');
    return;
  }
  const curGroup = getActiveAllianceGroup();
  if (confirm(`グループ「${curGroup.name}」を削除してもよろしいですか？`)) {
    allianceData.groups = allianceData.groups.filter(g => g.id !== curGroup.id);
    allianceData.activeGroupId = allianceData.groups[0].id;
    saveAllianceData();
    renderAllianceGroupTabs();
    renderAllianceMemberList();
    renderAllianceSelectionList();
  }
}

function renderAllianceGroupTabs() {
  const container = document.getElementById('alliance-group-tabs-container');
  const selContainer = document.getElementById('alliance-selection-group-tabs');
  
  if (container) {
    container.innerHTML = '';
    allianceData.groups.forEach(g => {
      const isActive = g.id === allianceData.activeGroupId;
      const btn = document.createElement('button');
      btn.className = `btn-game btn-xs ${isActive ? 'btn-primary active' : 'btn-secondary'} px-2.5 py-1 font-bold whitespace-nowrap text-xs flex items-center gap-1`;
      btn.innerHTML = `${g.name} <span class="bg-black/40 px-1 rounded text-[10px] text-yellow-300 font-mono">${g.members.length}</span>`;
      btn.onclick = () => setActiveAllianceGroup(g.id);
      container.appendChild(btn);
    });
  }

  if (selContainer) {
    selContainer.innerHTML = '';
    allianceData.groups.forEach(g => {
      const isActive = g.id === allianceData.activeGroupId;
      const btn = document.createElement('button');
      btn.className = `btn-game btn-xs ${isActive ? 'btn-primary active' : 'btn-secondary'} px-2 py-0.5 font-bold whitespace-nowrap text-[11px] flex items-center gap-1`;
      btn.innerHTML = `${g.name} <span class="bg-black/40 px-1 rounded text-[10px] text-yellow-300 font-mono">${g.members.length}</span>`;
      btn.onclick = () => setActiveAllianceGroup(g.id);
      selContainer.appendChild(btn);
    });
  }
}

function updateAllianceMemberBadges() {
  const curGroup = getActiveAllianceGroup();
  allianceMembers = curGroup ? curGroup.members : [];

  const countBadge = document.getElementById('alliance-member-count-badge');
  const selBadge = document.getElementById('alliance-selected-count-badge');
  const totalBadge = document.getElementById('alliance-total-count-badge');
  const modalCount = document.getElementById('alliance-modal-member-count');

  const total = allianceMembers.length;
  const selected = allianceMembers.filter(m => m.selected !== false).length;

  if (countBadge) countBadge.textContent = total;
  if (selBadge) selBadge.textContent = selected;
  if (totalBadge) totalBadge.textContent = total;
  if (modalCount) modalCount.textContent = total;

  updateAllianceCopyButtons();
}

// Modal Handlers
function openAllianceMemberModal() {
  const modal = document.getElementById('alliance-member-modal');
  if (modal) {
    renderAllianceGroupTabs();
    renderAllianceMemberList();
    modal.classList.add('open');
  }
}

function closeAllianceMemberModal() {
  const modal = document.getElementById('alliance-member-modal');
  if (modal) modal.classList.remove('open');
}

function openAllianceMemberSelectionModal() {
  const modal = document.getElementById('alliance-selection-modal');
  if (modal) {
    renderAllianceGroupTabs();
    renderAllianceSelectionList();
    modal.classList.add('open');
  }
}

function closeAllianceMemberSelectionModal() {
  const modal = document.getElementById('alliance-selection-modal');
  if (modal) modal.classList.remove('open');
}

function toggleAllianceGroupsArea() {
  const area = document.getElementById('alliance-groups-area');
  if (area) {
    area.classList.toggle('hidden');
  }
  updateAllToggleButtonsUI();
}

function toggleAllianceQuickAddArea() {
  const area = document.getElementById('alliance-quick-add-area');
  if (area) {
    area.classList.toggle('hidden');
  }
  updateAllToggleButtonsUI();
}

function toggleAllianceBatchImportArea() {
  const area = document.getElementById('alliance-batch-import-area');
  if (area) {
    area.classList.toggle('hidden');
  }
  updateAllToggleButtonsUI();
}

// Quick Add Member (Name + Seconds)
function quickAddAllianceMember() {
  const nameInput = document.getElementById('quick-add-member-name');
  const timeInput = document.getElementById('quick-add-member-time');
  if (!nameInput || !timeInput) return;

  const name = nameInput.value.trim();
  const timeRaw = timeInput.value.trim();

  if (!name) {
    alert('メンバー名を入力してください。');
    nameInput.focus();
    return;
  }
  if (!timeRaw) {
    alert('行軍時間を入力してください (例: 30 または 01:30)。');
    timeInput.focus();
    return;
  }

  const marchSec = parseSecondsFromMMSS(timeRaw);
  if (isNaN(marchSec) || marchSec <= 0) {
    alert('有効な行軍時間を入力してください (例: 30 または 01:30)。');
    timeInput.focus();
    return;
  }

  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;

  const existing = curGroup.members.find(m => m.name === name);
  if (existing) {
    existing.marchSec = marchSec;
  } else {
    curGroup.members.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: name,
      marchSec: marchSec,
      selected: true
    });
  }

  saveAllianceData();
  renderAllianceMemberList();
  nameInput.value = '';
  timeInput.value = '';
  nameInput.focus();
}

// Sorting Helpers with Visual State Updates
let allianceMemberSortMode = 'name'; // 'name' or 'time'

function sortAllianceMembersByName() {
  allianceMemberSortMode = 'name';
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  curGroup.members.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  saveAllianceData();
  renderAllianceMemberList();
  updateMemberSortButtonsUI();
}

function sortAllianceMembersByTime() {
  allianceMemberSortMode = 'time';
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  curGroup.members.sort((a, b) => a.marchSec - b.marchSec);
  saveAllianceData();
  renderAllianceMemberList();
  updateMemberSortButtonsUI();
}

function updateMemberSortButtonsUI() {
  const btnName = document.getElementById('btn-member-sort-name');
  const btnTime = document.getElementById('btn-member-sort-time');
  if (btnName) {
    btnName.className = `btn-game btn-xs ${allianceMemberSortMode === 'name' ? 'btn-primary active font-black' : 'btn-secondary font-bold'} py-0.5 px-2 text-[11px] whitespace-nowrap`;
  }
  if (btnTime) {
    btnTime.className = `btn-game btn-xs ${allianceMemberSortMode === 'time' ? 'btn-primary active font-black' : 'btn-secondary font-bold'} py-0.5 px-2 text-[11px] whitespace-nowrap`;
  }
}

// Quick Load Sample 65 Members Helper
function loadSample65MembersToTextarea() {
  const textarea = document.getElementById('alliance-import-textarea');
  if (!textarea) return;

  const sampleData = `103ch,00:31
Candy,00:20
Ciel,00:28
Cion,00:30
HANA,00:30
nagisa2,00:20
ozi,00:29
Ruru,00:25
Shikky,00:31
sympathy,00:25
アーモンドミルク,00:30
ｲﾝｶﾗﾏｯ,00:23
ウィット,00:25
えま,00:20
おじー,00:23
おしっきーん,00:28
きなぽん,00:20
ぎょぎょ,00:25
こんもちこ,00:29
さくまる,00:28
さぶちゃんマソ,00:20
さぶちゃんマン,00:31
ちむほび,00:20
なりもん,00:29
にゃおち,00:28
にゃんこまろ,00:28
バブ大福,00:26
はるさん,00:31
はるしゃん,00:20
ひなーこ,00:26
ひなこもち,00:28
ひまり,00:31
ぷかぷか,00:20
ぷらころーる,00:30
ぷらりね,00:26
ぺこりん,00:29
べび大福,00:29
ぽてまる,00:26
まめさん,00:25
みにはるさん,00:23
めごらー,00:29
めごらん,00:25
めろにゃおち,00:28
もち大福,00:23
もふ大福,00:23
やん・凡・じーん,00:20
やんちゃんマン,00:23
ゆゆ,00:20
らすかりーの・ぽんてぃーぬ,00:30
らすかる,00:23
りょう,00:25
リリド,00:20
るいち,00:28
ルッカ,00:26
るるたん,00:20
るるるん,00:31
鬼嫁ちゃん,00:20
黒大福もちみ,00:20
新橋,00:29
新八,00:31
昔むかしの鬼嫁ちゃん,00:25
白大福もちこ,00:30
六ZERO,00:26
和,00:26
和菓子屋,00:30`;

  textarea.value = sampleData;
  alert('サンプル65名のデータをセットしました！「📥 一括登録」を押すと現在のグループに登録されます。');
}

// Template Download & Data Export Helpers
function downloadAllianceTemplate(type) {
  let content = `\uFEFF名前,行軍時間\n103ch,00:31\nCandy,00:20\nCiel,00:28\nShikky,00:31\nアーモンドミルク,00:30\n`;
  let filename = 'wos_alliance_template.csv';
  let mimeType = 'text/csv;charset=utf-8;';

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCurrentAllianceMembers() {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup || curGroup.members.length === 0) {
    alert('エクスポートする登録メンバーがいません。');
    return;
  }

  const sorted = [...curGroup.members].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  let csvContent = '\uFEFF名前,行軍時間\n';

  sorted.forEach(m => {
    csvContent += `${m.name},${formatCountdownMMSS(m.marchSec)}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wos_${curGroup.name}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import & Member Management
function importAllianceMembersFromText() {
  const textarea = document.getElementById('alliance-import-textarea');
  if (!textarea || !textarea.value.trim()) {
    alert('テキストを入力してください。');
    return;
  }

  const lines = textarea.value.split('\n');
  let addedCount = 0;
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    let name = '';
    let timeStr = '';

    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      name = parts[0].trim();
      timeStr = parts.slice(1).join(',').trim();
    } else if (trimmed.includes('\t')) {
      const parts = trimmed.split('\t');
      name = parts[0].trim();
      timeStr = parts.slice(1).join('\t').trim();
    } else {
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx !== -1) {
        name = trimmed.substring(0, spaceIdx).trim();
        timeStr = trimmed.substring(spaceIdx).trim();
      }
    }

    if (name && timeStr) {
      const marchSec = parseSecondsFromMMSS(timeStr);
      if (!isNaN(marchSec) && marchSec > 0) {
        const existing = curGroup.members.find(m => m.name === name);
        if (existing) {
          existing.marchSec = marchSec;
        } else {
          curGroup.members.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: name,
            marchSec: marchSec,
            selected: true
          });
        }
        addedCount++;
      }
    }
  });

  saveAllianceData();
  renderAllianceMemberList();
  alert(`${addedCount} 名のメンバーを現在のグループに登録/更新しました！`);
}

function clearAllianceImportTextarea() {
  const textarea = document.getElementById('alliance-import-textarea');
  if (textarea) textarea.value = '';
}

function clearAllAllianceMembers() {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  if (confirm(`グループ「${curGroup.name}」の登録メンバーを全消去しますか？`)) {
    curGroup.members = [];
    saveAllianceData();
    renderAllianceMemberList();
  }
}

function deleteAllianceMember(id) {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  curGroup.members = curGroup.members.filter(m => m.id !== id);
  saveAllianceData();
  renderAllianceMemberList();
}

function renderAllianceMemberList() {
  const container = document.getElementById('alliance-member-list-container');
  const searchInput = document.getElementById('alliance-member-search');
  if (!container) return;
  container.innerHTML = '';

  const curGroup = getActiveAllianceGroup();
  if (!curGroup || curGroup.members.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-4">このグループにはメンバーが登録されていません</div>';
    updateAllianceMemberBadges();
    return;
  }

  const rawQuery = (searchInput?.value || '').trim().toLowerCase();
  const sorted = [...curGroup.members];
  let filtered = sorted;

  if (rawQuery) {
    // Split by comma (全角・半角), space (全角・半角), or tab
    const tokens = rawQuery.split(/[,、\s\t]+/).filter(t => t.length > 0);
    if (tokens.length > 0) {
      filtered = sorted.filter(m => {
        const mName = m.name.toLowerCase();
        const mTimeStr = formatCountdownMMSS(m.marchSec).toLowerCase();
        const mSecStr = m.marchSec.toString();
        // Match if ANY of the search tokens matches this member (OR condition)
        return tokens.some(tok => mName.includes(tok) || mTimeStr.includes(tok) || mSecStr.includes(tok));
      });
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-3">該当するメンバーがいません</div>';
    return;
  }

  filtered.forEach(m => {
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-black/60 p-2 rounded border border-cyan-900/60 text-xs hover:border-cyan-500/50 transition-all';
    div.innerHTML = `
      <div class="flex items-center gap-2 flex-1 min-w-0 mr-2">
        <span class="font-bold text-cyan-200 truncate">${m.name}</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button class="btn-game btn-xs bg-yellow-950/80 border border-yellow-500/60 text-yellow-300 font-mono font-bold px-2 py-1 text-xs hover:scale-105 transition-transform" onclick="openAllianceKeypadModal('${m.id}')" title="タップして時間を変更">
          ⏱ ${formatCountdownMMSS(m.marchSec)} <i class="fa-solid fa-pen-to-square text-[10px] ml-0.5"></i>
        </button>
        <button class="text-red-400 hover:text-red-300 font-bold px-1.5 py-0.5 text-base" onclick="deleteAllianceMember('${m.id}')">&times;</button>
      </div>
    `;
    container.appendChild(div);
  });

  updateAllianceMemberBadges();
  updateAllianceTimeline();
}

// Inline Dedicated Keypad for Quick Member March Time Edit & Single Mode Inputs
let activeKeypadMemberId = null;
let activeKeypadInputTarget = null; // { elementId, labelName }
let keypadInputBuffer = ''; // Stores typed raw digits like "25" (25s) or "130" (1m30s)

function openAllianceKeypadModal(memberId) {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  const member = curGroup.members.find(m => m.id === memberId);
  if (!member) return;

  activeKeypadMemberId = memberId;
  activeKeypadInputTarget = null;
  keypadInputBuffer = ''; // Start from 00:00 as requested

  const nameElem = document.getElementById('keypad-member-name');
  if (nameElem) nameElem.textContent = member.name;

  const origTimeElem = document.getElementById('keypad-original-time');
  if (origTimeElem) origTimeElem.textContent = `(現在 ${formatCountdownMMSS(member.marchSec)})`;

  updateKeypadDisplay();

  const modal = document.getElementById('alliance-keypad-modal');
  if (modal) modal.classList.add('open');
}

// Single mode input keypad handler
function openSingleInputKeypad(elementId, labelName) {
  const inputElem = document.getElementById(elementId);
  if (!inputElem) return;

  activeKeypadMemberId = null;
  activeKeypadInputTarget = { elementId, labelName };
  keypadInputBuffer = ''; // Start from 00:00

  const nameElem = document.getElementById('keypad-member-name');
  if (nameElem) nameElem.textContent = labelName;

  const origTimeElem = document.getElementById('keypad-original-time');
  if (origTimeElem) origTimeElem.textContent = `(現在 ${inputElem.value || '00:00'})`;

  updateKeypadDisplay();

  const modal = document.getElementById('alliance-keypad-modal');
  if (modal) modal.classList.add('open');
}

function closeAllianceKeypadModal() {
  const modal = document.getElementById('alliance-keypad-modal');
  if (modal) modal.classList.remove('open');
  activeKeypadMemberId = null;
  activeKeypadInputTarget = null;
}

// Convert digit buffer (e.g. "5" -> 5s, "25" -> 25s, "130" -> 1m30s (90s), "0130" -> 1m30s (90s))
function parseKeypadBufferToSeconds(buffer) {
  if (!buffer || buffer === '') return 0;
  const clean = buffer.replace(/^0+/, '') || '0';
  
  if (clean.length <= 2) {
    // Up to 2 digits: direct seconds (e.g. "5" -> 5s, "25" -> 25s, "90" -> 90s)
    return parseInt(clean, 10) || 0;
  } else if (clean.length === 3) {
    // 3 digits: M:SS (e.g. "130" -> 1m 30s = 90s)
    const m = parseInt(clean[0], 10) || 0;
    const s = parseInt(clean.slice(1), 10) || 0;
    return m * 60 + s;
  } else {
    // 4 digits: MM:SS (e.g. "0215" -> 2m 15s = 135s)
    const m = parseInt(clean.slice(0, 2), 10) || 0;
    const s = parseInt(clean.slice(2), 10) || 0;
    return m * 60 + s;
  }
}

function updateKeypadDisplay() {
  const disp = document.getElementById('keypad-display-val');
  if (!disp) return;

  if (!keypadInputBuffer) {
    disp.textContent = '00:00';
    return;
  }

  const totalSec = parseKeypadBufferToSeconds(keypadInputBuffer);
  disp.textContent = formatCountdownMMSS(totalSec);
}

function pressKeypadNumber(numStr) {
  if (keypadInputBuffer.length >= 4) return;
  // If buffer is empty and user presses 0, ignore leading zeroes
  if (!keypadInputBuffer && numStr === '0') return;
  keypadInputBuffer += numStr;
  updateKeypadDisplay();
}

function clearKeypadInput() {
  keypadInputBuffer = '';
  updateKeypadDisplay();
}

function backspaceKeypadInput() {
  keypadInputBuffer = keypadInputBuffer.slice(0, -1);
  updateKeypadDisplay();
}

function adjustKeypadSeconds(delta) {
  let sec = parseKeypadBufferToSeconds(keypadInputBuffer);
  // If buffer was empty, start from currently registered seconds or 0
  if (!keypadInputBuffer) {
    if (activeKeypadMemberId) {
      const curGroup = getActiveAllianceGroup();
      const member = curGroup?.members.find(m => m.id === activeKeypadMemberId);
      if (member) sec = member.marchSec;
    } else if (activeKeypadInputTarget) {
      const inputElem = document.getElementById(activeKeypadInputTarget.elementId);
      if (inputElem) sec = parseSecondsFromMMSS(inputElem.value) || 0;
    }
  }

  sec = Math.max(1, sec + delta);
  // Format back into seconds or MMSS digits
  if (sec < 60) {
    keypadInputBuffer = sec.toString();
  } else {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    keypadInputBuffer = `${m}${s.toString().padStart(2, '0')}`;
  }
  updateKeypadDisplay();
}

function confirmKeypadTime() {
  let totalSec = parseKeypadBufferToSeconds(keypadInputBuffer);
  if (totalSec <= 0) {
    alert('有効な時間を入力してください (1秒以上)。');
    return;
  }

  if (activeKeypadInputTarget) {
    // Single Mode Input Target
    const inputElem = document.getElementById(activeKeypadInputTarget.elementId);
    if (inputElem) {
      const formatted = formatCountdownMMSS(totalSec);
      inputElem.value = formatted;
      if (activeKeypadInputTarget.elementId === 'simple-my-march') {
        saveMyMarchTime(formatted);
      }
      calculateInsertion();
      // v1.04.08 Realtime live recalculation if calculation is ongoing
      if (simpleLaunchState.isCalculated) {
        recalculateSimpleLaunchStateOnMarchChange();
      }
    }
    closeAllianceKeypadModal();
    return;
  }

  if (activeKeypadMemberId) {
    // Alliance Member Target
    const curGroup = getActiveAllianceGroup();
    if (!curGroup) return;
    const member = curGroup.members.find(m => m.id === activeKeypadMemberId);
    if (!member) return;

    member.marchSec = totalSec;
    saveAllianceData();
    renderAllianceMemberList();
    // v1.04.08 Realtime live recalculation if calculation is ongoing
    if (simpleLaunchState.isCalculated) {
      updateAllianceTimeline(true);
    }
    closeAllianceKeypadModal();
    return;
  }
}

// Selection Checklist Modal Logic
function renderAllianceSelectionList() {
  const container = document.getElementById('alliance-selection-list-container');
  const searchInput = document.getElementById('alliance-selection-search');
  if (!container) return;
  container.innerHTML = '';

  const curGroup = getActiveAllianceGroup();
  if (!curGroup || curGroup.members.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-4">このグループにはメンバーがいません</div>';
    return;
  }

  const rawQuery = (searchInput?.value || '').trim().toLowerCase();
  const sorted = [...curGroup.members];
  let filtered = sorted;

  if (rawQuery) {
    const tokens = rawQuery.split(/[,、\s\t]+/).filter(t => t.length > 0);
    if (tokens.length > 0) {
      filtered = sorted.filter(m => {
        const mName = m.name.toLowerCase();
        const mTimeStr = formatCountdownMMSS(m.marchSec).toLowerCase();
        const mSecStr = m.marchSec.toString();
        return tokens.some(tok => mName.includes(tok) || mTimeStr.includes(tok) || mSecStr.includes(tok));
      });
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-3">該当するメンバーがいません</div>';
    return;
  }

  filtered.forEach(m => {
    const isChecked = m.selected !== false;
    const div = document.createElement('label');
    div.className = 'flex items-center justify-between p-2 rounded hover:bg-cyan-950/50 cursor-pointer border-b border-gray-800/60 text-xs';
    div.innerHTML = `
      <div class="flex items-center gap-2 flex-1 min-w-0 mr-2">
        <input type="checkbox" class="w-4 h-4 accent-cyan-400 shrink-0" ${isChecked ? 'checked' : ''} onchange="toggleAllianceMemberSelection('${m.id}', this.checked)">
        <span class="font-bold text-gray-200 truncate">${m.name}</span>
      </div>
      <span class="text-yellow-300 font-mono text-[11px] font-bold shrink-0">${formatCountdownMMSS(m.marchSec)}</span>
    `;
    container.appendChild(div);
  });

  const selNum = document.getElementById('alliance-selection-selected-num');
  const totalNum = document.getElementById('alliance-selection-total-num');
  if (selNum) selNum.textContent = curGroup.members.filter(m => m.selected !== false).length;
  if (totalNum) totalNum.textContent = curGroup.members.length;
}

function toggleAllianceMemberSelection(id, checked) {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  const member = curGroup.members.find(m => m.id === id);
  if (member) {
    member.selected = checked;
    saveAllianceData();
    renderAllianceSelectionList();
    updateAllianceTimeline();
  }
}

function setAllAllianceSelection(checked) {
  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;
  curGroup.members.forEach(m => m.selected = checked);
  saveAllianceData();
  renderAllianceSelectionList();
  updateAllianceTimeline();
}

// Multi Mass Calculation & Copy Logic (v1.04.00 9-Person Chunking & Clean Template)
let allianceCopySortMode = localStorage.getItem('wos_alliance_copy_sort_mode') || 'name'; // 'name' or 'time'

function setAllianceCopySortMode(mode) {
  allianceCopySortMode = mode;
  localStorage.setItem('wos_alliance_copy_sort_mode', mode);

  const btnName = document.getElementById('btn-copy-sort-name');
  const btnTime = document.getElementById('btn-copy-sort-time');
  const hintTextElem = document.getElementById('alliance-selection-sort-hint');

  if (btnName) btnName.className = `btn-game btn-xs ${mode === 'name' ? 'btn-primary active' : 'btn-secondary'} py-0.5 px-2 text-[11px] font-bold whitespace-nowrap`;
  if (btnTime) btnTime.className = `btn-game btn-xs ${mode === 'time' ? 'btn-primary active' : 'btn-secondary'} py-0.5 px-2 text-[11px] font-bold whitespace-nowrap`;

  const modeName = mode === 'name' ? 'あいうえお順' : '出発時間順';
  if (hintTextElem) {
    hintTextElem.textContent = `(${modeName}でコピーされます)`;
  }
  updateAllianceCopyButtons();
}

// Dynamically generate single copy button or auto-split buttons if member count exceeds 9
function updateAllianceCopyButtons() {
  const container = document.getElementById('alliance-copy-buttons-container');
  if (!container) return;

  const curGroup = getActiveAllianceGroup();
  const selectedCount = curGroup ? curGroup.members.filter(m => m.selected !== false).length : 0;
  const sortModeTitle = allianceCopySortMode === 'time' ? '出発時間順' : 'あいうえお順';

  // Whiteout Survival chat allows max ~10 lines per message before stripping newlines.
  // Header is 1 line + 9 members = 10 lines (100% safe across all devices!)
  const limitPerChunk = 9;

  if (selectedCount <= limitPerChunk) {
    // Single Button
    container.innerHTML = `
      <button id="btn-copy-alliance-multi-chat" class="btn-game btn-sm btn-primary w-full py-2 font-black text-xs sm:text-sm tracking-wide shadow flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="copyAllianceMultiChat()">
        <i class="fa-solid fa-copy text-yellow-300"></i> <span id="label-copy-alliance-multi-chat">📋 選択メンバー全員の指示をコピー (${sortModeTitle})</span>
      </button>
    `;
  } else {
    // Auto-Split Buttons (Part 1, Part 2, etc.)
    const totalParts = Math.ceil(selectedCount / limitPerChunk);
    let html = `
      <div class="text-[10px] text-yellow-300 font-bold bg-yellow-950/60 p-1.5 rounded border border-yellow-500/40 text-center truncate">
        ⚠️ ホワサバ改行対策: ${selectedCount}名を 9名ずつ(全${totalParts}回) 分割送信
      </div>
      <div class="grid grid-cols-${Math.min(totalParts, 2)} gap-1.5">
    `;

    for (let part = 1; part <= totalParts; part++) {
      const startIdx = (part - 1) * limitPerChunk + 1;
      const endIdx = Math.min(part * limitPerChunk, selectedCount);
      html += `
        <button class="btn-game btn-sm btn-accent py-1.5 px-1 font-black text-xs shadow flex flex-col items-center justify-center leading-tight whitespace-nowrap min-w-0" onclick="copyAllianceMultiChat(${part}, ${limitPerChunk})">
          <span class="flex items-center gap-1 text-[11px] sm:text-xs">
            <i class="fa-solid fa-copy text-yellow-300 text-[10px]"></i> 📋 Part ${part}/${totalParts}
          </span>
          <span class="text-[10px] opacity-90 font-mono">(${startIdx}〜${endIdx}人目)</span>
        </button>
      `;
    }
    html += `</div>`;
    container.innerHTML = html;
  }
}

function copyAllianceMultiChat(part = 1, limitPerChunk = 0) {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.enemyLandDate) {
    alert('⚠️ 【コピー不可】差し込み計算が開始されていないか、リセットされています。\nまず「🎯 差し込み計算スタート！」を押してスケジュールを生成してください。');
    return;
  }

  const curGroup = getActiveAllianceGroup();
  if (!curGroup) return;

  const selectedMembers = curGroup.members.filter(m => m.selected !== false);
  if (selectedMembers.length === 0) {
    alert('⚠️ 【メンバー未選択】同盟タイムラインの送信対象メンバーが1人も選択されていません。\n「👥 送信選択」から対象メンバーをチェックしてください。');
    return;
  }

  const enemyLandDate = simpleLaunchState.enemyLandDate;

  // Calculate each member's target launch date
  const memberWithDates = selectedMembers.map(m => {
    const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - m.marchSec * 1000);
    return {
      member: m,
      targetLaunchDate: targetLaunchDate
    };
  });

  // Sort based on current mode
  if (allianceCopySortMode === 'time') {
    memberWithDates.sort((a, b) => a.targetLaunchDate.getTime() - b.targetLaunchDate.getTime());
  } else {
    memberWithDates.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ja'));
  }

  const localInfo = getLocalTimezoneInfo();
  const tzStr = state.timezone === 'UTC' ? 'UTC' : localInfo.code;
  const groupTitle = curGroup.name.replace(/^[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/, ''); // Strip leading emojis for concise text

  // Apply Chunking if requested
  let targetItems = memberWithDates;
  let partNote = '';
  if (limitPerChunk > 0) {
    const totalParts = Math.ceil(memberWithDates.length / limitPerChunk);
    const startIdx = (part - 1) * limitPerChunk;
    targetItems = memberWithDates.slice(startIdx, startIdx + limitPerChunk);
    partNote = ` (${part}/${totalParts})`;
  }

  // --- v1.04.00 Super Clean 1-Line Header + Name ➔ Launch Time Format ---
  let text = `⚔️【${groupTitle} 一斉発車】(${tzStr})${partNote}\n`;

  targetItems.forEach(item => {
    const m = item.member;
    const launchTimeStr = formatTimeHHMMSS(item.targetLaunchDate);
    text += `・${m.name} ➔ ${launchTimeStr}\n`;
  });

  // Robust Clipboard Copy with Mobile Fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 ${partNote ? `【Part ${part}】` : ''}${targetItems.length}名分の指示文をコピーしました！`, 'success');
    }).catch(err => {
      fallbackCopyText(text, part, targetItems.length, partNote);
    });
  } else {
    fallbackCopyText(text, part, targetItems.length, partNote);
  }
}

// Fallback copy function for mobile and non-secure contexts
function fallbackCopyText(text, part, count, partNote) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      showToast(`📋 ${partNote ? `【Part ${part}】` : ''}${count}名分の指示文をコピーしました！`, 'success');
    } else {
      prompt('以下の指示文を全選択してコピーしてください:', text);
    }
  } catch (e) {
    prompt('以下の指示文を全選択してコピーしてください:', text);
  }
}

// Restore sort mode state on init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadAllianceMembers();
    setAllianceCopySortMode(allianceCopySortMode);
  });
} else {
  loadAllianceMembers();
  setAllianceCopySortMode(allianceCopySortMode);
}

// v1.03.10 Interactive Help Tooltip System
let activeTooltipPopover = null;

function toggleHelpTooltip(event, helpKey) {
  event.stopPropagation();
  event.preventDefault();

  if (activeTooltipPopover) {
    const isSameKey = activeTooltipPopover.getAttribute('data-help-key') === helpKey;
    activeTooltipPopover.remove();
    activeTooltipPopover = null;
    if (isSameKey) return;
  }

  const helpTexts = {
    'ocr-sync': '【📸 スクショから一発自動同期】<br>ホワサバの防衛/集結画面のスクリーンショットを貼り付けるだけで、画像内の「集結中/行軍中残り時間」「敵名」「同盟タグ」をAI文字認識（OCR）で瞬時に抽出！<br>撮影時刻からの経過タイムラグも完全自動減算され、1ミリ秒のズレもなく即座に差し込み計算がスタートします！',
    'simple-sound': '【🔊 音声ON / 🔇 音声OFF】<br>発車3秒前からの「3、2、1、発車！」音声アナウンス・ビープ音の有効/無効を切り替えます。',
    'simple-vibe': '【📳 バイブON / 📳 バイブOFF】<br>発車10秒前〜発車瞬間のカウントダウン振動（バイブレーション通知）の有効/無効を切り替えます。',
    'simple-adjust': '【🎛️ 時間調整ON / 時間調整OFF】<br>集結残り時間のクイック調整ボタン（[0分〜5分] や [00s〜50s] など）の表示/非表示を切り替えます。',
    'simple-alliance': '【👥 一斉指示ON / 👥 一斉指示OFF】<br>同盟員全員の発車スケジュールを一覧表示する「タイムライン」や、チャットへの一括指示コピー機能の表示/非表示を切り替えます。<br>※個人利用時はOFFにしておくことで画面をスッキリ広々と利用できます！',
    'my-march': '自分が出征してターゲット(砦や王城等)に到着するまでの時間（分:秒）を入力します。※ホワサバ内の出征画面右下に表示されています。',
    'enemy-march': '相手(敵)が出征してターゲット(砦や王城等)に到着する時間を入力します。※ホワサバ内の集結画面で集結中から行軍中に切り替わった際の秒数を確認します。',
    'enemy-rem': 'ホワサバ内の集結画面に表示されている集結中時間を入力します。※画面上部の【時間調整ON】を押すと調整同期ボタンが表示されます。',
    'status-mode': 'ホワサバ内の集結画面に表示されている相手(敵)が【集結中】もしくは【行軍中】かを選択します。',
    'alliance-timeline': '【⏱️ タイムラインON / タイムラインOFF】<br>選択されている同盟メンバー全員の発車時刻と、最速で発車する人からの時間差（+◯.◯秒）を一覧表示します。右上のボタンで展開/折りたたみを切り替えられます。行をタップすると黄色枠で注目トラッキングできます。',
    'alliance-groups': '【🏰 グループON / 🏰 グループOFF】<br>「砦1班」「王城班」「SVS精鋭」などターゲット別グループの切替・作成エリアの表示/非表示を切り替えます。<br>※グループを非表示にすることで、メンバー一覧をさらに広々と確認・検索できます！',
    'alliance-quick-add': '【➕ 個別追加ON / ➕ 個別追加OFF】<br>メンバーを名前と秒数で1人ずつ手動登録する入力フォームの表示/非表示を切り替えます。<br>※登録完了後はOFFにしておくことで、メンバー一覧をスッキリ広々と確認できます！秒数のみ（例: <code>30</code> ➔ 00:30）の入力でも自動認識されます。',
    'alliance-search': '【🔍 複数キーワード一括検索】<br>名前や秒数を1文字打つだけでリアルタイム絞り込みができます。<br>💡 <b>複数人検索の裏技</b>:<br>「<code>ひまり、はるさん、白大福もちこ</code>」のように読点「、」やカンマ「,」、スペース区切りで入力すると、該当する複数メンバーをまとめて一覧に抽出できます！',
    'alliance-keypad': '【⏱️ 専用ミニテンキーパッド】<br>メンバーの行軍時間ボタン（例: <code>⏱ 00:23 📝</code>）をタップすると専用テンキーが出現し、スマホのキーボードを開かずに <code>[3] [0] [確定]</code> や <code>[+1s]</code> でサクサク秒数変更できます！',
    'alliance-batch-import': '【📥 一括登録ON / 📥 一括登録OFF】<br>テキストやCSV形式で複数メンバーを一括登録・エクスポートするエリアの展開/折りたたみを切り替えます。<br>※<code>名前, 行軍時間(分:秒)</code> の形式で、カンマ・スペース・タブ区切りの改行テキストをまとめて現在のグループへ一括登録できます。「サンプル65名」ボタンでテストデータも一発セット可能です。',
    'alliance-selection-group': '【グループ一括選択】<br>上部のグループタブ（砦1班、王城班など）をタップすると、そのグループに所属するメンバーの選択状態へ一瞬で切り替わります。',
    'copy-order': '同盟チャットに指示を貼り付ける際、名前順で並べるか、発車時刻が早い順で並べるかを選択できます。',
    'chat-format': '【ホワサバのチャット改行・文字数制限対策】<br>ホワサバのチャットは1メッセージあたり最大10行前後の制限があります。<br>・<b>📄 標準形式</b>: 詳細な発車指示文<br>・<b>⚡️ 超短縮形式</b>: 1行を極限まで短縮したコンパクト形式<br>※人数が8名を超える場合は、改行潰れを防ぐため自動で【Part 1】【Part 2】と8名ずつ分割コピーボタンが出現します！',
    'member-manage': '同盟メンバーの追加・編集・削除や、名前・行軍時間の一括登録・テンプレート読み込みを行います。',
    'member-select': '同盟一斉発車のスケジュール計算および個別指示文生成の対象とするメンバーをチェックボックスで選択します。',
    'calc-now': '【現在時刻代入】ボタンを押すと、時計調整で同期されている現在のリアルタイム（時:分:秒）を電卓に一発セットします。',
    'calc-transfer': '【📤 自分/相手/残りへ】電卓の計算結果や相互変換した秒数を、差し込み計算の「自分の行軍時間」「相手の行軍時間」「集結残り時間」へワンタップで転送・反映します。',
    'calc-keypad-time': '【⏱️ 時間計算の入力方法】<br>コロン（:）を使って「時:分:秒」を直感的に足し引きできます。<br><br>💡 <b>入力例</b>:<br>・<code>5:00</code> ➔ 5分00秒<br>・<code>:30</code> ➔ 30秒<br>・<code>1:30:00</code> ➔ 1時間30分00秒<br>・<code>12:05:00 + 5:00</code> ➔ 12時10分00秒<br><br>※上部の <code>[+5分]</code> や <code>[+0.3秒]</code> ボタンと組み合わせると爆速で計算できます！',
    'calc-keypad-converter': '【🔄 相互変換の入力方法】<br>秒数や分（例: <code>10000秒</code>、<code>1000分</code>、<code>3時間</code>、<code>05:30</code>）を入力するだけで、下の3つの形式（①時分秒 / ②分秒 / ③総秒数）へリアルタイムに一括変換されます！',
    'calc-keypad-speedup': '【⚡️ 加速計算の入力方法】<br>短縮したい目標時間を（例: <code>1000分</code> や <code>24時間</code>）と入力すると、手持ちの加速アイテム（8h/1h/5m/1m）に応じた最適個数と、各単独使用時の必要個数（過剰警告つき）が自動算出されます！',
    'calc-history': '【📜 計算履歴 ＆ メモ / 再利用 / 反映】<br>過去に行った時間計算の結果が自動で保存されます。<br><br>🔘 <b>各ボタン・機能の使い方</b>:<br>・<b>【メモを入力】</b>: 「砦差し込み用」「敵集結時間」など自由にメモを残せます。<br>・<b>【再利用】</b>: その計算式を電卓の入力欄にもう一度呼び出して再計算します。<br>・<b>【反映】</b>: 計算結果の秒数をメイン画面の差し込み計算（自分/相手/残り）へ直接セットします。',
    'calc-converter': '【🔄 相互変換 ＆ 時間計算へ代入】<br>入力された数字（例: <code>10000秒</code> や <code>100000分</code>）を3つの形式に一括変換します。<br><br>🔘 <b>各ボタンの使い分け</b>:<br>・<b>【📋 コピー】</b>: その形式の文字列をクリップボードにコピーします。<br>・<b>【⏱️ 時間計算へ】</b>: 変換された時間（①時分秒 / ②分秒 / ③総秒数）を「時間計算」タブの入力欄へ直接セットします！そのまま <code>+5分</code> や時刻加減算を続けたい時に超便利です！<br>・<b>【📤 自分 / 相手】</b>: メイン画面の差し込み行軍時間へ直接セットします。',
    'calc-speedup': '【加速計算】ホワサバの8時間・1時間・5分・1分加速の「最適組み合わせ（最小個数）」および「単体使用時の必要個数（過剰時間警告つき）」を即座に自動算出します。チェックボックスで使用する加速アイテムを自由に絞り込めます。'
  };

  const text = helpTexts[helpKey];
  if (!text) return;

  const btnElem = event.currentTarget;
  const insideModalBody = btnElem.closest('.modal-body');

  const popover = document.createElement('div');
  popover.className = 'tooltip-popover';
  popover.setAttribute('data-help-key', helpKey);
  popover.innerHTML = `
    <div class="flex justify-between items-start mb-1 border-b border-cyan-500/30 pb-1">
      <span class="font-bold text-yellow-300 text-xs flex items-center gap-1">
        <i class="fa-solid fa-circle-question text-cyan-400"></i> 項目解説ヘルプ
      </span>
      <button class="text-gray-400 hover:text-white text-xs font-bold px-1" onclick="closeActiveTooltip(event)">&times;</button>
    </div>
    <div class="text-xs leading-relaxed text-cyan-100">${text}</div>
  `;

  if (insideModalBody) {
    // If button is inside modal-body, mount directly inside modal-body with position relative to modal-body!
    insideModalBody.style.position = 'relative';
    insideModalBody.appendChild(popover);

    const btnRect = btnElem.getBoundingClientRect();
    const modalRect = insideModalBody.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    // Calculate relative offsets inside the scrolling modal
    let relativeTop = (btnRect.bottom - modalRect.top) + insideModalBody.scrollTop + 6;
    let relativeLeft = (btnRect.left - modalRect.left) + insideModalBody.scrollLeft - 10;

    // Check bottom boundary inside modal viewport
    if (btnRect.bottom + popoverRect.height + 20 > modalRect.bottom) {
      relativeTop = (btnRect.top - modalRect.top) + insideModalBody.scrollTop - popoverRect.height - 6;
    }

    if (relativeLeft + popoverRect.width > insideModalBody.clientWidth - 12) {
      relativeLeft = insideModalBody.clientWidth - popoverRect.width - 12;
    }
    if (relativeLeft < 10) relativeLeft = 10;

    popover.style.top = `${relativeTop}px`;
    popover.style.left = `${relativeLeft}px`;
  } else {
    // Standard Document Body Mounting
    document.body.appendChild(popover);

    const rect = btnElem.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    let top;
    if (rect.bottom + popoverRect.height + 20 > viewportHeight) {
      top = rect.top + window.scrollY - popoverRect.height - 8;
    } else {
      top = rect.bottom + window.scrollY + 6;
    }

    let left = rect.left + window.scrollX - 10;
    if (left + popoverRect.width > window.innerWidth - 12) {
      left = window.innerWidth - popoverRect.width - 12;
    }
    if (left < 12) left = 12;

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  activeTooltipPopover = popover;
}

function closeActiveTooltip(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (activeTooltipPopover) {
    activeTooltipPopover.remove();
    activeTooltipPopover = null;
  }
}

document.addEventListener('click', (e) => {
  if (activeTooltipPopover && !activeTooltipPopover.contains(e.target) && !e.target.classList.contains('help-icon-btn')) {
    activeTooltipPopover.remove();
    activeTooltipPopover = null;
  }
});


// ==========================================================================
// v1.05.00 Screenshot OCR Instant Sync & Multi-March Engine
// ==========================================================================

let ocrSessionState = {
  imageFile: null,
  captureTime: null,
  detectedMarches: [],
  selectedTargetIdx: 0,
  lagTimerInterval: null
};

// Clipboard Paste Event Listener: Supports (1) JSON Dictionary { time, image } from iPhone Shortcut, (2) Direct Image File Paste
window.addEventListener('paste', async (e) => {
  const clipboardData = e.clipboardData;
  if (!clipboardData) return;

  // 1. Check for JSON Text (from iPhone Shortcut Base64 + Time Dictionary)
  const pastedText = clipboardData.getData('text');
  if (pastedText && pastedText.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(pastedText.trim());
      if (parsed.image) {
        e.preventDefault();
        console.log('⚡ [iPhone Shortcut] Detected JSON Bundle paste! Time:', parsed.time);
        
        // Parse custom timestamp from JSON
        let captureDate = getAdjustedNowTime();
        if (parsed.time) {
          const tStr = String(parsed.time);
          const dtMatch = tStr.match(/(\d{4})[-_\/]?(\d{2})[-_\/]?(\d{2})[\sT_]?(\d{2})[:：](\d{2})(?:[:：](\d{2}))?/);
          if (dtMatch) {
            const sec = dtMatch[6] ? parseInt(dtMatch[6], 10) : 0;
            const rawDate = new Date(parseInt(dtMatch[1], 10), parseInt(dtMatch[2], 10) - 1, parseInt(dtMatch[3], 10), parseInt(dtMatch[4], 10), parseInt(dtMatch[5], 10), sec);
            captureDate = new Date(rawDate.getTime() + (state.syncOffsetMs || 0));
          } else {
            const timeOnly = tStr.match(/(\d{2})[:：](\d{2})(?:[:：](\d{2}))?/);
            if (timeOnly) {
              const now = getAdjustedNowTime();
              const sec = timeOnly[3] ? parseInt(timeOnly[3], 10) : 0;
              const rawDate = new Date(now);
              rawDate.setHours(parseInt(timeOnly[1], 10), parseInt(timeOnly[2], 10), sec, 0);
              captureDate = new Date(rawDate.getTime() + (state.syncOffsetMs || 0));
            }
          }
        }

        // Convert base64 data to Blob
        const base64Data = parsed.image.replace(/^data:image\/[a-z]+;base64,/, '');
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        const file = new File([blob], 'shortcut_screenshot.png', { type: 'image/png', lastModified: captureDate.getTime() });

        ocrSessionState.imageFile = file;
        ocrSessionState.captureTime = captureDate;
        openOcrPreviewModal();
        startOcrLagTimer();
        await processImageWithTesseract(file);
        return;
      }
    } catch (jsonErr) {
      // Not JSON, continue to raw image check
    }
  }

  // 2. Direct Raw Image Paste (PC Ctrl+V, Android, or standard image copy)
  const items = clipboardData.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        e.preventDefault();
        handleOcrImageFile(file);
        break;
      }
    }
  }
});

// Smart Timestamp Extractor from Filename, EXIF / lastModified, or current time
// Automatically converts device raw capture time to WOS Adjusted Clock Time (syncOffsetMs)
function extractCaptureTimeFromFile(file) {
  const now = getAdjustedNowTime();
  const offsetMs = state.syncOffsetMs || 0;

  // 1. Check filename for timestamps (e.g. Screenshot_20260825_154626.png, 2026-08-25-15-46-26.png, etc.)
  if (file && file.name) {
    const fn = file.name;
    // Matches: 20260825_154626 or 2026-08-25-15-46-26 or 154626
    const fullDateMatch = fn.match(/(d{4})[-_]?(d{2})[-_]?(d{2})[-_T]?(d{2})[-_]?(d{2})[-_]?(d{2})/);
    if (fullDateMatch) {
      const year = parseInt(fullDateMatch[1], 10);
      const month = parseInt(fullDateMatch[2], 10) - 1;
      const day = parseInt(fullDateMatch[3], 10);
      const hour = parseInt(fullDateMatch[4], 10);
      const min = parseInt(fullDateMatch[5], 10);
      const sec = parseInt(fullDateMatch[6], 10);
      const rawParsed = new Date(year, month, day, hour, min, sec);
      if (!isNaN(rawParsed.getTime())) {
        // Apply WOS Clock Offset to map device raw capture timestamp directly onto WOS game timeline
        const wosAlignedDate = new Date(rawParsed.getTime() + offsetMs);
        console.log('Parsed exact capture timestamp from filename (aligned with WOS sync offset):', wosAlignedDate);
        return wosAlignedDate;
      }
    }
    // Matches short time in name: 15-46-26 or 154626
    const timeOnlyMatch = fn.match(/(d{2})[-_](d{2})[-_](d{2})/);
    if (timeOnlyMatch) {
      const d = new Date(now);
      d.setHours(parseInt(timeOnlyMatch[1], 10), parseInt(timeOnlyMatch[2], 10), parseInt(timeOnlyMatch[3], 10), 0);
      return d;
    }
  }

  // 2. Check file.lastModified
  if (file && file.lastModified) {
    const fileTime = new Date(file.lastModified);
    const diffMs = Math.abs(now.getTime() - fileTime.getTime());
    if (diffMs < 3600000 * 4) { // within 4 hours
      return fileTime;
    }
  }

  // 3. Fallback to current time
  return now;
}

// Image File Handler & Timestamp Extractor
window.handleOcrImageFile = handleOcrImageFile;
async function handleOcrImageFile(file) {
  if (!file) return;
  initAudio();

  ocrSessionState.imageFile = file;
  ocrSessionState.captureTime = extractCaptureTimeFromFile(file);

  openOcrPreviewModal();
  startOcrLagTimer();
  await processImageWithTesseract(file);
}

window.handleOcrManualCaptureTimeChange = function(timeStr) {
  if (!timeStr) return;
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    const now = getAdjustedNowTime();
    const d = new Date(ocrSessionState.captureTime || now);
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2] || '0', 10) || 0;
    d.setHours(h, m, s, 0);
    ocrSessionState.captureTime = d;
  }
};

window.adjustOcrLag = function(secDelta) {
  if (!ocrSessionState.captureTime) ocrSessionState.captureTime = getAdjustedNowTime();
  ocrSessionState.captureTime = new Date(ocrSessionState.captureTime.getTime() - (secDelta * 1000));
  const timeInput = document.getElementById('ocr-capture-time-input');
  if (timeInput) {
    timeInput.value = formatTimeHHMMSS(ocrSessionState.captureTime);
  }
};

window.resetOcrLagToNow = function() {
  ocrSessionState.captureTime = getAdjustedNowTime();
  const timeInput = document.getElementById('ocr-capture-time-input');
  if (timeInput) {
    timeInput.value = formatTimeHHMMSS(ocrSessionState.captureTime);
  }
};

function openOcrPreviewModal() {
  const modal = document.getElementById('ocr-preview-modal');
  if (modal) modal.classList.add('open');

  const captureTimeInput = document.getElementById('ocr-capture-time-input');
  if (captureTimeInput && ocrSessionState.captureTime) {
    captureTimeInput.value = formatTimeHHMMSS(ocrSessionState.captureTime);
  }

  // Show loading view initially
  const loadingView = document.getElementById('ocr-loading-view');
  const resultsView = document.getElementById('ocr-results-view');
  if (loadingView) loadingView.classList.remove('hidden');
  if (resultsView) resultsView.classList.add('hidden');
}

function closeOcrPreviewModal() {
  const modal = document.getElementById('ocr-preview-modal');
  if (modal) modal.classList.remove('open');
  if (ocrSessionState.lagTimerInterval) {
    clearInterval(ocrSessionState.lagTimerInterval);
    ocrSessionState.lagTimerInterval = null;
  }
}

function startOcrLagTimer() {
  if (ocrSessionState.lagTimerInterval) clearInterval(ocrSessionState.lagTimerInterval);
  
  const updateLag = () => {
    if (!ocrSessionState.captureTime) return;
    const now = getAdjustedNowTime();
    const lagSec = Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000);
    const lagEl = document.getElementById('ocr-elapsed-lag');
    if (lagEl) lagEl.textContent = `+${lagSec.toFixed(1)}秒`;
    updateOcrTimeoutSafety(lagSec);
  };

  updateLag();
  ocrSessionState.lagTimerInterval = setInterval(updateLag, 100);
}

// Preprocess Canvas: 2x Upscale & High-Contrast White Text Enhancement
function preprocessImageCanvas(imageElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const scale = 2.0;
  const nw = imageElement.naturalWidth || imageElement.width || 500;
  const nh = imageElement.naturalHeight || imageElement.height || 1000;
  canvas.width = nw * scale;
  canvas.height = nh * scale;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

  // High-contrast binarization: makes white header numbers stark black on white, eliminating blurry game backgrounds
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      if (lum > 170) {
        d[i] = 0; d[i+1] = 0; d[i+2] = 0; // Text is stark black
      } else {
        d[i] = 255; d[i+1] = 255; d[i+2] = 255; // Background is pure white
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Canvas binarization skipped:', e);
  }

  return canvas;
}

// Full 1-March Card Block Cropper: Cuts the entire whole blue card (Header + Target + Defender + Attacker)
function cropCardSnapshot(img, headerPixelY, canvasScale) {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;

    // Convert preprocessed canvas coordinate back to original image coordinate
    const actualHeaderY = headerPixelY / canvasScale;

    // A complete Whiteout Survival card is approx 0.44 to 0.46 times its width
    // Or ~38% of total screen height when scrolled
    const idealCardHeight = Math.max(nw * 0.48, nh * 0.38);

    const cropY = Math.max(0, actualHeaderY - (nh * 0.015));
    const cropH = Math.min(nh - cropY, idealCardHeight);

    // Full card width: from left card border (2.0%) to right card border (98.0%)
    const cropX = nw * 0.020;
    const cropW = nw * 0.960;

    canvas.width = cropW;
    canvas.height = cropH;

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('Crop Error:', e);
    return null;
  }
}

// Tesseract.js Fast Time Extractor & Visual Card Cropper
async function processImageWithTesseract(file) {
  const statusEl = document.getElementById('ocr-loading-status');
  
  try {
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    const canvasScale = 2.0;
    const preprocessedCanvas = preprocessImageCanvas(img);

    if (typeof Tesseract === 'undefined') {
      if (statusEl) statusEl.textContent = 'OCRエンジンをロード中...';
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Tesseract.js のダウンロードに失敗しました。インターネット接続をご確認ください。'));
        document.head.appendChild(script);
      });
    }

    if (statusEl) statusEl.textContent = 'ホワサバ画面をAI文字解析中...';
    
    // Tesseract Recognize
    const result = await Tesseract.recognize(preprocessedCanvas, 'jpn+eng', {
      logger: m => {
        if (m.status === 'recognizing text' && statusEl) {
          statusEl.textContent = `ホワサバ画面をAI文字解析中... (${Math.round((m.progress || 0) * 100)}%)`;
        }
      }
    });
    URL.revokeObjectURL(imageUrl);

    const ocrLines = result.data.lines || [];
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;

    // Crop the right 68% (Member Info + Attacker Names + Times), cutting away the left 32% (Fortress Target Image)
    const rightCanvas = document.createElement('canvas');
    const cutLeftX = nw * 0.32;
    const cutW = nw * 0.68;
    rightCanvas.width = cutW;
    rightCanvas.height = nh;
    const rctx = rightCanvas.getContext('2d');
    rctx.drawImage(img, cutLeftX, 0, cutW, nh, 0, 0, cutW, nh);
    ocrSessionState.croppedRightSideDataUrl = rightCanvas.toDataURL('image/png');

    console.log('Detected OCR Lines with BBoxes:', ocrLines.map(l => ({ text: l.text, y0: l.bbox.y0 })));
    parseOcrExtractedLines(ocrLines, img, canvasScale);

  } catch (err) {
    console.error('OCR Process Error:', err);
    if (statusEl) statusEl.textContent = '⚠️ OCR解析に失敗しました。手動で入力してください。';
    setTimeout(() => {
      parseOcrExtractedLines([], null, 1.5);
    }, 1200);
  }
}

// Backwards compatible wrapper for text parsing
function parseOcrExtractedText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const mockOcrLines = lines.map((l, i) => ({
    text: l,
    bbox: { y0: i * 80 }
  }));
  parseOcrExtractedLines(mockOcrLines, null, 1.0);
}

// Bounding-Box Line Parser: Robustly extracts all battle times & strictly filters for DEFENSE (Blue) only
function parseOcrExtractedLines(ocrLines, sourceImageElement, canvasScale) {
  const validCards = [];

  // Match flexible time format including colon, dot, space or Chinese colons (00:00:31, 00:31, 00.00.31, 00 00 31)
  const flexibleTimeRegex = /(\d{1,2}[:：\.\s]\d{2}[:：\.\s]\d{2}|\d{1,2}[:：\.\s]\d{2})/;

  // Prepare pixel sampling canvas from source image if available
  let imgCtx = null;
  let imgW = 1000;
  let imgH = 1000;
  if (sourceImageElement && (sourceImageElement.naturalWidth || sourceImageElement.width)) {
    imgW = sourceImageElement.naturalWidth || sourceImageElement.width;
    imgH = sourceImageElement.naturalHeight || sourceImageElement.height;
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = imgW;
      sampleCanvas.height = imgH;
      imgCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      imgCtx.drawImage(sourceImageElement, 0, 0);
    } catch (e) {
      imgCtx = null;
    }
  }

  for (let i = 0; i < ocrLines.length; i++) {
    const ocrLine = ocrLines[i];
    const text = (ocrLine.text || '').trim();

    // Skip top notification / status clock lines (contains 午前, 午後, or 2025/2026/2027)
    if (text.includes('午前') || text.includes('午後') || /202\d/.test(text)) {
      continue;
    }

    const timeMatch = text.match(flexibleTimeRegex);

    if (timeMatch) {
      // Normalize time separators (convert dots or spaces to colons)
      const normalizedTimeStr = timeMatch[0].replace(/[：\.\s]/g, ':');
      const remSec = parseSecondsFromHHMMSS(normalizedTimeStr);

      // Determine rally vs march mode from line or adjacent lines
      const contextText = text + ' ' + (ocrLines[i-1]?.text || '') + ' ' + (ocrLines[i+1]?.text || '');
      let mode = (contextText.includes('行軍') || contextText.includes('行')) ? 'march' : 'rally';

      if (remSec > 0 && remSec <= 3600) {
        // Pixel Y position of this time line in preprocessed canvas
        const headerPixelY = ocrLine.bbox ? ocrLine.bbox.y0 : ((i / ocrLines.length) * (sourceImageElement ? sourceImageElement.height * canvasScale : 1000));

        // Pixel Y relative to original image height (in %)
        const actualYRatio = (headerPixelY / canvasScale) / imgH;

        // 🛡️ STRICT DEFENSE BLUE HEADER VALIDATOR:
        // Sample pixel color at header band (x=20% ~ 50% across card) to distinguish Defense (Blue) vs Attack (Red)
        if (imgCtx) {
          const sampleY = Math.min(imgH - 1, Math.max(0, Math.floor(actualYRatio * imgH)));
          const sampleX = Math.floor(imgW * 0.20);
          const px = imgCtx.getImageData(sampleX, sampleY, 1, 1).data;
          const r = px[0], g = px[1], b = px[2];

          // If header is distinctly Red (Attack Rally: r:160, g:81, b:76), skip it!
          // Defense headers have strong Blue (b > r + 15)
          const isAttackRed = (r > b + 20) && (r > 110);
          const isDefenseBlue = (b > r + 10) || (b > 130 && r < 100);

          if (isAttackRed && !isDefenseBlue) {
            console.log(`🚫 [Attack Filtered] Skipping Red Attack Card at y=${actualYRatio.toFixed(3)} (RGB: ${r},${g},${b}) - Time: ${normalizedTimeStr}`);
            continue;
          }
        }
        
        // Deduplicate cards that are too close vertically (< 8% distance)
        const prev = validCards[validCards.length - 1];
        if (!prev || Math.abs(prev.yRatio - actualYRatio) > 0.08) {
          validCards.push({
            mode: mode,
            timeStr: normalizedTimeStr,
            remSec: remSec,
            yRatio: actualYRatio,
            tag: '',
            name: `相手行軍 ${validCards.length + 1}`
          });
        }
      }
    }
  }

  // Renumber cards cleanly
  validCards.forEach((c, idx) => {
    c.name = `相手行軍 ${idx + 1}`;
  });

  ocrSessionState.detectedMarches = validCards;
  ocrSessionState.selectedTargetIdx = 0;

  renderOcrResultsView();
}

function renderOcrResultsView() {
  const loadingView = document.getElementById('ocr-loading-view');
  const resultsView = document.getElementById('ocr-results-view');
  if (loadingView) loadingView.classList.add('hidden');
  if (resultsView) resultsView.classList.remove('hidden');

  const countEl = document.getElementById('ocr-detected-count');
  if (countEl) countEl.textContent = ocrSessionState.detectedMarches.length;

  const listContainer = document.getElementById('ocr-detected-marches-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  if (ocrSessionState.detectedMarches.length === 0) {
    const noResultBox = document.createElement('div');
    noResultBox.className = 'bg-gray-900/95 border-2 border-yellow-500/80 rounded-2xl p-3.5 text-center space-y-1.5 shadow-xl';
    noResultBox.innerHTML = `
      <div class="text-yellow-300 font-black text-sm sm:text-base flex items-center justify-center gap-1.5">
        <i class="fa-solid fa-triangle-exclamation text-yellow-400"></i>
        <span>時間が見つかりません</span>
      </div>
      <div class="text-xs text-gray-300 font-bold leading-relaxed">
        集結・行軍時間が写っているスクショを<br>もう一度貼り付けてください。
      </div>
    `;
    listContainer.appendChild(noResultBox);
    return;
  }

  // Unified Single Scroll Container (100% synchronized smooth scrolling)
  const scrollWrapper = document.createElement('div');
  scrollWrapper.className = 'relative rounded-xl border-2 border-cyan-400/80 shadow-2xl bg-slate-950 p-2 overflow-y-auto max-h-[64vh] select-none';

  // Inner Layout: Relative Container where Right Column is directly pinned to image wrapper
  const innerContainer = document.createElement('div');
  innerContainer.className = 'relative flex gap-2 w-full';

  // Left Column: Cropped Image (Right 68% with members and times)
  const leftCol = document.createElement('div');
  leftCol.className = 'flex-1 rounded-lg overflow-hidden border border-cyan-500/50 bg-black shadow-inner relative';

  let imgEl = null;
  if (ocrSessionState.croppedRightSideDataUrl) {
    imgEl = document.createElement('img');
    imgEl.src = ocrSessionState.croppedRightSideDataUrl;
    imgEl.className = 'w-full h-auto block';
    imgEl.alt = 'ホワサバ敵行軍情報';
    leftCol.appendChild(imgEl);
  }
  innerContainer.appendChild(leftCol);

  // Right Column: Positioned buttons
  const rightCol = document.createElement('div');
  rightCol.className = 'w-32 relative shrink-0';

  // Function to align buttons to exact rendered pixel Y of image
  const positionButtons = () => {
    const renderedH = imgEl ? (imgEl.offsetHeight || imgEl.clientHeight) : 0;
    rightCol.style.height = (renderedH > 0 ? renderedH + 'px' : '100%');

    ocrSessionState.detectedMarches.forEach((m, idx) => {
      const btn = document.getElementById(`ocr-card-btn-${idx}`);
      if (btn) {
        const topRatio = (m.yRatio !== undefined && m.yRatio > 0) ? m.yRatio : (0.16 + (idx * 0.32));
        if (renderedH > 0) {
          btn.style.top = `${Math.max(4, (renderedH * topRatio) - 8)}px`;
        } else {
          btn.style.top = `${topRatio * 100}%`;
        }
      }
    });
  };

  ocrSessionState.detectedMarches.forEach((m, idx) => {
    const isSelected = idx === ocrSessionState.selectedTargetIdx;
    const isRally = m.mode === 'rally';

    const cardBtn = document.createElement('button');
    cardBtn.id = `ocr-card-btn-${idx}`;
    cardBtn.className = `absolute left-0 right-0 p-2 rounded-xl font-black text-xs transition-all text-left flex flex-col gap-0.5 border-2 shadow-xl ${
      isSelected
        ? 'bg-yellow-400 text-black border-yellow-100 shadow-2xl shadow-yellow-400/60 ring-4 ring-yellow-300 scale-105 z-20'
        : 'bg-gray-900/95 text-cyan-200 border-cyan-700/80 hover:border-cyan-400 hover:bg-cyan-950 z-10'
    }`;

    const topRatio = (m.yRatio !== undefined && m.yRatio > 0) ? m.yRatio : (0.16 + (idx * 0.32));
    cardBtn.style.top = `${topRatio * 100}%`;

    cardBtn.onclick = () => {
      ocrSessionState.selectedTargetIdx = idx;
      updateOcrTargetSelectionUI();
    };

    cardBtn.innerHTML = getOcrCardButtonInnerHTML(m, idx, isSelected);

    rightCol.appendChild(cardBtn);
  });

  if (imgEl) {
    imgEl.onload = positionButtons;
    setTimeout(positionButtons, 50);
  }
  innerContainer.appendChild(rightCol);

  scrollWrapper.appendChild(innerContainer);
  listContainer.appendChild(scrollWrapper);
}


function getOcrCardButtonInnerHTML(m, idx, isSelected) {
  const isRally = m.mode === 'rally';
  return `
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-black ${isSelected ? 'text-black' : 'text-yellow-300'}">
        ${isSelected ? '🎯 選択中' : '相手行軍 ' + (idx + 1)}
      </span>
      <span class="text-[9px] px-1 py-0.5 rounded font-black ${isSelected ? 'bg-black text-yellow-300' : 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'}">
        ${isRally ? '⏳集結' : '🏃行軍'}
      </span>
    </div>
    <div class="font-mono text-sm font-black ${isSelected ? 'text-black' : 'text-white'}">
      ${formatCountdownMMSS(m.remSec)}
    </div>
    <div class="text-[10px] text-right font-black ${isSelected ? 'text-black font-bold' : 'text-cyan-400'}">
      ${isSelected ? '✔ ターゲット中' : 'タップで選択 👉'}
    </div>
  `;
}

function updateOcrTargetSelectionUI() {
  ocrSessionState.detectedMarches.forEach((m, idx) => {
    const btn = document.getElementById(`ocr-card-btn-${idx}`);
    if (!btn) return;
    const isSelected = idx === ocrSessionState.selectedTargetIdx;
    btn.className = `absolute left-0 right-0 p-2 rounded-xl font-black text-xs transition-all text-left flex flex-col gap-0.5 border-2 shadow-xl ${
      isSelected
        ? 'bg-yellow-400 text-black border-yellow-100 shadow-2xl shadow-yellow-400/60 ring-4 ring-yellow-300 scale-105 z-20'
        : 'bg-gray-900/95 text-cyan-200 border-cyan-700/80 hover:border-cyan-400 hover:bg-cyan-950 z-10'
    }`;
    btn.innerHTML = getOcrCardButtonInnerHTML(m, idx, isSelected);
  });
}

function updateOcrTimeoutSafety(lagSec) {
  if (!ocrSessionState.detectedMarches || ocrSessionState.detectedMarches.length === 0) return;
  const selected = ocrSessionState.detectedMarches[ocrSessionState.selectedTargetIdx];
  if (!selected) return;

  const myMarchStr = document.getElementById('simple-my-march')?.value || '01:30';
  const myMarchSec = parseSecondsFromMMSS(myMarchStr);

  // Total landing time from capture point
  let enemyTotalLandSec = selected.remSec;
  if (selected.mode === 'rally') {
    const enemyMarchStr = document.getElementById('simple-enemy-march')?.value || '02:15';
    enemyTotalLandSec += parseSecondsFromMMSS(enemyMarchStr);
  }

  // Time remaining to launch from NOW
  const remainingUntilLaunch = (enemyTotalLandSec + 0.3 - myMarchSec) - lagSec;
  const warningEl = document.getElementById('ocr-timeout-warning');
  const confirmBtn = document.getElementById('btn-confirm-ocr-sync');

  if (remainingUntilLaunch < -1.0) {
    if (warningEl) warningEl.classList.remove('hidden');
    if (confirmBtn) {
      confirmBtn.className = "btn-game btn-sm btn-danger flex-2 py-2.5 font-black text-sm shadow opacity-90";
      confirmBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ⚠️ 間に合いませんが確定して開始';
    }
  } else {
    if (warningEl) warningEl.classList.add('hidden');
    if (confirmBtn) {
      confirmBtn.className = "btn-game btn-sm btn-accent flex-2 py-2.5 font-black text-sm shadow-lg shadow-yellow-500/30 flex items-center justify-center gap-1";
      confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> 🚀 この設定で確定・追従開始！';
    }
  }
}

// Apply OCR Selected Target into Single Launch Mode with Full Realtime Offset Correction
function applySelectedOcrTarget() {
  if (!ocrSessionState.detectedMarches || ocrSessionState.detectedMarches.length === 0) return;
  const selected = ocrSessionState.detectedMarches[ocrSessionState.selectedTargetIdx];
  if (!selected) return;

  const now = getAdjustedNowTime();
  const captureTime = ocrSessionState.captureTime || now;
  const elapsedSec = Math.max(0, (now.getTime() - captureTime.getTime()) / 1000);

  // 1. Compute exact corrected remaining time
  const correctedRemSec = Math.max(0, selected.remSec - elapsedSec);

  // 2. Set Status Mode (Rally vs March)
  setSimpleStatusMode(selected.mode);

  // 3. Set Remaining Time Input
  const remInput = document.getElementById('simple-remaining-time');
  if (remInput) {
    remInput.value = formatCountdownMMSS(correctedRemSec);
  }

  // 4. Save Enemy Tag/Name preset if present
  if (selected.tag || selected.name) {
    saveEnemyPreset(selected.tag, selected.name, selected.remSec);
  }

  closeOcrPreviewModal();

  // 5. Trigger Realtime Launch Sync Start!
  const myStr = document.getElementById('simple-my-march')?.value || '01:30';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '02:15';
  const remStr = document.getElementById('simple-remaining-time')?.value || '00:30';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);
  const remSec = parseSecondsFromMMSS(remStr);

  const startNow = getAdjustedNowTime();
  let rallyFinishDate;
  let enemyLandDate;

  if (selected.mode === 'rally') {
    rallyFinishDate = new Date(startNow.getTime() + remSec * 1000);
    enemyLandDate = new Date(rallyFinishDate.getTime() + enemySec * 1000);
  } else {
    rallyFinishDate = null;
    enemyLandDate = new Date(startNow.getTime() + remSec * 1000);
  }

  const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - mySec * 1000);

  simpleLaunchState.isCalculated = true;
  simpleLaunchState.statusMode = selected.mode;
  simpleLaunchState.calcStartTime = new Date(startNow.getTime());
  simpleLaunchState.startRemSec = remSec;
  simpleLaunchState.rallyFinishDate = rallyFinishDate;
  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  const btnReset = document.getElementById('btn-simple-reset');
  if (btnReset) btnReset.classList.remove('hidden');

  updateSimpleCountdown();
  updateAllianceTimeline();
}

// One-Tap Direct Clipboard Reader (for iPhone Shortcut JSON & Standard Image)
window.readFromClipboardDirectly = async function() {
  initAudio();
  try {
    // 1. Try reading text (iPhone JSON bundle)
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(text.trim());
          if (parsed.image) {
            console.log('⚡ [One-Tap Button] Successfully read iPhone Shortcut JSON bundle! Time:', parsed.time);
            let captureDate = getAdjustedNowTime();
            if (parsed.time) {
              const tStr = String(parsed.time);
              const dtMatch = tStr.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[\sT_]?(\d{2})[:：](\d{2})[:：](\d{2})/);
              if (dtMatch) {
                captureDate = new Date(parseInt(dtMatch[1], 10), parseInt(dtMatch[2], 10) - 1, parseInt(dtMatch[3], 10), parseInt(dtMatch[4], 10), parseInt(dtMatch[5], 10), parseInt(dtMatch[6], 10));
              } else {
                const timeOnly = tStr.match(/(\d{2})[:：](\d{2})[:：](\d{2})/);
                if (timeOnly) {
                  captureDate.setHours(parseInt(timeOnly[1], 10), parseInt(timeOnly[2], 10), parseInt(timeOnly[3], 10), 0);
                }
              }
            }

            const base64Data = parsed.image.replace(/^data:image\/[a-z]+;base64,/, '');
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });
            const file = new File([blob], 'shortcut_screenshot.png', { type: 'image/png', lastModified: captureDate.getTime() });

            ocrSessionState.imageFile = file;
            ocrSessionState.captureTime = captureDate;
            openOcrPreviewModal();
            startOcrLagTimer();
            await processImageWithTesseract(file);
            return;
          }
        } catch (e) {
          // not JSON, fallback
        }
      }
    }

    // 2. Try reading clipboard items (Raw Image)
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'clipboard_image.png', { type: type, lastModified: Date.now() });
            handleOcrImageFile(file);
            return;
          }
        }
      }
    }

    alert('⚠️ クリップボードに画像やショートカットデータが見つかりませんでした。\n先に背面タップするか、画像をコピーしてから押してください。');
  } catch (err) {
    console.error('Clipboard Read Error:', err);
    alert('📋 クリップボードへのアクセス権限を許可してください。\nまたは画面を長押しして「ペースト」を行ってください。');
  }
};
