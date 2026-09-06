
// --- Security: HTML Injection / XSS Protection Helper (v1.06.43) ---
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const APP_VERSION = '1.06.77';
window.APP_VERSION = APP_VERSION;
const CURRENT_SCHEMA_VERSION = 4;
window.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

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
function generateUniquePresetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'ep_' + crypto.randomUUID();
  }
  return 'ep_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function saveEnemyPreset(tag, name, marchSec) {
  if (!tag && !name) return;
  const cleanTag = tag.trim();
  const cleanName = name.trim();
  const naturalKey = `${cleanTag}:${cleanName}`;
  
  // 同盟タグ＋名前が一致する既存プリセットがあれば更新、無ければ衝突可能性を極めて低くした一意IDを付与して先頭追加
  const existing = state.enemyPresets.find(p => (p.key === naturalKey) || (p.tag === cleanTag && p.name === cleanName));
  if (!existing) {
    const id = generateUniquePresetId();
    state.enemyPresets.unshift({ id, key: id, naturalKey, tag: cleanTag, name: cleanName, marchSec });
    if (state.enemyPresets.length > 20) state.enemyPresets.pop();
  } else {
    if (!existing.id) existing.id = generateUniquePresetId();
    existing.key = existing.id;
    existing.naturalKey = naturalKey;
    existing.marchSec = marchSec;
  }
  localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
}

/* [RETIRED in v1.06.64] deleteSelectedPreset */

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

  // チャッピー指摘対応: indexedPresets/originalIdx を完全撤去し、純粋配列コピーでソート
  const sortedPresets = [...state.enemyPresets];

  if (presetSortMode === 'tag') {
    sortedPresets.sort((a, b) => {
      const tagA = (a.tag || '').toUpperCase();
      const tagB = (b.tag || '').toUpperCase();
      return tagA.localeCompare(tagB, 'ja');
    });
  } else if (presetSortMode === 'name') {
    sortedPresets.sort((a, b) => {
      const nameA = (a.name || '').toUpperCase();
      const nameB = (b.name || '').toUpperCase();
      return nameA.localeCompare(nameB, 'ja');
    });
  }

  sortedPresets.forEach(p => {
    const item = document.createElement('div');
    item.className = 'preset-item-card';
    const presetId = String(p.id || p.key || generateUniquePresetId());
    if (!p.id) p.id = presetId;
    if (!p.key) p.key = presetId;
    item.dataset.presetId = presetId;

    item.innerHTML = `
      <div class="preset-select-area flex-1 cursor-pointer" data-preset-id="${escapeHtml(presetId)}">
        <div class="font-bold text-cyan-300 text-sm flex items-center gap-2">
          ${p.tag ? `<span class="bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono">[${escapeHtml(p.tag)}]</span>` : ''}
          <span>${escapeHtml(p.name) || '領主名なし'}</span>
        </div>
        <div class="text-xs text-gray-400 font-mono mt-0.5">
          行軍時間: <span class="text-yellow-300 font-bold">${formatCountdownMMSSs(p.marchSec)}</span>
        </div>
      </div>
      <button type="button" class="preset-delete-btn" data-preset-id="${escapeHtml(presetId)}" title="このプリセットを削除">
        <i class="fa-solid fa-trash-can text-lg pointer-events-none"></i>
      </button>
    `;

    // チャッピー推奨: dataset を Single Source of Truth としてイベント受領
    const selectArea = item.querySelector('.preset-select-area');
    if (selectArea) {
      selectArea.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.presetId;
        selectPresetFromModal(id);
      });
    }

    const deleteBtn = item.querySelector('.preset-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.presetId;
        deletePresetFromModal(e, id);
      });
    }

    listElem.appendChild(item);
  });
}

function selectPresetFromModal(presetId) {
  if (!presetId) return;
  // 純粋Stable IDによるlookup（配列Index受け入れは完全撤去）
  const p = state.enemyPresets.find(item => item.id === presetId || item.key === presetId);
  if (!p) return;

  const march = state.marchList.find(m => m.id === currentTargetMarchIdForPreset);
  if (march) {
    march.allianceTag = p.tag;
    march.governorName = p.name;
    march.marchTimeSec = p.marchSec;
    march.selectedPresetKey = p.id || p.key;
    delete march.selectedPresetIndex;
    renderMarchCards();
    calculateInsertion();
  }
  closePresetPickerModal();
}

function deletePresetFromModal(event, presetId) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (!presetId) return;
  // 純粋Stable IDによるlookup（配列Index受け入れは完全撤去）
  const targetIdx = state.enemyPresets.findIndex(item => item.id === presetId || item.key === presetId);
  if (targetIdx === -1) return;

  const deletedItem = state.enemyPresets.splice(targetIdx, 1)[0];
  if (deletedItem) {
    state.lastDeletedPreset = deletedItem;
    const deletedId = deletedItem.id || deletedItem.key;
    state.marchList.forEach(m => {
      if (m.selectedPresetKey === deletedId || m.selectedPresetKey === deletedItem.id) {
        delete m.selectedPresetKey;
      }
      if (m.selectedPresetIndex !== undefined) delete m.selectedPresetIndex;
    });
    localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
    renderPresetPickerList();
    renderMarchCards();
    calculateInsertion();
  }
}

function loadEnemyPresets() {
  const saved = localStorage.getItem('wos_enemy_presets');
  let hasNormalized = false;
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const rawList = Array.isArray(parsed) ? parsed : [];
      const cleanList = [];
      const seenIds = new Set();

      // チャッピーP1/P2指摘対応: malformed preset (nullや非オブジェクト) の安全リカバリー＆正常要素の保持
      rawList.forEach(p => {
        if (!p || typeof p !== 'object') {
          hasNormalized = true; // 不正なnull/プリミティブ要素は安全にドロップ
          return;
        }

        // チャッピーP1指摘対応: id/key のフィールド型不正 (数値等) や空白の厳格文字列正規化
        let candidateId = (typeof p.id === 'string' && p.id.trim()) ? p.id.trim()
                        : (typeof p.key === 'string' && p.key.trim()) ? p.key.trim()
                        : null;

        if (!candidateId) {
          candidateId = generateUniquePresetId();
          hasNormalized = true;
        } else if (p.id !== candidateId) {
          hasNormalized = true;
        }

        // チャッピーP2指摘対応: 重複ID衝突時は while ループにより「必ずseenIdsに存在しない一意ID」を数学的に完全保証
        while (seenIds.has(candidateId)) {
          candidateId = generateUniquePresetId();
          hasNormalized = true;
        }
        seenIds.add(candidateId);

        p.id = candidateId;
        // チャッピーP1指摘対応: key を必ず id の完全ミラーとして一本化 (id/key 相互衝突・二重性リスクの完全排除)
        if (p.key !== p.id) {
          p.key = p.id;
          hasNormalized = true;
        }

        cleanList.push(p);
      });

      state.enemyPresets = cleanList;
      if (hasNormalized) {
        localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
      }
    } catch (e) {
      state.enemyPresets = [];
    }
  } else {
    state.enemyPresets = [];
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

    // Preset dropdown options (純粋 Stable Key 単一責任 - チャッピー指摘対応)
    let presetOptionsHtml = '<option value="">-- 💾 プリセット呼出 --</option>';
    state.enemyPresets.forEach(p => {
      const pKey = p.id || p.key;
      const isSelected = march.selectedPresetKey && (march.selectedPresetKey === p.id || march.selectedPresetKey === pKey);
      presetOptionsHtml += `<option value="${escapeHtml(pKey)}" ${isSelected ? 'selected' : ''}>[${escapeHtml(p.tag)}] ${escapeHtml(p.name)} (${formatCountdownMMSSs(p.marchSec)})</option>`;
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
                 value="${escapeHtml(march.allianceTag || '')}" placeholder="ABC" 
                 oninput="this.value = this.value.toUpperCase(); updateMarchData(${march.id}, 'allianceTag', this.value)">
        </div>
        <div class="input-group">
          <label>領主名</label>
          <input type="text" class="game-input gov-input" 
                 value="${escapeHtml(march.governorName || '')}" placeholder="PlayerName"
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


function updateMarchData(id, field, value) {
  const march = state.marchList.find(m => m.id === id);
  if (!march) return;
  march[field] = value;
  calculateInsertion();
}

function getProjectedLandDate(march) {
  if (march.targetLandDate instanceof Date && !isNaN(march.targetLandDate.getTime())) {
    return march.targetLandDate;
  }
  if (march.startTimestamp && march.initialRallySec !== undefined) {
    return new Date(march.startTimestamp + (march.initialRallySec + (march.marchTimeSec || 90)) * 1000);
  }
  const refNow = getAdjustedNowTime();
  const rem = typeof march.remainingRallySec === 'number' ? march.remainingRallySec : 300;
  const mSec = typeof march.marchTimeSec === 'number' ? march.marchTimeSec : 90;
  if (march.isRunning) {
    return new Date(refNow.getTime() + (rem + mSec) * 1000);
  }
  if (!march.frozenLandDate || !(march.frozenLandDate instanceof Date) || isNaN(march.frozenLandDate.getTime())) {
    march.frozenLandDate = new Date(refNow.getTime() + (rem + mSec) * 1000);
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

function setMarchRunning(march, running) {
  if (!march) return;
  march.isRunning = running;
  syncWakeLock();
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
    setMarchRunning(march, true);
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
  syncWakeLock();
}

// applyEnemyPresetToMarch has been retired in favor of production selectPresetFromModal()

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
    syncWakeLock();
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


// --- Screen Wake Lock Manager (v1.06.57 Detached-Release & Recovery Lifecycle) ---
let wakeLockInstance = null;
let wakeLockToken = 0; // チャッピー指摘対応: 非同期リクエスト競合 (Race Condition) 根絶用世代トークン

async function requestScreenWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (wakeLockInstance) return; // 既に保持中の場合は多重取得しない

  const currentToken = ++wakeLockToken;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    // 非同期待機中に状態が変化して release されていた場合は即座に破棄して復帰
    if (wakeLockToken !== currentToken || !isAnyTimerActive()) {
      try { await sentinel.release(); } catch (e) {}
      console.log('💡 Screen WakeLock discarded: Request superseded during async acquire');
      return;
    }
    wakeLockInstance = sentinel;
    console.log('💡 Screen WakeLock acquired: Display will stay on (token: ' + currentToken + ')');
    wakeLockInstance.addEventListener('release', () => {
      if (wakeLockInstance === sentinel) {
        wakeLockInstance = null;
        console.log('💡 Screen WakeLock released');
        // チャッピー指摘対応 (外部解除からの自動回復): タイマー稼働中ならマイクロタスクで再取得
        if (isAnyTimerActive()) {
          queueMicrotask(syncWakeLock);
        }
      }
    });
  } catch (err) {
    console.warn('WakeLock request failed or unsupported:', err);
  }
}

async function releaseScreenWakeLock() {
  // チャッピー指摘対応 (P0-1 release/restart race 根絶):
  // await release() での待機前に即座にインスタンスを切り離し世代トークンを進める
  // これにより release 待機中に直後の START が発生しても「保持中」と誤判定せず新トークンで再取得可能
  const instance = wakeLockInstance;
  wakeLockInstance = null;
  wakeLockToken++;

  if (instance) {
    try {
      await instance.release();
    } catch (e) {}
    console.log('💡 Screen WakeLock cleanly released (detached)');
  }
}

// Helper to check if any timer is actively running across single or multi modes
function isAnyTimerActive() {
  if (typeof simpleLaunchState !== 'undefined' && simpleLaunchState && simpleLaunchState.isCalculated) return true;
  if (Array.isArray(state.marchList) && state.marchList.some(m => m.isRunning)) return true;
  if (typeof isAllianceCalculationActive === 'function' && isAllianceCalculationActive()) return true;
  return false;
}

// チャッピー指摘対応 (P1): syncWakeLock() による一元ライフサイクル管理
// タイマー稼働中のみ画面スリープを防止し、タイマー未稼働・停止時は即座にWakeLockを解放
function syncWakeLock() {
  if (isAnyTimerActive()) {
    requestScreenWakeLock();
  } else {
    releaseScreenWakeLock();
  }
}
window.syncWakeLock = syncWakeLock;

// スリープ復帰・アプリ切替時の表示即時更新 ＆ WakeLock再同期
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (typeof updateAllTimersUI === 'function') {
      try { updateAllTimersUI(); } catch (e) { console.warn('updateAllTimersUI error on visibilitychange:', e); }
    }
    syncWakeLock();
  }
});

// --- Toast / Snackbar Notification Helper (v1.06.43) ---
function showToast(message, type = 'success', duration = 2200) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%); z-index: 9999999; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 90vw; width: max-content;';
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
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML = iconHtml;
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, duration);
}

// --- Vibration Feedback Helper (v1.06.43) ---
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
/* [RETIRED in v1.06.64] saveEnemyHistory */

