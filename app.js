const $ = (selector) => document.querySelector(selector);

const els = {
  appShell: $("#appShell"),
  text: $("#textInput"),
  repeat: $("#repeatCount"),
  pause: $("#pauseSeconds"),
  rate: $("#rate"),
  pitch: $("#pitch"),
  rateValue: $("#rateValue"),
  pitchValue: $("#pitchValue"),
  split: $("#splitSentences"),
  naturalMode: $("#naturalMode"),
  voice: $("#voiceSelect"),
  testVoice: $("#testVoiceButton"),
  themeSelect: $("#themeSelect"),
  play: $("#playButton"),
  advancedSettingsButton: $("#advancedSettingsButton"),
  advancedSettingsPanel: $("#advancedSettingsPanel"),
  exportBackup: $("#exportBackupButton"),
  importBackupInput: $("#importBackupInput"),
  clear: $("#clearButton"),
  savePhrase: $("#savePhraseButton"),
  phrasesPanelTab: $("#phrasesPanelTab"),
  epubPanelTab: $("#epubPanelTab"),
  memoryPanelTab: $("#memoryPanelTab"),
  phrasesPanel: $("#phrasesPanel"),
  epubPanel: $("#epubPanel"),
  memoryPanel: $("#memoryPanel"),
  practiceTab: $("#practiceTab"),
  masteredTab: $("#masteredTab"),
  epubInput: $("#epubInput"),
  epubInfo: $("#epubInfo"),
  addChapter: $("#addChapterButton"),
  chapterSort: $("#chapterSortButton"),
  chapterSelect: $("#chapterSelect"),
  chapterParagraphs: $("#chapterParagraphs"),
  memorySort: $("#memorySortButton"),
  todoMemoryTitle: $("#todoMemoryTitle"),
  doneMemoryTitle: $("#doneMemoryTitle"),
  todoMemoryList: $("#todoMemoryList"),
  doneMemoryList: $("#doneMemoryList"),
  memoryProgressFill: $("#memoryProgressFill"),
  memoryProgressText: $("#memoryProgressText"),
  memoryStatsText: $("#memoryStatsText"),
  cultivationProgressFill: $("#cultivationProgressFill"),
  cultivationProgressText: $("#cultivationProgressText"),
  cultivationProgressPercent: $("#cultivationProgressPercent"),
  memoryBookFilter: $("#memoryBookFilter"),
  resetStats: $("#resetStatsButton"),
  combineSelected: $("#combineSelectedButton"),
  clearSelected: $("#clearSelectedButton"),
  phraseList: $("#phraseList"),
  status: $("#statusText"),
  progress: $("#progressFill"),
  fxCanvas: $("#fxCanvas"),
  sourceCanvas: $("#sourceCanvas"),
  rainAudio: $("#rainAudio"),
  rainSoundDown: $("#rainSoundDownButton"),
  rainSoundUp: $("#rainSoundUpButton"),
  rainSoundButton: $("#rainSoundButton"),
  rainSettingsButton: $("#rainSettingsButton"),
  rainSettingsPanel: $("#rainSettingsPanel"),
  rainIntensityRange: $("#rainIntensityRange"),
  rainSizeRange: $("#rainSizeRange"),
  rainRefractRange: $("#rainRefractRange"),
  rainMistRange: $("#rainMistRange"),
  rainIntensityValue: $("#rainIntensityValue"),
  rainSizeValue: $("#rainSizeValue"),
  rainRefractValue: $("#rainRefractValue"),
  rainMistValue: $("#rainMistValue"),
  rainSettingsReset: $("#rainSettingsResetButton"),
  audioLevel: $("#audioLevel"),
  rainSoundValue: $("#rainSoundValue"),
  mobileScreenTabs: document.querySelectorAll(".mobile-screen-tab"),
};

const storageKey = "chinese-repeater-state";
const phraseKey = "chinese-repeater-phrases";
const masteredPhraseKey = "chinese-repeater-mastered-phrases";
const memoryKey = "chinese-repeater-memory-items";
const statsKey = "chinese-repeater-memory-stats";
const rainSoundKey = "chinese-repeater-rain-sound";
const rainSettingsKey = "chinese-repeater-rain-settings";
const sidePanelKey = "chinese-repeater-side-panel";
const mobileScreenKey = "chinese-repeater-mobile-screen";
const themeKey = "chinese-repeater-theme";
const defaultsVersionKey = "chinese-repeater-defaults-version";
const backupKeys = [
  storageKey,
  phraseKey,
  masteredPhraseKey,
  memoryKey,
  statsKey,
  rainSoundKey,
  rainSettingsKey,
  sidePanelKey,
  mobileScreenKey,
  themeKey,
];

let voices = [];
let isPlaying = false;
let isPaused = false;
let currentTimer = null;
let currentRunId = 0;
let currentFolder = "practice";
let currentSidePanel = localStorage.getItem(sidePanelKey) || "phrases";
let currentMobileScreen = localStorage.getItem(mobileScreenKey) || "practice";
let currentTheme = new URLSearchParams(window.location.search).get("theme") || localStorage.getItem(themeKey) || "rain";
let epubBook = null;
let currentChapterParagraphs = [];
let chapterSortDescending = false;
let memorySortDescending = false;
let currentMemoryBook = "__all__";
const selectedMemoryIds = new Set();
let rainFx = null;
let rainAudioContext = null;
let rainGain = null;
let rainSource = null;
let lastRainBackgroundUpdate = 0;
let rainSoundVolume = 0.1;
const defaultRainSettings = {
  intensity: 1,
  size: 1,
  refract: 1,
  mist: 1,
};

function getRainSettings() {
  const saved = loadJson(rainSettingsKey, {});
  return {
    intensity: clampNumber(saved.intensity, 0.35, 1.6, defaultRainSettings.intensity),
    size: clampNumber(saved.size, 0.65, 1.45, defaultRainSettings.size),
    refract: clampNumber(saved.refract, 0.45, 1.65, defaultRainSettings.refract),
    mist: clampNumber(saved.mist, 0, 1.2, defaultRainSettings.mist),
  };
}

function setRainControlValues(settings) {
  if (!els.rainIntensityRange) return;
  els.rainIntensityRange.value = String(settings.intensity);
  els.rainSizeRange.value = String(settings.size);
  els.rainRefractRange.value = String(settings.refract);
  els.rainMistRange.value = String(settings.mist);
  els.rainIntensityValue.textContent = settings.intensity.toFixed(2);
  els.rainSizeValue.textContent = settings.size.toFixed(2);
  els.rainRefractValue.textContent = settings.refract.toFixed(2);
  els.rainMistValue.textContent = settings.mist.toFixed(2);
}

const defaults = [
  "今天我想把这句话练到自然脱口而出。",
  "请慢一点，再说一遍。",
  "我正在练习中文发音和语感。",
];

