require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

// ---- paths ----
// STATE_DIR allows mutable files to live outside the (potentially read-only)
// install directory. Falls back to __dirname for local development.

const STATE_DIR = process.env.STATE_DIR || __dirname;
const BAD_WORDS_PATH = path.join(STATE_DIR, "bad_words.txt");
const ENV_PATH = path.join(STATE_DIR, ".env");

// On first run with a custom STATE_DIR, copy the default bad_words.txt if missing
if (STATE_DIR !== __dirname) {
  const defaultBadWords = path.join(__dirname, "bad_words.txt");
  if (!fs.existsSync(BAD_WORDS_PATH) && fs.existsSync(defaultBadWords)) {
    fs.copyFileSync(defaultBadWords, BAD_WORDS_PATH);
    console.log(`[init] Скопирован bad_words.txt в ${STATE_DIR}`);
  }
}

// ---- config ----

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN не задан! Создай файл .env с токеном.");
  process.exit(1);
}

const CHAT_ID = process.env.CHAT_ID ? Number(process.env.CHAT_ID) : null;

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map((id) => Number(id.trim()))
  : [];

// ---- mutable state (hot-reloadable) ----

let badPatterns = [];
let userIds = [];

function loadBadWords() {
  badPatterns = fs
    .readFileSync(BAD_WORDS_PATH, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  console.log(`[reload] ${badPatterns.length} паттернов загружено.`);
}

function saveBadWords() {
  selfWrite = true;
  const header = "# Список корней плохих слов (по одному на строку)\n\n";
  fs.writeFileSync(BAD_WORDS_PATH, header + badPatterns.join("\n") + "\n");
  setTimeout(() => { selfWrite = false; }, 500);
}

function loadUserIds() {
  const raw = readEnvKey("USER_IDS");
  userIds = raw
    ? raw
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean)
    : [];
  console.log(`[reload] ${userIds.length} юзеров в списке.`);
}

function saveUserIdsToEnv() {
  writeEnvKey("USER_IDS", userIds.join(","));
}

// ---- .env read/write helpers ----

function readEnvKey(key) {
  if (!fs.existsSync(ENV_PATH)) return "";
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(key + "=")) {
      return trimmed.slice(key.length + 1);
    }
  }
  return "";
}

function writeEnvKey(key, value) {
  if (!fs.existsSync(ENV_PATH)) {
    fs.writeFileSync(ENV_PATH, `${key}=${value}\n`);
    return;
  }
  let content = fs.readFileSync(ENV_PATH, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content);
}

// ---- initial load ----

loadBadWords();
loadUserIds();

if (CHAT_ID) console.log(`Слежу за чатом: ${CHAT_ID}`);
else console.log("CHAT_ID не задан — реагирую во всех чатах.");
if (ADMIN_IDS.length) console.log(`Админы: ${ADMIN_IDS.join(", ")}`);
else console.log("ADMIN_IDS не заданы — команды управления отключены.");

// ---- fs watcher: hot-reload при ручном редактировании файла ----

let selfWrite = false;       // флаг: мы сами записали файл
let watchTimer = null;        // debounce таймер

fs.watch(BAD_WORDS_PATH, { persistent: false }, (event) => {
  if (event !== "change") return;
  if (selfWrite) return;      // игнорируем собственную запись
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    try { loadBadWords(); } catch (e) { console.error("Ошибка перечитывания bad_words.txt:", e.message); }
  }, 300);
});

// ---- helpers ----

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[её]/g, "е")
    .replace(/0/g, "о")
    .replace(/1/g, "и")
    .replace(/3/g, "з")
    .replace(/4/g, "ч")
    .replace(/@/g, "а")
    .replace(/\$/g, "с")
    .replace(/\*/g, "")
    .replace(/[.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBadWords(text) {
  const normalized = normalize(text);
  return badPatterns.some((p) => normalized.includes(p.replace(/ё/g, "е")));
}

function isTargetMessage(msg) {
  if (CHAT_ID && msg.chat.id !== CHAT_ID) return false;
  if (userIds.length && !userIds.includes(msg.from.id)) return false;
  return true;
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function adminOnly(msg) {
  if (isAdmin(msg.from.id)) return true;
  bot.sendMessage(msg.chat.id, "У тебя нет прав на эту команду.");
  return false;
}

function userName(msg) {
  return msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
}

// ---- bot ----

const bot = new TelegramBot(token, { polling: true });

// --- /start & /help ---

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привет! Я слежу за чистотой речи. Не ругайся!\nНапиши /help чтобы узнать команды.",
  );
});

bot.onText(/\/help/, (msg) => {
  const lines = [
    "Команды управления (только для админов):\n",
    "/addword <слово>  — добавить паттерн",
    "/delword <слово>  — удалить паттерн",
    "/words            — показать все паттерны",
    "",
    "/adduser <id>     — добавить юзера в список слежки",
    "/deluser <id>     — убрать юзера из списка",
    "/users            — показать список юзеров",
    "",
    "/myid             — узнать свой user id",
    "/chatid           — узнать id текущего чата",
  ];
  bot.sendMessage(msg.chat.id, lines.join("\n"));
});