function loadEnemyHistory() {
  const saved = localStorage.getItem('wos_enemy_history');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.history = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      state.history = [];
    }
  } else {
    state.history = [];
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
        <span class="font-bold text-yellow-400">[${escapeHtml(item.tag || '??? ')}]</span>
        <span class="text-gray-200 ml-1">${escapeHtml(item.name || '不明')}</span>
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
    const launchMaxDate = new Date(e2.landDate.getTime() - getInsertionMarginMs() - myMarchSec * 1000);
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
  if (!activeGap || !activeGap.enemy1 || !activeGap.enemy2) return;
  const enemy1 = activeGap.enemy1;
  const enemy2 = activeGap.enemy2;
  const enemy1LandDate = enemy1.landDate;
  const enemy2LandDate = enemy2.landDate;
  const gapDeltaSec = activeGap.deltaSec;

  // Update Target Labels (Show rank + enemy number)
  const l1 = document.getElementById('label-target-enemy1'); if (l1) l1.textContent = `${activeGap.rank1}着 (相手 ${enemy1.originalIdx + 1}) 着弾:`;
  const l2 = document.getElementById('label-target-enemy2'); if (l2) l2.textContent = `${activeGap.rank2}着 (相手 ${enemy2.originalIdx + 1}) 着弾:`;

  // Earliest Launch (Enemy 1 + 0.3s)
  const launchMinDate = new Date(enemy1LandDate.getTime() + getInsertionMarginMs() - myMarchSec * 1000);
  // Latest Launch (Enemy 2 - 0.3s)
  const launchMaxDate = new Date(enemy2LandDate.getTime() - getInsertionMarginMs() - myMarchSec * 1000);
  // Middle Recommended Launch
  const launchMidDate = new Date(launchMinDate.getTime() + (launchMaxDate.getTime() - launchMinDate.getTime()) / 2);

  // Window Span in seconds (max - min)
  const windowSpanSec = Math.max(0, (launchMaxDate.getTime() - launchMinDate.getTime()) / 1000);

  // Countdown to Earliest Launch
  const launchMinCountdownSec = (launchMinDate.getTime() - now.getTime()) / 1000;
  const launchMaxCountdownSec = (launchMaxDate.getTime() - now.getTime()) / 1000;

  // Update UI Elements
  const e1Land = document.getElementById('res-enemy1-land'); if (e1Land) e1Land.textContent = formatTimeHHMMSSs(enemy1LandDate);
  const e2Land = document.getElementById('res-enemy2-land'); if (e2Land) e2Land.textContent = formatTimeHHMMSSs(enemy2LandDate);
  const resDelta = document.getElementById('res-gap-delta'); if (resDelta) resDelta.textContent = `${gapDeltaSec.toFixed(1)}s`;
  const resSpan = document.getElementById('res-window-span'); if (resSpan) resSpan.textContent = `${windowSpanSec.toFixed(1)}秒間`;

  const rMin = document.getElementById('res-launch-min'); if (rMin) rMin.textContent = formatTimeHHMMSSs(launchMinDate);
  const rMid = document.getElementById('res-launch-mid'); if (rMid) rMid.textContent = formatTimeHHMMSSs(launchMidDate);
  const rMax = document.getElementById('res-launch-max'); if (rMax) rMax.textContent = formatTimeHHMMSSs(launchMaxDate);

  // Main scheduled launch time display set to Earliest Launch
  const schTime = document.getElementById('launch-scheduled-time'); if (schTime) schTime.textContent = formatTimeHHMMSSs(launchMinDate);

  const countdownElem = document.getElementById('launch-countdown');
  const miniTimerElem = document.getElementById('mini-launch-timer');
  const miniTimeElem = document.getElementById('mini-launch-time');
  const miniHeaderElem = document.getElementById('header-mini-launch');
  const miniFillElem = document.getElementById('mini-launch-fill');
  const statusElem = document.getElementById('window-status-text');
  const fillElem = document.getElementById('launch-window-fill');

  const safeSetText = (elem, text) => { if (elem) elem.textContent = text; };
  const safeSetHtml = (elem, html) => { if (elem) elem.innerHTML = html; };

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
    const staticMinCountdownSec = (enemy1.march.remainingRallySec + enemy1.march.marchTimeSec + (getInsertionMarginMs() / 1000)) - myMarchSec;
    const staticCountdownStr = formatCountdownMMSSs(Math.max(0, staticMinCountdownSec));
    safeSetText(countdownElem, staticCountdownStr);
    safeSetText(miniTimerElem, staticCountdownStr);
    if(statusElem) statusElem.className = "text-xs text-center font-bold text-cyan-300 mt-1";
    safeSetText(statusElem, `⏸ タイマー待機中 (対象相手の「▶ スタート」で進行します)`);
    if(fillElem) fillElem.style.left = '0%';
    if(fillElem) fillElem.style.width = '0%';
    if (miniFillElem) miniFillElem.style.width = '0%';
      if (miniHeaderElem) miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-300 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/30";
  } else if (isPastDeadline) {
    // 2. EXPIRED STATE: Marches were started, and current time has passed latest launch deadline
    safeSetText(countdownElem, "00:00.0");
    safeSetText(miniTimerElem, "00:00.0");
    if(statusElem) statusElem.className = "text-xs text-center font-bold text-red-400 mt-1";
    safeSetText(statusElem, `❌ 発車タイミングを過ぎました`);
    if(miniHeaderElem) miniHeaderElem.className = "mt-1 text-xs font-bold text-red-400 contrast-plate px-2 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10";
    fillElem.style.left = '0%';
    if(fillElem) fillElem.style.width = '100%';
    if (miniFillElem) miniFillElem.style.width = '100%';
  } else {
    // 3. ACTIVE COUNTDOWN STATE: Marches were started, and deadline is in the future
    const displayCountdownSec = Math.max(0, launchMinCountdownSec);
    const countdownStr = formatCountdownMMSSs(displayCountdownSec);
    safeSetText(countdownElem, countdownStr);
    safeSetText(miniTimerElem, countdownStr);

    if (launchMinCountdownSec > 0) {
      // Before earliest launch
      if (statusElem) statusElem.className = "text-xs text-center font-bold text-green-300 mt-1";
      if (statusElem) statusElem.textContent = `🟢 最速発車まで あと ${formatCountdownMMSSs(launchMinCountdownSec)} (猶予 ${windowSpanSec.toFixed(1)}秒間)`;
      fillElem.style.left = '0%';
      fillElem.style.width = '0%';
      if (miniFillElem) miniFillElem.style.width = '0%';
      if (miniHeaderElem) miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-300 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/30";
    } else {
      // Currently INSIDE the launch window!
      if (statusElem) statusElem.className = "text-xs text-center font-bold text-yellow-300 animate-pulse mt-1";
      if (statusElem) statusElem.textContent = `🔥【今すぐ発車可能！】 締め切りまで 残り ${launchMaxCountdownSec.toFixed(1)}秒！`;
      if (miniHeaderElem) miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-400 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/50 bg-yellow-500/20 animate-pulse";

      // Fill from left to right as time passes inside window (0% -> 100%)
      let elapsedTimeInWindow = windowSpanSec - launchMaxCountdownSec;
      let percentFilled = Math.max(0, Math.min(100, (elapsedTimeInWindow / windowSpanSec) * 100));
      fillElem.style.left = '0%';
      fillElem.style.width = `${percentFilled}%`;
      if (miniFillElem) miniFillElem.style.width = `${percentFilled}%`;
    }
  }

  // Countdown Alert Color Changes (5s / 3s) & Audio Beep (Only when started)
  if (countdownElem) countdownElem.classList.remove('warning-5s', 'danger-3s');

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
    if (riskBadge) riskBadge.style.display = 'none';
  } else {
    if (riskBadge) riskBadge.style.display = 'inline-flex';
    if (riskBadge) riskBadge.className = 'risk-badge safe-text';

    if (gapDeltaSec >= 3.0) {
      if (riskBadge) riskBadge.classList.add('risk-safe');
      if (riskBadge) riskBadge.innerHTML = `<i class="fa-solid fa-shield-check"></i> 🟢 安全 (発車猶予 ${windowSpanSec.toFixed(1)}s 成功率極高)`;
    } else if (gapDeltaSec >= 1.1) {
      if (riskBadge) riskBadge.classList.add('risk-warn');
      if (riskBadge) riskBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 🟡 注意 (発車猶予 ${windowSpanSec.toFixed(1)}s 微調整推奨)`;
    } else {
      if (riskBadge) riskBadge.classList.add('risk-danger');
      if (riskBadge) riskBadge.innerHTML = `<i class="fa-solid fa-radiation"></i> 🔴 危険 (着弾差 ${gapDeltaSec.toFixed(1)}s - 同秒判定重複リスク)`;
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
    const now = getAdjustedNowTime();
    // Update live clock display
    try {
      const timeStr = formatTimeHHMMSSs(now);
      const clockElem = document.getElementById('live-clock');
      if (clockElem) clockElem.textContent = timeStr;
      const modalClock = document.getElementById('modal-live-clock');
      if (modalClock) modalClock.textContent = timeStr;
      const shareClock = document.getElementById('share-modal-live-clock');
      if (shareClock) shareClock.textContent = timeStr;
      const shareModal = document.getElementById('operation-share-modal');
      if (shareModal && shareModal.classList.contains('open') && typeof updateOperationSharePreview === 'function') {
        updateOperationSharePreview();
      }
    } catch (e) {
      console.error('Clock display error:', e);
    }

    // Update active timers if live mode is counting down (チャッピー指摘対応: タイムスタンプ基準によるタイマー狂い・ズレ完全根絶)
    if (state.mode === 'live') {
      let cardStateChanged = false;
      const refNowMs = now.getTime();
      state.marchList.forEach(m => {
        if (m.isRunning) {
          if (m.startTimestamp && m.initialRallySec !== undefined) {
            const elapsedSec = (refNowMs - m.startTimestamp) / 1000;
            const remaining = Math.max(0, m.initialRallySec - elapsedSec);
            m.remainingRallySec = Math.round(remaining * 10) / 10;
            if (m.remainingRallySec <= 0) {
              m.remainingRallySec = 0;
              m.isRunning = false;
              cardStateChanged = true;
            }
          } else {
            // チャッピー指摘対応: startTimestampが欠落した不正Running状態はドリフト減算せず安全停止
            console.warn(`[Safety Stop] March #${m.id} missing startTimestamp in running state`);
            m.isRunning = false;
            cardStateChanged = true;
          }
        }
      });

      if (cardStateChanged) {
        syncWakeLock();
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
      if (typeof drawAndPushPipFrame === 'function') {
        drawAndPushPipFrame();
      }
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
※相手着弾直後 (+${(getInsertionMarginMs() / 1000).toFixed(1)}秒後) に合わせた自動計算指示です。`;
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

/* [RETIRED in v1.06.64] copySimpleAllianceChat */

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
window.calcHistory = calcHistory;
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

// チャッピー・Claude指摘対応 (安全性完全保証パーサー):
// 任意JavaScript実行 eval() 撤去に加え、不正数値構文(複数小数点 1.2.3 等)および括弧不整合((5+3 等)を自身で厳格拒絶
function safeEvalArithmetic(exprStr) {
  let cleaned = exprStr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!cleaned) return 0;
  // 安全文字ホワイトリスト検査 (数字、小数点、四則演算子、括弧のみ)
  if (!/^[0-9+\-*/.()]+$/.test(cleaned)) {
    throw new Error('Invalid arithmetic characters');
  }

  // 再帰下降構文解析 (Recursive Descent Parser)
  let pos = 0;
  function peek() { return cleaned[pos]; }
  function get() { return cleaned[pos++]; }

  function parsePrimary() {
    let ch = peek();
    if (ch === '(') {
      get(); // consume '('
      let val = parseExpr();
      if (peek() !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      get(); // consume ')'
      return val;
    }
    if (ch === '-' || ch === '+') {
      let sign = get() === '-' ? -1 : 1;
      return sign * parsePrimary();
    }
    let start = pos;
    let dotCount = 0;
    while (pos < cleaned.length && /[0-9.]/.test(cleaned[pos])) {
      if (cleaned[pos] === '.') {
        dotCount++;
        if (dotCount > 1) {
          throw new Error('Invalid number format: multiple decimal points');
        }
      }
      pos++;
    }
    if (start === pos) throw new Error('Number expected');
    let numStr = cleaned.slice(start, pos);
    if (numStr === '.') {
      throw new Error('Malformed decimal number: ' + numStr);
    }
    let n = parseFloat(numStr);
    if (isNaN(n)) throw new Error('Invalid number: ' + numStr);
    return n;
  }

  function parseFactor() {
    let val = parsePrimary();
    while (pos < cleaned.length) {
      let op = peek();
      if (op === '*' || op === '/') {
        get();
        let right = parsePrimary();
        if (op === '*') val = val * right;
        else {
          if (right === 0) throw new Error('Division by zero');
          val = val / right;
        }
      } else {
        break;
      }
    }
    return val;
  }

  function parseExpr() {
    let val = parseFactor();
    while (pos < cleaned.length) {
      let op = peek();
      if (op === '+' || op === '-') {
        get();
        let right = parseFactor();
        if (op === '+') val = val + right;
        else val = val - right;
      } else {
        break;
      }
    }
    return val;
  }

  const result = parseExpr();
  if (pos < cleaned.length) throw new Error('Unexpected token: ' + cleaned[pos]);
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Calculation result is not a finite number');
  }
  return Math.round(result * 100000000) / 100000000; // 丸め誤差保護
}

function evaluateCalc() {
  let expr = state.calc.expression;
  if (!expr) return;

  try {
    let resultStr = '';
    if (state.calc.mode === 'normal') {
      let res = safeEvalArithmetic(expr);
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
        <span class="text-gray-300 font-mono">${escapeHtml(item.expr || '')} = <strong class="text-cyan-300">${escapeHtml(item.result || '')}</strong></span>
        <div class="flex gap-1">
          <button class="btn-game btn-xs btn-secondary text-[11px] px-1.5 py-0.5" onclick="useHistoryResult('${encodeURIComponent(item.result || '')}')">再利用</button>
          <button class="btn-game btn-xs bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-[10px] px-1 py-0.5" onclick="transferHistoryToSimple('${encodeURIComponent(item.result || '')}')">反映</button>
        </div>
      </div>
      <input type="text" class="game-input text-xs" style="height:26px;" placeholder="メモを入力... (例: 砦差し込み用)" 
             value="${escapeHtml(item.note || '')}" onchange="updateCalcHistoryNote('${encodeURIComponent(item.id)}', this.value)">
    `;
    container.appendChild(div);
  });
}

function transferHistoryToSimple(resStr) {
  resStr = decodeURIComponent(resStr || "");
  const sec = parseFlexibleInputToSeconds(resStr);
  calcActiveResultSec = sec;
  transferCalcResultToSimple('my');
}

function updateCalcHistoryNote(id, noteVal) {
  const targetIdStr = String(id || "");
  const item = calcHistory.find(i => String(i.id) === targetIdStr);
  if (item) {
    item.note = noteVal;
    persistCalcHistory();
  }
}