function fitRainCanvas(canvas) {
  if (!canvas) return { width: 1, height: 1 };
  const ratio = Math.min(window.devicePixelRatio || 1, 1.8);
  const width = Math.max(1, Math.floor(window.innerWidth * ratio));
  const height = Math.max(1, Math.floor(window.innerHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawRainBackground(time = 0) {
  if (!els.sourceCanvas) return;
  const sourceCtx = els.sourceCanvas.getContext("2d");
  const { width, height } = fitRainCanvas(els.sourceCanvas);
  const t = time * 0.00008;
  const horizon = height * 0.32;
  const sky = sourceCtx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#020509");
  sky.addColorStop(0.26, "#130b10");
  sky.addColorStop(0.34, "#082737");
  sky.addColorStop(0.58, "#053142");
  sky.addColorStop(1, "#031014");
  sourceCtx.fillStyle = sky;
  sourceCtx.fillRect(0, 0, width, height);

  const glow = sourceCtx.createRadialGradient(width * (0.68 + Math.sin(t) * 0.05), horizon * 0.82, 0, width * 0.68, horizon * 0.82, width * 0.48);
  glow.addColorStop(0, "rgba(255, 122, 46, 0.86)");
  glow.addColorStop(0.22, "rgba(255, 122, 46, 0.48)");
  glow.addColorStop(0.55, "rgba(255, 122, 46, 0.08)");
  glow.addColorStop(1, "rgba(255, 122, 46, 0)");
  sourceCtx.fillStyle = glow;
  sourceCtx.fillRect(0, 0, width, height);

  sourceCtx.save();
  sourceCtx.globalAlpha = 0.82;
  sourceCtx.filter = "blur(5px)";
  for (let i = 0; i < 11; i += 1) {
    const y = horizon + i * 9;
    sourceCtx.fillStyle = `rgba(255, ${92 + i * 8}, 32, ${0.23 - i * 0.012})`;
    sourceCtx.fillRect(-width * 0.1, y + Math.sin(t * 30 + i) * 4, width * 1.2, 2);
  }
  sourceCtx.restore();

  sourceCtx.save();
  sourceCtx.globalAlpha = 0.48;
  sourceCtx.strokeStyle = "rgba(190, 232, 240, 0.18)";
  sourceCtx.lineWidth = 1;
  for (let i = 0; i < 40; i += 1) {
    const y = height * 0.48 + i * height * 0.017;
    sourceCtx.beginPath();
    sourceCtx.moveTo(0, y);
    sourceCtx.bezierCurveTo(width * 0.26, y + Math.sin(i + t * 12) * 8, width * 0.68, y - 5, width, y + Math.cos(i) * 7);
    sourceCtx.stroke();
  }
  sourceCtx.restore();

  const vignette = sourceCtx.createRadialGradient(width * 0.5, height * 0.5, width * 0.05, width * 0.5, height * 0.5, width * 0.72);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.62, "rgba(0, 0, 0, 0.18)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.74)");
  sourceCtx.fillStyle = vignette;
  sourceCtx.fillRect(0, 0, width, height);
}

async function pushRainBackground() {
  if (!rainFx || !rainFx.setBackground || !els.sourceCanvas) return;
  await rainFx.setBackground(els.sourceCanvas);
}

function ensureRainAudioGraph() {
  if (!els.rainAudio) return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    if (!rainAudioContext) rainAudioContext = new AudioContextCtor();
    if (!rainGain) {
      rainGain = rainAudioContext.createGain();
      rainGain.gain.value = rainSoundVolume;
      if (!rainSource) rainSource = rainAudioContext.createMediaElementSource(els.rainAudio);
      rainSource.connect(rainGain);
      rainGain.connect(rainAudioContext.destination);
    }
    if (rainAudioContext.state === "suspended") rainAudioContext.resume().catch(() => {});
    return rainGain;
  } catch {
    return null;
  }
}

function applyRainAudioVolume(volume) {
  if (!els.rainAudio) return;
  els.rainAudio.muted = false;
  els.rainAudio.volume = volume;
  const gain = ensureRainAudioGraph();
  if (gain) {
    if (rainAudioContext) {
      gain.gain.setTargetAtTime(volume, rainAudioContext.currentTime, 0.015);
    } else {
      gain.gain.value = volume;
    }
  }
}

function setRainSound(value) {
  if (!els.rainAudio || !els.audioLevel) return;
  const volume = Math.max(0, Math.min(1, Number(value) || 0));
  rainSoundVolume = volume;
  applyRainAudioVolume(volume);
  els.audioLevel.style.width = `${Math.round(volume * 100)}%`;
  if (els.rainSoundValue) els.rainSoundValue.textContent = `${Math.round(volume * 100)}%`;
  if (els.rainSoundDown) els.rainSoundDown.disabled = volume <= 0;
  if (els.rainSoundUp) els.rainSoundUp.disabled = volume >= 1;
  localStorage.setItem(rainSoundKey, String(volume));
  if (volume > 0) {
    els.rainAudio.play().catch(() => {
      setStatus("浏览器拦截了雨声，请再点一次雨声开关。", null);
    });
  } else {
    els.rainAudio.pause();
  }
}

function getRainSoundVolume() {
  return Math.max(0, Math.min(1, Number(rainSoundVolume) || 0));
}

function syncRainSoundUi(volume) {
  rainSoundVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  if (els.rainAudio) applyRainAudioVolume(rainSoundVolume);
  if (els.audioLevel) els.audioLevel.style.width = `${Math.round(rainSoundVolume * 100)}%`;
  if (els.rainSoundValue) els.rainSoundValue.textContent = `${Math.round(rainSoundVolume * 100)}%`;
  if (els.rainSoundDown) els.rainSoundDown.disabled = rainSoundVolume <= 0;
  if (els.rainSoundUp) els.rainSoundUp.disabled = rainSoundVolume >= 1;
}

async function initRainWindow() {
  if (!els.fxCanvas || !els.sourceCanvas) return;
  const root = typeof window !== "undefined" ? window : self;
  const RaindropCtor = root.RaindropFX || (typeof RaindropFX !== "undefined" ? RaindropFX : null);
  if (!RaindropCtor) return;

  fitRainCanvas(els.fxCanvas);
  drawRainBackground();
  rainFx = new RaindropCtor({
    canvas: els.fxCanvas,
    background: els.sourceCanvas,
    spawnInterval: [0.01, 0.06],
    spawnSize: [24, 92],
    spawnLimit: 1200,
    slipRate: 0.62,
    motionInterval: [0.45, 1.2],
    xShifting: [0.01, 0.075],
    mist: true,
    mistColor: [0.02, 0.035, 0.04, 0.68],
    mistTime: 0.8,
    mistBlurStep: 5,
    dropletsPerSeconds: 750,
    dropletSize: [9, 28],
    backgroundBlurSteps: 3,
    smoothRaindrop: [0.95, 1.0],
    refractBase: 0.45,
    refractScale: 0.78,
    raindropCompose: "smoother",
    raindropLightPos: [-1, 1, 2, 0],
    raindropDiffuseLight: [0.34, 0.42, 0.44],
    raindropShadowOffset: 0.64,
    raindropSpecularLight: [0.08, 0.1, 0.1],
    raindropSpecularShininess: 72,
    raindropLightBump: 0.58,
  });
  applyRainSettings(getRainSettings(), false);
  await rainFx.start();
  await pushRainBackground();
}

function applyRainSettings(settings, save = true) {
  const next = {
    intensity: clampNumber(settings.intensity, 0.35, 1.6, defaultRainSettings.intensity),
    size: clampNumber(settings.size, 0.65, 1.45, defaultRainSettings.size),
    refract: clampNumber(settings.refract, 0.45, 1.65, defaultRainSettings.refract),
    mist: clampNumber(settings.mist, 0, 1.2, defaultRainSettings.mist),
  };
  setRainControlValues(next);
  if (save) localStorage.setItem(rainSettingsKey, JSON.stringify(next));
  if (!rainFx?.options) return;

  rainFx.options.spawnInterval = [0.01 / next.intensity, 0.06 / next.intensity];
  rainFx.options.spawnLimit = Math.round(1200 * next.intensity);
  rainFx.options.dropletsPerSeconds = Math.round(750 * next.intensity);
  rainFx.options.spawnSize = [Math.round(24 * next.size), Math.round(92 * next.size)];
  rainFx.options.dropletSize = [Math.round(9 * next.size), Math.round(28 * next.size)];
  rainFx.options.refractBase = 0.45 * next.refract;
  rainFx.options.refractScale = 0.78 * next.refract;
  rainFx.options.mist = next.mist > 0.05;
  rainFx.options.mistColor = [0.02, 0.035, 0.04, 0.68 * next.mist];
  rainFx.options.backgroundBlurSteps = Math.max(1, Math.round(3 * next.mist));
  rainFx.options.mistBlurStep = Math.max(1, Math.round(5 * next.mist));
  rainFx.simulator?.resize?.();
}

function readRainSettingsFromControls() {
  return {
    intensity: els.rainIntensityRange?.value,
    size: els.rainSizeRange?.value,
    refract: els.rainRefractRange?.value,
    mist: els.rainMistRange?.value,
  };
}

function animateRainBackground(time) {
  if (time - lastRainBackgroundUpdate > 1600) {
    lastRainBackgroundUpdate = time;
    drawRainBackground(time);
    pushRainBackground();
  }
  requestAnimationFrame(animateRainBackground);
}

async function resizeRainWindow() {
  if (!els.fxCanvas) return;
  const rect = els.fxCanvas.getBoundingClientRect();
  fitRainCanvas(els.fxCanvas);
  if (rainFx) {
    rainFx.resize(rect.width, rect.height);
    drawRainBackground();
    await pushRainBackground();
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function uniquePhrases(phrases) {
  return [...new Set(phrases.map((phrase) => String(phrase).trim()).filter(Boolean))];
}

function getPracticePhrases() {
  return uniquePhrases(loadJson(phraseKey, defaults));
}

function getMasteredPhrases() {
  return uniquePhrases(loadJson(masteredPhraseKey, []));
}

function savePracticePhrases(phrases) {
  localStorage.setItem(phraseKey, JSON.stringify(uniquePhrases(phrases).slice(0, 50)));
}

function saveMasteredPhrases(phrases) {
  localStorage.setItem(masteredPhraseKey, JSON.stringify(uniquePhrases(phrases).slice(0, 100)));
}

function getMemoryItems() {
  return loadJson(memoryKey, []).filter((item) => item && item.text);
}

function saveMemoryItems(items) {
  localStorage.setItem(memoryKey, JSON.stringify(items.slice(0, 1000)));
}

function getSortedMemoryItems(items) {
  return [...items].sort((a, b) => {
    const chapterDiff = String(a.chapter || "").localeCompare(String(b.chapter || ""), "zh-Hans-CN");
    const numberDiff = (a.paragraphNumber || 0) - (b.paragraphNumber || 0);
    const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
    const result = chapterDiff || numberDiff || timeDiff;
    return memorySortDescending ? -result : result;
  });
}

function getMemoryStats() {
  return {
    totalMs: 0,
    sessions: 0,
    firstMasteredAt: 0,
    masteredCharsTotal: 0,
    ...loadJson(statsKey, {}),
  };
}

function saveMemoryStats(stats) {
  localStorage.setItem(statsKey, JSON.stringify(stats));
}

function countMemorizedChars(text) {
  return [...String(text).replace(/\s/g, "")].length;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 1) return `${seconds} 秒`;
  return `${minutes} 分 ${seconds} 秒`;
}

function previewText(text, length = 5) {
  const chars = [...String(text).trim()];
  return chars.length > length ? `${chars.slice(0, length).join("")}...` : chars.join("");
}

function getPracticeDayCount(firstMasteredAt, masteredChars) {
  if (!firstMasteredAt || !masteredChars) return 0;
  const first = new Date(firstMasteredAt);
  const today = new Date();
  const firstDay = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(1, Math.floor((todayDay - firstDay) / 86400000) + 1);
}

const cultivationLevels = [
  [0, "凡人"],
  [1000, "炼气前期"],
  [3000, "炼气中期"],
  [5000, "炼气后期"],
  [10000, "筑基前期"],
  [20000, "筑基中期"],
  [30000, "筑基后期"],
  [40000, "金丹前期"],
  [55000, "金丹中期"],
  [70000, "金丹后期"],
  [85000, "元婴前期"],
  [100000, "元婴中期"],
  [120000, "元婴后期"],
  [140000, "化神前期"],
  [170000, "化神中期"],
  [200000, "化神后期"],
  [240000, "炼虚前期"],
  [290000, "炼虚中期"],
  [340000, "炼虚后期"],
  [400000, "合体前期"],
  [500000, "合体中期"],
  [600000, "合体后期"],
  [700000, "大乘前期"],
  [800000, "大乘中期"],
  [900000, "大乘后期"],
  [1000000, "渡劫前期"],
  [1200000, "渡劫中期"],
  [1500000, "渡劫后期"],
  [2000000, "半步真仙"],
  [3000000, "真仙"],
  [5000000, "金仙"],
  [8000000, "太乙金仙"],
  [10000000, "大罗金仙"],
];

function getCultivationProgress(chars) {
  const safeChars = Math.max(0, chars);
  const currentIndex = cultivationLevels.reduce((index, [min], levelIndex) => (safeChars >= min ? levelIndex : index), 0);
  const current = cultivationLevels[currentIndex];
  const next = cultivationLevels[currentIndex + 1] || null;
  if (!next) {
    return {
      title: current[1],
      nextTitle: "",
      percent: 100,
      remaining: 0,
      label: "已达最高境界",
    };
  }
  const span = Math.max(1, next[0] - current[0]);
  const completed = Math.min(span, Math.max(0, safeChars - current[0]));
  const percent = Math.round((completed / span) * 100);
  return {
    title: current[1],
    nextTitle: next[1],
    percent,
    remaining: Math.max(0, next[0] - safeChars),
    label: `距离${next[1]} ${Math.max(0, next[0] - safeChars)} 字`,
  };
}

function getCultivationTitle(chars) {
  return getCultivationProgress(chars).title;
}

function migrateMasteredStats(stats, items) {
  const rawStats = loadJson(statsKey, {});
  if (typeof rawStats.masteredCharsTotal === "number") return stats;

  const masteredCharsTotal = items
    .filter((item) => item.status === "mastered")
    .reduce((sum, item) => sum + countMemorizedChars(item.text), 0);
  const nextStats = { ...stats, masteredCharsTotal };
  saveMemoryStats(nextStats);
  return nextStats;
}

function renderMemoryStats() {
  const items = getMemoryItems();
  const stats = migrateMasteredStats(getMemoryStats(), items);
  const masteredChars = Math.max(0, stats.masteredCharsTotal || 0);
  if (masteredChars > 0 && !stats.firstMasteredAt) {
    stats.firstMasteredAt = Date.now();
    saveMemoryStats(stats);
  }
  const practiceDays = getPracticeDayCount(stats.firstMasteredAt, masteredChars);
  const averageChars = practiceDays ? Math.round(masteredChars / practiceDays) : 0;
  const cultivation = getCultivationProgress(masteredChars);
  els.memoryStatsText.textContent = `累计背诵 ${formatDuration(stats.totalMs)} · 已背出 ${masteredChars} 字 · ${stats.sessions} 次 · 背诵 ${practiceDays} 天 · 日均 ${averageChars} 字 · 境界：${cultivation.title}`;
  if (els.cultivationProgressFill) els.cultivationProgressFill.style.width = `${cultivation.percent}%`;
  if (els.cultivationProgressText) els.cultivationProgressText.textContent = cultivation.label;
  if (els.cultivationProgressPercent) els.cultivationProgressPercent.textContent = `${cultivation.percent}%`;
}

function recordMemoryStats(text, startedAt) {
  const stats = getMemoryStats();
  saveMemoryStats({
    ...stats,
    totalMs: stats.totalMs + Math.max(0, Date.now() - startedAt),
    sessions: stats.sessions + 1,
    firstMasteredAt: stats.firstMasteredAt || 0,
  });
  renderMemoryStats();
}

function addMasteredChars(chars) {
  const stats = getMemoryStats();
  saveMemoryStats({
    ...stats,
    firstMasteredAt: stats.firstMasteredAt || Date.now(),
    masteredCharsTotal: Math.max(0, (stats.masteredCharsTotal || 0) + chars),
  });
}

function subtractMasteredChars(chars) {
  const stats = getMemoryStats();
  saveMemoryStats({
    ...stats,
    masteredCharsTotal: Math.max(0, (stats.masteredCharsTotal || 0) - chars),
  });
}

function markMemoryAsMastered(item) {
  addMasteredChars(countMemorizedChars(item.text));
  updateMemoryItem(item.id, { status: "mastered", masteredAt: Date.now() });
}

function restoreMemoryToTodo(item) {
  subtractMasteredChars(countMemorizedChars(item.text));
  updateMemoryItem(item.id, { status: "todo", masteredAt: 0 });
}

function makeMemoryId(text, source) {
  const raw = `${source.book}|${source.chapter}|${source.paragraphNumber || ""}|${text}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `m-${hash.toString(36)}-${raw.length.toString(36)}`;
}

function setInputText(text, message = "已载入到复读框。") {
  els.text.value = text;
  saveState();
  setStatus(message, 0);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setSidePanel(panel) {
  currentSidePanel = panel;
  localStorage.setItem(sidePanelKey, panel);
  const config = [
    ["phrases", els.phrasesPanelTab, els.phrasesPanel],
    ["epub", els.epubPanelTab, els.epubPanel],
    ["memory", els.memoryPanelTab, els.memoryPanel],
  ];
  config.forEach(([name, tab, section]) => {
    const active = name === panel;
    tab?.classList.toggle("is-active", active);
    tab?.setAttribute("aria-selected", String(active));
    if (section) {
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    }
  });
}

function setMobileScreen(screen) {
  const next = ["practice", "my", "zen"].includes(screen) ? screen : "practice";
  currentMobileScreen = next;
  localStorage.setItem(mobileScreenKey, next);
  els.appShell?.setAttribute("data-mobile-screen", next);
  els.mobileScreenTabs?.forEach((button) => {
    const active = button.dataset.screen === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function setTheme(theme) {
  const next = ["rain", "fluent", "golife", "softline"].includes(theme) ? theme : "rain";
  currentTheme = next;
  document.documentElement.dataset.theme = next;
  localStorage.setItem(themeKey, next);
  if (els.themeSelect) els.themeSelect.value = next;
}

async function loadAndPlay(text, message = "已载入并开始播放。", countStats = false) {
  setInputText(text, message);
  const startedAt = Date.now();
  await play();
  if (countStats) recordMemoryStats(text, startedAt);
}

function saveState() {
  const state = {
    text: els.text.value,
    repeat: els.repeat.value,
    pause: els.pause.value,
    rate: els.rate.value,
    pitch: els.pitch.value,
    split: els.split.checked,
    naturalMode: els.naturalMode.checked,
    voiceURI: els.voice.value,
  };
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function restoreState() {
  const state = loadJson(storageKey, {});
  const defaultsVersion = localStorage.getItem(defaultsVersionKey);
  if (defaultsVersion !== "30.10") {
    state.split = false;
    state.naturalMode = true;
    localStorage.setItem(storageKey, JSON.stringify(state));
    localStorage.setItem(defaultsVersionKey, "30.10");
  }
  els.text.value = state.text || defaults[0];
  els.repeat.value = state.repeat || "5";
  els.pause.value = state.pause || "1";
  els.rate.value = state.rate || "0.85";
  els.pitch.value = state.pitch || "1";
  els.split.checked = state.split ?? false;
  els.naturalMode.checked = state.naturalMode ?? true;
  updateOutputs();
}

function exportBackup() {
  const data = {};
  backupKeys.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  });
  const backup = {
    app: "chinese-repeater",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `中文复读-备份-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("备份已导出。", null);
}

async function importBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup?.app !== "chinese-repeater" || !backup.data || typeof backup.data !== "object") {
      setStatus("这个文件不是中文复读备份。", null);
      return;
    }
    const ok = window.confirm("导入备份会覆盖当前短句、仓库和统计。确定导入吗？");
    if (!ok) return;
    backupKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
        localStorage.setItem(key, String(backup.data[key]));
      }
    });
    setStatus("备份已导入，正在刷新。", null);
    window.setTimeout(() => window.location.reload(), 300);
  } catch {
    setStatus("备份文件读取失败。", null);
  } finally {
    if (els.importBackupInput) els.importBackupInput.value = "";
  }
}

