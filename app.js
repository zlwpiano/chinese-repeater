const $ = (selector) => document.querySelector(selector);

const els = {
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
  play: $("#playButton"),
  pauseButton: $("#pauseButton"),
  stop: $("#stopButton"),
  clear: $("#clearButton"),
  savePhrase: $("#savePhraseButton"),
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
  phraseList: $("#phraseList"),
  status: $("#statusText"),
  progress: $("#progressFill"),
};

const storageKey = "chinese-repeater-state";
const phraseKey = "chinese-repeater-phrases";
const masteredPhraseKey = "chinese-repeater-mastered-phrases";
const memoryKey = "chinese-repeater-memory-items";

let voices = [];
let isPlaying = false;
let isPaused = false;
let currentTimer = null;
let currentRunId = 0;
let currentFolder = "practice";
let epubBook = null;
let currentChapterParagraphs = [];
let chapterSortDescending = false;
let memorySortDescending = false;

const defaults = [
  "今天我想把这句话练到自然脱口而出。",
  "请慢一点，再说一遍。",
  "我正在练习中文发音和语感。",
];

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

async function loadAndPlay(text, message = "已载入并开始播放。") {
  setInputText(text, message);
  await play();
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
  els.text.value = state.text || defaults[0];
  els.repeat.value = state.repeat || "5";
  els.pause.value = state.pause || "1";
  els.rate.value = state.rate || "0.85";
  els.pitch.value = state.pitch || "1";
  els.split.checked = state.split ?? true;
  els.naturalMode.checked = state.naturalMode ?? true;
  updateOutputs();
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
    els.pauseButton.textContent = "暂停";
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
  els.pauseButton.textContent = "暂停";

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
      els.pauseButton.textContent = "暂停";
    }
  }
}

function pause() {
  if (!isPlaying) return;
  if (isPaused) {
    speechSynthesis.resume();
    isPaused = false;
    els.pauseButton.textContent = "暂停";
    setStatus("继续播放。");
  } else {
    speechSynthesis.pause();
    isPaused = true;
    els.pauseButton.textContent = "继续";
    setStatus("已暂停。");
  }
}

function stop(resetProgress = true) {
  currentRunId += 1;
  isPlaying = false;
  isPaused = false;
  window.clearTimeout(currentTimer);
  currentTimer = null;
  speechSynthesis.cancel();
  els.play.classList.remove("is-active");
  els.pauseButton.textContent = "暂停";
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
    button.innerHTML = `<span></span><small>点按载入</small>`;
    button.querySelector("span").textContent = phrase;
    button.addEventListener("click", () => {
      setInputText(phrase, `已载入第 ${index + 1} 条短句。`);
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

async function loadEpub(event) {
  const file = event.target.files?.[0];
  if (!file) return;
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

    epubBook = { zip, title, chapters };
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
    empty.textContent = epubBook ? "这一章没有拆出可背段落。" : "上传 EPUB 后，这里会显示当前章节段落。";
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
  saveMemoryItems(getMemoryItems().map((item) => (item.id === id ? { ...item, ...patch } : item)));
  renderMemory();
  renderChapterParagraphs();
}

function deleteMemoryItem(id) {
  saveMemoryItems(getMemoryItems().filter((item) => item.id !== id));
  renderMemory();
  renderChapterParagraphs();
  setStatus("已从背诵仓库删除。", 0);
}

function renderMemory() {
  const allItems = getMemoryItems();
  const masteredCount = allItems.filter((item) => item.status === "mastered").length;
  const todoCount = allItems.length - masteredCount;
  const percent = allItems.length ? Math.round((masteredCount / allItems.length) * 100) : 0;
  const sortItems = (items) =>
    items.sort((a, b) => {
      const chapterDiff = String(a.chapter || "").localeCompare(String(b.chapter || ""), "zh-Hans-CN");
      const numberDiff = (a.paragraphNumber || 0) - (b.paragraphNumber || 0);
      const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
      const result = chapterDiff || numberDiff || timeDiff;
      return memorySortDescending ? -result : result;
    });
  const todoItems = sortItems(allItems.filter((item) => item.status !== "mastered"));
  const masteredItems = sortItems(allItems.filter((item) => item.status === "mastered"));

  els.memoryProgressFill.style.width = `${percent}%`;
  els.memoryProgressText.textContent = allItems.length ? `待背 ${todoCount} 段 · 已背出 ${masteredCount} 段 · 完成 ${percent}%` : "还没有加入段落。";
  els.memorySort.textContent = memorySortDescending ? "正序" : "倒序";
  els.todoMemoryTitle.textContent = `待背 ${todoCount}`;
  els.doneMemoryTitle.textContent = `已背出 ${masteredCount}`;
  renderMemoryColumn(els.todoMemoryList, todoItems, "todo", allItems.length);
  renderMemoryColumn(els.doneMemoryList, masteredItems, "mastered", allItems.length);
}

function renderMemoryColumn(container, items, folder, totalCount) {
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = totalCount ? "这个文件夹暂时没有段落。" : "从 EPUB 章节里点“加入待背”，段落会保存到这里。";
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "memory-item";

    const textButton = document.createElement("button");
    textButton.className = "phrase memory-text";
    textButton.type = "button";
    textButton.innerHTML = `<span></span><small></small>`;
    textButton.querySelector("span").textContent = item.text;
    textButton.querySelector("small").textContent = `第 ${item.paragraphNumber || "?"} 段 · ${item.chapter} · ${item.status === "mastered" ? "已背出" : "待背"}`;
    textButton.addEventListener("click", () => loadAndPlay(item.text));

    const doneButton = document.createElement("button");
    doneButton.className = folder === "mastered" ? "restore-phrase" : "archive-phrase";
    doneButton.type = "button";
    doneButton.textContent = folder === "mastered" ? "移回" : "背出";
    doneButton.addEventListener("click", () => {
      updateMemoryItem(item.id, { status: folder === "mastered" ? "todo" : "mastered" });
      setStatus(folder === "mastered" ? "已移回待背。" : "已标记背出。", 0);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-phrase";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "删除";
    deleteButton.addEventListener("click", () => deleteMemoryItem(item.id));

    row.append(textButton, doneButton, deleteButton);
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

  els.play.addEventListener("click", play);
  els.testVoice.addEventListener("click", testVoice);
  els.pauseButton.addEventListener("click", pause);
  els.stop.addEventListener("click", () => stop(true));
  els.savePhrase.addEventListener("click", savePhrase);
  els.practiceTab.addEventListener("click", () => {
    currentFolder = "practice";
    renderPhrases();
  });
  els.masteredTab.addEventListener("click", () => {
    currentFolder = "mastered";
    renderPhrases();
  });
  els.epubInput.addEventListener("change", loadEpub);
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
  els.clear.addEventListener("click", () => {
    stop(true);
    els.text.value = "";
    saveState();
    els.text.focus();
    setStatus("已清空。", 0);
  });

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
renderPhrases();
renderChapterParagraphs();
renderMemory();
bindEvents();
loadVoices();
if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}
registerServiceWorker();
