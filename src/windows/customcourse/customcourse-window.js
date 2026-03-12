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
  existingCourseTableName: ''
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

  state.existingCourses.forEach((course) => {
    const li = document.createElement('li');
    li.className = 'existing-course-item';

    const titleEl = document.createElement('div');
    titleEl.className = 'existing-course-title';

    const nameEl = document.createElement('span');
    nameEl.textContent = course.name || '[No Name]';

    const releaseEl = document.createElement('span');
    releaseEl.className = 'existing-course-release';
    releaseEl.textContent = `release: ${course.release === false ? 'false' : 'true / 未指定'}`;

    titleEl.appendChild(nameEl);
    titleEl.appendChild(releaseEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'existing-course-meta';
    const constraints = Array.isArray(course.constraint) && course.constraint.length > 0
      ? course.constraint.join(', ')
      : '(なし)';
    const trophyCount = Array.isArray(course.trophy) ? course.trophy.length : 0;
    metaEl.textContent = `制約: ${constraints} / Trophy数: ${trophyCount}`;

    const songsWrap = document.createElement('div');
    songsWrap.className = 'existing-course-songs';

    const hashes = Array.isArray(course.hash) ? course.hash : [];
    hashes.forEach((song, index) => {
      const songEl = document.createElement('div');
      songEl.className = 'existing-course-song';

      const stageEl = document.createElement('div');
      stageEl.className = 'existing-course-song-stage';
      stageEl.textContent = getStageLabel(index, hashes.length);

      const songTitleEl = document.createElement('div');
      songTitleEl.className = 'existing-course-song-title';
      songTitleEl.textContent = formatSongTitle(song);

      songEl.appendChild(stageEl);
      songEl.appendChild(songTitleEl);
      songsWrap.appendChild(songEl);
    });

    li.appendChild(titleEl);
    li.appendChild(metaEl);
    li.appendChild(songsWrap);
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
    savePathInput.value = state.existingCourseFilePath || savePath;
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

async function loadTableDataByUrl(tableUrl) {
  const table = state.difficultyTables.find((item) => item.url === tableUrl);
  if (!table) {
    throw new Error('選択された難易度表が見つかりません。');
  }

  state.selectedTable = table;
  const tableData = await window.api.loadDifficultyTable(table.url);
  state.selectedTableData = tableData;

  const extracted = extractSongsByLevel(tableData);
  state.songsByLevel = extracted.songsByLevel;
  state.levelKeys = extracted.levelKeys;

  if (state.levelKeys.length === 0) {
    throw new Error('難易度表からレベル情報を取得できませんでした。');
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

function pickRandomSongForLevel(levelKey, usedKeys) {
  const songs = state.songsByLevel.get(levelKey) || [];
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

    if (typeof config.customCourseJsonPath === 'string' && config.customCourseJsonPath.trim() !== '') {
      document.getElementById('savePathInput').value = config.customCourseJsonPath;
      await loadExistingCourses();
    }

    state.difficultyTables = (config.difficultyTables || [])
      .slice()
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    populateTableSelect();

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