function updateOutputs() {
  els.rateValue.textContent = Number(els.rate.value).toFixed(2);
  els.pitchValue.textContent = Number(els.pitch.value).toFixed(1);
}

function getChineseScore(voice) {
  const haystack = `${voice.lang} ${voice.name}`.toLowerCase();
  let score = 10;
  if (haystack.includes("zh-cn") || haystack.includes("cmn") || haystack.includes("mandarin")) score = 0;
  else if (haystack.includes("zh-hans") || haystack.includes("zh")) score = 1;
  else if (haystack.includes("chinese")) score = 2;

  if (voice.localService) score -= 0.2;
  if (/tingting|meijia|sinji|li-mu|yu-shu|shelley|sandy|grandma|grandpa/.test(haystack)) score -= 0.3;
  return score;
}

function getVoiceLabel(voice) {
  const tags = [];
  if (getChineseScore(voice) < 3) tags.push("中文");
  if (voice.localService) tags.push("本机");
  return `${voice.name} (${voice.lang || "默认"}${tags.length ? ` · ${tags.join(" · ")}` : ""})`;
}

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    els.voice.innerHTML = '<option value="">系统不支持朗读</option>';
    return;
  }

  voices = speechSynthesis.getVoices().sort((a, b) => {
    const score = getChineseScore(a) - getChineseScore(b);
    return score || a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  const previous = loadJson(storageKey, {}).voiceURI;
  els.voice.innerHTML = "";

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = getVoiceLabel(voice);
    els.voice.append(option);
  });

  const best = voices.find((voice) => voice.voiceURI === previous) || voices.find((voice) => getChineseScore(voice) < 3) || voices[0];
  if (best) els.voice.value = best.voiceURI;
}

