const STAGE_CONFIG = [
  { id: 'stage1Level', label: '1st stage' },
  { id: 'stage2Level', label: '2nd stage' },
  { id: 'stage3Level', label: '3rd stage' },
  { id: 'stageFinalLevel', label: 'final stage' }
];

const TROPHY_PRESETS = {
  bronze: {
    class: 'bms.player.beatoraja.CourseData$TrophyData',
    name: 'bronzemedal',
    missrate: 7.5,
    scorerate: 55
  },
  silver: {
    class: 'bms.player.beatoraja.CourseData$TrophyData',
    name: 'silvermedal',
    missrate: 5,
    scorerate: 70
  },
  gold: {
    class: 'bms.player.beatoraja.CourseData$TrophyData',
    name: 'goldmedal',
    missrate: 2.5,
    scorerate: 85
  }
};

const state = {
  difficultyTables: [],
  selectedTableData: null,
  selectedTable: null,
  levelKeys: [],
  songsByLevel: new Map(),
  generatedCourse: null,
  generatedStages: [],
  existingCourses: [],
  resolvedCourseFilePath: '',
  existingCourseFilePath: '',
  existingCourseTableName: '',
  courseDifficultyLookup: new Map(),
  courseDifficultyLookupReady: false,
  expandedExistingCourses: new Set(),
  courseMetadata: [],
  editingCourseIndex: null,
  editingCourseName: '',
  editingOriginalMatchKey: '',
  editingCourseMetadata: null
};

function getResolvedCourseFilePath() {
  return state.existingCourseFilePath || state.resolvedCourseFilePath || '';
}

function isEditingCourse() {
  return Number.isInteger(state.editingCourseIndex) && state.editingCourseIndex >= 0;
}

function updateEditingUi() {
  const noticeEl = document.getElementById('editingNotice');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');

  if (!noticeEl || !saveBtn || !cancelBtn) {
    return;
  }

  if (isEditingCourse()) {
    noticeEl.hidden = false;
    noticeEl.textContent = `編集中: ${state.editingCourseName} / 保存すると既存コースを上書きします`;
    saveBtn.textContent = '内容を更新';
    cancelBtn.hidden = false;
    return;
  }

  noticeEl.hidden = true;
  noticeEl.textContent = '';
  saveBtn.textContent = 'JSONに保存';
  cancelBtn.hidden = true;
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
}

function clearStatus() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = '';
  statusEl.style.display = 'none';
  statusEl.className = 'status';
}

function normalizeLevel(level) {
  if (level === undefined || level === null) {
    return '';
  }
  return String(level).trim();
}

function extractNumericValue(text) {
  const match = String(text).match(/-?\d+(\.\d+)?/);
  if (!match) {
    return Number.NaN;
  }
  return Number.parseFloat(match[0]);
}

function compareLevels(a, b) {
  const numberA = extractNumericValue(a);
  const numberB = extractNumericValue(b);

  if (!Number.isNaN(numberA) && !Number.isNaN(numberB) && numberA !== numberB) {
    return numberA - numberB;
  }

  return String(a).localeCompare(String(b), 'ja', { numeric: true });
}

function formatLevelLabel(levelKey) {
  const symbol = state.selectedTableData?.header?.symbol || '';
  if (!symbol) {
    return levelKey;
  }

  return String(levelKey).startsWith(symbol) ? levelKey : `${symbol}${levelKey}`;
}

function formatSongTitle(song) {
  const title = song.title || '[Unknown Song]';
  const subtitle = song.subtitle && String(song.subtitle).trim() !== '' ? ` ${song.subtitle}` : '';
  return `${title}${subtitle}`;
}

function getSongUniqueKey(song) {
  return (
    song.charthash ||
    song.sha256 ||
    song.md5 ||
    song.path ||
    `${song.title || ''}__${song.artist || ''}__${song.subtitle || ''}`
  );
}

function buildConstraintText(constraints) {
  return Array.isArray(constraints) && constraints.length > 0
    ? constraints.join(', ')
    : '(なし)';
}

function computeMatchKey(course) {
  const hashes = Array.isArray(course?.hash) ? course.hash : [];
  const keys = hashes.map((h) => h?.charthash || h?.sha256 || '').filter(Boolean);
  return keys.join('|');
}

function findCourseMetadata(course) {
  const key = computeMatchKey(course);
  if (!key) return null;
  return state.courseMetadata.find((m) => m.matchKey === key) || null;
}

function buildCourseMetadataPayload({ course, stages, table, tableData, savedFilePath, previousMetadata = null }) {
  const symbol = tableData?.header?.symbol || previousMetadata?.tableSymbol || '';

  return {
    matchKey: computeMatchKey(course),
    name: course.name || previousMetadata?.name || '',
    savedFilePath: savedFilePath || previousMetadata?.savedFilePath || '',
    tableUrl: table?.url || previousMetadata?.tableUrl || '',
    tableName: table?.name || previousMetadata?.tableName || '',
    tableSymbol: symbol,
    createdAt: previousMetadata?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages: stages.map((stage, index) => ({
      stageLabel: stage.label || getStageLabel(index, stages.length),
      levelKey: stage.levelKey,
      difficultyLabel: String(stage.levelKey).startsWith(symbol)
        ? stage.levelKey
        : symbol ? `${symbol}${stage.levelKey}` : String(stage.levelKey),
      sha256: course.hash[index]?.sha256 || '',
      charthash: course.hash[index]?.charthash || ''
    }))
  };
}