function useHistoryResult(res) {
  res = decodeURIComponent(res || "");
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
    'simple-sub-info': [],
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

// --- Insertion Margin Offset Engine (v1.06.43: +0.1s / +0.3s / +0.5s) ---
function getInsertionMarginMs() {
  if (state.settings && typeof state.settings.insertionMarginMs === 'number') {
    return state.settings.insertionMarginMs;
  }
  return 300; // Default +0.3s
}

function setInsertionMarginOffset(marginMs) {
  state.settings.insertionMarginMs = marginMs;
  saveAppSettings();
  updateInsertionMarginUI();

  // Instantly recalculate insertion if calculation is active
  if (typeof calculateInsertion === 'function') calculateInsertion();
  if (simpleLaunchState.isCalculated && typeof recalculateSimpleLaunchStateOnMarchChange === 'function') {
    recalculateSimpleLaunchStateOnMarchChange();
  }
  if (typeof updateAllianceTimeline === 'function') {
    updateAllianceTimeline(true);
  }
  if (typeof updateAllianceCopyButtons === 'function') {
    updateAllianceCopyButtons();
  }

  showToast(`🎯 差し込みマージンを【+${(marginMs / 1000).toFixed(1)}s】に変更しました`, 'info');
}

function updateInsertionMarginUI() {
  const currentMargin = getInsertionMarginMs();
  const marginSecStr = (currentMargin / 1000).toFixed(1);
  const displayElem = document.getElementById('setting-margin-display');
  if (displayElem) {
    displayElem.textContent = `+${marginSecStr}s`;
  }

  [100, 300, 500].forEach(val => {
    const btn = document.getElementById(`btn-margin-opt-${val}`);
    if (btn) {
      if (val === currentMargin) {
        btn.className = "btn-game btn-xs py-2 text-center flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-amber-400 text-amber-300 font-black bg-amber-950/90 shadow-[0_0_12px_rgba(245,158,11,0.6)]";
      } else {
        btn.className = "btn-game btn-xs py-2 text-center flex flex-col items-center justify-center gap-0.5 rounded-lg border border-gray-700 text-gray-400 font-bold bg-black/40";
      }
    }
  });

  // Update dynamic subtitle under calculation card (both idle and active!)
  const subInfo = document.getElementById('simple-sub-info');
  if (subInfo) {
    if (simpleLaunchState.isCalculated) {
      subInfo.textContent = `相手着弾直後 (+${marginSecStr}s後) に自動合わせ中`;
    } else {
      subInfo.textContent = `相手着弾 ${marginSecStr}秒後 直後に自動合わせ`;
    }
  }
}

function setButtonTheme(themeKey) {
  state.settings.buttonTheme = themeKey || 'neon';
  saveAppSettings();
  applyButtonTheme();
  updateInsertionMarginUI();
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

// v1.06.43 Vibration ON/OFF Control

// Handlers for Audio Alert & Vibration settings checkboxes
function handleSettingAudioChange(enabled) {
  if (enabled) {
    initAudio();
  }
  setSimpleAudioMuteState(!enabled);
}

function handleSettingVibrationChange(enabled) {
  setSimpleVibrationState(enabled);
}

let isSimpleVibrationEnabled = localStorage.getItem('wos_simple_vibration_enabled') !== 'false';

function setSimpleVibrationState(enabled) {
  isSimpleVibrationEnabled = enabled;
  localStorage.setItem('wos_simple_vibration_enabled', enabled ? 'true' : 'false');
  const cbVibe = document.getElementById('setting-vibration');
  if (cbVibe) cbVibe.checked = enabled;
  updateAllToggleButtonsUI();
}

/* [RETIRED in v1.06.64] toggleSimpleVibration */

let isSimpleAudioMuted = false;

function setSimpleAudioMuteState(muted) {
  isSimpleAudioMuted = muted;
  localStorage.setItem('wos_simple_audio_muted', muted ? 'true' : 'false');
  const cbAudio = document.getElementById('setting-audio-alert');
  if (cbAudio) cbAudio.checked = !muted;
  updateAllToggleButtonsUI();
}

/* [RETIRED in v1.06.64] toggleSimpleAudioMute */

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

/* [RETIRED in v1.06.64] scrollToTop */

// --- Legacy Preset Migration Engine (v1.06.69 - チャッピーP1指摘対応: 共通純粋関数化) ---
function migrateLegacyPresetSelections() {
  if (!Array.isArray(state.marchList) || !Array.isArray(state.enemyPresets) || state.enemyPresets.length === 0) {
    return;
  }
  state.marchList.forEach(march => {
    if (!march.selectedPresetKey && typeof march.selectedPresetIndex === 'number') {
      const legacyPreset = state.enemyPresets[march.selectedPresetIndex];
      if (legacyPreset && (legacyPreset.id || legacyPreset.key)) {
        march.selectedPresetKey = legacyPreset.id || legacyPreset.key;
        // チャッピー指摘対応: 変換成功時のみ legacy index を削除 (破損データでの情報誤消失を完全防止)
        delete march.selectedPresetIndex;
      } else {
        console.warn(`[LegacyPresetMigration] March[${march.id}] の legacy index (${march.selectedPresetIndex}) に該当するプリセットが見つかりません。未解決indexを保持します。`);
      }
    }
  });
}
window.migrateLegacyPresetSelections = migrateLegacyPresetSelections;

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

  // [LEGACY MIGRATION LAYER - チャッピー指摘対応 (P1)]
  // marchList 生成/復元後に共通移行関数を実行し、古い selectedPresetIndex を Stable ID へ自動昇華
  migrateLegacyPresetSelections();

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

  // Tap to start splash handler with strict one-shot guard (チャッピー指摘対応: 多重イベント・タイマー多重予約の完全防止)
  let splashDismissed = false;
  const hideSplash = () => {
    if (splashDismissed) return;
    splashDismissed = true;
    initAudio();
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => splash.style.display = 'none', 600);
    }
    setTimeout(() => {
      if (typeof checkAndTriggerOnboarding === 'function') {
        checkAndTriggerOnboarding();
      }
    }, 450);
  };
  window.hideSplash = hideSplash;

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

  // Clear History (v1.06.43: confirm dialog guard)
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    if (confirm('履歴をすべて消去しますか？')) {
      state.history = [];
      localStorage.removeItem('wos_enemy_history');
      renderHistoryList();
    }
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
  // v1.06.43: スプラッシュが非表示状態の場合の初回オンボーディング自動起動フォールバック
  const splashEl = document.getElementById('splash-screen');
  if (splashEl && (splashEl.style.display === 'none' || splashEl.classList.contains('hidden'))) {
    setTimeout(() => {
      if (typeof checkAndTriggerOnboarding === 'function') {
        checkAndTriggerOnboarding();
      }
    }, 600);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Floating Jump Button Helper
/* [RETIRED in v1.06.64] jumpToResultCard */

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
  
  const updateFixedBadge = (id) => {
    const b = document.getElementById(id);
    if (!b) return;
    if (state.timezone === 'UTC') {
      b.className = "w-[76px] py-1 rounded-lg text-[11px] font-black tracking-wide border shadow-md transition-all flex items-center justify-center gap-1 bg-yellow-950/90 border-yellow-400 text-yellow-300 shadow-yellow-500/20 select-none cursor-pointer active:scale-95 whitespace-nowrap";
      b.innerHTML = `<i class="fa-solid fa-globe text-yellow-400 text-xs"></i> <span>UTC</span>`;
    } else {
      b.className = "w-[76px] py-1 rounded-lg text-[11px] font-black tracking-wide border shadow-md transition-all flex items-center justify-center gap-1 bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-cyan-500/20 select-none cursor-pointer active:scale-95 whitespace-nowrap";
      b.innerHTML = `<span>${localInfo.flag}</span> <span>${localInfo.code}</span>`;
    }
  };

  updateFixedBadge('tz-indicator-badge');
  updateFixedBadge('simple-tz-badge');

  const floatingBadge = document.getElementById('floating-tz-badge');
  if (floatingBadge) {
    if (state.timezone === 'UTC') {
      floatingBadge.className = "px-2 py-0.5 rounded-full text-xs font-black tracking-wide border shadow-md transition-all flex items-center gap-1 bg-yellow-950/90 border-yellow-400 text-yellow-300 shadow-yellow-500/20";
      floatingBadge.innerHTML = "<span>🌐 UTC</span>";
    } else {
      floatingBadge.className = "px-2 py-0.5 rounded-full text-xs font-black tracking-wide border shadow-md transition-all flex items-center gap-1 bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-cyan-500/20";
      floatingBadge.innerHTML = `<span>${localInfo.flag} ${localInfo.code}</span>`;
    }
  }
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


/**
 * 差し込み計算進行中のリアルタイム再計算エンジン (v1.06.43)
 * 集結中/行軍中の切替、行軍時間の変更、残り時間調整時に瞬時に着弾＆発車時刻を再計算
 */
function recalculateSimpleLaunchStateOnMarchChange(showVisualFeedback = false, overrideRemSec = null) {
  if (!simpleLaunchState.isCalculated) return;

  const myStr = document.getElementById('simple-my-march')?.value || '';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '';
  const remInput = document.getElementById('simple-remaining-time');
  const remStr = remInput?.value || '';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);
  
  const now = getAdjustedNowTime();
  let currentRemSec;

  if (overrideRemSec !== null && overrideRemSec !== undefined) {
    // ユーザーが調整ボタン等で明示的に残り時間を変更した場合：新しい基準値として同期！
    currentRemSec = Math.max(0, overrideRemSec);
    simpleLaunchState.startRemSec = currentRemSec;
    simpleLaunchState.calcStartTime = new Date(now.getTime());
    if (remInput) remInput.value = formatCountdownMMSS(currentRemSec);
    const modalRemVal = document.getElementById('modal-rem-time-val');
    if (modalRemVal) modalRemVal.textContent = formatCountdownMMSS(currentRemSec);
  } else {
    // 通常の行軍時間変更やモード切替の場合：経過時間を維持して計算
    currentRemSec = parseSecondsFromMMSS(remStr);
    if (simpleLaunchState.calcStartTime) {
      const elapsedSec = (now.getTime() - simpleLaunchState.calcStartTime.getTime()) / 1000;
      currentRemSec = Math.max(0, simpleLaunchState.startRemSec - elapsedSec);
    }
  }

  let rallyFinishDate;
  let enemyLandDate;

  if (simpleLaunchState.statusMode === 'rally') {
    rallyFinishDate = new Date(now.getTime() + currentRemSec * 1000);
    enemyLandDate = new Date(rallyFinishDate.getTime() + enemySec * 1000);
  } else {
    rallyFinishDate = null;
    enemyLandDate = new Date(now.getTime() + currentRemSec * 1000);
  }

  const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - mySec * 1000);

  // Update state without interrupting running countdown
  simpleLaunchState.rallyFinishDate = rallyFinishDate;
  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  // Immediate UI update
  updateSimpleCountdown();
  updateAllianceTimeline();

  // Visual & toast feedback
  if (showVisualFeedback) {
    const resultBox = document.getElementById('simple-result-box');
    if (resultBox) {
      resultBox.classList.remove('recalc-flash');
      // Trigger reflow to restart CSS animation
      void resultBox.offsetWidth;
      resultBox.classList.add('recalc-flash');
    }
    const modeName = simpleLaunchState.statusMode === 'rally' ? '相手が集結中' : '相手が行軍中';
    showToast(`🔄 ${modeName} に合わせて再計算しました！`, 'info', 1800);
  }
}
window.recalculateSimpleLaunchStateOnMarchChange = recalculateSimpleLaunchStateOnMarchChange;

// === v1.02.02 TRIAL: Super Simple Launch Mode Controller ===
function setSimpleStatusMode(mode) {
  simpleLaunchState.statusMode = mode || 'rally';
  const btnRally = document.getElementById('btn-simple-mode-rally');
  const btnMarch = document.getElementById('btn-simple-mode-march');
  const enemyMarchGroup = document.getElementById('group-simple-enemy-march');
  const remLabel = document.getElementById('label-simple-remaining-time');

  if (simpleLaunchState.statusMode === 'rally') {
    if (btnRally) {
      btnRally.className = "btn-game btn-sm flex-1 font-black btn-primary active shadow-lg py-2.5 text-xs sm:text-sm flex items-center justify-center gap-1.5";
    }
    if (btnMarch) {
      btnMarch.className = "btn-game btn-sm flex-1 font-black btn-secondary py-2.5 text-xs sm:text-sm flex items-center justify-center gap-1.5";
    }
    if (enemyMarchGroup) enemyMarchGroup.style.display = '';
    if (remLabel) remLabel.textContent = '③ 相手の集結残り時間 (MM:SS / 秒)';
  } else {
    if (btnRally) {
      btnRally.className = "btn-game btn-sm flex-1 font-black btn-secondary py-2.5 text-xs sm:text-sm flex items-center justify-center gap-1.5";
    }
    if (btnMarch) {
      btnMarch.className = "btn-game btn-sm flex-1 font-black btn-primary active shadow-lg py-2.5 text-xs sm:text-sm flex items-center justify-center gap-1.5";
    }
    if (enemyMarchGroup) enemyMarchGroup.style.display = 'none';
    if (remLabel) remLabel.textContent = '③ 相手の行軍残り時間 (MM:SS / 秒)';
  }

  // If calculation was ongoing, recalculate live
  if (simpleLaunchState.isCalculated && typeof recalculateSimpleLaunchStateOnMarchChange === 'function') {
    recalculateSimpleLaunchStateOnMarchChange();
  }
}

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
/* [RETIRED in v1.06.64] toggleAllianceFeature */

// Legacy compatibility helper
function setAllianceFeatureVisible(visible) {
  // No-op for forward/backward compatibility
}

function triggerSimpleEnemyLaunch() {
  resetAllianceCopyStatus();
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

  // 自分の発車時刻 = 相手着弾時刻 + margin - 自分の行軍時間
  const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - mySec * 1000);

  // 2. Check if calculated launch time is already in the past (out of time)
  const diffSec = (targetLaunchDate.getTime() - now.getTime()) / 1000;
  if (diffSec < -1.0) {
    const curGroup = getActiveAllianceGroup();
    const allMembers = curGroup ? curGroup.members : [];
    const selectedMembers = allMembers.filter(m => m.selected !== false);
    const hasLaunchableAllianceMember = selectedMembers.some(m => {
      const memberLaunchMs = enemyLandDate.getTime() + getInsertionMarginMs() - m.marchSec * 1000;
      return (memberLaunchMs - now.getTime()) / 1000 > -1.0;
    });

    if (!hasLaunchableAllianceMember) {
      const passedSec = Math.abs(diffSec).toFixed(1);
      const confirmLaunch = confirm(`⚠️ 【発車不可アラート（すでに手遅れです）】\n\n以下の原因が考えられます：\n① 自分の行軍時間（または集結時間）の設定が長すぎる\n② 相手の着弾までの残り時間が短すぎる（過去の時刻）\n\n※【 ${passedSec} 秒過去 】を経過しており全員間に合いません。\nこのまま差し込みタイマーを開始しますか？`);
      if (!confirmLaunch) return;
    }
  }

  // Automatically save used march times to Recent History!
  if (mySec > 0) saveKeypadRecentHistory(mySec);
  if (enemySec > 0) saveKeypadRecentHistory(enemySec);

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
  syncWakeLock();
}

function updateSimpleCountdown() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.targetLaunchDate || !simpleLaunchState.enemyLandDate) return;

  const now = getAdjustedNowTime();
  const nowMs = now.getTime();

  // 1. Calculate active/remaining selected alliance members
  let maxLaunchTimeMs = simpleLaunchState.targetLaunchDate.getTime();
  const curGroup = getActiveAllianceGroup();
  const allMembers = curGroup ? curGroup.members : [];
  const selectedMembers = allMembers.filter(m => m.selected !== false);

  let unlaunchedMemberCount = 0;
  if (selectedMembers.length > 0) {
    selectedMembers.forEach(m => {
      const memberLaunchMs = simpleLaunchState.enemyLandDate.getTime() + getInsertionMarginMs() - m.marchSec * 1000;
      if (memberLaunchMs > maxLaunchTimeMs) {
        maxLaunchTimeMs = memberLaunchMs;
      }
      if (memberLaunchMs >= nowMs) {
        unlaunchedMemberCount++;
      }
    });
  }

  // 2. Auto-reset 5 seconds AFTER the last member's launch time (Plan A: Instant & clean termination!)
  if (nowMs > maxLaunchTimeMs + 5000) {
    resetSimpleLaunchCalculation();
    return;
  }

  // 3. Live Countdown of Remaining Time Input (Display MM:SS of enemy arrival countdown)
  const remInput = document.getElementById('simple-remaining-time');
  const elapsedSec = (nowMs - simpleLaunchState.calcStartTime.getTime()) / 1000;
  const currentRemSec = Math.max(0, simpleLaunchState.startRemSec - elapsedSec);

  const remFormatted = formatCountdownMMSS(currentRemSec);
  if (remInput && document.activeElement !== remInput) {
    remInput.value = remFormatted;
  }
  const modalRemVal = document.getElementById('modal-rem-time-val');
  if (modalRemVal) {
    modalRemVal.textContent = remFormatted;
  }

  // 4. Projected Launch Time Display
  const landTimeVal = document.getElementById('simple-land-time-val');
  if (landTimeVal) {
    landTimeVal.textContent = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  }
  const floatingLandTimeVal = document.getElementById('floating-land-time-val');
  if (floatingLandTimeVal) {
    floatingLandTimeVal.textContent = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  }

  // 5. Main Card Status & Countdown Display (Plan A Logic)
  const statusLabel = document.getElementById('simple-status-label');
  const countdownVal = document.getElementById('simple-countdown-val');
  const subInfo = document.getElementById('simple-sub-info');

  if (!statusLabel || !countdownVal) return;

  const modeText = simpleLaunchState.statusMode === 'rally' ? '集結完了後発車' : '行軍着弾';
  const diffSec = (simpleLaunchState.targetLaunchDate.getTime() - nowMs) / 1000;
  const marginStr = `+${(getInsertionMarginMs() / 1000).toFixed(1)}s`;

  // 10s Countdown Audio Beep & Vibration Logic
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
      if (isSimpleVibrationEnabled) {
        if (currentCeilSec === 1) {
          triggerVibration([80, 50, 80]);
        } else {
          triggerVibration(80);
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
    if (subInfo) subInfo.textContent = `相手着弾直後 (${marginStr}後) に自動合わせ中`;
  } else if (diffSec > -1.0) {
    // 0s Window: Launch Chime & Vibe
    if (simpleLaunchState.lastBeepSecond !== 0) {
      simpleLaunchState.lastBeepSecond = 0;
      if (!isSimpleAudioMuted) {
        playBeep(1760, 'triangle', 0.4);
      }
      if (isSimpleVibrationEnabled) {
        triggerVibration([200, 100, 300]);
      }
    }

    statusLabel.textContent = "🟢 今すぐ発車せよ！！ (発車推奨ウィンドウ中)";
    statusLabel.className = "text-sm text-green-400 font-black mt-2 mb-1 animate-bounce";
    countdownVal.textContent = "00:00.0";
    countdownVal.className = "text-2xl sm:text-3xl font-black text-digital text-green-400";
    if (subInfo) subInfo.textContent = "即座にゲーム画面で発車ボタンをタップ！";
  } else {
    // User's own launch time has passed
    if (nowMs > maxLaunchTimeMs) {
      // Entire operation has concluded!
      statusLabel.textContent = "🏁 全メンバーの発車が完了しました";
      statusLabel.className = "text-xs text-emerald-300 font-bold mt-2 mb-1";
      countdownVal.textContent = "作戦完了";
      countdownVal.className = "text-xl sm:text-2xl font-black text-emerald-400";
      if (subInfo) subInfo.textContent = "まもなく自動で初期状態へリセットされます";
    } else {
      // User passed, but some alliance members are still counting down
      statusLabel.textContent = "✅ 自分の発車完了 (通過)";
      statusLabel.className = "text-xs text-emerald-300 font-bold mt-2 mb-1";
      countdownVal.textContent = "発車完了";
      countdownVal.className = "text-xl sm:text-2xl font-black text-emerald-400";
      if (subInfo) {
        subInfo.textContent = `👥 同盟メンバー進行中 (未発車 残り ${unlaunchedMemberCount} 名)`;
      }
    }
  }

  updateAllianceTimeline();
}

// v1.03.13 Forced Stop & Clean Reset Calculation
function resetSimpleLaunchCalculation() {
  // 📺 PiP 小窓への即時リセットフレームプッシュ (v1.06.74 メディアAPI完全不干渉)
  if (typeof drawAndPushPipFrame === 'function') drawAndPushPipFrame();

  resetAllianceCopyStatus();
  const startSec = simpleLaunchState.startRemSec || 15;
  
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
    const marginSecStr = (getInsertionMarginMs() / 1000).toFixed(1);
    subInfo.textContent = `相手着弾 ${marginSecStr}秒後 直後に自動合わせ`;
  }

  const btnReset = document.getElementById('btn-simple-reset');
  if (btnReset) btnReset.classList.add('hidden');

  // Cleanly clear and hide timeline card
  updateAllianceTimeline();
  syncWakeLock();
}

// v1.03.04 Alliance Departure Timeline Implementation (Selection by Name)
let isAllianceTimelineCollapsed = false;
let selectedTimelineMemberName = null;

/* [RETIRED in v1.06.64] toggleAllianceTimelineCard */

function selectTimelineRowMember(name) {
  const targetName = name || '';
  if (selectedTimelineMemberName === targetName) {
    selectedTimelineMemberName = null;
  } else {
    selectedTimelineMemberName = targetName;
  }
  updateAllianceTimeline(true);
}

