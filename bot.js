require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

// ---- config ----

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN не задан! Создай файл .env с токеном.");
  process.exit(1);
}

const CHAT_ID = process.env.CHAT_ID ? Number(process.env.CHAT_ID) : null;
const USER_IDS = process.env.USER_IDS
  ? process.env.USER_IDS.split(",").map((id) => Number(id.trim()))
  : [];

// ---- load bad words from txt ----

const badPatterns = fs
  .readFileSync(path.join(__dirname, "bad_words.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

console.log(`Загружено ${badPatterns.length} паттернов плохих слов.`);
if (CHAT_ID) console.log(`Слежу за чатом: ${CHAT_ID}`);
else console.log("CHAT_ID не задан — реагирую во всех чатах.");
if (USER_IDS.length) console.log(`Слежу за юзерами: ${USER_IDS.join(", ")}`);
else console.log("USER_IDS не заданы — реагирую на всех юзеров.");

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
  if (USER_IDS.length && !USER_IDS.includes(msg.from.id)) return false;
  return true;
}

// ---- bot ----

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привет! Я слежу за чистотой речи. Не ругайся!");
});

bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  if (!isTargetMessage(msg)) return;

  if (containsBadWords(msg.text)) {
    bot.sendMessage(msg.chat.id, "Не ругайся!", {
      reply_to_message_id: msg.message_id,
    });
  }
});

console.log("Бот запущен!");