function getCourseSongHashKeys(song) {
  return [song?.charthash, song?.sha256, song?.md5]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function registerCourseDifficultyEntry(lookup, song, difficultyLabel) {
  getCourseSongHashKeys(song).forEach((key) => {
    if (!lookup.has(key)) {
      lookup.set(key, difficultyLabel);
    }
  });
}

async function ensureCourseDifficultyLookup() {
  if (state.courseDifficultyLookupReady) {
    return;
  }

  const lookup = new Map();

  for (const table of state.difficultyTables) {
    if (!table?.url) {
      continue;
    }

    try {
      const tableData = await window.api.loadDifficultyTable(table.url);
      const { songsByLevel, levelKeys } = extractSongsByLevel(tableData);
      const symbol = tableData?.header?.symbol || '';

      levelKeys.forEach((levelKey) => {
        const difficultyLabel = symbol ? `${symbol}${levelKey}` : String(levelKey);
        const songs = songsByLevel.get(levelKey) || [];
        songs.forEach((song) => registerCourseDifficultyEntry(lookup, song, difficultyLabel));
      });
    } catch (error) {
      console.error('既存コース用難易度表読込エラー:', table?.name || table?.url, error);
    }
  }

  state.courseDifficultyLookup = lookup;
  state.courseDifficultyLookupReady = true;
}

function resolveCourseSongDifficulty(song) {
  const difficulty = getCourseSongHashKeys(song)
    .map((key) => state.courseDifficultyLookup.get(key))
    .find(Boolean);

  return difficulty || '難易度不明';
}

function appendIfDefined(target, key, value) {
  if (value !== undefined && value !== null) {
    target[key] = value;
  }
}

function pickValue(primary, fallback) {
  return primary !== undefined && primary !== null ? primary : fallback;
}

async function resolveSongMetadata(song) {
  const hash = song.sha256 || song.md5;
  if (!hash || !window.api?.getSongMetadata) {
    return null;
  }

  try {
    return await window.api.getSongMetadata(hash);
  } catch (error) {
    console.error('メタデータ取得エラー:', error);
    return null;
  }
}

async function buildCourseHashEntry(song) {
  const metadata = await resolveSongMetadata(song);
  const source = metadata && typeof metadata === 'object' ? metadata : {};

  const entry = {};
  appendIfDefined(entry, 'title', pickValue(source.title, song.title));
  appendIfDefined(entry, 'subtitle', pickValue(source.subtitle, song.subtitle));
  appendIfDefined(entry, 'genre', pickValue(source.genre, song.genre));
  appendIfDefined(entry, 'artist', pickValue(source.artist, song.artist));
  appendIfDefined(entry, 'subartist', pickValue(source.subartist, song.subartist));
  appendIfDefined(entry, 'md5', pickValue(source.md5, song.md5));
  appendIfDefined(entry, 'sha256', pickValue(source.sha256, song.sha256));
  appendIfDefined(entry, 'content', pickValue(source.content, song.content));
  appendIfDefined(entry, 'stagefile', pickValue(source.stagefile, song.stagefile));
  appendIfDefined(entry, 'backbmp', pickValue(source.backbmp, song.backbmp));
  appendIfDefined(entry, 'banner', pickValue(source.banner, song.banner));
  appendIfDefined(entry, 'charthash', pickValue(source.charthash, song.charthash));

  return entry;
}

function buildConstraintList() {
  const option = document.getElementById('optionSetting').value;
  const gauge = document.getElementById('gaugeSetting').value;
  const lnType = document.getElementById('lnTypeSetting').value;
  const noSpeed = document.getElementById('noSpeedSetting').value;
  const noGood = document.getElementById('noGoodSetting').value;

  const constraints = [];
  if (option) constraints.push(option);
  if (gauge) constraints.push(gauge);
  if (lnType) constraints.push(lnType);
  if (noSpeed) constraints.push(noSpeed);
  if (noGood) constraints.push(noGood);

  return constraints;
}

function buildTrophyList() {
  return [
    { ...TROPHY_PRESETS.bronze },
    { ...TROPHY_PRESETS.silver },
    { ...TROPHY_PRESETS.gold }
  ];
}

function getCourseName() {
  return document.getElementById('courseNameInput').value.trim();
}

function pickConstraintValue(constraints, candidates, fallback = '') {
  return candidates.find((candidate) => constraints.includes(candidate)) || fallback;
}

function applyConstraintSelections(constraints) {
  const normalizedConstraints = Array.isArray(constraints) ? constraints : [];

  document.getElementById('optionSetting').value = pickConstraintValue(
    normalizedConstraints,
    ['CLASS', 'MIRROR', 'RANDOM'],
    'RANDOM'
  );
  document.getElementById('gaugeSetting').value = pickConstraintValue(
    normalizedConstraints,
    ['GAUGE_LR2', 'GAUGE_7keys', 'GAUGE_5keys', 'GAUGE_9keys', 'GAUGE_24keys'],
    'GAUGE_LR2'
  );
  document.getElementById('lnTypeSetting').value = pickConstraintValue(
    normalizedConstraints,
    ['LN', 'CN', 'HCN'],
    'LN'
  );
  document.getElementById('noSpeedSetting').value = normalizedConstraints.includes('NO_SPEED') ? 'NO_SPEED' : '';
  document.getElementById('noGoodSetting').value = pickConstraintValue(
    normalizedConstraints,
    ['NO_GOOD', 'NO_GREAT'],
    ''
  );
  
}

function ensureSelectHasOption(select, value, label) {
  if (!select || !value) {
    return;
  }

  const exists = Array.from(select.options).some((option) => option.value === value);
  if (!exists) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label || value;
    select.appendChild(option);
  }

  select.value = value;
}

function buildGeneratedStagesFromCourse(course, metadata) {
  const hashes = Array.isArray(course?.hash) ? course.hash : [];

  return hashes.map((song, index) => ({
    label: metadata?.stages?.[index]?.stageLabel || getStageLabel(index, hashes.length),
    levelKey: metadata?.stages?.[index]?.levelKey || '',
    song
  }));
}