function updateAllianceTimeline(forceRender = false) {
  const selectedBadge = document.getElementById('timeline-selected-count');
  const hintElem = document.getElementById('alliance-timeline-status-hint');
  const tableContainer = document.getElementById('alliance-timeline-table-container');
  const tbody = document.getElementById('alliance-timeline-tbody');

  const curGroup = typeof getActiveAllianceGroup === 'function' ? getActiveAllianceGroup() : null;
    const selectedMembers = (curGroup ? curGroup.members : allianceMembers).filter(m => m.selected !== false);
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
    const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - m.marchSec * 1000);
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


    html += `
      <tr data-member-name="${escapeHtml(m.name)}" class="${rowBg} ${selectedClass} hover:bg-cyan-900/40 transition-colors cursor-pointer select-none" onclick="selectTimelineRowMember(this.getAttribute('data-member-name'))">
        <td class="p-1.5 text-center font-bold text-gray-400 text-[10px]">${index + 1}</td>
        <td class="p-1.5 font-bold text-cyan-200 truncate max-w-[100px]">${escapeHtml(m.name)}</td>
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
      btn.innerHTML = `${escapeHtml(g.name)} <span class="bg-black/40 px-1 rounded text-[10px] text-yellow-300 font-mono">${g.members.length}</span>`;
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
      btn.innerHTML = `${escapeHtml(g.name)} <span class="bg-black/40 px-1 rounded text-[10px] text-yellow-300 font-mono">${g.members.length}</span>`;
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
  id = decodeURIComponent(id || "");
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
        <span class="font-bold text-cyan-200 truncate">${escapeHtml(m.name)}</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button class="btn-game btn-xs bg-yellow-950/80 border border-yellow-500/60 text-yellow-300 font-mono font-bold px-2 py-1 text-xs hover:scale-105 transition-transform" onclick="openAllianceKeypadModal('${encodeURIComponent(m.id)}')" title="タップして時間を変更">
          ⏱ ${formatCountdownMMSS(m.marchSec)} <i class="fa-solid fa-pen-to-square text-[10px] ml-0.5"></i>
        </button>
        <button class="text-red-400 hover:text-red-300 font-bold px-1.5 py-0.5 text-base" onclick="deleteAllianceMember('${encodeURIComponent(m.id)}')">&times;</button>
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



// --- March Time Keypad Preset & Recent History Engine (v1.06.43) ---
let keypadRecentHistory = [15, 20, 25, 30]; // Sensible default initial history!
try {
  const savedHistory = localStorage.getItem('wos_keypad_recent_history');
  if (savedHistory) {
    const parsed = JSON.parse(savedHistory);
    if (Array.isArray(parsed) && parsed.length > 0) keypadRecentHistory = parsed;
  }
} catch (e) {
  keypadRecentHistory = [15, 20, 25, 30];
}
window.keypadRecentHistory = keypadRecentHistory;

function saveKeypadRecentHistory(sec) {
  if (!sec || sec <= 0) return;
  keypadRecentHistory = keypadRecentHistory.filter(s => s !== sec);
  keypadRecentHistory.unshift(sec);
  if (keypadRecentHistory.length > 5) keypadRecentHistory = keypadRecentHistory.slice(0, 5);
  window.keypadRecentHistory = keypadRecentHistory;
  try {
    localStorage.setItem('wos_keypad_recent_history', JSON.stringify(keypadRecentHistory));
  } catch (e) {}
}

function renderKeypadRecentHistory() {
  const container = document.getElementById('keypad-history-container');
  const chipsWrapper = document.getElementById('keypad-history-chips');
  if (!container || !chipsWrapper) return;

  const displayList = (keypadRecentHistory && keypadRecentHistory.length > 0) ? keypadRecentHistory : [15, 20, 25, 30];

  chipsWrapper.innerHTML = '';
  displayList.forEach(sec => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-game btn-xs bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 py-1 px-2 text-xs font-mono font-bold hover:scale-105 active:scale-95 transition-transform flex-1 text-center';
    btn.textContent = formatCountdownMMSS(sec);
    btn.onclick = () => applyKeypadPresetSeconds(sec);
    chipsWrapper.appendChild(btn);
  });
}

function applyKeypadPresetSeconds(sec) {
  if (sec < 60) {
    keypadInputBuffer = sec.toString();
  } else {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    keypadInputBuffer = `${m}${s.toString().padStart(2, '0')}`;
  }
  updateKeypadDisplay();
}


function openAllianceKeypadModal(memberId) {
  memberId = decodeURIComponent(memberId || "");
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
  renderKeypadRecentHistory();

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
  renderKeypadRecentHistory();

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

  const isZeroAllowed = (activeKeypadInputTarget && (activeKeypadInputTarget.elementId === 'simple-remaining-time' || (activeKeypadInputTarget.elementId === 'ocr-manual-time-input' && ocrSessionState.manualMode === 'rally')));
  const minLimit = isZeroAllowed ? 0 : 1;
  sec = Math.max(minLimit, sec + delta);
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
  
  // Check if 0 seconds is valid for the current target (e.g. 集結中/集結残り時間)
  const isZeroAllowed = (activeKeypadInputTarget && (
    activeKeypadInputTarget.elementId === 'simple-remaining-time' ||
    (activeKeypadInputTarget.elementId === 'ocr-manual-time-input' && ocrSessionState.manualMode === 'rally')
  ));

  if (totalSec < 0 || (!isZeroAllowed && totalSec <= 0)) {
    alert('有効な時間を入力してください (1秒以上)。');
    return;
  }

  // 100% Guaranteed: Record into Recent History & re-render chips immediately
  saveKeypadRecentHistory(totalSec);

  if (activeKeypadInputTarget) {
    // Single Mode Input Target
    const inputElem = document.getElementById(activeKeypadInputTarget.elementId);
    if (inputElem) {
      const formatted = formatCountdownMMSS(totalSec);
      inputElem.value = formatted;
      if (activeKeypadInputTarget.elementId === 'ocr-manual-time-input') {
        ocrSessionState.manualRemSec = totalSec;
        ocrSessionState.isManualSelected = true;
        ocrSessionState.selectedTargetIdx = -1;
        updateOcrManualUI();
        updateOcrTargetSelectionUI();

        const now = getAdjustedNowTime();
        const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
        updateOcrTimeoutSafety(lagSec);
      } else {
        if (activeKeypadInputTarget.elementId === 'simple-my-march') {
          saveMyMarchTime(formatted);
        }
        calculateInsertion();
        // Realtime live recalculation if calculation is ongoing
        if (simpleLaunchState.isCalculated) {
          if (activeKeypadInputTarget.elementId === 'simple-remaining-time') {
            recalculateSimpleLaunchStateOnMarchChange(false, totalSec);
          } else {
            recalculateSimpleLaunchStateOnMarchChange();
          }
        }
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
let allianceSelectionSortMode = localStorage.getItem('wos_alliance_selection_sort_mode') || 'time'; // 'name' or 'time'

function setAllianceSelectionSortMode(mode) {
  allianceSelectionSortMode = mode;
  localStorage.setItem('wos_alliance_selection_sort_mode', mode);
  updateSelectionSortButtonsUI();
  renderAllianceSelectionList();
}

function updateSelectionSortButtonsUI() {
  const btnName = document.getElementById('btn-selection-sort-name');
  const btnTime = document.getElementById('btn-selection-sort-time');
  if (btnName) btnName.className = `btn-game btn-xs ${allianceSelectionSortMode === 'name' ? 'btn-primary active font-black' : 'btn-secondary font-bold'} py-0.5 px-2 text-[10px] whitespace-nowrap`;
  if (btnTime) btnTime.className = `btn-game btn-xs ${allianceSelectionSortMode === 'time' ? 'btn-primary active font-black' : 'btn-secondary font-bold'} py-0.5 px-2 text-[10px] whitespace-nowrap`;
}

function renderAllianceSelectionList() {
  const container = document.getElementById('alliance-selection-list-container');
  const searchInput = document.getElementById('alliance-selection-search');
  if (!container) return;
  container.innerHTML = '';

  updateSelectionSortButtonsUI();

  const curGroup = getActiveAllianceGroup();
  if (!curGroup || curGroup.members.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-4">このグループにはメンバーがいません</div>';
    return;
  }

  const rawQuery = (searchInput?.value || '').trim().toLowerCase();
  let sorted = [...curGroup.members];

  // Apply sorting according to allianceSelectionSortMode
  if (allianceSelectionSortMode === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  } else {
    // Default 'time' (fastest march time first, then by name)
    sorted.sort((a, b) => (a.marchSec - b.marchSec) || a.name.localeCompare(b.name, 'ja'));
  }

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
        <input type="checkbox" class="w-4 h-4 accent-cyan-400 shrink-0" ${isChecked ? 'checked' : ''} onchange="toggleAllianceMemberSelection('${encodeURIComponent(m.id)}', this.checked)">
        <span class="font-bold text-gray-200 truncate">${escapeHtml(m.name)}</span>
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
  id = decodeURIComponent(id || "");
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
let allianceCopySortMode = localStorage.getItem('wos_alliance_copy_sort_mode') || 'time'; // 'name' or 'time'

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

// State tracking for copied chunks & expired status
let copiedAlliancePartIds = new Set();

function resetAllianceCopyStatus() {
  copiedAlliancePartIds.clear();
  updateAllianceCopyButtons();
}

// Dynamically generate single copy button or auto-split buttons with Copied & Expired states
function updateAllianceCopyButtons() {
  const container = document.getElementById('alliance-copy-buttons-container');
  if (!container) return;

  const curGroup = getActiveAllianceGroup();
  const allMembers = curGroup ? curGroup.members : [];
  const selectedMembers = allMembers.filter(m => m.selected !== false);
  const selectedCount = selectedMembers.length;
  const sortModeTitle = allianceCopySortMode === 'time' ? '出発時間順' : 'あいうえお順';

  const limitPerChunk = 9;
  const nowTimeMs = getAdjustedNowTime().getTime();

  // === CASE A: 9名以下 (単一全メンバーコピーボタン) ===
  if (selectedCount <= limitPerChunk) {
    const isCalculated = simpleLaunchState.isCalculated && !!simpleLaunchState.enemyLandDate;
    let btnClass = 'btn-game btn-sm w-full py-2.5 font-black text-xs sm:text-sm tracking-wide shadow flex items-center justify-center gap-1.5 whitespace-nowrap transition-all';
    let btnContent = '';

    if (!isCalculated) {
      btnClass += ' btn-primary';
      btnContent = `<i class="fa-solid fa-copy text-yellow-300"></i> <span>📋 選択メンバー全員の指示をコピー (${sortModeTitle})</span>`;
    } else {
      const enemyLandDate = simpleLaunchState.enemyLandDate;
      const memberWithDates = selectedMembers.map(m => {
        const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - m.marchSec * 1000);
        return { member: m, targetLaunchDate, launchTimeMs: targetLaunchDate.getTime() };
      });
      const isExpired = memberWithDates.length > 0 && memberWithDates.every(item => nowTimeMs > item.launchTimeMs);
      const isCopied = copiedAlliancePartIds.has('single');

      if (isExpired) {
        btnClass += ' bg-rose-950/90 border-2 border-rose-500 text-rose-300 opacity-80 cursor-not-allowed';
        btnContent = `<i class="fa-solid fa-circle-xmark text-rose-400"></i> <span>❌ 時間超過 (全メンバー発車済)</span>`;
      } else if (isCopied) {
        btnClass += ' bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]';
        btnContent = `<i class="fa-solid fa-check-double text-emerald-200"></i> <span>✓ 全員分の指示 コピー済 (${sortModeTitle})</span>`;
      } else {
        btnClass += ' btn-primary';
        btnContent = `<i class="fa-solid fa-copy text-yellow-300"></i> <span>📋 選択メンバー全員の指示をコピー (${sortModeTitle})</span>`;
      }
    }

    const existingBtn = container.querySelector('#btn-copy-alliance-multi-chat');
    if (existingBtn && container.children.length === 1) {
      if (existingBtn.className !== btnClass) existingBtn.className = btnClass;
      if (existingBtn.innerHTML.trim() !== btnContent.trim()) existingBtn.innerHTML = btnContent;
    } else {
      container.innerHTML = `
        <button id="btn-copy-alliance-multi-chat" class="${btnClass}" onclick="copyAllianceMultiChat(1, 0, 'single')">
          ${btnContent}
        </button>
      `;
    }
    return;
  }

  // === CASE B: 10名以上 (全Part分割グリッドボタン) ===
  const totalParts = Math.ceil(selectedCount / limitPerChunk);
  const grid = container.querySelector('.alliance-parts-grid');

  // DOM要素が存在し、子ボタン数が一致している場合はDOMを壊さず再利用！
  if (!grid || grid.children.length !== totalParts) {
    let html = `
      <div class="text-[10px] text-yellow-300 font-bold bg-yellow-950/60 p-1.5 rounded border border-yellow-500/40 text-center truncate">
        ⚠️ ホワサバ改行対策: ${selectedCount}名を 9名ずつ(全${totalParts}回) 分割送信
      </div>
      <div class="alliance-parts-grid grid grid-cols-${Math.min(totalParts, 2)} gap-1.5">
    `;
    for (let part = 1; part <= totalParts; part++) {
      const startIdx = (part - 1) * limitPerChunk;
      const endIdx = Math.min(part * limitPerChunk, selectedCount);
      html += `
        <button id="btn-alliance-part-${part}" class="btn-game btn-sm btn-accent py-2 px-1 font-black text-xs shadow flex flex-col items-center justify-center leading-tight whitespace-nowrap min-w-0 transition-all" onclick="copyAllianceMultiChat(${part}, ${limitPerChunk}, 'part_${part}')">
          <span class="flex items-center gap-1 text-[11px] sm:text-xs">
            <i class="fa-solid fa-copy text-yellow-300 text-[10px]"></i> 📋 Part ${part}/${totalParts}
          </span>
          <span class="text-[10px] opacity-90 font-mono">(${startIdx + 1}〜${endIdx}人目)</span>
        </button>
      `;
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  // 計算未スタート時の場合は初期アクセントボタンスタイルを維持して完了（DOM破棄を防止！）
  const isCalculated = simpleLaunchState.isCalculated && !!simpleLaunchState.enemyLandDate;
  if (!isCalculated) {
    for (let part = 1; part <= totalParts; part++) {
      const btn = document.getElementById(`btn-alliance-part-${part}`);
      if (!btn) continue;
      const startIdx = (part - 1) * limitPerChunk;
      const endIdx = Math.min(part * limitPerChunk, selectedCount);
      const expectedClass = 'btn-game btn-sm btn-accent py-2 px-1 font-black text-xs shadow flex flex-col items-center justify-center leading-tight whitespace-nowrap min-w-0 transition-all';
      if (btn.className !== expectedClass) btn.className = expectedClass;
      const innerContent = `
        <span class="flex items-center gap-1 text-[11px] sm:text-xs">
          <i class="fa-solid fa-copy text-yellow-300 text-[10px]"></i> 📋 Part ${part}/${totalParts}
        </span>
        <span class="text-[10px] opacity-90 font-mono">(${startIdx + 1}〜${endIdx}人目)</span>
      `;
      if (btn.innerHTML.replace(/\s+/g, ' ') !== innerContent.replace(/\s+/g, ' ')) {
        btn.innerHTML = innerContent;
      }
    }
    return;
  }

  // 計算進行中の場合は、時間超過・コピー済ステータスを非破壊に差分更新
  const enemyLandDate = simpleLaunchState.enemyLandDate;
  const memberWithDates = selectedMembers.map(m => {
    const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - m.marchSec * 1000);
    return {
      member: m,
      targetLaunchDate: targetLaunchDate,
      launchTimeMs: targetLaunchDate.getTime()
    };
  });

  if (allianceCopySortMode === 'time') {
    memberWithDates.sort((a, b) => a.launchTimeMs - b.launchTimeMs);
  } else {
    memberWithDates.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ja'));
  }

  const isChunkExpired = (items) => {
    if (!items || items.length === 0) return false;
    return items.every(item => nowTimeMs > item.launchTimeMs);
  };

  for (let part = 1; part <= totalParts; part++) {
    const btn = document.getElementById(`btn-alliance-part-${part}`);
    if (!btn) continue;

    const startIdx = (part - 1) * limitPerChunk;
    const endIdx = Math.min(part * limitPerChunk, selectedCount);
    const chunkItems = memberWithDates.slice(startIdx, endIdx);

    const partKey = `part_${part}`;
    const isCopied = copiedAlliancePartIds.has(partKey);
    const isExpired = isChunkExpired(chunkItems);

    let btnClass = 'btn-game btn-sm py-2 px-1 font-black text-xs shadow flex flex-col items-center justify-center leading-tight whitespace-nowrap min-w-0 transition-all';
    let btnLabel = `📋 Part ${part}/${totalParts}`;
    let btnSub = `(${startIdx + 1}〜${endIdx}人目)`;
    let icon = '<i class="fa-solid fa-copy text-yellow-300 text-[10px]"></i>';

    if (isExpired) {
      btnClass += ' bg-rose-950/90 border-2 border-rose-500 text-rose-300 opacity-80 cursor-not-allowed';
      btnLabel = `❌ Part ${part} 超過`;
      icon = '<i class="fa-solid fa-circle-xmark text-rose-400 text-[10px]"></i>';
    } else if (isCopied) {
      btnClass += ' bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
      btnLabel = `✓ Part ${part} コピー済`;
      icon = '<i class="fa-solid fa-check text-emerald-200 text-[10px]"></i>';
    } else {
      btnClass += ' btn-accent';
    }

    if (btn.className !== btnClass) btn.className = btnClass;
    const innerContent = `
      <span class="flex items-center gap-1 text-[11px] sm:text-xs">
        ${icon} ${btnLabel}
      </span>
      <span class="text-[10px] opacity-90 font-mono">${btnSub}</span>
    `;
    if (btn.innerHTML.replace(/\s+/g, ' ') !== innerContent.replace(/\s+/g, ' ')) {
      btn.innerHTML = innerContent;
    }
  }
}

function copyAllianceMultiChat(part = 1, limitPerChunk = 0, partKey = 'single') {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.enemyLandDate) {
    if (typeof showToast === 'function') {
      showToast('⚠️ 【コピー不可】まず「🎯 差し込み計算スタート！」を押してください', 'warn', 3500);
    }
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
    const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - m.marchSec * 1000);
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
  const groupTitle = curGroup.name.replace(/^[^w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/, ''); // Strip leading emojis for concise text

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

  // 1. Immediately mark as copied & re-render button state
  copiedAlliancePartIds.add(partKey);
  updateAllianceCopyButtons();

  // 2. Immediately trigger Toast Notification
  const toastMsg = `📋 ${partNote ? `【Part ${part}】` : ''}${targetItems.length}名分の指示文をコピーしました！`;
  showToast(toastMsg, 'success');

  // 3. Perform Clipboard Copy with Mobile DOM Fallback
  let copySucceeded = false;
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    copySucceeded = document.execCommand('copy');
    document.body.removeChild(textArea);
  } catch (e) {
    copySucceeded = false;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(err => {
      if (!copySucceeded) {
        prompt('以下の指示文を全選択してコピーしてください:', text);
      }
    });
  } else if (!copySucceeded) {
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


const helpTexts = {
  // 📸 OCR & Synchronization
  'ocr-sync': '【📸 スクショから一発自動同期】<br>ホワサバの防衛/集結画面のスクリーンショットを貼り付けるだけで、画像内の「集結中/行軍中残り時間」「敵名」「同盟タグ」をAI文字認識（OCR）で瞬時に抽出！<br>撮影時刻からの経過タイムラグも完全自動減算され、1ミリ秒のズレもなく即座に差し込み計算がスタートします！',
  'ocr-capture-time': '【📸 撮影時刻の手動調整】<br>スマホのスクショ画像から撮影時刻を自動解析しますが、手動で秒数を変更したり <code>[-5s]</code> <code>[+5s]</code> <code>[今撮った]</code> ボタンで微調整できます。',

  // ⚙️ Status & Sound / Vibe
  'status-mode': '【⏳ 集結中 ⇄ 🏃 行軍中（状態モード）】<br>ホワサバ内の集結画面に表示されている相手(敵)が【集結中】もしくは【行軍中】かを選択します。<br>・<b>⏳ 集結中</b>: 敵行軍時間を加算して着弾を算出します。<br>・<b>🏃 行軍中</b>: 敵行軍時間を使わずに直着弾時刻から逆算します。',
  'simple-sound': '【🔊 音声ON / 🔇 音声OFF】<br>発車10秒前・5秒前のカウントダウン音、および発車瞬間のダブルチャイム通知の有効/無効を切り替えます。',
  'simple-vibe': '【📳 バイブON / 📳 バイブOFF】<br>発車10秒前〜発車瞬間のカウントダウン振動（バイブレーション通知）の有効/無効を切り替えます。',
  'simple-adjust': '【🎛️ 時間調整ON / 時間調整OFF】<br>集結残り時間のクイック調整ボタン（[0分〜5分] や [00s〜50s] など）の表示/非表示を切り替えます。',
  'simple-alliance': '【👥 一斉指示ON / 👥 一斉指示OFF】<br>同盟員全員の発車スケジュールを一覧表示する「タイムライン」や、チャットへの一括指示コピー機能の表示/非表示を切り替えます。',

  // 🎯 March Time Inputs
  'my-march': '【① 自分の行軍時間】<br>自分が出征してターゲット(砦や王城等)に到着するまでの時間（分:秒）を入力します。※ホワサバ内の出征画面右下に表示されています。タップすると専用テンキーが開きます。',
  'enemy-march': '【② 相手の行軍時間】<br>相手(敵)が出征してターゲット(砦や王城等)に到着する時間を入力します。※ホワサバ内の集結画面で集結中から行軍中に切り替わった際の秒数を確認します。',
  'enemy-rem': '【③ 相手の集結残り時間】<br>ホワサバ内の集結画面に表示されている集結中時間を入力します。右横の [⚙調整 ▾] から分・秒・コンマ秒をクイック同期できます。',
  'insertion-margin': '【🎯 目標差し込みマージン】<br>相手着弾に対して何秒遅れで差し込むかを設定します。<br>・<code>+0.1s</code>: 極限攻め（難関）<br>・<code>+0.3s</code>: 標準推奨（王道・基本値）<br>・<code>+0.5s</code>: 安全安定（確実）',

  // 👥 Alliance & Orders Hub
  'alliance-timeline': '【⏱️ タイムライン】<br>選択されている同盟メンバー全員の発車時刻と、最速で発車する人からの時間差（+◯.◯秒）をリアルタイムに一覧表示します。行をタップすると黄色枠で注目トラッキングできます。',
  'alliance-groups': '【🏰 グループ管理】<br>「砦1班」「王城班」「SVS精鋭」などターゲット別グループの切替・作成エリアの表示/非表示を切り替えます。',
  'alliance-quick-add': '【➕ 個別追加】<br>メンバーを名前と秒数で1人ずつ手動登録する入力フォームの表示/非表示を切り替えます。秒数のみ（例: <code>30</code> ➔ 00:30）の入力でも自動認識されます。',
  'alliance-search': '【🔍 複数キーワード一括検索】<br>名前や秒数を1文字打つだけでリアルタイム絞り込みができます。<br>💡 <b>複数人検索の裏技</b>:<br>「<code>ひまり、はるさん、白大福もちこ</code>」のように読点「、」やカンマ「,」、スペース区切りで入力すると、該当する複数メンバーをまとめて一覧に抽出できます！',
  'alliance-keypad': '【⏱️ 専用ミニテンキーパッド】<br>メンバーの行軍時間ボタン（例: <code>⏱ 00:23 📝</code>）をタップすると専用テンキーが出現し、スマホのキーボードを開かずに <code>[3] [0] [確定]</code> や <code>[+1s]</code> でサクサク秒数変更できます！',
  'alliance-batch-import': '【📥 一括登録】<br>テキストやCSV形式で複数メンバーを一括登録・エクスポートします。<code>名前, 行軍時間(分:秒)</code> の形式で、カンマ・スペース・タブ区切りの改行テキストをまとめて現在のグループへ一括登録できます。「サンプル65名」ボタンでテストデータも一発セット可能です。',
  'alliance-selection-group': '【グループ一括選択】<br>上部のグループタブ（砦1班、王城班など）をタップすると、そのグループに所属するメンバーの選択状態へ一瞬で切り替わります。',
  'copy-order': '【並び順切替】<br>同盟チャットに指示を貼り付ける際、[名前順] で並べるか、発車時刻が早い [時間順] で並べるかを選択できます。',
  'chat-format': '【ホワサバのチャット改行・文字数制限対策】<br>ホワサバのチャットは1メッセージあたり最大10行前後の制限があります。人数が8名を超える場合は、改行潰れを防ぐため自動で【Part 1】【Part 2】と8名ずつ分割コピーボタンが出現します！',
  'member-manage': '【名簿管理】<br>同盟メンバーの追加・編集・削除や、名前・行軍時間の一括登録・テンプレート読み込みを行います。',
  'member-select': '【送信選択】<br>同盟一斉発車のスケジュール計算および個別指示文生成の対象とするメンバーをチェックボックスで選択します。',

  // 🧮 Calculator Component
  'calc-now': '【現在時刻代入】<br>ボタンを押すと、時計調整で同期されている現在のリアルタイム（時:分:秒）を電卓に一発セットします。',
  'calc-transfer': '【📤 自分/相手/残りへ】<br>電卓の計算結果や相互変換した秒数を、差し込み計算の「自分の行軍時間」「相手の行軍時間」「集結残り時間」へワンタップで転送・反映します。',
  'calc-keypad-time': '【⏱️ 時間計算の入力方法】<br>コロン（:）を使って「時:分:秒」を直感的に足し引きできます。<br><br>💡 <b>入力例</b>:<br>・<code>5:00</code> ➔ 5分00秒<br>・<code>:30</code> ➔ 30秒<br>・<code>1:30:00</code> ➔ 1時間30分00秒<br>・<code>12:05:00 + 5:00</code> ➔ 12時10分00秒<br><br>※上部の <code>[+5分]</code> や <code>[+0.3秒]</code> ボタンと組み合わせると爆速で計算できます！',
  'calc-keypad-converter': '【🔄 相互変換の入力方法】<br>秒数や分（例: <code>10000秒</code>、<code>1000分</code>、<code>3時間</code>、<code>05:30</code>）を入力するだけで、下の3つの形式（①時分秒 / ②分秒 / ③総秒数）へリアルタイムに一括変換されます！',
  'calc-keypad-speedup': '【⚡️ 加速計算の入力方法】<br>短縮したい目標時間を（例: <code>1000分</code> や <code>24時間</code>）と入力すると、手持ちの加速アイテム（8h/1h/5m/1m）に応じた最適個数と、各単独使用時の必要個数（過剰警告つき）が自動算出されます！',
  'calc-history': '【📜 計算履歴 ＆ メモ / 再利用 / 反映】<br>過去に行った時間計算の結果が自動で保存されます。<br><br>🔘 <b>各ボタン・機能の使い方</b>:<br>・<b>【メモを入力】</b>: 「砦差し込み用」「敵集結時間」など自由にメモを残せます。<br>・<b>【再利用】</b>: その計算式を電卓の入力欄にもう一度呼び出して再計算します。<br>・<b>【反映】</b>: 計算結果の秒数をメイン画面の差し込み計算（自分/相手/残り）へ直接セットします。',
  'calc-converter': '【🔄 相互変換 ＆ 時間計算へ代入】<br>入力された数字（例: <code>10000秒</code> や <code>100000分</code>）を3つの形式に一括変換します。<br><br>🔘 <b>各ボタンの使い分け</b>:<br>・<b>【📋 コピー】</b>: その形式の文字列をクリップボードにコピーします。<br>・<b>【⏱️ 時間計算へ】</b>: 変換された時間を「時間計算」タブの入力欄へ直接セットします！<br>・<b>【📤 自分 / 相手】</b>: メイン画面の差し込み行軍時間へ直接セットします。',
  'calc-speedup': '【⚡️ 加速計算】<br>ホワサバの8時間・1時間・5分・1分加速の「最適組み合わせ（最小個数）」および「単体使用時の必要個数（過剰時間警告つき）」を即座に自動算出します。チェックボックスで使用する加速アイテムを自由に絞り込めます。',
  'setting-backup': '【💾 全データ一括バックアップ ＆ 復元】<br>アプリ内のすべての設定（音・バイブ・マージン・テーマ・同盟グループ名簿・計算履歴・作戦メモ）をまるごと1つのファイル(JSON)として書き出し・読み込みできます。<br>スマホの機種変更やブラウザデータ削除前の安全保存に最適です！'
};

// v1.03.10 Interactive Help Tooltip System
let activeTooltipPopover = null;

function toggleHelpTooltip(event, helpKey) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (event && typeof event.preventDefault === 'function') event.preventDefault();

  if (activeTooltipPopover) {
    const isSameKey = activeTooltipPopover.getAttribute('data-help-key') === helpKey;
    activeTooltipPopover.remove();
    activeTooltipPopover = null;
    if (isSameKey) return;
  }

  const text = helpTexts[helpKey] || "項目解説が登録されていません";
  const btnElem = event ? (event.currentTarget || event.target) : null;
  if (!btnElem) return; // Safeguard if called without valid event target
  const insideModalBody = btnElem.closest ? btnElem.closest('.modal-body') : null;

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
  lagTimerInterval: null,
  isManualSelected: false,
  manualMode: 'march', // 'rally' or 'march'
  manualRemSec: 30
};

// --- OCR Manual Direct Input & Correction Handlers (v1.06.43) ---
function toggleOcrManualSection() {
  // If toggling on, activate manual mode exclusively
  if (!ocrSessionState.isManualSelected) {
    ocrSessionState.isManualSelected = true;
    ocrSessionState.selectedTargetIdx = -1; // Deselect AI targets
  } else {
    // If toggling off and AI targets exist, revert to first AI target
    if (ocrSessionState.detectedMarches && ocrSessionState.detectedMarches.length > 0) {
      ocrSessionState.isManualSelected = false;
      ocrSessionState.selectedTargetIdx = 0;
    }
  }
  updateOcrManualUI();
  updateOcrTargetSelectionUI();
  
  // Re-check timeout warning for current selection
  const now = getAdjustedNowTime();
  const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
  updateOcrTimeoutSafety(lagSec);
}
window.toggleOcrManualSection = toggleOcrManualSection;

function selectOcrAiTarget(idx) {
  ocrSessionState.selectedTargetIdx = idx;
  ocrSessionState.isManualSelected = false; // Deselect manual card
  updateOcrManualUI();
  updateOcrTargetSelectionUI();

  // Re-check timeout warning for newly selected AI target
  const now = getAdjustedNowTime();
  const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
  updateOcrTimeoutSafety(lagSec);

  const target = ocrSessionState.detectedMarches?.[idx];
  if (target) {
    let enemyLand = target.remSec;
    if (target.mode === 'rally') {
      const enemyMarchStr = document.getElementById('simple-enemy-march')?.value || '02:15';
      enemyLand += parseSecondsFromMMSS(enemyMarchStr);
    }
    const myMarchSec = parseSecondsFromMMSS(document.getElementById('simple-my-march')?.value || '01:30');
    if ((enemyLand + (getInsertionMarginMs() / 1000) - myMarchSec) - lagSec < -1.0) {
      showToast('⚠️ 【発車時間切れ】この行軍は時間が経過しており間に合いません！', 'error', 3000);
    }
  }
}
window.selectOcrAiTarget = selectOcrAiTarget;

function setOcrManualMode(mode) {
  ocrSessionState.manualMode = mode;
  ocrSessionState.isManualSelected = true;
  ocrSessionState.selectedTargetIdx = -1;
  updateOcrManualUI();
  updateOcrTargetSelectionUI();

  const now = getAdjustedNowTime();
  const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
  updateOcrTimeoutSafety(lagSec);
}
window.setOcrManualMode = setOcrManualMode;

function openOcrManualKeypad() {
  activeKeypadMemberId = null;
  activeKeypadInputTarget = { elementId: 'ocr-manual-time-input', labelName: '✍️ 手動設定の時間' };
  keypadInputBuffer = '';

  const nameElem = document.getElementById('keypad-member-name');
  if (nameElem) nameElem.textContent = '手動指定: 相手時間';

  const origTimeElem = document.getElementById('keypad-original-time');
  const currentVal = formatCountdownMMSS(ocrSessionState.manualRemSec !== undefined ? ocrSessionState.manualRemSec : 30);
  if (origTimeElem) origTimeElem.textContent = `(現在 ${currentVal})`;

  updateKeypadDisplay();
  renderKeypadRecentHistory();

  const modal = document.getElementById('alliance-keypad-modal');
  if (modal) modal.classList.add('open');
}
window.openOcrManualKeypad = openOcrManualKeypad;

function adjustOcrManualTime(deltaSec) {
  const minAllowed = (ocrSessionState.manualMode === 'rally') ? 0 : 1;
  ocrSessionState.manualRemSec = Math.max(minAllowed, (ocrSessionState.manualRemSec !== undefined ? ocrSessionState.manualRemSec : 30) + deltaSec);
  ocrSessionState.isManualSelected = true;
  ocrSessionState.selectedTargetIdx = -1;
  updateOcrManualUI();
  updateOcrTargetSelectionUI();

  const now = getAdjustedNowTime();
  const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
  updateOcrTimeoutSafety(lagSec);
}
window.adjustOcrManualTime = adjustOcrManualTime;

function handleOcrManualTimeInputChange(valStr) {
  if (!valStr) return;
  const sec = parseSecondsFromMMSS(valStr);
  if (sec > 0) {
    ocrSessionState.manualRemSec = sec;
    ocrSessionState.isManualSelected = true;
    ocrSessionState.selectedTargetIdx = -1;
    updateOcrManualUI();
    updateOcrTargetSelectionUI();

    const now = getAdjustedNowTime();
    const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
    updateOcrTimeoutSafety(lagSec);
  }
}
window.handleOcrManualTimeInputChange = handleOcrManualTimeInputChange;

function selectOcrManualCard() {
  ocrSessionState.isManualSelected = true;
  ocrSessionState.selectedTargetIdx = -1;
  updateOcrManualUI();
  updateOcrTargetSelectionUI();

  const now = getAdjustedNowTime();
  const lagSec = ocrSessionState.captureTime ? Math.max(0, (now.getTime() - ocrSessionState.captureTime.getTime()) / 1000) : 0;
  updateOcrTimeoutSafety(lagSec);
}
window.selectOcrManualCard = selectOcrManualCard;

function updateOcrManualUI() {
  const manualCard = document.getElementById('ocr-manual-card');
  const toggleBtn = document.getElementById('ocr-manual-toggle-btn');
  const toggleIcon = document.getElementById('ocr-manual-toggle-icon');
  const btnRally = document.getElementById('ocr-manual-btn-rally');
  const btnMarch = document.getElementById('ocr-manual-btn-march');
  const timeInput = document.getElementById('ocr-manual-time-input');

  if (timeInput) {
    timeInput.value = formatCountdownMMSS(ocrSessionState.manualRemSec !== undefined ? ocrSessionState.manualRemSec : 30);
  }

  const isManual = ocrSessionState.isManualSelected;
  const hasAiTargets = ocrSessionState.detectedMarches && ocrSessionState.detectedMarches.length > 0;

  if (!hasAiTargets) {
    // 0 AI targets: force manual card open and hide toggle button
    if (toggleBtn) toggleBtn.classList.add('hidden');
    if (manualCard) manualCard.classList.remove('hidden');
  } else {
    // Has AI targets: show toggle button, toggle card visibility based on isManual
    if (toggleBtn) toggleBtn.classList.remove('hidden');
    if (manualCard) {
      if (isManual) {
        manualCard.classList.remove('hidden');
      } else {
        manualCard.classList.add('hidden');
      }
    }
    if (toggleIcon) {
      toggleIcon.textContent = isManual ? '▲ 閉じる' : '▼ 開く';
    }
  }

  if (btnRally && btnMarch) {
    const isRally = ocrSessionState.manualMode === 'rally';
    btnRally.className = `btn-game btn-xs flex-1 py-1.5 font-black text-[11px] rounded-lg ${isRally ? 'bg-amber-500 text-black border-amber-300 shadow' : 'bg-black/80 text-gray-400 border-gray-700'}`;
    btnMarch.className = `btn-game btn-xs flex-1 py-1.5 font-black text-[11px] rounded-lg ${!isRally ? 'bg-cyan-500 text-black border-cyan-300 shadow' : 'bg-black/80 text-gray-400 border-gray-700'}`;
  }
}

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
    const fullDateMatch = fn.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_T]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
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
    const timeOnlyMatch = fn.match(/(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
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

  // Reset manual state on modal open
  ocrSessionState.isManualSelected = false;
  ocrSessionState.selectedTargetIdx = 0;
  updateOcrManualUI();

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

  // Reset manual state and hide manual card on modal close
  ocrSessionState.isManualSelected = false;
  ocrSessionState.selectedTargetIdx = 0;
  updateOcrManualUI();
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

// OCR Engine Global Worker (0.8s Ultra-Fast & 100% Accurate March/Rally Auto-Detector)
let ocrWorkerPromise = null;

function getOrInitOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      if (typeof Tesseract === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Tesseract.js のロードに失敗しました。'));
          document.head.appendChild(script);
        });
      }
      // Fast Dual-model (eng+jpn) whitelisted strictly to 15 characters for 0.8s speed & 100% accuracy!
      const worker = await Tesseract.createWorker('eng+jpn');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789:.行軍集結中',
        tessedit_pageseg_mode: '11' // Sparse text mode for multi-row finding
      });
      return worker;
    })();
  }
  return ocrWorkerPromise;
}

// Pre-warm Tesseract Worker in background on app load
setTimeout(() => {
  try {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => getOrInitOcrWorker());
    } else {
      setTimeout(() => getOrInitOcrWorker(), 1500);
    }
  } catch (e) {}
}, 800);

// Preprocess Canvas: Crop Right 42% (x=58% to 100%) to target "行軍中：00:00:31" and "集結中：00:00:25"
function preprocessImageCanvas(imageElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const scale = 1.0; // 1.0x native scale is ultra-fast
  const nw = imageElement.naturalWidth || imageElement.width || 500;
  const nh = imageElement.naturalHeight || imageElement.height || 1000;

  const cropLeft = nw * 0.45;
  const cropW = nw * 0.55;
  const cropH = nh;

  canvas.width = cropW * scale;
  canvas.height = cropH * scale;

  ctx.drawImage(imageElement, cropLeft, 0, cropW, cropH, 0, 0, canvas.width, canvas.height);

  // High-contrast binarization on white digital numbers & header text
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      if (lum > 175) {
        d[i] = 0; d[i+1] = 0; d[i+2] = 0; // Numbers stark black
      } else {
        d[i] = 255; d[i+1] = 255; d[i+2] = 255; // Pure white background
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Canvas binarization skipped:', e);
  }

  return { canvas, scale, cropLeft, cropW };
}

// Full 1-March Card Block Cropper
/* [RETIRED in v1.06.64] cropCardSnapshot */

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

    const { canvas: preprocessedCanvas, scale: canvasScale } = preprocessImageCanvas(img);

    if (statusEl) statusEl.textContent = 'ホワサバ画面を爆速AI解析中...';
    
    // Super-fast recognize with limited eng+jpn worker (~0.8s)
    const worker = await getOrInitOcrWorker();
    const result = await worker.recognize(preprocessedCanvas);
    URL.revokeObjectURL(imageUrl);

    const ocrLines = result.data.lines || [];
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;

    // Crop right 68% for UI display
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
      parseOcrExtractedLines([], null, 1.0);
    }, 1000);
  }
}

// Backwards compatible wrapper for text parsing
/* [RETIRED in v1.06.64] parseOcrExtractedText */

// Bounding-Box Line Parser: Ultra-Fast 100% Robust Time & Mode Extractor
function parseOcrExtractedLines(ocrLines, sourceImageElement, canvasScale) {
  const validCards = [];

  // Regex matching end-anchored 3-segment (00:00:31) or 2-segment MM:SS
  const timeExtractRegex = /(?:\d{1,2}[:：\.])?(\d{2})[:：\.](\d{2})[:：\.](\d{2})|(\d{1,2})[:：\.](\d{2})/;

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

    // Extract clean time string
    const match = text.match(timeExtractRegex);
    if (!match) continue;

    let normalizedTimeStr = '';
    if (match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
      // 3-segment HH:MM:SS
      normalizedTimeStr = `${match[1]}:${match[2]}:${match[3]}`;
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // 2-segment MM:SS
      normalizedTimeStr = `00:${match[4].padStart(2, '0')}:${match[5]}`;
    }

    const remSec = parseSecondsFromHHMMSS(normalizedTimeStr);
    if (remSec <= 0 || remSec > 3600) continue;

    // Pixel Y position
    const headerPixelY = ocrLine.bbox ? ocrLine.bbox.y0 : ((i / ocrLines.length) * (sourceImageElement ? sourceImageElement.height * canvasScale : 1000));
    const actualYRatio = (headerPixelY / canvasScale) / imgH;

    // Skip lines in top notification bar (< 11% screen height)
    if (actualYRatio < 0.11) continue;

    // Red attack card filter (x=20%)
    if (imgCtx) {
      const sampleY = Math.min(imgH - 1, Math.max(0, Math.floor(actualYRatio * imgH)));
      const pRed = imgCtx.getImageData(Math.floor(imgW * 0.20), sampleY, 1, 1).data;
      if (pRed[0] > pRed[2] + 40 && pRed[0] > 140) {
        console.log(`🚫 [Attack Filtered] Skipping Red Attack Card at y=${actualYRatio.toFixed(3)}`);
        continue;
      }
    }

    // Precise Mode Detection from Recognized Text:
    // "行軍" or "行" in text -> 'march'
    // "集結" or "結" in text -> 'rally'
    let mode = 'rally';
    if (/行軍|行/.test(text)) {
      mode = 'march';
    } else if (/集結|結/.test(text)) {
      mode = 'rally';
    } else {
      const contextText = (ocrLines[i-1]?.text || '') + ' ' + text + ' ' + (ocrLines[i+1]?.text || '');
      if (/行軍|行/.test(contextText)) {
        mode = 'march';
      } else if (/集結|結/.test(contextText)) {
        mode = 'rally';
      }
    }

    // Deduplicate cards that are too close vertically (< 12% screen height)
    const prev = validCards[validCards.length - 1];
    if (!prev || Math.abs(prev.yRatio - actualYRatio) > 0.12) {
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

  // Renumber cards cleanly
  validCards.forEach((c, idx) => {
    c.name = `相手行軍 ${idx + 1}`;
  });

  ocrSessionState.detectedMarches = validCards;
  ocrSessionState.selectedTargetIdx = 0;

  renderOcrResultsView();
}
function renderOcrResultsView() {
  ocrSessionState.isManualSelected = (!ocrSessionState.detectedMarches || ocrSessionState.detectedMarches.length === 0);
  updateOcrManualUI();
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
  scrollWrapper.className = 'relative rounded-xl border-2 border-cyan-400/80 shadow-2xl bg-slate-950 p-1.5 sm:p-2 overflow-y-auto h-[46vh] sm:h-[54vh] max-h-[58vh] select-none shrink-0';

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

    cardBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      selectOcrAiTarget(idx);
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


function toggleOcrCardMode(idx, e) {
  if (e) e.stopPropagation();
  if (ocrSessionState.detectedMarches && ocrSessionState.detectedMarches[idx]) {
    const cur = ocrSessionState.detectedMarches[idx].mode;
    ocrSessionState.detectedMarches[idx].mode = (cur === 'rally' ? 'march' : 'rally');
    updateOcrTargetSelectionUI();
    const lagSec = (Date.now() - (ocrSessionState.captureTime ? ocrSessionState.captureTime.getTime() : Date.now())) / 1000;
    updateOcrTimeoutSafety(lagSec);
  }
}

function getOcrCardButtonInnerHTML(m, idx, isSelected) {
  const isRally = m.mode === 'rally';
  return `
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-black ${isSelected ? 'text-black' : 'text-yellow-300'}">
        ${isSelected ? '🎯 選択中' : '相手行軍 ' + (idx + 1)}
      </span>
      <span onclick="toggleOcrCardMode(${idx}, event)" title="タップで集結/行軍を切替" class="text-[9px] px-1.5 py-0.5 rounded-md font-black cursor-pointer shadow-sm transition-transform active:scale-90 ${
        isSelected
          ? (isRally ? 'bg-amber-950 text-amber-300 border border-amber-500' : 'bg-blue-950 text-cyan-300 border border-cyan-400')
          : (isRally ? 'bg-amber-900/90 text-amber-300 border border-amber-600/80' : 'bg-cyan-950 text-cyan-300 border border-cyan-700/80')
      }">
        ${isRally ? '⏳集結' : '🏃行軍'} 🔄
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
    const isSelected = !ocrSessionState.isManualSelected && (idx === ocrSessionState.selectedTargetIdx);
    btn.className = `absolute left-0 right-0 p-2 rounded-xl font-black text-xs transition-all text-left flex flex-col gap-0.5 border-2 shadow-xl ${
      isSelected
        ? 'bg-yellow-400 text-black border-yellow-100 shadow-2xl shadow-yellow-400/60 ring-4 ring-yellow-300 scale-105 z-20'
        : 'bg-gray-900/95 text-cyan-200 border-cyan-700/80 hover:border-cyan-400 hover:bg-cyan-950 z-10'
    }`;
    btn.innerHTML = getOcrCardButtonInnerHTML(m, idx, isSelected);
  });
}

