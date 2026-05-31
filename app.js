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
  phraseList: $("#phraseList"),
  status: $("#statusText"),
  progress: $("#progressFill"),
};

const storageKey = "chinese-repeater-state";
const phraseKey = "chinese-repeater-phrases";

let voices = [];
let isPlaying = false;
let isPaused = false;
let currentTimer = null;
let currentRunId = 0;

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
  const phrases = loadJson(phraseKey, defaults);
  els.phraseList.innerHTML = "";

  if (!phrases.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "保存常练句子后，会显示在这里。";
    els.phraseList.append(empty);
    return;
  }

  phrases.slice(0, 12).forEach((phrase, index) => {
    const item = document.createElement("div");
    item.className = "phrase-item";

    const button = document.createElement("button");
    button.className = "phrase";
    button.type = "button";
    button.innerHTML = `<span></span><small>点按载入</small>`;
    button.querySelector("span").textContent = phrase;
    button.addEventListener("click", () => {
      els.text.value = phrase;
      saveState();
      setStatus(`已载入第 ${index + 1} 条短句。`, 0);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-phrase";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `删除第 ${index + 1} 条短句`);
    deleteButton.title = "删除";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      const nextPhrases = loadJson(phraseKey, defaults).filter((itemPhrase) => itemPhrase !== phrase);
      localStorage.setItem(phraseKey, JSON.stringify(nextPhrases));
      renderPhrases();
      setStatus("已删除短句。", 0);
    });

    item.append(button, deleteButton);
    els.phraseList.append(item);
  });
}

function savePhrase() {
  const phrase = els.text.value.trim();
  if (!phrase) {
    setStatus("先输入一句中文。");
    return;
  }

  const phrases = loadJson(phraseKey, defaults).filter((item) => item !== phrase);
  phrases.unshift(phrase);
  localStorage.setItem(phraseKey, JSON.stringify(phrases.slice(0, 12)));
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
bindEvents();
loadVoices();
if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}
registerServiceWorker();
