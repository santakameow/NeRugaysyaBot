require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { badPatterns } = require("./bad_words.json");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN не задан! Создай файл .env с токеном.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// ---- helpers ----

/**
 * Нормализует текст: приводит к нижнему регистру,
 * заменяет частые "маскировки" символов на буквы.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[её]/g, "е") // ё -> е
    .replace(/0/g, "о")
    .replace(/1/g, "и")
    .replace(/3/g, "з")
    .replace(/4/g, "ч")
    .replace(/@/g, "а")
    .replace(/\$/g, "с")
    .replace(/\*/g, "")
    .replace(/\.\-/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Проверяет, содержит ли текст плохие слова.
 * Возвращает true если найдено совпадение.
 */
function containsBadWords(text) {
  const normalized = normalize(text);
  return badPatterns.some((pattern) =>
    normalized.includes(pattern.replace(/ё/g, "е")),
  );
}

// ---- bot handlers ----

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привет! Я слежу за чистотой речи в этом чате. Не ругайся!",
  );
});

bot.on("message", (msg) => {
  if (!msg.text) return;

  // Не реагируем на команды /start и т.п.
  if (msg.text.startsWith("/")) return;

  if (containsBadWords(msg.text)) {
    bot.sendMessage(msg.chat.id, "Не ругайся!", {
      reply_to_message_id: msg.message_id,
    });
  }
});

console.log("Бот запущен! Ожидаю сообщения...");