function updateOcrTimeoutSafety(lagSec) {
  let selected = null;
  if (ocrSessionState.isManualSelected || !ocrSessionState.detectedMarches || ocrSessionState.detectedMarches.length === 0) {
    selected = {
      mode: ocrSessionState.manualMode || 'march',
      remSec: (ocrSessionState.manualRemSec !== undefined ? ocrSessionState.manualRemSec : 30)
    };
  } else {
    selected = ocrSessionState.detectedMarches[ocrSessionState.selectedTargetIdx];
  }
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
  const remainingUntilLaunch = (enemyTotalLandSec + (getInsertionMarginMs() / 1000) - myMarchSec) - lagSec;
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
  let selected = null;
  if (ocrSessionState.isManualSelected || !ocrSessionState.detectedMarches || ocrSessionState.detectedMarches.length === 0) {
    selected = {
      mode: ocrSessionState.manualMode || 'march',
      remSec: (ocrSessionState.manualRemSec !== undefined ? ocrSessionState.manualRemSec : 30),
      name: '',
      tag: ''
    };
  } else {
    selected = ocrSessionState.detectedMarches[ocrSessionState.selectedTargetIdx];
  }
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

  const targetLaunchDate = new Date(enemyLandDate.getTime() + getInsertionMarginMs() - mySec * 1000);

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


// --- Modern 5-Hub Main Tab Switcher (v1.06.43) ---
let currentActiveMainTab = 'single';

function switchMainTab(tabName) {
  currentActiveMainTab = tabName;
  const singleView = document.getElementById('tab-content-single');
  const commanderView = document.getElementById('tab-content-commander');
  
  // Systematically close ALL modals when navigating via bottom bar
  const allModals = document.querySelectorAll('.modal-backdrop');
  allModals.forEach(m => m.classList.remove('open', 'active'));

  // Update Nav Active State
  const navItems = ['single', 'share', 'calc', 'settings'];
  navItems.forEach(n => {
    const btn = document.getElementById(`nav-tab-${n}`);
    if (btn) {
      if (n === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  if (tabName === 'single') {
    if (singleView) singleView.style.display = 'block';
    if (commanderView) commanderView.style.display = 'none';
  } else if (tabName === 'share') {
    if (singleView) singleView.style.display = 'block';
    openOperationShareModal();
  } else if (tabName === 'calc') {
    if (singleView) singleView.style.display = 'block';
    openCalcModal();
  } else if (tabName === 'settings') {
    if (singleView) singleView.style.display = 'block';
    openSettingsModal();
  }
  localStorage.setItem('wos_active_main_tab', tabName);
}

function openOperationShareModal() {
  if (typeof switchShareSubTab === 'function') {
    switchShareSubTab('copy');
  }
  updateOperationSharePreview();
  const modal = document.getElementById('operation-share-modal');
  if (modal) modal.classList.add('open');
}

function closeOperationShareModal() {
  const modal = document.getElementById('operation-share-modal');
  if (modal) modal.classList.remove('open');
}

function updateOperationSharePreview() {
  const previewBox = document.getElementById('share-modal-preview-text');
  if (previewBox) {
    const text = generateAllianceChatText();
    previewBox.innerText = text;
  }
  if (typeof updateAllianceCopyButtons === 'function') {
    updateAllianceCopyButtons();
  }
  const timelinePanel = document.getElementById('share-panel-timeline');
  if (timelinePanel && !timelinePanel.classList.contains('hidden') && typeof updateAllianceTimeline === 'function') {
    updateAllianceTimeline(false);
  }
}

/* [RETIRED in v1.06.64] copyAllianceChatFromModal */

// --- Unified Alliance Chat Generators (v1.06.43) ---
function generateAllianceChatText() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.targetLaunchDate) {
    return `⚔️【ホワサバ 差し込み発車指示】
⚠️ 差し込み計算が開始されていないか、リセットされています。
「個人」画面で「🎯 差し込み計算スタート！」を押すと、
ここに最新の着弾・発車スケジュール指示文が自動生成されます。`;
  }

  const launchTimeStr = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  const now = getAdjustedNowTime();
  const diffSec = Math.max(0, (simpleLaunchState.targetLaunchDate.getTime() - now.getTime()) / 1000);
  const countdownStr = formatCountdownMMSSs(diffSec);
  return buildAllianceChatText('simple', {
    statusMode: simpleLaunchState.statusMode || 'rally',
    launchTimeStr: launchTimeStr,
    countdownStr: countdownStr
  });
}

function copyAllianceChat() {
  const text = generateAllianceChatText();
  navigator.clipboard.writeText(text).then(() => {
    alert('📢 作戦指示テキストをクリップボードにコピーしました！\n同盟チャットやDiscordにそのまま貼り付けてください。');
  }).catch(err => {
    prompt('以下のテキストをコピーしてください:', text);
  });
}


// --- Dedicated Clock Adjustment Modal Helpers (v1.06.43) ---
function openClockAdjustModal() {
  const modal = document.getElementById('clock-adjust-modal');
  if (modal) modal.classList.add('open');
}

function closeClockAdjustModal() {
  const modal = document.getElementById('clock-adjust-modal');
  if (modal) modal.classList.remove('open');
}


// --- Remaining Time Quick Adjust Modal Helpers (v1.06.43) ---
function openRemTimeAdjustModal() {
  updateModalRemTimeDisplay();
  const modal = document.getElementById('rem-time-adjust-modal');
  if (modal) modal.classList.add('open');
}

function closeRemTimeAdjustModal() {
  const modal = document.getElementById('rem-time-adjust-modal');
  if (modal) modal.classList.remove('open');
}

function updateModalRemTimeDisplay() {
  const elem = document.getElementById('simple-remaining-time');
  const modalVal = document.getElementById('modal-rem-time-val');
  if (elem && modalVal) {
    modalVal.textContent = elem.value || '00:00';
  }
}


// Remaining Time Adjust Helpers (for Simple Mode & Modal)
function setSimpleRemainingMinute(mins) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  const currentSecs = parseSecondsFromMMSS(elem.value) % 60;
  const newTotalSec = (mins * 60) + currentSecs;
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated && typeof recalculateSimpleLaunchStateOnMarchChange === 'function') {
    recalculateSimpleLaunchStateOnMarchChange(false, newTotalSec);
  }
}

function setSimpleRemainingSecond(secs) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  const currentMins = Math.floor(parseSecondsFromMMSS(elem.value) / 60);
  const newTotalSec = (currentMins * 60) + secs;
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated && typeof recalculateSimpleLaunchStateOnMarchChange === 'function') {
    recalculateSimpleLaunchStateOnMarchChange(false, newTotalSec);
  }
}