function getSelectedVoice() {
  return voices.find((voice) => voice.voiceURI === els.voice.value) || null;
}

function getSegments() {
  const text = els.text.value.trim();
  if (!text) return [];
  if (!els.split.checked) return [text];
  return text
    .split(/(?<=[。！？!?；;，,、\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getPauseAfter(segment, basePauseMs) {
  if (!els.naturalMode.checked) return basePauseMs;

  const trimmed = segment.trim();
  if (!trimmed) return basePauseMs;
  const last = trimmed.at(-1);
  const punctuationPause = {
    "。": 650,
    "！": 760,
    "!": 760,
    "？": 820,
    "?": 820,
    "；": 580,
    ";": 580,
    "：": 480,
    ":": 480,
    "，": 320,
    ",": 320,
    "、": 220,
  }[last] || 360;

  return Math.max(basePauseMs, punctuationPause);
}

function normalizeSpeechText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function setStatus(text, progress = null) {
  els.status.textContent = text;
  if (progress !== null) {
    els.progress.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function speakOnce(text, runId) {
  return new Promise((resolve, reject) => {
    if (!text || runId !== currentRunId) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(normalizeSpeechText(text));
    const voice = getSelectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "zh-CN";
    utterance.rate = clampNumber(els.rate.value, 0.5, 1.6, 0.85);
    utterance.pitch = clampNumber(els.pitch.value, 0.6, 1.4, 1);

    utterance.onend = () => resolve();
    utterance.onerror = (event) => reject(event);
    speechSynthesis.speak(utterance);
  });
}

function wait(ms, runId) {
  return new Promise((resolve) => {
    if (ms <= 0 || runId !== currentRunId) {
      resolve();
      return;
    }
    currentTimer = window.setTimeout(() => {
      currentTimer = null;
      resolve();
    }, ms);
  });
}

async function play() {
  if (!("speechSynthesis" in window)) {
    setStatus("这个浏览器不支持系统朗读。");
    return;
  }

  if (isPaused) {
    speechSynthesis.resume();
    isPaused = false;
    els.play.textContent = "暂停";
    setStatus("继续播放。");
    return;
  }

  const segments = getSegments();
  if (!segments.length) {
    setStatus("先输入一句中文。");
    els.text.focus();
    return;
  }

  stop(false);
  saveState();

  isPlaying = true;
  isPaused = false;
  currentRunId += 1;
  const runId = currentRunId;
  const repeatCount = clampNumber(els.repeat.value, 1, 99, 5);
  const pauseMs = clampNumber(els.pause.value, 0, 10, 1) * 1000;
  const total = repeatCount * segments.length;
  let done = 0;

  els.play.classList.add("is-active");
  els.play.textContent = "暂停";

  try {
    for (let round = 1; round <= repeatCount; round += 1) {
      for (let index = 0; index < segments.length; index += 1) {
        if (!isPlaying || runId !== currentRunId) return;
        setStatus(`第 ${round} 遍，${els.split.checked ? `第 ${index + 1} 句` : "正在朗读"}。`, (done / total) * 100);
        await speakOnce(segments[index], runId);
        done += 1;
        setStatus(`已完成 ${done}/${total}。`, (done / total) * 100);
        if (done < total) await wait(getPauseAfter(segments[index], pauseMs), runId);
      }
    }
    setStatus("复读完成。", 100);
  } catch {
    setStatus("朗读被系统中断，请再点一次播放。");
  } finally {
    if (runId === currentRunId) {
      isPlaying = false;
      isPaused = false;
      els.play.classList.remove("is-active");
      els.play.textContent = "播放";
    }
  }
}

function pause() {
  if (!isPlaying) return;
  if (isPaused) {
    speechSynthesis.resume();
    isPaused = false;
    els.play.textContent = "暂停";
    setStatus("继续播放。");
  } else {
    speechSynthesis.pause();
    isPaused = true;
    els.play.textContent = "播放";
    setStatus("已暂停。");
  }
}

function togglePlay() {
  if (isPlaying) {
    pause();
    return;
  }
  play();
}

function stop(resetProgress = true) {
  currentRunId += 1;
  isPlaying = false;
  isPaused = false;
  window.clearTimeout(currentTimer);
  currentTimer = null;
  speechSynthesis.cancel();
  els.play.classList.remove("is-active");
  els.play.textContent = "播放";
  if (resetProgress) setStatus("已停止。", 0);
}

async function testVoice() {
  if (!("speechSynthesis" in window)) {
    setStatus("这个浏览器不支持系统朗读。");
    return;
  }

  stop(false);
  currentRunId += 1;
  const runId = currentRunId;
  setStatus("正在试听当前声音。", 0);
  try {
    await speakOnce("你好，我会用这个声音帮你复读中文。", runId);
    setStatus("试听完成。", 0);
  } catch {
    setStatus("试听被系统中断，请再点一次。", 0);
  }
}

function renderPhrases() {
  const practicePhrases = getPracticePhrases();
  const masteredPhrases = getMasteredPhrases();
  const phrases = currentFolder === "practice" ? practicePhrases : masteredPhrases;
  els.phraseList.innerHTML = "";
  els.practiceTab.classList.toggle("is-active", currentFolder === "practice");
  els.masteredTab.classList.toggle("is-active", currentFolder === "mastered");
  els.practiceTab.setAttribute("aria-selected", String(currentFolder === "practice"));
  els.masteredTab.setAttribute("aria-selected", String(currentFolder === "mastered"));
  els.practiceTab.textContent = `练习中 ${practicePhrases.length}`;
  els.masteredTab.textContent = `已背出 ${masteredPhrases.length}`;

  if (!phrases.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = currentFolder === "practice" ? "保存常练句子后，会显示在这里。" : "点“背出”归档后，会显示在这里。";
    els.phraseList.append(empty);
    return;
  }

  phrases.forEach((phrase, index) => {
    const item = document.createElement("div");
    item.className = "phrase-item";

    const button = document.createElement("button");
    button.className = "phrase";
    button.type = "button";
    button.title = phrase;
    button.innerHTML = `<span></span><small>点按播放</small>`;
    button.querySelector("span").textContent = previewText(phrase);
    button.addEventListener("click", () => {
      loadAndPlay(phrase, `已载入第 ${index + 1} 条短句并开始播放。`);
    });

    const moveButton = document.createElement("button");
    moveButton.className = currentFolder === "practice" ? "archive-phrase" : "restore-phrase";
    moveButton.type = "button";
    moveButton.textContent = currentFolder === "practice" ? "背出" : "移回";
    moveButton.setAttribute("aria-label", currentFolder === "practice" ? `归档第 ${index + 1} 条短句到已背出` : `移回第 ${index + 1} 条短句到练习中`);
    moveButton.addEventListener("click", () => {
      if (currentFolder === "practice") {
        savePracticePhrases(getPracticePhrases().filter((itemPhrase) => itemPhrase !== phrase));
        saveMasteredPhrases([phrase, ...getMasteredPhrases().filter((itemPhrase) => itemPhrase !== phrase)]);
        setStatus("已归档到已背出。", 0);
      } else {
        saveMasteredPhrases(getMasteredPhrases().filter((itemPhrase) => itemPhrase !== phrase));
        savePracticePhrases([phrase, ...getPracticePhrases().filter((itemPhrase) => itemPhrase !== phrase)]);
        setStatus("已移回练习中。", 0);
      }
      renderPhrases();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-phrase";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `删除第 ${index + 1} 条短句`);
    deleteButton.title = "删除";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      if (currentFolder === "practice") {
        savePracticePhrases(getPracticePhrases().filter((itemPhrase) => itemPhrase !== phrase));
      } else {
        saveMasteredPhrases(getMasteredPhrases().filter((itemPhrase) => itemPhrase !== phrase));
      }
      renderPhrases();
      setStatus("已删除短句。", 0);
    });

    item.append(button, moveButton, deleteButton);
    els.phraseList.append(item);
  });
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function getDirname(path) {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

function joinPath(basePath, href) {
  const parts = `${basePath}${href}`.split("/");
  const normalized = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  });
  return normalized.join("/");
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").replace(/[\u00a0\u3000]/g, " ").trim();
}

function getHtmlParagraphs(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  doc.querySelectorAll("script, style, nav, header, footer").forEach((node) => node.remove());
  let paragraphs = [...doc.querySelectorAll("p, h1, h2, h3")]
    .map((node) => cleanText(node.textContent))
    .filter((text) => text.length >= 6);

  if (!paragraphs.length) {
    paragraphs = cleanText(doc.body?.textContent || "")
      .split(/(?<=[。！？!?])/u)
      .map((text) => cleanText(text))
      .filter((text) => text.length >= 6);
  }

  return uniquePhrases(paragraphs);
}

function stripBookExtension(name) {
  return cleanText(String(name || "未命名书籍").replace(/\.(epub|txt)$/i, "")) || "未命名书籍";
}

function getTextParagraphs(text) {
  const normalized = String(text || "")
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ");
  let paragraphs = normalized
    .split(/\n\s*\n+|\n+/)
    .map((line) => cleanText(line))
    .filter((line) => line.length >= 6 && !isTextChapterHeading(line));

  if (paragraphs.length <= 1 && cleanText(normalized).length > 280) {
    const sentences = cleanText(normalized)
      .split(/(?<=[。！？!?])/u)
      .map((line) => cleanText(line))
      .filter((line) => line.length >= 6);
    const chunks = [];
    let buffer = "";
    sentences.forEach((sentence) => {
      if ((buffer + sentence).length > 260 && buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      buffer = buffer ? `${buffer}${sentence}` : sentence;
    });
    if (buffer) chunks.push(buffer);
    paragraphs = chunks;
  }

  return uniquePhrases(paragraphs);
}

function isTextChapterHeading(line) {
  return /^(第\s*[零〇一二三四五六七八九十百千万\d]+\s*[章节回卷部篇].{0,40}|chapter\s+\d+.{0,40})$/i.test(cleanText(line));
}

function parseTextChapters(text, fallbackTitle) {
  const title = stripBookExtension(fallbackTitle);
  const lines = String(text || "").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n");
  const chapters = [];
  let current = { label: "全文", lines: [] };

  lines.forEach((line) => {
    const cleaned = cleanText(line);
    if (cleaned && isTextChapterHeading(cleaned)) {
      if (current.lines.some((item) => cleanText(item))) chapters.push(current);
      current = { label: cleaned.slice(0, 28), lines: [] };
      return;
    }
    current.lines.push(line);
  });
  if (current.lines.some((item) => cleanText(item))) chapters.push(current);

  const parsed = (chapters.length ? chapters : [{ label: "全文", lines }])
    .map((chapter, index) => ({
      index,
      label: chapter.label || `第 ${index + 1} 章`,
      paragraphs: getTextParagraphs(chapter.lines.join("\n")).map((paragraph, paragraphIndex) => ({
        text: paragraph,
        number: paragraphIndex + 1,
      })),
    }))
    .filter((chapter) => chapter.paragraphs.length);

  return {
    title,
    chapters: parsed.length ? parsed : [{ index: 0, label: "全文", paragraphs: [] }],
    type: "txt",
  };
}

async function loadBook(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const isTxt = /\.txt$/i.test(file.name) || /^text\/plain\b/i.test(file.type || "");
  if (isTxt) {
    await loadTxt(file);
    return;
  }
  await loadEpub(file);
}

async function loadTxt(file) {
  els.epubInfo.textContent = "正在读取 TXT...";
  els.chapterSelect.disabled = true;
  els.chapterParagraphs.innerHTML = "";

  try {
    const text = await file.text();
    const book = parseTextChapters(text, file.name);
    epubBook = book;
    els.chapterSelect.innerHTML = "";
    book.chapters.forEach((chapter, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = chapter.label;
      els.chapterSelect.append(option);
    });
    els.chapterSelect.disabled = false;
    els.epubInfo.textContent = `已读取《${book.title}》，共 ${book.chapters.length} 个章节。`;
    await loadChapter(0);
  } catch {
    epubBook = null;
    currentChapterParagraphs = [];
    els.epubInfo.textContent = "这本 TXT 暂时读取失败，可以换一个文件试试。";
    els.chapterSelect.innerHTML = "<option>解析失败</option>";
    els.addChapter.disabled = true;
    els.chapterSort.disabled = true;
    renderChapterParagraphs();
  }
}

async function loadEpub(file) {
  if (!window.JSZip) {
    els.epubInfo.textContent = "EPUB 解析库没有加载成功。";
    return;
  }

  els.epubInfo.textContent = "正在读取 EPUB...";
  els.chapterSelect.disabled = true;
  els.chapterParagraphs.innerHTML = "";

  try {
    const zip = await JSZip.loadAsync(file);
    const containerText = await zip.file("META-INF/container.xml")?.async("text");
    if (!containerText) throw new Error("missing container");

    const container = parseXml(containerText);
    const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
    if (!opfPath) throw new Error("missing opf");

    const opfText = await zip.file(opfPath)?.async("text");
    if (!opfText) throw new Error("missing opf text");

    const opf = parseXml(opfText);
    const basePath = getDirname(opfPath);
    const title = cleanText(opf.querySelector("metadata title")?.textContent || file.name.replace(/\.epub$/i, ""));
    const manifest = new Map(
      [...opf.querySelectorAll("manifest item")].map((item) => [
        item.getAttribute("id"),
        {
          href: item.getAttribute("href"),
          type: item.getAttribute("media-type") || "",
        },
      ]),
    );

    const chapters = [...opf.querySelectorAll("spine itemref")]
      .map((itemref, index) => {
        const item = manifest.get(itemref.getAttribute("idref"));
        if (!item || !/xhtml|html/i.test(item.type)) return null;
        return {
          index,
          label: `第 ${index + 1} 章`,
          path: joinPath(basePath, item.href),
        };
      })
      .filter(Boolean);

    if (!chapters.length) throw new Error("empty spine");

    epubBook = { zip, title, chapters, type: "epub" };
    els.chapterSelect.innerHTML = "";
    chapters.forEach((chapter, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = chapter.label;
      els.chapterSelect.append(option);
    });
    els.chapterSelect.disabled = false;
    els.epubInfo.textContent = `已读取《${title}》，共 ${chapters.length} 个章节。`;
    await loadChapter(0);
  } catch {
    epubBook = null;
    currentChapterParagraphs = [];
    els.epubInfo.textContent = "这本 EPUB 暂时解析失败，可以换一个文件试试。";
    els.chapterSelect.innerHTML = "<option>解析失败</option>";
    els.addChapter.disabled = true;
    els.chapterSort.disabled = true;
    renderChapterParagraphs();
  }
}

async function loadChapter(chapterIndex) {
  if (!epubBook) return;
  const chapter = epubBook.chapters[chapterIndex];
  if (!chapter) return;

  els.epubInfo.textContent = `正在打开《${epubBook.title}》${chapter.label}...`;
  els.chapterParagraphs.innerHTML = '<p class="empty">正在拆分段落...</p>';

  try {
    if (epubBook.type === "txt") {
      currentChapterParagraphs = chapter.paragraphs || [];
      els.epubInfo.textContent = `${chapter.label}：${currentChapterParagraphs.length} 段。`;
      els.addChapter.disabled = !currentChapterParagraphs.length;
      els.chapterSort.disabled = !currentChapterParagraphs.length;
      renderChapterParagraphs();
      return;
    }

    const htmlText = await epubBook.zip.file(chapter.path)?.async("text");
    if (!htmlText) throw new Error("missing chapter");
    currentChapterParagraphs = getHtmlParagraphs(htmlText).map((text, index) => ({
      text,
      number: index + 1,
    }));
    chapter.label = getChapterLabel(htmlText, chapter.label);
    els.chapterSelect.options[chapterIndex].textContent = chapter.label;
    els.epubInfo.textContent = `${chapter.label}：${currentChapterParagraphs.length} 段。`;
    els.addChapter.disabled = !currentChapterParagraphs.length;
    els.chapterSort.disabled = !currentChapterParagraphs.length;
    renderChapterParagraphs();
  } catch {
    currentChapterParagraphs = [];
    els.epubInfo.textContent = "这一章读取失败，可以换一章试试。";
    els.addChapter.disabled = true;
    els.chapterSort.disabled = true;
    renderChapterParagraphs();
  }
}

function getChapterLabel(htmlText, fallback) {
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const title = cleanText(doc.querySelector("h1, h2, title")?.textContent || "");
  return title ? title.slice(0, 28) : fallback;
}

function renderChapterParagraphs() {
  els.chapterParagraphs.innerHTML = "";
  els.chapterSort.textContent = chapterSortDescending ? "正序" : "倒序";
  if (!currentChapterParagraphs.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = epubBook ? "这一章没有拆出可背段落。" : "上传 EPUB / TXT 后，这里会显示当前章节段落。";
    els.chapterParagraphs.append(empty);
    return;
  }

  const source = {
    book: epubBook?.title || "未命名 EPUB",
    chapter: epubBook?.chapters[Number(els.chapterSelect.value)]?.label || "当前章节",
  };
  const savedIds = new Set(getMemoryItems().map((item) => item.id));
  const paragraphs = [...currentChapterParagraphs].sort((a, b) => (chapterSortDescending ? b.number - a.number : a.number - b.number));

  paragraphs.forEach((paragraph) => {
    const itemSource = { ...source, paragraphNumber: paragraph.number };
    const id = makeMemoryId(paragraph.text, itemSource);
    const item = document.createElement("div");
    item.className = "paragraph-item";

    const number = document.createElement("span");
    number.className = "paragraph-number";
    number.textContent = String(paragraph.number);

    const textButton = document.createElement("button");
    textButton.className = "paragraph-text";
    textButton.type = "button";
    textButton.textContent = paragraph.text;
    textButton.addEventListener("click", () => setInputText(paragraph.text, `已载入第 ${paragraph.number} 段。`));

    const addButton = document.createElement("button");
    addButton.className = "archive-phrase";
    addButton.type = "button";
    addButton.textContent = savedIds.has(id) ? "已加入" : "加入待背";
    addButton.disabled = savedIds.has(id);
    addButton.addEventListener("click", () => addMemoryItem(paragraph.text, itemSource));

    item.append(number, textButton, addButton);
    els.chapterParagraphs.append(item);
  });
}

function addMemoryItem(text, source) {
  const id = makeMemoryId(text, source);
  const items = getMemoryItems().filter((item) => item.id !== id);
  items.unshift({
    id,
    text,
    book: source.book,
    chapter: source.chapter,
    paragraphNumber: source.paragraphNumber || 0,
    status: "todo",
    createdAt: Date.now(),
  });
  saveMemoryItems(items);
  renderMemory();
  renderChapterParagraphs();
  setStatus("已加入待背。", 0);
}

function addCurrentChapterToMemory() {
  if (!epubBook || !currentChapterParagraphs.length) return;

  const source = {
    book: epubBook.title,
    chapter: epubBook.chapters[Number(els.chapterSelect.value)]?.label || "当前章节",
  };
  const existing = getMemoryItems();
  const existingIds = new Set(existing.map((item) => item.id));
  const additions = [];

  currentChapterParagraphs.forEach((paragraph) => {
    const itemSource = { ...source, paragraphNumber: paragraph.number };
    const id = makeMemoryId(paragraph.text, itemSource);
    if (existingIds.has(id)) return;
    existingIds.add(id);
    additions.push({
      id,
      text: paragraph.text,
      book: itemSource.book,
      chapter: itemSource.chapter,
      paragraphNumber: itemSource.paragraphNumber,
      status: "todo",
      createdAt: Date.now() + paragraph.number,
    });
  });

  saveMemoryItems([...additions, ...existing]);
  renderMemory();
  renderChapterParagraphs();
  setStatus(`已加入 ${additions.length} 段，跳过重复 ${currentChapterParagraphs.length - additions.length} 段。`, 0);
}

function updateMemoryItem(id, patch) {
  selectedMemoryIds.delete(id);
  saveMemoryItems(getMemoryItems().map((item) => (item.id === id ? { ...item, ...patch } : item)));
  renderMemory();
  renderChapterParagraphs();
}

function deleteMemoryItem(id) {
  selectedMemoryIds.delete(id);
  saveMemoryItems(getMemoryItems().filter((item) => item.id !== id));
  renderMemory();
  renderChapterParagraphs();
  setStatus("已从背诵仓库删除。", 0);
}

async function combineSelectedMemory() {
  const itemMap = new Map(getMemoryItems().map((item) => [item.id, item]));
  const selectedItems = [...selectedMemoryIds].map((id) => itemMap.get(id)).filter(Boolean);

  if (!selectedItems.length) {
    setStatus("先勾选要合并的段落。", 0);
    return;
  }

  if (selectedItems.length > 10) {
    setStatus("一次最多合并 10 段。", 0);
    return;
  }

  const text = selectedItems.map((item) => item.text).join("\n\n");
  setInputText(text, `已按选择顺序合并 ${selectedItems.length} 段，请点播放。`);
  selectedMemoryIds.clear();
  renderMemory();
}

function clearSelectedMemory() {
  selectedMemoryIds.clear();
  renderMemory();
  setStatus("已清除选择。", 0);
}

function syncMemoryBookFilter(allItems) {
  if (!els.memoryBookFilter) return;
  const books = [...new Set(allItems.map((item) => item.book || "未命名书籍"))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const existing = new Set(["__all__", ...books]);
  if (!existing.has(currentMemoryBook)) currentMemoryBook = "__all__";

  els.memoryBookFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "__all__";
  allOption.textContent = `全部书籍（${allItems.length}）`;
  els.memoryBookFilter.append(allOption);

  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book;
    option.textContent = `${book}（${allItems.filter((item) => (item.book || "未命名书籍") === book).length}）`;
    els.memoryBookFilter.append(option);
  });
  els.memoryBookFilter.value = currentMemoryBook;
}

function renderMemory() {
  const allItems = getMemoryItems();
  syncMemoryBookFilter(allItems);
  const visibleItems = currentMemoryBook === "__all__" ? allItems : allItems.filter((item) => (item.book || "未命名书籍") === currentMemoryBook);
  const masteredCount = visibleItems.filter((item) => item.status === "mastered").length;
  const todoCount = visibleItems.length - masteredCount;
  const percent = visibleItems.length ? Math.round((masteredCount / visibleItems.length) * 100) : 0;
  const existingIds = new Set(allItems.map((item) => item.id));
  [...selectedMemoryIds].forEach((id) => {
    if (!existingIds.has(id)) selectedMemoryIds.delete(id);
  });
  const todoItems = getSortedMemoryItems(visibleItems.filter((item) => item.status !== "mastered"));
  const masteredItems = getSortedMemoryItems(visibleItems.filter((item) => item.status === "mastered"));

  els.memoryProgressFill.style.width = `${percent}%`;
  els.memoryProgressText.textContent = visibleItems.length ? `待背 ${todoCount} 段 · 已背出 ${masteredCount} 段 · 完成 ${percent}%` : "还没有加入段落。";
  els.memorySort.textContent = memorySortDescending ? "正序" : "倒序";
  els.combineSelected.textContent = `合并选中 ${selectedMemoryIds.size}`;
  els.clearSelected.disabled = selectedMemoryIds.size === 0;
  els.todoMemoryTitle.textContent = `待背 ${todoCount}`;
  els.doneMemoryTitle.textContent = `已背出 ${masteredCount}`;
  renderMemoryStats();
  renderMemoryColumn(els.todoMemoryList, todoItems, "todo", visibleItems.length);
  renderMemoryColumn(els.doneMemoryList, masteredItems, "mastered", visibleItems.length);
}

function renderMemoryColumn(container, items, folder, totalCount) {
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = totalCount ? "这个文件夹暂时没有段落。" : "从书籍章节里点“加入待背”，段落会保存到这里。";
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "memory-item";

    const selectLabel = document.createElement("label");
    selectLabel.className = "memory-select";
    selectLabel.title = "选择合听";
    const selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.checked = selectedMemoryIds.has(item.id);
    selectBox.addEventListener("change", () => {
      if (selectBox.checked) selectedMemoryIds.add(item.id);
      else selectedMemoryIds.delete(item.id);
      renderMemory();
    });
    selectLabel.append(selectBox);

    const textButton = document.createElement("button");
    textButton.className = "phrase memory-text";
    textButton.type = "button";
    textButton.title = item.text;
    textButton.innerHTML = `<span></span><small></small>`;
    textButton.querySelector("span").textContent = previewText(item.text);
    textButton.querySelector("small").textContent = `${item.book || "未命名书籍"} · 第 ${item.paragraphNumber || "?"} 段 · ${item.chapter} · ${item.status === "mastered" ? "已背出" : "待背"}`;
    textButton.addEventListener("click", () => loadAndPlay(item.text, "已载入并开始播放。", true));

    const doneButton = document.createElement("button");
    doneButton.className = folder === "mastered" ? "restore-phrase" : "archive-phrase";
    doneButton.type = "button";
    doneButton.textContent = folder === "mastered" ? "移回" : "背出";
    doneButton.addEventListener("click", () => {
      if (folder === "mastered") {
        restoreMemoryToTodo(item);
      } else {
        markMemoryAsMastered(item);
      }
      setStatus(folder === "mastered" ? "已移回待背。" : "已标记背出。", 0);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-phrase";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "删除";
    deleteButton.addEventListener("click", () => deleteMemoryItem(item.id));

    row.append(selectLabel, textButton, doneButton, deleteButton);
    container.append(row);
  });
}

function savePhrase() {
  const phrase = els.text.value.trim();
  if (!phrase) {
    setStatus("先输入一句中文。");
    return;
  }

  saveMasteredPhrases(getMasteredPhrases().filter((item) => item !== phrase));
  savePracticePhrases([phrase, ...getPracticePhrases().filter((item) => item !== phrase)]);
  currentFolder = "practice";
  renderPhrases();
  setStatus("已保存到常用短句。");
}

function bindEvents() {
  [els.text, els.repeat, els.pause, els.rate, els.pitch, els.split, els.naturalMode, els.voice].forEach((el) => {
    el.addEventListener("input", () => {
      updateOutputs();
      saveState();
    });
  });

  els.play.addEventListener("click", togglePlay);
  els.advancedSettingsButton?.addEventListener("click", () => {
    const shouldOpen = els.advancedSettingsPanel.hasAttribute("hidden");
    els.advancedSettingsPanel.toggleAttribute("hidden", !shouldOpen);
    els.advancedSettingsButton.setAttribute("aria-expanded", String(shouldOpen));
  });
  els.testVoice.addEventListener("click", testVoice);
  els.themeSelect?.addEventListener("change", () => setTheme(els.themeSelect.value));
  els.savePhrase.addEventListener("click", savePhrase);
  els.exportBackup?.addEventListener("click", exportBackup);
  els.importBackupInput?.addEventListener("change", () => importBackup(els.importBackupInput.files?.[0]));
  els.phrasesPanelTab?.addEventListener("click", () => setSidePanel("phrases"));
  els.epubPanelTab?.addEventListener("click", () => setSidePanel("epub"));
  els.memoryPanelTab?.addEventListener("click", () => setSidePanel("memory"));
  els.mobileScreenTabs?.forEach((button) => {
    button.addEventListener("click", () => setMobileScreen(button.dataset.screen));
  });
  els.practiceTab.addEventListener("click", () => {
    currentFolder = "practice";
    renderPhrases();
  });
  els.masteredTab.addEventListener("click", () => {
    currentFolder = "mastered";
    renderPhrases();
  });
  els.epubInput.addEventListener("change", loadBook);
  els.chapterSelect.addEventListener("change", () => loadChapter(Number(els.chapterSelect.value)));
  els.addChapter.addEventListener("click", addCurrentChapterToMemory);
  els.chapterSort.addEventListener("click", () => {
    chapterSortDescending = !chapterSortDescending;
    renderChapterParagraphs();
  });
  els.memorySort.addEventListener("click", () => {
    memorySortDescending = !memorySortDescending;
    renderMemory();
  });
  els.memoryBookFilter?.addEventListener("change", () => {
    currentMemoryBook = els.memoryBookFilter.value || "__all__";
    selectedMemoryIds.clear();
    renderMemory();
  });
  els.combineSelected.addEventListener("click", combineSelectedMemory);
  els.clearSelected.addEventListener("click", clearSelectedMemory);
  els.resetStats.addEventListener("click", () => {
    saveMemoryStats({ totalMs: 0, sessions: 0, firstMasteredAt: 0, masteredCharsTotal: 0 });
    renderMemory();
    renderMemoryStats();
    setStatus("背诵统计已清零。", 0);
  });
  els.clear.addEventListener("click", () => {
    stop(true);
    els.text.value = "";
    saveState();
    els.text.focus();
    setStatus("已清空。", 0);
  });

  els.rainSoundDown?.addEventListener("click", () => {
    setRainSound(Math.max(0, getRainSoundVolume() - 0.05));
  });
  els.rainSoundUp?.addEventListener("click", () => {
    setRainSound(Math.min(1, getRainSoundVolume() + 0.05));
  });
  els.rainSoundButton?.addEventListener("click", () => {
    if (!els.rainAudio) return;
    const current = Math.max(0.05, getRainSoundVolume() || 0.1);
    syncRainSoundUi(current);
    localStorage.setItem(rainSoundKey, String(current));
    if (!els.rainAudio.paused) {
      els.rainAudio.pause();
      setStatus("雨声已关闭。", null);
      return;
    }
    els.rainAudio.play().catch(() => {
      setStatus("浏览器拦截了雨声，请再点一次雨声开关。", null);
    });
  });
  els.rainSettingsButton?.addEventListener("click", () => {
    const shouldOpen = els.rainSettingsPanel.hasAttribute("hidden");
    els.rainSettingsPanel.toggleAttribute("hidden", !shouldOpen);
    els.rainSettingsButton.setAttribute("aria-expanded", String(shouldOpen));
  });
  [els.rainIntensityRange, els.rainSizeRange, els.rainRefractRange, els.rainMistRange].forEach((input) => {
    input?.addEventListener("input", () => applyRainSettings(readRainSettingsFromControls()));
  });
  els.rainSettingsReset?.addEventListener("click", () => {
    applyRainSettings(defaultRainSettings);
    setStatus("雨幕已恢复默认。", 0);
  });
  window.addEventListener("resize", resizeRainWindow);
  window.addEventListener("pagehide", () => els.rainAudio?.pause());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isPlaying) stop(true);
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch {
    // The app still works without offline caching.
  }
}

restoreState();
if (els.audioLevel) {
  const savedRainRaw = localStorage.getItem(rainSoundKey);
  const savedRainVolume = savedRainRaw === null || savedRainRaw === "0.05" ? 0.1 : clampNumber(savedRainRaw, 0, 1, 0.1);
  syncRainSoundUi(savedRainVolume);
}
setRainControlValues(getRainSettings());
renderPhrases();
renderChapterParagraphs();
renderMemory();
renderMemoryStats();
bindEvents();
setSidePanel(currentSidePanel);
setMobileScreen(currentMobileScreen);
setTheme(currentTheme);
loadVoices();
if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}
initRainWindow().catch(() => {});
requestAnimationFrame(animateRainBackground);
registerServiceWorker();
