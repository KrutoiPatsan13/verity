// Логика чата: выбор персонажа, история переписки и запросы к OpenRouter.

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_URL = "https://openrouter.ai/api/v1/models";
// Роутер OpenRouter: сам выбирает работающую бесплатную модель.
const DEFAULT_MODEL = "openrouter/free";

const KEY_STORAGE = "verity.openrouterKey";
const MODEL_STORAGE = "verity.model";
const HISTORY_STORAGE = "verity.history";
const PERSONA_STORAGE = "verity.persona";

const $ = (id) => document.getElementById(id);
const els = {
  list: $("personaList"),
  messages: $("messages"),
  composer: $("composer"),
  input: $("input"),
  sendBtn: $("sendBtn"),
  clearBtn: $("clearBtn"),
  keyBtn: $("keyBtn"),
  keyDialog: $("keyDialog"),
  keyInput: $("keyInput"),
  keyHint: $("keyHint"),
  modelSelect: $("modelSelect"),
  headerFace: $("headerFace"),
  headerName: $("headerName"),
  headerTagline: $("headerTagline"),
  brandFace: $("brandFace"),
};

// ---------- Хранилище (localStorage может быть недоступен) ----------
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const state = {
  apiKey: load(KEY_STORAGE, ""),
  model: load(MODEL_STORAGE, DEFAULT_MODEL),
  histories: load(HISTORY_STORAGE, {}), // { personaId: [{role, content}] }
  personaId: load(PERSONA_STORAGE, PERSONAS[0].id),
  busy: false,
};
if (!PERSONAS.some((p) => p.id === state.personaId)) state.personaId = PERSONAS[0].id;

const persona = () => PERSONAS.find((p) => p.id === state.personaId);
const history = () => (state.histories[state.personaId] ||= []);

// ---------- Отрисовка ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function formatText(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

// Старые сообщения (от версии на Claude) хранились блоками — достаём из них текст.
function textOf(content) {
  if (typeof content === "string") return content;
  return content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function addBubble(kind, text) {
  const p = persona();
  const row = document.createElement("div");
  row.className = `msg ${kind}`;
  if (kind !== "user") {
    const av = document.createElement("div");
    av.className = "avatar";
    av.innerHTML = faceSVG(p.face);
    row.appendChild(av);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(text);
  row.appendChild(bubble);
  els.messages.appendChild(row);
  els.messages.scrollTop = els.messages.scrollHeight;
  return bubble;
}

function renderSidebar() {
  els.list.innerHTML = "";
  for (const p of PERSONAS) {
    const btn = document.createElement("button");
    btn.className = "persona" + (p.id === state.personaId ? " active" : "");
    btn.style.setProperty("--accent", p.accent);
    btn.innerHTML = `<div class="mini">${faceSVG(p.face)}</div>
      <div><div class="persona-name">${p.name}</div><div class="persona-tag">${p.tagline}</div></div>`;
    btn.onclick = () => selectPersona(p.id);
    els.list.appendChild(btn);
  }
  els.keyBtn.classList.toggle("missing", !state.apiKey);
  els.keyBtn.textContent = state.apiKey ? "⚙️ Настройки" : "🔑 Ввести ключ OpenRouter";
}

function renderChat() {
  const p = persona();
  document.documentElement.style.setProperty("--accent", p.accent);
  els.headerFace.innerHTML = faceSVG(p.face);
  els.headerName.textContent = `${p.name} · ${p.latin}`;
  els.headerTagline.textContent = p.tagline;
  els.input.placeholder = `Спроси ${p.name}…`;

  els.messages.innerHTML = "";
  addBubble("bot", p.greeting);
  for (const m of history()) addBubble(m.role === "user" ? "user" : "bot", textOf(m.content));
}

function selectPersona(id) {
  if (state.busy) return;
  state.personaId = id;
  save(PERSONA_STORAGE, id);
  renderSidebar();
  renderChat();
  els.input.focus();
}

// ---------- OpenRouter ----------
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function errorText(err) {
  if (!(err instanceof ApiError)) return "Нет связи с OpenRouter. Проверь интернет.";
  switch (err.status) {
    case 401:
      return "OpenRouter не принял ключ. Нужен ключ с openrouter.ai/keys — он начинается с «sk-or-».";
    case 402:
      return "Эта модель платная или на счёте не хватает денег. Выбери бесплатную модель в ⚙️ Настройках.";
    case 429:
      return "Бесплатный лимит на сейчас закончился. Подожди минутку или выбери другую модель в ⚙️ Настройках.";
    default:
      return `Ошибка OpenRouter (${err.status ?? "?"}): ${err.message}`;
  }
}

async function readError(res) {
  try {
    const data = await res.json();
    return new ApiError(res.status, data?.error?.message || res.statusText);
  } catch {
    return new ApiError(res.status, res.statusText);
  }
}

// Отправляет переписку и по кусочкам отдаёт текст ответа в onText. Возвращает весь ответ.
async function streamChat(system, turns, onText) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Verity",
    },
    body: JSON.stringify({
      model: state.model,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...turns.map((m) => ({ role: m.role, content: textOf(m.content) })),
      ],
    }),
  });
  if (!res.ok) throw await readError(res);

  // Ответ приходит потоком строк вида «data: {...}» (Server-Sent Events).
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue; // пропускаем служебные «: OPENROUTER PROCESSING»
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return full;
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new ApiError(chunk.error.code, chunk.error.message);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onText(full);
      }
    }
  }
  return full;
}