function adjustSimpleRemainingTime(delta) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  const currentSec = parseSecondsFromMMSS(elem.value);
  const newTotalSec = Math.max(0, Math.round((currentSec + delta) * 10) / 10);
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated && typeof recalculateSimpleLaunchStateOnMarchChange === 'function') {
    recalculateSimpleLaunchStateOnMarchChange(false, newTotalSec);
  }
}

function setSimpleRemainingMinuteInModal(mins) {
  setSimpleRemainingMinute(mins);
  updateModalRemTimeDisplay();
}

function setSimpleRemainingSecondInModal(secs) {
  setSimpleRemainingSecond(secs);
  updateModalRemTimeDisplay();
}

function adjustSimpleRemainingTimeInModal(delta) {
  adjustSimpleRemainingTime(delta);
  updateModalRemTimeDisplay();
}


// --- Comprehensive Help Guide Modal Helpers (v1.06.43) ---
function openHelpGuideModal() {
  const modal = document.getElementById('help-guide-modal');
  if (modal) modal.classList.add('open');
}

function closeHelpGuideModal() {
  const modal = document.getElementById('help-guide-modal');
  if (modal) modal.classList.remove('open');
}


// --- Operation Share Modal Sub-Tabs (v1.06.43 Plan A) ---
let currentShareSubTab = 'copy';