// --- info commands (available to everyone) ---

bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Твой user ID: ${msg.from.id}`);
});

bot.onText(/\/chatid/, (msg) => {
  bot.sendMessage(msg.chat.id, `ID этого чата: ${msg.chat.id}`);
});

// --- word management ---

bot.onText(/\/addword(?:\s+(.+))?/, (msg, match) => {
  if (!adminOnly(msg)) return;
  const word = match[1]?.trim().toLowerCase();
  if (!word)
    return bot.sendMessage(msg.chat.id, "Использование: /addword <слово>");
  if (badPatterns.includes(word)) {
    return bot.sendMessage(msg.chat.id, `«${word}» уже в списке.`);
  }
  badPatterns.push(word);
  saveBadWords();
  bot.sendMessage(
    msg.chat.id,
    `Добавлено: «${word}». Всего паттернов: ${badPatterns.length}.`,
  );
});

bot.onText(/\/delword(?:\s+(.+))?/, (msg, match) => {
  if (!adminOnly(msg)) return;
  const word = match[1]?.trim().toLowerCase();
  if (!word)
    return bot.sendMessage(msg.chat.id, "Использование: /delword <слово>");
  const idx = badPatterns.indexOf(word);
  if (idx === -1) {
    return bot.sendMessage(msg.chat.id, `«${word}» не найдено в списке.`);
  }
  badPatterns.splice(idx, 1);
  saveBadWords();
  bot.sendMessage(
    msg.chat.id,
    `Удалено: «${word}». Всего паттернов: ${badPatterns.length}.`,
  );
});

bot.onText(/\/words/, (msg) => {
  if (!adminOnly(msg)) return;
  if (!badPatterns.length) {
    return bot.sendMessage(msg.chat.id, "Список пуст.");
  }
  // Telegram message limit ~4096 chars, split if needed
  const text = badPatterns.join(", ");
  if (text.length <= 4000) {
    bot.sendMessage(msg.chat.id, `Паттерны (${badPatterns.length}):\n${text}`);
  } else {
    const chunks = [];
    let chunk = "";
    for (const w of badPatterns) {
      if ((chunk + ", " + w).length > 3900) {
        chunks.push(chunk);
        chunk = w;
      } else {
        chunk = chunk ? chunk + ", " + w : w;
      }
    }
    if (chunk) chunks.push(chunk);
    chunks.forEach((c, i) => {
      bot.sendMessage(
        msg.chat.id,
        `Паттерны (${i + 1}/${chunks.length}):\n${c}`,
      );
    });
  }
});

// --- user management ---

bot.onText(/\/adduser(?:\s+(.+))?/, (msg, match) => {
  if (!adminOnly(msg)) return;
  const raw = match[1]?.trim();
  if (!raw)
    return bot.sendMessage(msg.chat.id, "Использование: /adduser <user_id>");
  const id = Number(raw);
  if (!id || !Number.isInteger(id)) {
    return bot.sendMessage(
      msg.chat.id,
      "Нужен числовой user ID. Юзер может узнать свой через /myid.",
    );
  }
  if (userIds.includes(id)) {
    return bot.sendMessage(msg.chat.id, `${id} уже в списке.`);
  }
  userIds.push(id);
  saveUserIdsToEnv();
  bot.sendMessage(
    msg.chat.id,
    `Юзер ${id} добавлен. Слежу за ${userIds.length} юзерами.`,
  );
});

bot.onText(/\/deluser(?:\s+(.+))?/, (msg, match) => {
  if (!adminOnly(msg)) return;
  const raw = match[1]?.trim();
  if (!raw)
    return bot.sendMessage(msg.chat.id, "Использование: /deluser <user_id>");
  const id = Number(raw);
  const idx = userIds.indexOf(id);
  if (idx === -1) {
    return bot.sendMessage(msg.chat.id, `${id} не найден в списке.`);
  }
  userIds.splice(idx, 1);
  saveUserIdsToEnv();
  const status = userIds.length
    ? `Слежу за ${userIds.length} юзерами.`
    : "Список пуст — слежу за всеми.";
  bot.sendMessage(msg.chat.id, `Юзер ${id} удалён. ${status}`);
});

bot.onText(/\/users/, (msg) => {
  if (!adminOnly(msg)) return;
  if (!userIds.length) {
    return bot.sendMessage(
      msg.chat.id,
      "Список юзеров пуст — бот реагирует на всех.",
    );
  }
  bot.sendMessage(
    msg.chat.id,
    `Слежу за (${userIds.length}):\n${userIds.join("\n")}`,
  );
});

// --- main message handler ---

bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  if (!isTargetMessage(msg)) return;

  if (containsBadWords(msg.text)) {
    bot.sendMessage(msg.chat.id, `${userName(msg)}, не ругайся!`, {
      reply_to_message_id: msg.message_id,
    });
  }
});

console.log("Бот запущен!");