function buildCoursePayloadForSave() {
  return {
    ...state.generatedCourse,
    class: 'bms.player.beatoraja.CourseData',
    name: getCourseName(),
    constraint: buildConstraintList(),
    trophy: buildTrophyList(),
    release: false
  };
}

function getStageLabel(index, totalCount) {
  if (totalCount === STAGE_CONFIG.length && STAGE_CONFIG[index]) {
    return STAGE_CONFIG[index].label;
  }

  return `stage ${index + 1}`;
}

function resetGeneratedCourse() {
  state.generatedCourse = null;
  state.generatedStages = [];
}

function clearEditingState(options = {}) {
  const { resetPreview = false } = options;

  state.editingCourseIndex = null;
  state.editingCourseName = '';
  state.editingOriginalMatchKey = '';
  state.editingCourseMetadata = null;
  updateEditingUi();

  if (resetPreview) {
    resetGeneratedCourse();
    renderPreview();
  }
}

function handleCourseStructureChange() {
  resetGeneratedCourse();
  renderPreview();
}

function handleCourseSettingsChange() {
  if (state.generatedCourse) {
    state.generatedCourse = buildCoursePayloadForSave();
  }
  renderPreview();
}

function getWarmUpMixTaggedCourses() {
  return state.existingCourses
    .map((course, index) => ({
      course,
      index,
      metadata: findCourseMetadata(course)
    }))
    .filter((entry) => Boolean(entry.metadata));
}

function getWarmUpMixShuffleTargets() {
  return getWarmUpMixTaggedCourses();
}

function renderExistingCourses() {
  const summaryEl = document.getElementById('existingCourseSummary');
  const listEl = document.getElementById('existingCourseList');
  const bulkShuffleButton = document.getElementById('bulkShuffleWarmUpMixBtn');
  listEl.innerHTML = '';

  const warmUpMixTargets = getWarmUpMixShuffleTargets();
  if (bulkShuffleButton) {
    bulkShuffleButton.disabled = warmUpMixTargets.length === 0;
    bulkShuffleButton.textContent = warmUpMixTargets.length > 0
      ? `Warm Up Mix一括再選曲 (${warmUpMixTargets.length})`
      : 'Warm Up Mix一括再選曲';
  }

  if (!state.existingCourseFilePath) {
    summaryEl.textContent = '設定画面の Player* フォルダ設定から default.json を自動で読み込みます';
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'Player* フォルダが未設定です';
    listEl.appendChild(li);
    return;
  }

  const tableNameText = state.existingCourseTableName
    ? ` / Table: ${state.existingCourseTableName}`
    : '';

  if (state.existingCourses.length === 0) {
    summaryEl.textContent = `${state.existingCourseFilePath}${tableNameText} / コース 0 件`;
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'このJSONにはコースが登録されていません';
    listEl.appendChild(li);
    return;
  }

  summaryEl.textContent = `${state.existingCourseFilePath}${tableNameText} / コース ${state.existingCourses.length} 件`;

  state.existingCourses.forEach((course, index) => {
    const li = document.createElement('li');
    li.className = 'existing-course-item';

    const beatArchiveMeta = findCourseMetadata(course);
    if (beatArchiveMeta) {
      li.classList.add('existing-course-item--ours');
    }

    const headerEl = document.createElement('div');
    headerEl.className = 'existing-course-header';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'existing-course-toggle';
    toggleButton.setAttribute('aria-expanded', state.expandedExistingCourses.has(index) ? 'true' : 'false');
    toggleButton.addEventListener('click', () => {
      if (state.expandedExistingCourses.has(index)) {
        state.expandedExistingCourses.delete(index);
      } else {
        state.expandedExistingCourses.add(index);
      }
      renderExistingCourses();
    });

    const titleWrap = document.createElement('div');
    titleWrap.className = 'existing-course-title-wrap';

    const nameEl = document.createElement('div');
    nameEl.className = 'existing-course-name';
    nameEl.textContent = course.name || '[No Name]';

    const settingsEl = document.createElement('div');
    settingsEl.className = 'existing-course-meta';
    settingsEl.textContent = `設定: ${buildConstraintText(course.constraint)}`;

    const indicatorEl = document.createElement('span');
    indicatorEl.className = 'existing-course-indicator';
    indicatorEl.textContent = state.expandedExistingCourses.has(index) ? '-' : '+';

    if (beatArchiveMeta) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'existing-course-badge';
      badgeEl.textContent = 'Warm Up Mix';
      nameEl.appendChild(badgeEl);

      if (typeof beatArchiveMeta.tableName === 'string' && beatArchiveMeta.tableName.trim() !== '') {
        const tableBadgeEl = document.createElement('span');
        tableBadgeEl.className = 'existing-course-badge existing-course-badge--table';
        tableBadgeEl.textContent = beatArchiveMeta.tableName.trim();
        nameEl.appendChild(tableBadgeEl);
      }
    }

    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(settingsEl);
    toggleButton.appendChild(titleWrap);
    toggleButton.appendChild(indicatorEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'existing-course-actions';

    if (beatArchiveMeta?.tableUrl && Array.isArray(beatArchiveMeta.stages) && beatArchiveMeta.stages.length > 0) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'existing-course-action existing-course-edit';
      editButton.textContent = isEditingCourse() && state.editingCourseIndex === index ? '編集中' : '編集';
      editButton.disabled = isEditingCourse() && state.editingCourseIndex === index;
      editButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await editExistingCourse(index);
      });
      actionsEl.appendChild(editButton);

      const shuffleButton = document.createElement('button');
      shuffleButton.type = 'button';
      shuffleButton.className = 'existing-course-action existing-course-shuffle';
      shuffleButton.textContent = '再選曲';
      shuffleButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await shuffleExistingCourse(index, course.name || '[No Name]');
      });
      actionsEl.appendChild(shuffleButton);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'existing-course-action existing-course-delete';
    deleteButton.textContent = '削除';
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteExistingCourse(index, course.name || '[No Name]');
    });

    actionsEl.appendChild(deleteButton);

    headerEl.appendChild(toggleButton);
    headerEl.appendChild(actionsEl);
    li.appendChild(headerEl);

    if (state.expandedExistingCourses.has(index)) {
      const detailWrap = document.createElement('div');
      detailWrap.className = 'existing-course-details';

      const hashes = Array.isArray(course.hash) ? course.hash : [];
      if (hashes.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'no-results';
        emptyEl.textContent = 'このコースにはステージ情報がありません';
        detailWrap.appendChild(emptyEl);
      } else {
        hashes.forEach((song, songIndex) => {
          const songEl = document.createElement('div');
          songEl.className = 'existing-course-song';

          const stageEl = document.createElement('div');
          stageEl.className = 'existing-course-song-stage';
          stageEl.textContent = getStageLabel(songIndex, hashes.length);

          const songTitleEl = document.createElement('div');
          songTitleEl.className = 'existing-course-song-title';
          songTitleEl.textContent = formatSongTitle(song);

          const difficultyEl = document.createElement('div');
          difficultyEl.className = 'existing-course-song-difficulty';
          const difficultyText = beatArchiveMeta?.stages?.[songIndex]?.difficultyLabel
            ? beatArchiveMeta.stages[songIndex].difficultyLabel
            : resolveCourseSongDifficulty(song);
          difficultyEl.textContent = `難易度: ${difficultyText}`;

          songEl.appendChild(stageEl);
          songEl.appendChild(songTitleEl);
          songEl.appendChild(difficultyEl);
          detailWrap.appendChild(songEl);
        });
      }

      li.appendChild(detailWrap);
    }

    listEl.appendChild(li);
  });
}

