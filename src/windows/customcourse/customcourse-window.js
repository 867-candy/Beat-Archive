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
  existingCourseFilePath: '',
  existingCourseTableName: '',
  courseDifficultyLookup: new Map(),
  courseDifficultyLookupReady: false,
  expandedExistingCourses: new Set(),
  courseMetadata: []
};

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
  const selected = document.getElementById('trophySetting').value;

  if (selected === 'bronze') {
    return [{ ...TROPHY_PRESETS.bronze }];
  }

  if (selected === 'silver') {
    return [{ ...TROPHY_PRESETS.bronze }, { ...TROPHY_PRESETS.silver }];
  }

  return [
    { ...TROPHY_PRESETS.bronze },
    { ...TROPHY_PRESETS.silver },
    { ...TROPHY_PRESETS.gold }
  ];
}

function getCourseName() {
  return document.getElementById('courseNameInput').value.trim();
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

function renderExistingCourses() {
  const summaryEl = document.getElementById('existingCourseSummary');
  const listEl = document.getElementById('existingCourseList');
  listEl.innerHTML = '';

  if (!state.existingCourseFilePath) {
    summaryEl.textContent = '保存先JSONを読み込むと既存コースを表示します';
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'まだ既存コースを読み込んでいません';
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
      badgeEl.textContent = 'Beat Archive';
      nameEl.appendChild(badgeEl);
    }

    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(settingsEl);
    toggleButton.appendChild(titleWrap);
    toggleButton.appendChild(indicatorEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'existing-course-actions';

    if (beatArchiveMeta?.tableUrl && Array.isArray(beatArchiveMeta.stages) && beatArchiveMeta.stages.length > 0) {
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
  const savePathInput = document.getElementById('savePathInput');
  const savePath = savePathInput.value.trim();

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
    state.existingCourseFilePath = result.filePath || savePath;
    state.existingCourseTableName = result.tableName || '';
    state.expandedExistingCourses = new Set(
      Array.from(state.expandedExistingCourses).filter((index) => index < state.existingCourses.length)
    );
    savePathInput.value = state.existingCourseFilePath || savePath;

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
  const targetFilePath = state.existingCourseFilePath || document.getElementById('savePathInput').value.trim();
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
      select.value = levelKeys[Math.min(index, levelKeys.length - 1)];
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

async function shuffleExistingCourse(courseIndex, courseName) {
  const course = state.existingCourses[courseIndex];
  const metadata = findCourseMetadata(course);
  const targetFilePath = state.existingCourseFilePath || document.getElementById('savePathInput').value.trim();

  if (!course || !metadata) {
    showStatus('このコースは再選曲に必要な保存情報がありません。', 'error');
    return;
  }

  if (!metadata.tableUrl || !Array.isArray(metadata.stages) || metadata.stages.length === 0) {
    showStatus('このコースには再選曲に必要な難易度情報が保存されていません。', 'error');
    return;
  }

  if (!targetFilePath) {
    showStatus('保存先JSONファイルが見つかりません。', 'error');
    return;
  }

  showStatus(`コースを再選曲中です: ${courseName}`, 'info');

  try {
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

    await loadExistingCourses();
    showStatus(`コースを再選曲しました: ${courseName}`, 'success');
  } catch (error) {
    console.error('コース再選曲エラー:', error);
    showStatus(`コース再選曲に失敗しました: ${error.message}`, 'error');
  }
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

  if (!state.generatedCourse) {
    const generated = await generateCoursePreview();
    if (!generated) {
      return;
    }
  }

  const savePath = document.getElementById('savePathInput').value.trim();
  if (!savePath) {
    showStatus('保存先JSONファイルを指定してください。', 'error');
    return;
  }

  try {
    const result = await window.api.saveCustomCourse(state.generatedCourse, savePath);

    if (!result || !result.success) {
      throw new Error(result?.error || '保存処理で不明なエラーが発生しました。');
    }

    document.getElementById('savePathInput').value = result.filePath;

    const metadata = buildCourseMetadataPayload({
      course: state.generatedCourse,
      stages: state.generatedStages,
      table: state.selectedTable,
      tableData: state.selectedTableData,
      savedFilePath: result.filePath
    });

    if (metadata.matchKey && window.api.saveCourseMetadata) {
      await window.api.saveCourseMetadata(metadata);
      const existingIdx = state.courseMetadata.findIndex((m) => m.matchKey === metadata.matchKey);
      if (existingIdx >= 0) {
        state.courseMetadata[existingIdx] = metadata;
      } else {
        state.courseMetadata.push(metadata);
      }
    }

    await loadExistingCourses();
    showStatus(`保存完了: ${result.filePath} (登録コース数: ${result.totalCourses})`, 'success');
  } catch (error) {
    console.error('保存エラー:', error);
    showStatus(`保存に失敗しました: ${error.message}`, 'error');
  }
}

async function browseSavePath() {
  try {
    const selectedPath = await window.api.selectCourseJsonPath();
    if (selectedPath) {
      document.getElementById('savePathInput').value = selectedPath;
      await loadExistingCourses({ showStatusMessage: true });
    }
  } catch (error) {
    console.error('保存先選択エラー:', error);
    showStatus(`保存先選択に失敗しました: ${error.message}`, 'error');
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
  document.getElementById('courseNameInput').addEventListener('input', resetGeneratedCourse);
  document.getElementById('tableSelect').addEventListener('change', handleTableChange);

  STAGE_CONFIG.forEach((stage) => {
    document.getElementById(stage.id).addEventListener('change', resetGeneratedCourse);
  });

  document.getElementById('optionSetting').addEventListener('change', resetGeneratedCourse);
  document.getElementById('gaugeSetting').addEventListener('change', resetGeneratedCourse);
  document.getElementById('lnTypeSetting').addEventListener('change', resetGeneratedCourse);
  document.getElementById('noSpeedSetting').addEventListener('change', resetGeneratedCourse);
  document.getElementById('noGoodSetting').addEventListener('change', resetGeneratedCourse);
  document.getElementById('trophySetting').addEventListener('change', resetGeneratedCourse);

  document.getElementById('browseSavePathBtn').addEventListener('click', browseSavePath);
  document.getElementById('loadExistingCoursesBtn').addEventListener('click', async () => {
    clearStatus();
    await loadExistingCourses({ showStatusMessage: true });
  });
  document.getElementById('savePathInput').addEventListener('change', async () => {
    await loadExistingCourses();
  });
  document.getElementById('generateBtn').addEventListener('click', generateCoursePreview);
  document.getElementById('saveBtn').addEventListener('click', saveCourseToJson);
}

async function initialize() {
  renderPreview();
  renderExistingCourses();
  setupEventListeners();

  const courseNameInput = document.getElementById('courseNameInput');
  if (!courseNameInput.value.trim()) {
    courseNameInput.value = 'warmup';
  }

  try {
    const config = await window.api.getConfig();

    state.difficultyTables = (config.difficultyTables || [])
      .slice()
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    state.courseDifficultyLookup = new Map();
    state.courseDifficultyLookupReady = false;
    state.courseMetadata = Array.isArray(config.courseMetadata) ? config.courseMetadata : [];

    populateTableSelect();

    if (typeof config.customCourseJsonPath === 'string' && config.customCourseJsonPath.trim() !== '') {
      document.getElementById('savePathInput').value = config.customCourseJsonPath;
      await loadExistingCourses();
    }

    if (state.difficultyTables.length === 0) {
      showStatus('難易度表が未設定です。先に設定画面で難易度表を追加してください。', 'error');
      return;
    }

    const tableSelect = document.getElementById('tableSelect');
    tableSelect.value = state.difficultyTables[0].url;
    await loadTableDataByUrl(tableSelect.value);
    showStatus('初期化が完了しました。設定を選んでプレビューを生成してください。', 'success');
  } catch (error) {
    console.error('初期化エラー:', error);
    showStatus(`初期化に失敗しました: ${error.message}`, 'error');
  }
}

initialize();