async function ask(text) {
  const p = persona();
  const turns = history();
  turns.push({ role: "user", content: text });
  addBubble("user", text);

  const bubble = addBubble("bot", "");
  bubble.classList.add("typing");
  setBusy(true);

  try {
    const answer = await streamChat(p.prompt, turns, (soFar) => {
      bubble.innerHTML = formatText(soFar);
      els.messages.scrollTop = els.messages.scrollHeight;
    });
    if (!answer.trim()) throw new ApiError(null, "модель прислала пустой ответ, попробуй ещё раз");
    turns.push({ role: "assistant", content: answer });
  } catch (err) {
    turns.pop();
    bubble.closest(".msg").classList.add("notice");
    bubble.textContent = errorText(err);
    if (err instanceof ApiError && err.status === 401) openKeyDialog("Этот ключ не подошёл. Вставь другой.");
  } finally {
    bubble.classList.remove("typing");
    save(HISTORY_STORAGE, state.histories);
    setBusy(false);
  }
}

function setBusy(busy) {
  state.busy = busy;
  els.sendBtn.disabled = busy;
  els.clearBtn.disabled = busy;
}

// ---------- Выбор модели ----------
let modelsLoaded = false;
async function loadFreeModels() {
  if (modelsLoaded) return;
  try {
    const res = await fetch(MODELS_URL);
    const { data } = await res.json();
    const free = data
      .filter((m) => m.id.endsWith(":free"))
      .filter((m) => m.architecture?.output_modalities?.includes("text") ?? true)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const m of free) {
      if (m.id === DEFAULT_MODEL) continue;
      els.modelSelect.add(new Option(m.name, m.id));
    }
    modelsLoaded = true;
  } catch {
    // Без списка остаётся вариант по умолчанию — этого достаточно.
  }
  // Если сохранённой модели больше нет среди бесплатных — возвращаемся к роутеру.
  if (![...els.modelSelect.options].some((o) => o.value === state.model)) state.model = DEFAULT_MODEL;
  els.modelSelect.value = state.model;
}

// ---------- События ----------
els.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text || state.busy) return;
  if (!state.apiKey) {
    openKeyDialog();
    return;
  }
  els.input.value = "";
  autoGrow();
  ask(text);
});

els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    els.composer.requestSubmit();
  }
});

function autoGrow() {
  els.input.style.height = "auto";
  els.input.style.height = els.input.scrollHeight + 2 + "px"; // +2 — рамка поля
}
els.input.addEventListener("input", autoGrow);

els.clearBtn.addEventListener("click", () => {
  state.histories[state.personaId] = [];
  save(HISTORY_STORAGE, state.histories);
  renderChat();
});

function openKeyDialog(hint = "") {
  els.keyInput.value = state.apiKey;
  els.keyHint.textContent = hint;
  els.modelSelect.value = state.model;
  loadFreeModels();
  els.keyDialog.showModal();
}
els.keyBtn.addEventListener("click", () => openKeyDialog());
els.keyDialog.addEventListener("close", () => {
  if (els.keyDialog.returnValue !== "save") return;
  // Убираем пробелы и кавычки, которые часто попадают при копировании.
  const key = els.keyInput.value.trim().replace(/^["'«]+|["'»]+$/g, "");
  if (!key.startsWith("sk-or-")) {
    openKeyDialog("Это не похоже на ключ OpenRouter: он должен начинаться с «sk-or-».");
    return;
  }
  state.apiKey = key;
  state.model = els.modelSelect.value;
  save(KEY_STORAGE, state.apiKey);
  save(MODEL_STORAGE, state.model);
  renderSidebar();
});

// ---------- Старт ----------
els.brandFace.innerHTML = faceSVG(PERSONAS[0].face);
renderSidebar();
renderChat();