async function loadExistingCourses(options = {}) {
  const { showStatusMessage = false } = options;
  const savePath = state.resolvedCourseFilePath.trim();

  if (!savePath) {
    state.existingCourses = [];
    state.existingCourseFilePath = '';
    state.existingCourseTableName = '';
    state.expandedExistingCourses = new Set();
    renderExistingCourses();
    return;
  }

  try {
    const result = await window.api.loadCustomCourseFile(savePath);

    if (!result || !result.success) {
      throw new Error(result?.error || '既存コースの読込に失敗しました。');
    }

    state.existingCourses = Array.isArray(result.courses) ? result.courses : [];
    state.resolvedCourseFilePath = result.filePath || savePath;
    state.existingCourseFilePath = state.resolvedCourseFilePath;
    state.existingCourseTableName = result.tableName || '';
    state.expandedExistingCourses = new Set(
      Array.from(state.expandedExistingCourses).filter((index) => index < state.existingCourses.length)
    );

    if (state.existingCourses.length > 0 && state.difficultyTables.length > 0) {
      await ensureCourseDifficultyLookup();
    }

    renderExistingCourses();

    if (showStatusMessage) {
      if (result.exists) {
        showStatus(`既存コースを読み込みました (${state.existingCourses.length} 件)。`, 'success');
      } else {
        showStatus('保存先JSONはまだ存在しません。新規保存時に作成されます。', 'info');
      }
    }
  } catch (error) {
    console.error('既存コース読込エラー:', error);
    if (showStatusMessage) {
      showStatus(`既存コースの読込に失敗しました: ${error.message}`, 'error');
    }
  }
}

async function deleteExistingCourse(courseIndex, courseName) {
  const targetFilePath = getResolvedCourseFilePath();
  if (!targetFilePath) {
    showStatus('削除対象の保存先JSONが見つかりません。', 'error');
    return;
  }

  const shouldDelete = await window.api.showConfirmDialog(
    `コース「${courseName}」を削除しますか？`,
    'コースの削除'
  );

  if (!shouldDelete) {
    return;
  }

  try {
    const courseToDelete = state.existingCourses[courseIndex];
    const matchKey = computeMatchKey(courseToDelete);

    const result = await window.api.deleteCustomCourse(targetFilePath, courseIndex);
    if (!result || !result.success) {
      throw new Error(result?.error || 'コース削除に失敗しました。');
    }

    if (matchKey && window.api.deleteCourseMetadata) {
      await window.api.deleteCourseMetadata(matchKey);
      state.courseMetadata = state.courseMetadata.filter((m) => m.matchKey !== matchKey);
    }

    if (isEditingCourse()) {
      if (state.editingCourseIndex === courseIndex) {
        clearEditingState({ resetPreview: true });
      } else if (state.editingCourseIndex > courseIndex) {
        state.editingCourseIndex -= 1;
        updateEditingUi();
      }
    }

    state.expandedExistingCourses = new Set(
      Array.from(state.expandedExistingCourses)
        .filter((index) => index !== courseIndex)
        .map((index) => (index > courseIndex ? index - 1 : index))
    );

    await loadExistingCourses();
    showStatus(`コースを削除しました: ${courseName} (残り ${result.totalCourses} 件)`, 'success');
  } catch (error) {
    console.error('コース削除エラー:', error);
    showStatus(`コース削除に失敗しました: ${error.message}`, 'error');
  }
}

