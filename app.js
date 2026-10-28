// Логика чата: выбор персонажа, история переписки и запросы к Claude.

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.136.0/+esm";
const MODEL = "claude-opus-5-5";

const KEY_STORAGE = "verity.apiKey";
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

// Из ответа Claude показываем только текстовые блоки (thinking и прочее скрыто).
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
  els.keyBtn.textContent = state.apiKey ? "🔑 Ключ сохранён" : "🔑 Ввести API-ключ";
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

// ---------- Claude ----------
let sdkPromise = null;
function loadSdk() {
  return (sdkPromise ||= import(SDK_URL).then((m) => m.default));
}

function errorText(Anthropic, err) {
  if (err instanceof Anthropic.AuthenticationError)
    return "Сервер Claude не принял ключ. Нужен API-ключ с console.anthropic.com — он начинается с «sk-ant-api». Подписка Claude Pro на claude.ai тут не подходит, это другое.";
  if (err instanceof Anthropic.PermissionDeniedError) return "У этого ключа нет доступа к модели.";
  if (err instanceof Anthropic.RateLimitError) return "Слишком много запросов. Подожди немного и попробуй снова.";
  if (err instanceof Anthropic.APIConnectionError) return "Нет связи с сервером. Проверь интернет.";
  if (err instanceof Anthropic.APIError) return `Ошибка API (${err.status ?? "?"}): ${err.message}`;
  return `Что-то пошло не так: ${err?.message ?? err}`;
}

async function ask(text) {
  const p = persona();
  const turns = history();
  turns.push({ role: "user", content: text });
  addBubble("user", text);

  const bubble = addBubble("bot", "");
  bubble.classList.add("typing");
  setBusy(true);

  let Anthropic;
  try {
    Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: state.apiKey, dangerouslyAllowBrowser: true });

    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: p.prompt,
      messages: turns,
      output_config: { effort: "low" }, // для болтовни хватает, отвечает быстрее и дешевле
      // Если модель откажется отвечать, сервер сам попробует подходящую запасную модель.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    let shown = "";
    stream.on("text", (delta) => {
      shown += delta;
      bubble.innerHTML = formatText(shown);
      els.messages.scrollTop = els.messages.scrollHeight;
    });

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      turns.pop();
      bubble.closest(".msg").classList.add("notice");
      bubble.textContent = "Я не могу ответить на это. Попробуй спросить по-другому.";
    } else {
      // Сохраняем ответ целиком (вместе со служебными блоками), как требует API.
      turns.push({ role: "assistant", content: message.content });
      bubble.innerHTML = formatText(textOf(message.content) || shown);
    }
  } catch (err) {
    turns.pop();
    bubble.closest(".msg").classList.add("notice");
    bubble.textContent = Anthropic ? errorText(Anthropic, err) : "Не удалось загрузить библиотеку Claude. Проверь интернет.";
    if (Anthropic && err instanceof Anthropic.AuthenticationError) openKeyDialog("Этот ключ не подошёл. Вставь другой.");
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
  els.keyDialog.showModal();
}
els.keyBtn.addEventListener("click", () => openKeyDialog());
els.keyDialog.addEventListener("close", () => {
  if (els.keyDialog.returnValue !== "save") return;
  // Убираем пробелы и кавычки, которые часто попадают при копировании.
  const key = els.keyInput.value.trim().replace(/^["'«]+|["'»]+$/g, "");
  if (!key.startsWith("sk-ant-")) {
    openKeyDialog("Это не похоже на API-ключ: он должен начинаться с «sk-ant-».");
    return;
  }
  state.apiKey = key;
  save(KEY_STORAGE, state.apiKey);
  renderSidebar();
});

// ---------- Старт ----------
els.brandFace.innerHTML = faceSVG(PERSONAS[0].face);
renderSidebar();
renderChat();
loadSdk().catch(() => {}); // заранее подгружаем библиотеку