function switchShareSubTab(tabName) {
  currentShareSubTab = tabName;
  const btnTimeline = document.getElementById('share-subtab-timeline');
  const btnCopy = document.getElementById('share-subtab-copy');
  const panelTimeline = document.getElementById('share-panel-timeline');
  const panelCopy = document.getElementById('share-panel-copy');

  if (btnTimeline && btnCopy) {
    btnTimeline.className = `btn-game btn-xs ${tabName === 'timeline' ? 'btn-primary active' : 'btn-secondary'} font-bold px-2.5 py-1 text-xs flex items-center gap-1`;
    btnCopy.className = `btn-game btn-xs ${tabName === 'copy' ? 'btn-primary active' : 'btn-secondary'} font-bold px-2.5 py-1 text-xs flex items-center gap-1`;
  }

  if (panelTimeline && panelCopy) {
    panelTimeline.classList.toggle('hidden', tabName !== 'timeline');
    panelCopy.classList.toggle('hidden', tabName !== 'copy');
  }

  if (tabName === 'timeline') {
    updateAllianceTimeline(true);
  } else if (tabName === 'copy') {
    updateOperationSharePreview();
    updateAllianceCopyButtons();
  }
}


// --- Global Data Backup & Restore Engine (v1.06.52: Backup Contract Engine) ---
// チャッピー提案対応: 全20キーの型・セマンティック検証を単一の真実(Descriptor)として一元定義
const BACKUP_STORAGE_SCHEMA = {
  wos_alliance_groups_data_v2: {
    type: 'object',
    default: JSON.stringify({ activeGroupId: 'default', groups: [{ id: 'default', name: '第1グループ', members: [] }] }),
    validate: v => typeof v === 'object' && v !== null && !Array.isArray(v) && Array.isArray(v.groups)
  },
  wos_alliance_members: {
    type: 'array',
    default: '[]',
    validate: v => Array.isArray(v)
  },
  wos_enemy_presets: {
    type: 'array',
    default: '[]',
    validate: v => {
      if (!Array.isArray(v)) return false;
      const keysSeen = new Set();
      for (const p of v) {
        if (typeof p !== 'object' || p === null) return false;
        // チャッピー指摘対応: id と key は必ず両方厳格な非空文字列で存在し、かつ完全一致 (id === key) を要求
        if (typeof p.id !== 'string' || !p.id.trim()) return false;
        if (typeof p.key !== 'string' || !p.key.trim()) return false;
        if (p.id !== p.key) return false;
        if (keysSeen.has(p.id)) return false; // 重複IDの完全排除
        keysSeen.add(p.id);
      }
      return true;
    }
  },
  wos_strategy_note: {
    type: 'string',
    default: '',
    validate: v => typeof v === 'string'
  },
  wos_my_march_time: {
    type: 'string',
    default: '',
    validate: v => typeof v === 'string'
  },
  wos_calc_history: {
    type: 'array',
    default: '[]',
    validate: v => Array.isArray(v)
  },
  wos_enemy_history: {
    type: 'array',
    default: '[]',
    validate: v => Array.isArray(v)
  },
  wos_app_settings: {
    type: 'object',
    default: JSON.stringify({
      skipSplash: false,
      stickyHeader: true,
      showResultMetrics: true,
      customBg: '',
      themeBg: '#080c14',
      themeAccent: '#00f0ff',
      themeText: '#e6f1ff',
      buttonTheme: 'neon',
      hideAdjustButtons: false,
      cardVisibility: {
        'header-mini': false,
        'my-march': false,
        'enemy-list': false,
        'result': false,
        'simple': true,
        'simple-sub-info': false,
        'alliance-multi': false,
        'floating-memo': false
      }
    }),
    validate: v => typeof v === 'object' && v !== null && !Array.isArray(v)
  },
  wos_insertion_margin_ms: {
    type: 'string',
    default: '0',
    validate: v => typeof v === 'string'
  },
  wos_simple_audio_muted: {
    type: 'string',
    default: 'false',
    validate: v => v === 'true' || v === 'false'
  },
  wos_simple_vibration_enabled: {
    type: 'string',
    default: 'false',
    validate: v => v === 'true' || v === 'false'
  },
  wos_floating_memo_text: {
    type: 'string',
    default: '',
    validate: v => typeof v === 'string'
  },
  wos_floating_memo_land_time_show: {
    type: 'string',
    default: 'true',
    validate: v => v === 'true' || v === 'false'
  },
  wos_floating_memo_pos: {
    type: 'object',
    default: JSON.stringify({ left: 20, top: 120 }),
    validate: v => typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.left === 'number' && typeof v.top === 'number'
  },
  wos_keypad_recent_history: {
    type: 'array',
    default: '[]',
    validate: v => Array.isArray(v)
  },
  wos_alliance_selection_sort_mode: {
    type: 'string',
    default: 'time',
    validate: v => ['time', 'name'].includes(v)
  },
  wos_alliance_copy_sort_mode: {
    type: 'string',
    default: 'time',
    validate: v => ['time', 'name'].includes(v)
  },
  wos_active_main_tab: {
    type: 'string',
    default: 'single',
    validate: v => typeof v === 'string'
  },
  wos_button_theme: {
    type: 'string',
    default: 'neon',
    validate: v => typeof v === 'string'
  },
  wos_onboarding_completed: {
    type: 'string',
    default: 'false',
    validate: v => v === 'true' || v === 'false'
  }
};
window.BACKUP_STORAGE_SCHEMA = BACKUP_STORAGE_SCHEMA;

const BACKUP_STORAGE_KEYS = Object.keys(BACKUP_STORAGE_SCHEMA);
window.BACKUP_STORAGE_KEYS = BACKUP_STORAGE_KEYS;