function renderPreview() {
  const previewList = document.getElementById('previewList');
  previewList.innerHTML = '';

  if (!state.generatedCourse || state.generatedStages.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'まだコースが生成されていません';
    previewList.appendChild(li);
    return;
  }

  state.generatedStages.forEach((stage) => {
    const li = document.createElement('li');
    li.className = 'preview-item';

    const stageEl = document.createElement('div');
    stageEl.className = 'preview-stage';
    stageEl.textContent = `${stage.label} (${formatLevelLabel(stage.levelKey)})`;

    const titleEl = document.createElement('div');
    titleEl.className = 'preview-title';
    titleEl.textContent = formatSongTitle(stage.song);

    const metaEl = document.createElement('div');
    metaEl.className = 'preview-meta';
    metaEl.textContent = `${stage.song.artist || 'Unknown Artist'} / ${stage.song.genre || 'Unknown Genre'}`;

    li.appendChild(stageEl);
    li.appendChild(titleEl);
    li.appendChild(metaEl);
    previewList.appendChild(li);
  });

  const summaryLi = document.createElement('li');
  summaryLi.className = 'preview-item';
  summaryLi.textContent = `制約: ${state.generatedCourse.constraint.join(', ') || '(なし)'} / Trophy数: ${state.generatedCourse.trophy.length}`;
  previewList.appendChild(summaryLi);
}

function populateTableSelect() {
  const tableSelect = document.getElementById('tableSelect');
  tableSelect.innerHTML = '';

  if (state.difficultyTables.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '難易度表が設定されていません';
    tableSelect.appendChild(option);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '難易度表を選択してください';
  tableSelect.appendChild(placeholder);

  state.difficultyTables.forEach((table) => {
    const option = document.createElement('option');
    option.value = table.url;
    option.textContent = table.name;
    tableSelect.appendChild(option);
  });
}

function populateStageLevelSelects() {
  const levelKeys = state.levelKeys;

  STAGE_CONFIG.forEach((stage, index) => {
    const select = document.getElementById(stage.id);
    const previousValue = select.value;
    select.innerHTML = '';

    if (levelKeys.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '難易度なし';
      select.appendChild(option);
      return;
    }

    levelKeys.forEach((levelKey) => {
      const option = document.createElement('option');
      option.value = levelKey;
      option.textContent = formatLevelLabel(levelKey);
      select.appendChild(option);
    });

    if (previousValue && levelKeys.includes(previousValue)) {
      select.value = previousValue;
    } else {
      select.value = levelKeys[0];
    }
  });
}

function extractSongsByLevel(tableData) {
  const songsByLevel = new Map();
  const body = tableData?.body;

  const addSong = (level, song) => {
    const levelKey = normalizeLevel(level);
    if (!levelKey || !song || typeof song !== 'object') {
      return;
    }

    if (!songsByLevel.has(levelKey)) {
      songsByLevel.set(levelKey, []);
    }

    songsByLevel.get(levelKey).push(song);
  };

  if (Array.isArray(body)) {
    const hasGroupedLevels = body.some((item) => item && typeof item === 'object' && Array.isArray(item.songs));

    if (hasGroupedLevels) {
      body.forEach((levelGroup) => {
        const levelKey = normalizeLevel(levelGroup.level ?? levelGroup.name);
        if (!Array.isArray(levelGroup.songs)) {
          return;
        }

        levelGroup.songs.forEach((song) => addSong(levelKey, song));
      });
    } else {
      body.forEach((song) => {
        addSong(song.level, song);
      });
    }
  } else if (body && typeof body === 'object') {
    Object.entries(body).forEach(([levelKey, levelValue]) => {
      if (Array.isArray(levelValue)) {
        levelValue.forEach((song) => addSong(levelKey, song));
      } else if (levelValue && typeof levelValue === 'object' && Array.isArray(levelValue.songs)) {
        levelValue.songs.forEach((song) => addSong(levelKey, song));
      }
    });
  }

  const availableLevels = Array.from(songsByLevel.keys());
  const levelOrder = Array.isArray(tableData?.header?.level_order)
    ? tableData.header.level_order.map(normalizeLevel).filter(Boolean)
    : [];

  const seenLevels = new Set();
  const orderedLevels = [];

  levelOrder.forEach((level) => {
    if (songsByLevel.has(level) && !seenLevels.has(level)) {
      orderedLevels.push(level);
      seenLevels.add(level);
    }
  });

  availableLevels
    .filter((level) => !seenLevels.has(level))
    .sort(compareLevels)
    .forEach((level) => {
      orderedLevels.push(level);
      seenLevels.add(level);
    });

  return {
    songsByLevel,
    levelKeys: orderedLevels
  };
}

async function filterSongsByLocalExistence(songsByLevelInput, levelKeysInput) {
  const originalSongsByLevel = songsByLevelInput instanceof Map ? songsByLevelInput : new Map();
  const originalLevelKeys = Array.isArray(levelKeysInput) ? levelKeysInput.slice() : [];

  if (!window.api?.checkSongsExist) {
    return {
      songsByLevel: new Map(originalSongsByLevel),
      levelKeys: originalLevelKeys
    };
  }

  const allSha256 = [];
  const allMd5 = [];
  const sha256Set = new Set();
  const md5Set = new Set();

  originalSongsByLevel.forEach((songs) => {
    songs.forEach((song) => {
      if (song.sha256 && !sha256Set.has(song.sha256)) {
        allSha256.push(song.sha256);
        sha256Set.add(song.sha256);
      }
      if (song.md5 && !md5Set.has(song.md5)) {
        allMd5.push(song.md5);
        md5Set.add(song.md5);
      }
    });
  });

  if (allSha256.length === 0 && allMd5.length === 0) {
    return {
      songsByLevel: new Map(originalSongsByLevel),
      levelKeys: originalLevelKeys
    };
  }

  try {
    const result = await window.api.checkSongsExist(allSha256, allMd5);
    const existingSha256 = new Set(result?.existingSha256 || []);
    const existingMd5 = new Set(result?.existingMd5 || []);

    const songExists = (song) => {
      if (song.sha256 && existingSha256.has(song.sha256)) return true;
      if (song.md5 && existingMd5.has(song.md5)) return true;
      return false;
    };

    const filteredSongsByLevel = new Map();
    const filteredLevelKeys = [];
    originalLevelKeys.forEach((levelKey) => {
      const songs = originalSongsByLevel.get(levelKey) || [];
      const filtered = songs.filter(songExists);
      if (filtered.length > 0) {
        filteredSongsByLevel.set(levelKey, filtered);
        filteredLevelKeys.push(levelKey);
      }
    });

    return {
      songsByLevel: filteredSongsByLevel,
      levelKeys: filteredLevelKeys
    };
  } catch (error) {
    console.error('所持楽曲チェックエラー:', error);
    return {
      songsByLevel: new Map(originalSongsByLevel),
      levelKeys: originalLevelKeys
    };
  }
}

async function loadCourseSourceTable(tableUrl) {
  const table = state.difficultyTables.find((item) => item.url === tableUrl);
  if (!table) {
    throw new Error('コース作成時の難易度表が現在の設定に見つかりません。');
  }

  const tableData = await window.api.loadDifficultyTable(table.url);
  const extracted = extractSongsByLevel(tableData);
  const filtered = await filterSongsByLocalExistence(extracted.songsByLevel, extracted.levelKeys);

  return {
    table,
    tableData,
    songsByLevel: filtered.songsByLevel,
    levelKeys: filtered.levelKeys
  };
}

async function loadTableDataByUrl(tableUrl) {
  const { table, tableData, songsByLevel, levelKeys } = await loadCourseSourceTable(tableUrl);

  state.selectedTable = table;
  state.selectedTableData = tableData;
  state.songsByLevel = songsByLevel;
  state.levelKeys = levelKeys;

  if (state.levelKeys.length === 0) {
    throw new Error('所持楽曲が見つかりませんでした。songdata.dbの設定を確認してください。');
  }

  populateStageLevelSelects();
}

function validateForm() {
  if (!state.selectedTable) {
    showStatus('難易度表を選択してください。', 'error');
    return false;
  }

  const courseName = getCourseName();
  if (!courseName) {
    showStatus('コース名を入力してください。', 'error');
    return false;
  }

  for (const stage of STAGE_CONFIG) {
    const levelKey = document.getElementById(stage.id).value;
    if (!levelKey) {
      showStatus(`${stage.label} の難易度を選択してください。`, 'error');
      return false;
    }

    const songs = state.songsByLevel.get(levelKey) || [];
    if (songs.length === 0) {
      showStatus(`${stage.label} (${formatLevelLabel(levelKey)}) に曲がありません。`, 'error');
      return false;
    }
  }

  return true;
}

function pickRandomSongForLevel(levelKey, usedKeys, songsByLevel = state.songsByLevel) {
  const songs = songsByLevel.get(levelKey) || [];
  if (songs.length === 0) {
    throw new Error(`${formatLevelLabel(levelKey)} の曲が見つかりません。`);
  }

  let candidates = songs.filter((song) => !usedKeys.has(getSongUniqueKey(song)));
  if (candidates.length === 0) {
    candidates = songs;
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  const selectedSong = candidates[randomIndex];
  usedKeys.add(getSongUniqueKey(selectedSong));

  return selectedSong;
}

async function editExistingCourse(courseIndex) {
  const course = state.existingCourses[courseIndex];
  const metadata = findCourseMetadata(course);

  if (!course || !metadata) {
    showStatus('編集できるのは Warm Up Mix で作成したコースのみです。', 'error');
    return;
  }

  if (!metadata.tableUrl || !Array.isArray(metadata.stages) || metadata.stages.length === 0) {
    showStatus('このコースには編集に必要な難易度情報が保存されていません。', 'error');
    return;
  }

  try {
    document.getElementById('courseNameInput').value = course.name || '';
    applyConstraintSelections(course.constraint);

    const tableSelect = document.getElementById('tableSelect');
    tableSelect.value = metadata.tableUrl;
    await loadTableDataByUrl(metadata.tableUrl);

    STAGE_CONFIG.forEach((stage, index) => {
      const stageMeta = metadata.stages[index];
      if (!stageMeta) {
        return;
      }

      const levelKey = normalizeLevel(stageMeta.levelKey);
      const select = document.getElementById(stage.id);
      ensureSelectHasOption(select, levelKey, stageMeta.difficultyLabel || levelKey);
    });

    state.generatedCourse = {
      ...course,
      class: 'bms.player.beatoraja.CourseData',
      name: getCourseName(),
      constraint: buildConstraintList(),
      trophy: buildTrophyList(),
      release: false
    };
    state.generatedStages = buildGeneratedStagesFromCourse(course, metadata);
    state.editingCourseIndex = courseIndex;
    state.editingCourseName = course.name || '[No Name]';
    state.editingOriginalMatchKey = computeMatchKey(course);
    state.editingCourseMetadata = metadata;

    updateEditingUi();
    renderPreview();

    const cardEl = document.querySelector('.course-builder-card');
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showStatus(`編集中: ${state.editingCourseName}。難易度を変更した場合は保存前にプレビューを更新してください。`, 'info');
  } catch (error) {
    console.error('コース編集読込エラー:', error);
    clearEditingState();
    showStatus(`コースの編集準備に失敗しました: ${error.message}`, 'error');
  }
}

async function reshuffleCourseAtIndex(courseIndex) {
  const course = state.existingCourses[courseIndex];
  const metadata = findCourseMetadata(course);
  const targetFilePath = getResolvedCourseFilePath();

  if (!course || !metadata) {
    throw new Error('このコースは再選曲に必要な保存情報がありません。');
  }

  if (!metadata.tableUrl || !Array.isArray(metadata.stages) || metadata.stages.length === 0) {
    throw new Error('このコースには再選曲に必要な難易度情報が保存されていません。');
  }

  if (!targetFilePath) {
    throw new Error('保存先JSONファイルが見つかりません。');
  }

  const { table, tableData, songsByLevel } = await loadCourseSourceTable(metadata.tableUrl);
  const usedSongKeys = new Set();
  const shuffledStages = [];

  metadata.stages.forEach((stageMeta, index) => {
    const levelKey = normalizeLevel(stageMeta.levelKey);
    if (!levelKey) {
      throw new Error(`${getStageLabel(index, metadata.stages.length)} の難易度情報が不正です。`);
    }

    const availableSongs = songsByLevel.get(levelKey) || [];
    if (availableSongs.length === 0) {
      throw new Error(`${stageMeta.difficultyLabel || formatLevelLabel(levelKey)} に再選曲できる所持曲がありません。`);
    }

    const selectedSong = pickRandomSongForLevel(levelKey, usedSongKeys, songsByLevel);
    shuffledStages.push({
      label: stageMeta.stageLabel || getStageLabel(index, metadata.stages.length),
      levelKey,
      song: selectedSong
    });
  });

  const shuffledHashes = await Promise.all(
    shuffledStages.map((stage) => buildCourseHashEntry(stage.song))
  );

  const updatedCourse = {
    ...course,
    hash: shuffledHashes
  };

  const previousMatchKey = computeMatchKey(course);
  const result = await window.api.updateCustomCourse(targetFilePath, courseIndex, updatedCourse);

  if (!result || !result.success) {
    throw new Error(result?.error || 'コース更新に失敗しました。');
  }

  const nextMetadata = buildCourseMetadataPayload({
    course: updatedCourse,
    stages: shuffledStages,
    table,
    tableData,
    savedFilePath: result.filePath || targetFilePath,
    previousMetadata: metadata
  });

  if (window.api.deleteCourseMetadata && previousMatchKey && previousMatchKey !== nextMetadata.matchKey) {
    await window.api.deleteCourseMetadata(previousMatchKey);
  }

  if (window.api.saveCourseMetadata) {
    await window.api.saveCourseMetadata(nextMetadata);
  }

  state.courseMetadata = state.courseMetadata.filter(
    (item) => item.matchKey !== previousMatchKey && item.matchKey !== nextMetadata.matchKey
  );
  state.courseMetadata.push(nextMetadata);
  state.existingCourses[courseIndex] = updatedCourse;

  return {
    courseName: updatedCourse.name || '[No Name]'
  };
}

async function shuffleExistingCourse(courseIndex, courseName) {
  showStatus(`コースを再選曲中です: ${courseName}`, 'info');

  try {
    const result = await reshuffleCourseAtIndex(courseIndex);
    await loadExistingCourses();
    showStatus(`コースを再選曲しました: ${result.courseName}`, 'success');
  } catch (error) {
    console.error('コース再選曲エラー:', error);
    showStatus(`コース再選曲に失敗しました: ${error.message}`, 'error');
  }
}

async function shuffleAllWarmUpMixCourses() {
  const targets = getWarmUpMixShuffleTargets();

  if (targets.length === 0) {
    showStatus('一括再選曲の対象となる Warm Up Mix コースがありません。', 'info');
    return;
  }

  const shouldShuffle = await window.api.showConfirmDialog(
    `Warm Up Mix コース ${targets.length} 件を一括再選曲しますか？`,
    'Warm Up Mix 一括再選曲'
  );

  if (!shouldShuffle) {
    return;
  }

  const failures = [];
  let successCount = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const name = target.course?.name || '[No Name]';
    showStatus(`Warm Up Mix 一括再選曲中... (${i + 1}/${targets.length})`, 'info');

    try {
      await reshuffleCourseAtIndex(target.index);
      successCount += 1;
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }

  if (isEditingCourse() && targets.some((target) => target.index === state.editingCourseIndex)) {
    clearEditingState({ resetPreview: true });
  }

  await loadExistingCourses();

  if (failures.length === 0) {
    showStatus(`Warm Up Mix コース ${successCount} 件を再選曲しました。`, 'success');
    return;
  }

  console.error('Warm Up Mix 一括再選曲失敗:', failures);
  const failurePreview = failures.slice(0, 2).join(' / ');

  if (successCount === 0) {
    showStatus(`Warm Up Mix 一括再選曲に失敗しました: ${failurePreview}`, 'error');
    return;
  }

  showStatus(`Warm Up Mix 一括再選曲: 成功 ${successCount} 件 / 失敗 ${failures.length} 件`, 'info');
}

async function generateCoursePreview() {
  clearStatus();

  if (!validateForm()) {
    return false;
  }

  try {
    const courseName = getCourseName();
    const usedSongKeys = new Set();
    const generatedStages = [];

    for (const stage of STAGE_CONFIG) {
      const levelKey = document.getElementById(stage.id).value;
      const selectedSong = pickRandomSongForLevel(levelKey, usedSongKeys);
      generatedStages.push({
        label: stage.label,
        levelKey,
        song: selectedSong
      });
    }

    const hashSongs = await Promise.all(
      generatedStages.map((stage) => buildCourseHashEntry(stage.song))
    );

    state.generatedCourse = {
      class: 'bms.player.beatoraja.CourseData',
      name: courseName,
      hash: hashSongs,
      constraint: buildConstraintList(),
      trophy: buildTrophyList(),
      release: false
    };

    state.generatedStages = generatedStages;
    renderPreview();
    showStatus('ランダム選曲が完了しました。内容を確認して保存してください。', 'success');
    return true;
  } catch (error) {
    console.error('コース生成エラー:', error);
    showStatus(`コース生成に失敗しました: ${error.message}`, 'error');
    return false;
  }
}

async function saveCourseToJson() {
  clearStatus();
  const wasEditing = isEditingCourse();
  const editingCourseIndex = state.editingCourseIndex;
  const previousMatchKey = state.editingOriginalMatchKey;
  const previousMetadata = state.editingCourseMetadata;

  if (!state.generatedCourse) {
    const generated = await generateCoursePreview();
    if (!generated) {
      return;
    }
  }

  const savePath = getResolvedCourseFilePath();
  if (!savePath) {
    showStatus('設定画面で Player* フォルダを設定してください。保存先 default.json を自動判定できません。', 'error');
    return;
  }

  try {
    const courseToSave = buildCoursePayloadForSave();
    const result = wasEditing
      ? await window.api.updateCustomCourse(savePath, editingCourseIndex, courseToSave)
      : await window.api.saveCustomCourse(courseToSave, savePath);

    if (!result || !result.success) {
      throw new Error(result?.error || '保存処理で不明なエラーが発生しました。');
    }
    state.resolvedCourseFilePath = result.filePath || savePath;

    const metadata = buildCourseMetadataPayload({
      course: courseToSave,
      stages: state.generatedStages,
      table: state.selectedTable,
      tableData: state.selectedTableData,
      savedFilePath: result.filePath,
      previousMetadata: wasEditing ? previousMetadata : null
    });

    if (wasEditing && previousMatchKey && previousMatchKey !== metadata.matchKey && window.api.deleteCourseMetadata) {
      await window.api.deleteCourseMetadata(previousMatchKey);
    }

    if (metadata.matchKey && window.api.saveCourseMetadata) {
      await window.api.saveCourseMetadata(metadata);
      state.courseMetadata = state.courseMetadata.filter(
        (item) => item.matchKey !== metadata.matchKey && item.matchKey !== previousMatchKey
      );
      state.courseMetadata.push(metadata);
    } else if (wasEditing && previousMatchKey) {
      state.courseMetadata = state.courseMetadata.filter((item) => item.matchKey !== previousMatchKey);
    }

    await loadExistingCourses();

    if (wasEditing) {
      clearEditingState({ resetPreview: true });
      showStatus(`コースを更新しました: ${courseToSave.name}`, 'success');
    } else {
      showStatus(`保存完了: ${result.filePath} (登録コース数: ${result.totalCourses})`, 'success');
    }
  } catch (error) {
    console.error('保存エラー:', error);
    showStatus(`保存に失敗しました: ${error.message}`, 'error');
  }
}

async function handleTableChange(event) {
  const tableUrl = event.target.value;
  resetGeneratedCourse();
  renderPreview();

  if (!tableUrl) {
    state.selectedTable = null;
    state.selectedTableData = null;
    state.levelKeys = [];
    state.songsByLevel = new Map();
    populateStageLevelSelects();
    return;
  }

  showStatus('難易度表を読み込み中です...', 'info');

  try {
    await loadTableDataByUrl(tableUrl);
    showStatus(`難易度候補を読み込みました (${state.levelKeys.length} レベル)。`, 'success');
  } catch (error) {
    console.error('難易度表読み込みエラー:', error);
    showStatus(`難易度表読み込みに失敗しました: ${error.message}`, 'error');
  }
}

function setupEventListeners() {
  document.getElementById('courseNameInput').addEventListener('input', handleCourseSettingsChange);
  document.getElementById('tableSelect').addEventListener('change', handleTableChange);

  STAGE_CONFIG.forEach((stage) => {
    document.getElementById(stage.id).addEventListener('change', handleCourseStructureChange);
  });

  document.getElementById('optionSetting').addEventListener('change', handleCourseSettingsChange);
  document.getElementById('gaugeSetting').addEventListener('change', handleCourseSettingsChange);
  document.getElementById('lnTypeSetting').addEventListener('change', handleCourseSettingsChange);
  document.getElementById('noSpeedSetting').addEventListener('change', handleCourseSettingsChange);
  document.getElementById('noGoodSetting').addEventListener('change', handleCourseSettingsChange);

  document.getElementById('generateBtn').addEventListener('click', generateCoursePreview);
  document.getElementById('saveBtn').addEventListener('click', saveCourseToJson);
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    clearStatus();
    clearEditingState({ resetPreview: true });
  });
  document.getElementById('bulkShuffleWarmUpMixBtn').addEventListener('click', shuffleAllWarmUpMixCourses);
}