function exportAllAppDataJSON() {
  try {
    const backupData = {
      appVersion: APP_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      version: APP_VERSION,
      appName: 'WOS Insertion Calculator',
      exportedAt: new Date().toISOString(),
      storage: {}
    };

    // チャッピー指摘対応 (P0-1 自己完結型Backup保証):
    // 未使用・未設定キーであってもスキーマ定義の default 値をシリアライズ出力し、常に厳格20キー完全包含を保証
    BACKUP_STORAGE_KEYS.forEach(k => {
      const val = localStorage.getItem(k);
      if (val !== null) {
        backupData.storage[k] = val;
      } else {
        const schemaDef = BACKUP_STORAGE_SCHEMA[k];
        backupData.storage[k] = (schemaDef && schemaDef.default !== undefined) ? schemaDef.default : '';
      }
    });

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `wos_backup_${nowStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('📤 【バックアップ完了】\n設定ファイル(JSON)をダウンロードしました！\n機種変更時や復元時にご利用ください。');
  } catch (e) {
    alert('⚠️ バックアップ書き出し中にエラーが発生しました: ' + e.message);
  }
}

function triggerImportAppDataFile() {
  const fileInput = document.getElementById('setting-backup-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function handleImportAppDataFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const parsed = JSON.parse(content);

      if (!parsed || !parsed.storage || typeof parsed.storage !== 'object' || Array.isArray(parsed.storage)) {
        throw new Error('有効なWOSバックアップ設定ファイルではありません。');
      }

      // チャッピー・Gemini指摘対応: 未知の未来スキーマバージョン検査 (schemaVersion > 3 は拒絶, 厳格整数チェック)
      if (parsed.schemaVersion !== undefined && !Number.isInteger(parsed.schemaVersion)) {
        throw new Error('バックアップ設定ファイルの形式が不正です (schemaVersion must be integer)');
      }
      if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(`未対応の新しいバックアップ形式です (Schema: ${parsed.schemaVersion})。最新版のアプリをご利用ください。`);
      }

      // チャッピーP1指摘対応 (v1.06.73): Schema v3 ➔ v4 自動マイグレーション ＆ 不足キーのdefault安全補完
      // 20キー存在検査の「前」に実行し、古いv3以前のバックアップ(キー数が少なかった過去ver)も安全にv4仕様へ昇華
      const backupVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 3;
      if (backupVersion < 4) {
        // 1. 旧形式の敵プリセットデータを v4 (id === key, 厳格非空文字列) へ自動マイグレーション
        if (parsed.storage.wos_enemy_presets) {
          try {
            const rawPresets = JSON.parse(parsed.storage.wos_enemy_presets);
            if (Array.isArray(rawPresets)) {
              const cleanPresets = [];
              const seenIds = new Set();
              rawPresets.forEach(p => {
                if (!p || typeof p !== 'object') return;
                let candidateId = (typeof p.id === 'string' && p.id.trim()) ? p.id.trim()
                                : (typeof p.key === 'string' && p.key.trim()) ? p.key.trim()
                                : null;
                if (!candidateId) {
                  candidateId = generateUniquePresetId();
                }
                while (seenIds.has(candidateId)) {
                  candidateId = generateUniquePresetId();
                }
                seenIds.add(candidateId);
                p.id = candidateId;
                p.key = candidateId; // v4厳格契約: id === key
                cleanPresets.push(p);
              });
              parsed.storage.wos_enemy_presets = JSON.stringify(cleanPresets);
            }
          } catch (migErr) {
            // パース不可の場合は後続のスキーマバリデーションで安全に遮断
          }
        }

        // 2. 旧バージョンで未定義だった管理キーを schema.default で安全に補完 (下位互換救済)
        BACKUP_STORAGE_KEYS.forEach(k => {
          if (!(k in parsed.storage)) {
            const defSchema = BACKUP_STORAGE_SCHEMA[k];
            if (defSchema && defSchema.default !== undefined) {
              parsed.storage[k] = defSchema.default;
            }
          }
        });
        parsed.schemaVersion = CURRENT_SCHEMA_VERSION; // v4 へ正規化完了
      }

      // チャッピー指摘対応 (BACKUP-PARTIAL-001): 全20管理キーの完全包含検査（不完全JSONによる既存データ消失防止）
      // ※ v4バックアップは20キー完全包含が必須。v3以前は上記でdefault補完された上で20キーを満たすか検証
      const missingKeys = BACKUP_STORAGE_KEYS.filter(k => !(k in parsed.storage));
      if (missingKeys.length > 0) {
        throw new Error('バックアップデータに必要な管理キーが不足しています (' + missingKeys.length + '件欠落)。既存データを保護するため復元を中断しました。');
      }

      // チャッピー指摘対応 (P1: Pre-validation with BACKUP_STORAGE_SCHEMA):
      // Clean Restore（既存データ消去）前に、含まれる各キーの型・JSON構造およびセマンティック整合性を事前網羅検査
      // 不正なデータ構造が1つでも含まれる場合は既存データを消去せずにエラー中断（自爆防止）
      for (const k of Object.keys(parsed.storage)) {
        if (!BACKUP_STORAGE_KEYS.includes(k)) continue;
        const val = parsed.storage[k];
        if (typeof val !== 'string') {
          throw new Error(`ストレージキー [${k}] の値が文字列形式ではありません。`);
        }
        const schema = BACKUP_STORAGE_SCHEMA[k];
        if (schema) {
          let checkVal = val;
          if (schema.type === 'array' || schema.type === 'object') {
            try {
              checkVal = JSON.parse(val);
            } catch (e) {
              throw new Error(`キー [${k}] のJSON解析に失敗しました: ${e.message}`);
            }
          }
          if (typeof schema.validate === 'function' && !schema.validate(checkVal)) {
            throw new Error(`キー [${k}] のデータ構造がスキーマ仕様と不一致です。`);
          }
        }
      }

      if (!confirm('⚠️ 【全データ復元の確認】\nバックアップファイルの内容を読み込みます。\n現在の設定・同盟メンバー・メモは上書きされますがよろしいですか？')) {
        return;
      }

      // チャッピー指摘対応: 完全Restore (Clean Restore) 仕様
      // 復元前に管理対象キーを一度クリアし、古い不要データの残留を完全防止
      BACKUP_STORAGE_KEYS.forEach(k => {
        localStorage.removeItem(k);
      });

      // Gemini/チャッピー指摘対応: BACKUP_STORAGE_KEYS と完全一致するホワイトリストのみを受け入れ
      Object.keys(parsed.storage).forEach(k => {
        if (BACKUP_STORAGE_KEYS.includes(k)) {
          localStorage.setItem(k, parsed.storage[k]);
        }
      });

      alert('📥 【復元完了】\nすべての設定・同盟名簿・メモを正常に復元しました！\n画面を再読み込みします。');
      location.reload();
    } catch (err) {
      alert('⚠️ ファイル読み込みエラー: ' + err.message);
    }
  };
  reader.readAsText(file);
}


// ==========================================================================
// 🔰 Interactive Onboarding Tour Engine (v1.06.43 - Yan-chan 3-Step Experience)
// ==========================================================================
let onboardingTourState = {
  active: false,
  currentStep: 1, // 1: Input, 2: Start, 3: Result
  savedValues: null
};

let onboardingScheduleId = null;
function checkAndTriggerOnboarding() {
  const isDone = localStorage.getItem('wos_onboarding_completed');
  if (isDone) return;
  if (onboardingScheduleId !== null) return; // チャッピー指摘対応: 予約レベルの多重起動ガード

  onboardingScheduleId = setTimeout(() => {
    onboardingScheduleId = null;
    if (!localStorage.getItem('wos_onboarding_completed')) {
      startOnboardingTour(false);
    }
  }, 400);
}
window.checkAndTriggerOnboarding = checkAndTriggerOnboarding;

function startOnboardingTour(forceRestart = false) {
  // Switch to single calculation tab first
  if (typeof switchTab === 'function') {
    switchTab('single');
  }

  // Backup current inputs so we don't destroy user's existing work if forceRestarting
  const myInput = document.getElementById('simple-my-march');
  const enemyInput = document.getElementById('simple-enemy-march');
  const remInput = document.getElementById('simple-remaining-time');
  onboardingTourState.savedValues = {
    my: myInput?.value || '00:05',
    enemy: enemyInput?.value || '00:10',
    rem: remInput?.value || '00:15'
  };

  // Preset ultra-fast test values: 5s / 10s / 15s (Zero wait time)
  if (myInput) myInput.value = '00:05';
  if (enemyInput) enemyInput.value = '00:10';
  if (remInput) remInput.value = '00:15';

  onboardingTourState.active = true;
  onboardingTourState.currentStep = 1;

  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('active');
  }

  renderOnboardingStep();
}
window.startOnboardingTour = startOnboardingTour;

function clearOnboardingHighlights() {
  document.querySelectorAll('.onboarding-highlight').forEach(el => {
    el.classList.remove('onboarding-highlight');
  });
  const hole = document.getElementById('onboarding-hole-rect');
  if (hole) {
    hole.setAttribute('x', '0');
    hole.setAttribute('y', '0');
    hole.setAttribute('width', '0');
    hole.setAttribute('height', '0');
  }
  const border = document.getElementById('onboarding-spotlight-border');
  if (border) border.style.display = 'none';
}

function updateSvgCutoutSpotlight(targetEl) {
  const hole = document.getElementById('onboarding-hole-rect');
  const border = document.getElementById('onboarding-spotlight-border');
  if (!targetEl || !hole) return;

  const rect = targetEl.getBoundingClientRect();
  const pad = 6;
  const x = Math.max(0, rect.left - pad);
  const y = Math.max(0, rect.top - pad);
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;

  // Cut out perfectly clear hole in the SVG mask
  hole.setAttribute('x', x);
  hole.setAttribute('y', y);
  hole.setAttribute('width', w);
  hole.setAttribute('height', h);
  hole.setAttribute('rx', '14');

  // Place glowing spotlight border precisely over the cutout hole
  if (border) {
    border.style.display = 'block';
    border.style.left = x + 'px';
    border.style.top = y + 'px';
    border.style.width = w + 'px';
    border.style.height = h + 'px';
  }
}

function renderOnboardingStep() {
  clearOnboardingHighlights();

  const step = onboardingTourState.currentStep;
  const badge = document.getElementById('onboarding-step-badge');
  const title = document.getElementById('onboarding-title');
  const desc = document.getElementById('onboarding-desc');
  const actionBtn = document.getElementById('btn-onboarding-action');

  let target = null;

  if (step === 1) {
    // Step 1: Input Experience
    if (badge) badge.textContent = 'STEP 1/3';
    if (title) title.textContent = '① 自分と相手の時間をセット！';
    if (desc) desc.innerHTML = 'まずは行軍時間と、相手の残り時間をセット！✨<br><span class="text-amber-300 font-bold">（すぐに試せるサンプル値をセットしたよ！）</span>';
    if (actionBtn) {
      actionBtn.innerHTML = '<span>次へ（計算してみる） ▶</span>';
      actionBtn.className = 'btn-game btn-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-slate-950 font-black px-4 py-2 text-xs rounded-xl shadow-lg flex items-center gap-1';
    }

    target = document.getElementById('simple-input-block') || document.getElementById('simple-remaining-time');
  } else if (step === 2) {
    // Step 2: Trigger Action
    if (badge) badge.textContent = 'STEP 2/3';
    if (title) title.textContent = '② このボタンを押すだけ！';
    if (desc) desc.innerHTML = '準備ができたら<span class="text-yellow-300 font-bold">「差し込み計算スタート」</span>をタップ！🎯<br><span class="text-cyan-300">瞬時にベストな発車予定時刻を割り出します！</span>';
    if (actionBtn) {
      actionBtn.innerHTML = '<span>🎯 計算スタートを体験！</span>';
      actionBtn.className = 'btn-game btn-sm bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 text-slate-950 font-black px-4 py-2 text-xs rounded-xl shadow-lg flex items-center gap-1 animate-pulse';
    }

    target = document.getElementById('btn-simple-enemy-start');
  } else if (step === 3) {
    // Step 3: Result & Value
    if (badge) badge.textContent = 'STEP 3/3';
    if (title) title.textContent = '③ ここに出発時刻が出ます！';
    if (desc) desc.innerHTML = '発車予定時刻が出たよ！🚀<br><span class="text-yellow-300 font-bold">カウントダウンが0になった瞬間に発車</span>すれば、ミリ秒単位で差し込み成功！';
    if (actionBtn) {
      actionBtn.innerHTML = '<span>完了して使う！🎉</span>';
      actionBtn.className = 'btn-game btn-sm bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 text-slate-950 font-black px-5 py-2 text-xs rounded-xl shadow-lg flex items-center gap-1';
    }

    // Target the entire result panel so user sees land-time and countdown clearly
    target = document.getElementById('simple-result-box') || document.getElementById('simple-launch-time-hero');
  }

  const card = document.getElementById('onboarding-dialog-card');
  if (card) {
    if (step === 3) {
      // In Step 3, result panel is large in the lower half; place dialog cleanly at top (below header clock)
      card.classList.remove('pos-bottom');
      card.classList.add('pos-top');
    } else {
      // In Steps 1 & 2, targets are in the upper half; place dialog cleanly at bottom (above footer)
      card.classList.remove('pos-top');
      card.classList.add('pos-bottom');
    }
  }

  if (target) {
    target.classList.add('onboarding-highlight');
    if (step === 3) {
      // For Step 3, scroll result box smoothly to center/bottom so top dialog card does not collide
      target.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      updateSvgCutoutSpotlight(target);
    }, 150);
  }
}

// Window resize / scroll listener to keep spotlight hole in sync with target
window.addEventListener('resize', () => {
  if (onboardingTourState.active) {
    const step = onboardingTourState.currentStep;
    let target = null;
    if (step === 1) target = document.getElementById('simple-input-block');
    if (step === 2) target = document.getElementById('btn-simple-enemy-start');
    if (step === 3) target = document.getElementById('simple-launch-time-hero') || document.getElementById('simple-result-box');
    if (target) updateSvgCutoutSpotlight(target);
  }
});
window.addEventListener('scroll', () => {
  if (onboardingTourState.active) {
    const step = onboardingTourState.currentStep;
    let target = null;
    if (step === 1) target = document.getElementById('simple-input-block');
    if (step === 2) target = document.getElementById('btn-simple-enemy-start');
    if (step === 3) target = document.getElementById('simple-result-box');
    if (target) updateSvgCutoutSpotlight(target);
  }
}, { passive: true });

function handleOnboardingNext() {
  if (!onboardingTourState.active) return;

  if (onboardingTourState.currentStep === 1) {
    onboardingTourState.currentStep = 2;
    renderOnboardingStep();
  } else if (onboardingTourState.currentStep === 2) {
    // Experience actual calculation launch!
    triggerSimpleEnemyLaunch();
    onboardingTourState.currentStep = 3;
    renderOnboardingStep();
  } else if (onboardingTourState.currentStep === 3) {
    finishOnboardingTour();
  }
}
window.handleOnboardingNext = handleOnboardingNext;

function finishOnboardingTour() {
  localStorage.setItem('wos_onboarding_completed', 'true');
  clearOnboardingHighlights();
  onboardingTourState.active = false;
  const cardEl = document.getElementById('onboarding-dialog-card');
  if (cardEl) {
    cardEl.classList.remove('pos-top');
    cardEl.classList.add('pos-bottom');
  }

  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  showToast('🎉 やんちゃんツアー完了！自由に使ってみてね！', 'success', 2500);
}
window.finishOnboardingTour = finishOnboardingTour;

function skipOnboardingTour() {
  localStorage.setItem('wos_onboarding_completed', 'true');
  clearOnboardingHighlights();
  onboardingTourState.active = false;

  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  // Restore previous values if needed
  if (onboardingTourState.savedValues) {
    const myInput = document.getElementById('simple-my-march');
    const enemyInput = document.getElementById('simple-enemy-march');
    const remInput = document.getElementById('simple-remaining-time');
    if (myInput) myInput.value = onboardingTourState.savedValues.my;
    if (enemyInput) enemyInput.value = onboardingTourState.savedValues.enemy;
    if (remInput) remInput.value = onboardingTourState.savedValues.rem;
  }
}
window.skipOnboardingTour = skipOnboardingTour;

// 🧪 Debug Tool: Reset Onboarding Flag to test pristine first launch
function resetOnboardingFlagForDebug() {
  localStorage.removeItem('wos_onboarding_completed');
  showToast('🔄 初回フラグを解除しました！ページをリロードすると初回ツアーが起動します', 'info', 3000);
  setTimeout(() => {
    if (confirm('初回起動ツアーのデバッグのため、今すぐページをリロードしますか？')) {
      location.reload();
    }
  }, 350);
}
window.resetOnboardingFlagForDebug = resetOnboardingFlagForDebug;


/* ==========================================================================
   📺 最前面小窓タイマー (Picture-in-Picture / PiP) エンジン (v1.06.74)
   - 4大AI（チャッピー・Gemini・Claude・Antigravity）完全合意設計
   - メディアAPI完全不干渉（リセット時play/srcObject操作ゼロ）
   - canvas.captureStream(0) + 手動 track.requestFrame() による超絶高耐久
   - クリーン後始末（track.stop()）＆ 状態マシンによる排他制御
   ========================================================================== */

let pipState = 'IDLE'; // 'IDLE' | 'STARTING' | 'PIP' | 'STOPPED'
let pipCanvasStream = null;
let pipVideoTrack = null;
let isPipVideoReady = false;

// 1. ストリーム事前準備 (初回タッチまたはロード時)
function initPipStreamPreload() {
  const canvas = document.getElementById('pip-canvas');
  const video = document.getElementById('pip-video');
  if (!canvas || !video) return;

  if (!pipCanvasStream) {
    if (typeof canvas.captureStream !== 'function') {
      console.warn('[PiP] canvas.captureStream is not supported on this browser.');
      return;
    }
    try {
      pipCanvasStream = canvas.captureStream(0); // 手動供給モード
    } catch (e) {
      pipCanvasStream = canvas.captureStream();
    }

    const tracks = pipCanvasStream.getVideoTracks();
    if (tracks && tracks.length > 0) {
      pipVideoTrack = tracks[0];
    }
    video.srcObject = pipCanvasStream;
    // 初期フレームを描画してメタデータを即座に生成
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (pipVideoTrack && typeof pipVideoTrack.requestFrame === 'function') {
        try { pipVideoTrack.requestFrame(); } catch (e) {}
      }
    }
  }

  video.play().then(() => {
    isPipVideoReady = true;
  }).catch(() => {
    document.body.addEventListener('touchstart', () => {
      if (!isPipVideoReady && video) {
        video.play().then(() => { isPipVideoReady = true; }).catch(() => {});
      }
    }, { once: true });
  });

  // イベントリスナー
  video.addEventListener('leavepictureinpicture', handlePipClosed);
  video.addEventListener('webkitpresentationmodechanged', () => {
    if (video.webkitPresentationMode === 'inline') {
      handlePipClosed();
    } else if (video.webkitPresentationMode === 'picture-in-picture') {
      pipState = 'PIP';
      updatePipButtonUi(true);
    }
  });
}

// 2. PiP ボタンの表示同期
function updatePipButtonUi(isActive) {
  const btn = document.getElementById('btn-start-pip');
  const label = document.getElementById('pip-btn-label');
  if (!btn || !label) return;

  if (isActive) {
    btn.classList.add('pip-active');
    label.textContent = '表示中';
  } else {
    btn.classList.remove('pip-active');
    label.textContent = '小窓';
  }
}

// 3. 小窓を閉じた時のクリーン解放処理 (Claude/Gemini/チャッピー合意)
function handlePipClosed() {
  pipState = 'STOPPED';
  updatePipButtonUi(false);
  console.log('[PiP] 小窓が閉じられました (クリーン状態へ遷移)');
}

// 4. 手動フレーム描画 ＆ requestFrame 供給
function drawAndPushPipFrame() {
  if (pipState !== 'PIP') return;

  const canvas = document.getElementById('pip-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  try {
    const now = getAdjustedNowTime();
    let remainingMs = 0;
    let remainingText = '--:--.-';
    let isUrgent = false;
    let isFinished = false;

    if (simpleLaunchState.isCalculated && simpleLaunchState.targetLaunchDate) {
      remainingMs = simpleLaunchState.targetLaunchDate.getTime() - now.getTime();
      isUrgent = (remainingMs > 0 && remainingMs <= 5000);
      isFinished = (remainingMs <= 0);

      if (isFinished) {
        remainingText = '00:00.0';
      } else {
        const totalSec = Math.floor(remainingMs / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        const d = Math.floor((remainingMs % 1000) / 100);
        remainingText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
      }
    } else {
      remainingText = '未計算';
    }

    // 背景描画 (5秒前アラート時は赤黒点滅)
    if (isUrgent) {
      const blink = Math.floor(remainingMs / 400) % 2 === 0;
      ctx.fillStyle = blink ? '#7f1d1d' : '#020617';
    } else if (isFinished) {
      ctx.fillStyle = '#1e293b';
    } else {
      ctx.fillStyle = '#090d16';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ネオン外枠
    ctx.strokeStyle = isUrgent ? '#ef4444' : (isFinished ? '#64748b' : '#0284c7');
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

    // ヘッダー情報 (現在時刻)
    const nowStr = formatTimeHHMMSS(now) + '.' + Math.floor(now.getMilliseconds() / 100);
    ctx.fillStyle = isUrgent ? '#fca5a5' : '#38bdf8';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('⚔️ WOS 差込タイマー', 20, 36);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(nowStr, canvas.width - 20, 36);

    // 区切り線
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 48);
    ctx.lineTo(canvas.width - 20, 48);
    ctx.stroke();

    // 状態ラベル
    ctx.textAlign = 'center';
    if (!simpleLaunchState.isCalculated) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText('🎯 計算スタートを押してください', canvas.width / 2, 85);
    } else if (isUrgent) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText('🚨 まもなく発車！ (5秒前)', canvas.width / 2, 85);
    } else if (isFinished) {
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText('🏁 発車時刻 到達！ (経過)', canvas.width / 2, 85);
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText('🎯 あなたの発車カウントダウン', canvas.width / 2, 85);
    }

    // デカ文字タイマー
    if (isUrgent) {
      ctx.fillStyle = '#fef08a';
    } else if (isFinished) {
      ctx.fillStyle = '#94a3b8';
    } else {
      ctx.fillStyle = '#facc15';
    }
    ctx.font = '900 84px monospace';
    ctx.fillText(remainingText, canvas.width / 2, 175);

    // フッター情報
    ctx.fillStyle = '#64748b';
    ctx.font = '18px sans-serif';
    ctx.fillText('ホワサバ画面の隅に配置してご利用ください', canvas.width / 2, 215);

    // 手動フレーム送信
    if (pipVideoTrack && typeof pipVideoTrack.requestFrame === 'function') {
      pipVideoTrack.requestFrame();
    }
  } catch (err) {
    console.error('[PiP Render Error]', err);
  }
}

// 5. PiP のトグル起動 / 閉じる (本物のユーザー同期クリック内で実行)
async function togglePictureInPictureTimer() {
  const video = document.getElementById('pip-video');
  if (!video) return;

  // すでにPiP中の場合は閉じる
  if (pipState === 'PIP') {
    if (typeof video.webkitSetPresentationMode === 'function') {
      video.webkitSetPresentationMode('inline');
    } else if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    handlePipClosed();
    return;
  }

  // 起動前チェック: 計算中か案内
  if (!simpleLaunchState.isCalculated) {
    showToast('先に「差し込み計算スタート！」を押してください', 'warning');
  }

  if (pipState === 'STARTING') return;
  pipState = 'STARTING';

  // ストリームが未作成なら即時同期生成
  if (!pipCanvasStream) {
    initPipStreamPreload();
  }

  if (video.paused) {
    video.play().catch(() => {});
  }

  // 初回1コマを即座に描画
  pipState = 'PIP'; // 一時的に描画を通す
  drawAndPushPipFrame();

  // iOS Safari WebKit PiP
  if (typeof video.webkitSetPresentationMode === 'function') {
    try {
      video.webkitSetPresentationMode('picture-in-picture');
      updatePipButtonUi(true);
      showToast('小窓タイマーを起動しました！ゲームへ戻れます', 'success');
      return;
    } catch (e) {
      pipState = 'STOPPED';
      updatePipButtonUi(false);
      console.error('[PiP WebKit Exception]', e);
    }
  }

  // 標準 Picture-in-Picture (PC Chrome/Edge等のメタデータ待機保護)
  if (typeof video.requestPictureInPicture === 'function') {
    if (video.readyState === 0) {
      await new Promise(res => {
        video.addEventListener('loadedmetadata', res, { once: true });
        setTimeout(res, 200);
      });
    }
    video.requestPictureInPicture()
      .then(() => {
        pipState = 'PIP';
        updatePipButtonUi(true);
        showToast('小窓タイマーを起動しました！', 'success');
      })
      .catch((err) => {
        pipState = 'STOPPED';
        updatePipButtonUi(false);
        showToast('小窓の起動に失敗しました: ' + err.message, 'error');
      });
  } else {
    pipState = 'STOPPED';
    updatePipButtonUi(false);
    showToast('お使いの端末・ブラウザはPicture-in-Pictureに対応していません', 'warning');
  }
}

// アプリ起動時にPiP事前準備をキック
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPipStreamPreload);
} else {
  initPipStreamPreload();
}