async function initialize() {
  renderPreview();
  renderExistingCourses();
  setupEventListeners();
  updateEditingUi();

  const courseNameInput = document.getElementById('courseNameInput');
  if (!courseNameInput.value.trim()) {
    courseNameInput.value = 'Warm Up Mix ()';
  }

  try {
    const config = await window.api.getConfig();

    state.difficultyTables = (config.difficultyTables || [])
      .slice()
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    state.courseDifficultyLookup = new Map();
    state.courseDifficultyLookupReady = false;
    state.courseMetadata = Array.isArray(config.courseMetadata) ? config.courseMetadata : [];
    state.resolvedCourseFilePath = typeof config.customCourseJsonPath === 'string'
      ? config.customCourseJsonPath.trim()
      : '';

    populateTableSelect();

    if (state.resolvedCourseFilePath) {
      await loadExistingCourses();
    }

    if (state.difficultyTables.length === 0) {
      showStatus('難易度表が未設定です。先に設定画面で難易度表を追加してください。', 'error');
      return;
    }

    const tableSelect = document.getElementById('tableSelect');
    tableSelect.value = state.difficultyTables[0].url;
    await loadTableDataByUrl(tableSelect.value);

    if (!state.resolvedCourseFilePath) {
      showStatus('設定画面で Player* フォルダを設定してください。保存先 default.json を自動判定できません。', 'error');
      return;
    }

    showStatus('初期化が完了しました。設定を選んでプレビューを生成してください。', 'success');
  } catch (error) {
    console.error('初期化エラー:', error);
    showStatus(`初期化に失敗しました: ${error.message}`, 'error');
  }
}

initialize();
