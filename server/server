/* ═══════════════════════════════════════════════════════════════
   BASIKAL PORTAL — MULTIPLAYER SERVER (Node.js + Socket.io)
   ═══════════════════════════════════════════════════════════════ */

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { cleanUsername, createStorage, publicUser } = require("./storage");
const { buildDeck: cbBuildDeck, dealHands: cbDealHands, drawForSuit: cbDrawForSuit, rankValue: cbRankValue, applyHandLuck: cbApplyHandLuck, drawForSuitBiased: cbDrawForSuitBiased } = require("./deckUtils");
const { GACHA_CARDS, GACHA_RARITIES } = require("./gachaCards");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.ALLOWED_ORIGIN || (isProduction ? "" : "http://localhost:3000,http://127.0.0.1:3000"))
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
  console.error("ALLOWED_ORIGIN wajib diisi saat production.");
  process.exit(1);
}
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Socket.IO origin tidak diizinkan"));
    },
  },
});
const allowLocalFallback =
  process.env.ALLOW_LOCAL_DB_FALLBACK === "true" ||
  (!isProduction && process.env.ALLOW_LOCAL_DB_FALLBACK !== "false");

if (!hasDatabaseUrl && !allowLocalFallback) {
  console.error("DATABASE_URL wajib diisi saat production. Server tidak dijalankan agar tidak memakai database lokal.");
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!jwtSecret) {
  console.error("FATAL: JWT_SECRET is not set");
  process.exit(1);
}
const authSecret = jwtSecret;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "7d";

const pool = hasDatabaseUrl ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const storage = createStorage({
  pool,
  dataFile: path.join(__dirname, "data", "local-store.json"),
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Terlalu banyak percobaan. Coba lagi nanti." },
});

app.get("/cardbattle/deckUtils.js", (req, res) => {
  res.type("application/javascript").sendFile(path.join(__dirname, "deckUtils.js"));
});

function sendApiError(res, label, err, fallbackMessage) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }
  console.error(label, err);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

function issueAuthToken(user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username },
    authSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function readBearerToken(req) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return /^Bearer$/i.test(scheme) && token ? token : "";
}

async function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ success: false, error: "Token login diperlukan" });

  try {
    const payload = jwt.verify(token, authSecret);
    const username = cleanUsername(payload.username);
    if (!username) return res.status(401).json({ success: false, error: "Token login tidak valid" });
    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(401).json({ success: false, error: "User tidak ditemukan" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Token login tidak valid atau kedaluwarsa" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ success: false, error: "Akses admin diperlukan" });
  }
  next();
}

async function authenticateToken(token) {
  const payload = jwt.verify(token, authSecret);
  const username = cleanUsername(payload.username);
  if (!username) throw new Error("Token login tidak valid");
  const user = await storage.getUserByUsername(username);
  if (!user) throw new Error("User tidak ditemukan");
  return user;
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    socket.user = await authenticateToken(token || "");
    next();
  } catch (err) {
    next(new Error("Token login tidak valid atau kedaluwarsa"));
  }
});

function positiveInt(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function applyWalletAction(username, change) {
  return storage.applyWalletDelta(username, change);
}

const GACHA_COSTS = {
  coin_pull: { currency: "coins", 1: 50, 10: 450 },
  premium_pull: { currency: "gems", 1: 5, 10: 45 },
};

const SLOT_REWARDS = {
  "🍒": { gems: 30, coins: 0 },
  "🍋": { gems: 40, coins: 0 },
  "🍊": { gems: 60, coins: 0 },
  "🍇": { gems: 80, coins: 0 },
  "💵": { gems: 0, coins: 1000 },
  "💎": { gems: 300, coins: 0 },
  "⭐": { gems: 150, coins: 500 },
  "💀": { gems: 0, coins: 0 },
  "🎰": { gems: 1000, coins: 5000 },
};
const SLOT_WIN_SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "💵", "💎", "⭐"];
const SLOT_JACKPOT_CHANCE = 0.05;
const SLOT_WIN_CHANCE = 0.35;
const SLOT_ALLOWED_BETS = new Set([20, 50, 100, 200]);

function numberInRange(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function runtimeSlotProfile(slotProfile = {}) {
  return {
    jackpotChance: numberInRange(slotProfile.jackpotChance, SLOT_JACKPOT_CHANCE, 0, 0.20),
    winChance: numberInRange(slotProfile.winChance, SLOT_WIN_CHANCE, 0.05, 0.80),
    rewardMultiplier: numberInRange(slotProfile.rewardMultiplier, 1, 0.1, 5),
  };
}

function randomSlotSymbol() {
  const symbols = ["💀", "💀", "🍒", "🍒", "🍒", "🍋", "🍋", "🍋", "🍊", "🍊", "🍇", "🍇", "💵", "💎", "⭐", "🎰", "🎰", "🎰"];
  return symbols[Math.floor(Math.random() * symbols.length)];
}

function rollSlotSpin(slotProfile) {
  const profile = runtimeSlotProfile(slotProfile);
  let forcedSymbol = null;
  const roll = Math.random();
  if (roll < profile.jackpotChance) {
    forcedSymbol = "🎰";
  } else if (roll < profile.jackpotChance + profile.winChance) {
    forcedSymbol = SLOT_WIN_SYMBOLS[Math.floor(Math.random() * SLOT_WIN_SYMBOLS.length)];
  }

  const reels = Array.from({ length: 5 }, () => forcedSymbol || randomSlotSymbol());
  const allSame = reels.every((symbol) => symbol === reels[0]);
  const symbol = reels[0];
  const baseReward = allSame ? SLOT_REWARDS[symbol] || { gems: 0, coins: 0 } : { gems: 0, coins: 0 };
  const reward = {
    gems: Math.floor(baseReward.gems * profile.rewardMultiplier),
    coins: Math.floor(baseReward.coins * profile.rewardMultiplier),
  };
  return {
    reels,
    reward,
    jackpot: allSame && symbol === "🎰",
    win: allSame && symbol !== "💀",
    freeSpinsAwarded: allSame && symbol === "🎰" ? 3 : allSame && symbol !== "💀" ? 1 : 0,
  };
}

const GACHA_PROFILE_DEFAULTS = {
  rates: {
    common: 0.595,
    rare: 0.25,
    epic: 0.10,
    legendary: 0.04,
    mythic: 0.015,
  },
  pityThreshold: 50,
};
const GACHA_RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

function normalizeGachaRateWeights(rates) {
  const weights = {};
  let total = 0;
  GACHA_RARITIES.forEach((rarity) => {
    const weight = numberInRange(rates && rates[rarity], GACHA_PROFILE_DEFAULTS.rates[rarity], 0, 1);
    weights[rarity] = weight;
    total += weight;
  });
  if (total <= 0) return { ...GACHA_PROFILE_DEFAULTS.rates };
  GACHA_RARITIES.forEach((rarity) => {
    weights[rarity] /= total;
  });
  return weights;
}

function runtimeGachaProfile(gachaProfile = {}) {
  return {
    rates: normalizeGachaRateWeights(gachaProfile.rates),
    pityThreshold: Math.trunc(numberInRange(
      gachaProfile.pityThreshold,
      GACHA_PROFILE_DEFAULTS.pityThreshold,
      10,
      100
    )),
  };
}

function applyPremiumGachaBoost(rates, isPremium) {
  if (!isPremium) return { ...rates };
  const boosted = { ...rates, mythic: rates.mythic * 2 };
  return normalizeGachaRateWeights(boosted);
}

function applySoftPity(rates, pityCount, pityThreshold) {
  const nextPull = Math.max(0, Math.trunc(Number(pityCount) || 0)) + 1;
  const softStart = Math.ceil(pityThreshold * 0.8);
  if (nextPull < softStart || nextPull >= pityThreshold) return { ...rates };

  const span = Math.max(1, pityThreshold - softStart);
  const progress = Math.min(1, Math.max(0, (nextPull - softStart + 1) / span));
  const boostedMythic = rates.mythic + (1 - rates.mythic) * progress * 0.5;
  const nonMythicMass = Math.max(0, 1 - rates.mythic);
  const nextRates = { ...rates };

  if (nonMythicMass > 0) {
    const nonMythicScale = Math.max(0, 1 - boostedMythic) / nonMythicMass;
    ["common", "rare", "epic", "legendary"].forEach((rarity) => {
      nextRates[rarity] = rates[rarity] * nonMythicScale;
    });
  }

  nextRates.mythic = boostedMythic;

  return normalizeGachaRateWeights(nextRates);
}

function pickWeightedRarity(rates) {
  const roll = Math.random();
  let cursor = 0;
  for (const rarity of GACHA_RARITIES) {
    cursor += rates[rarity];
    if (roll <= cursor) return rarity;
  }
  return "common";
}

function pickRandomCard(rarity) {
  const candidates = GACHA_CARDS.filter((card) => card.rarity === rarity);
  return candidates[Math.floor(Math.random() * candidates.length)] || GACHA_CARDS[0];
}

function rollGachaCard(gachaProfile, pityCount, isPremium) {
  const profile = runtimeGachaProfile(gachaProfile);
  const currentPity = Math.max(0, Math.trunc(Number(pityCount) || 0));
  const nextPull = currentPity + 1;
  const premiumRates = applyPremiumGachaBoost(profile.rates, isPremium);
  const hardPityRates = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 1 };
  const rates = nextPull >= profile.pityThreshold
    ? hardPityRates
    : applySoftPity(premiumRates, currentPity, profile.pityThreshold);
  const rarity = pickWeightedRarity(rates);
  const nextPity = rarity === "mythic" ? 0 : nextPull;

  return {
    card: pickRandomCard(rarity),
    rarity,
    pity: nextPity,
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    storage: storage.mode,
    databaseConfigured: storage.mode === "postgres",
  });
});

app.post("/api/register", authRateLimiter, async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || "");
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "ISI SEMUA DATA!" });
  }

  try {
    const user = await storage.registerUser(username, password);
    res.json({ success: true, user: publicUser(user), token: issueAuthToken(user) });
  } catch (err) {
    sendApiError(res, "register error", err, "Register gagal di server");
  }
});

app.post("/api/login", authRateLimiter, async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || "");
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "ISI SEMUA DATA!" });
  }

  try {
    const user = await storage.getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: "LOGIN GAGAL! Periksa kembali username dan password." });
    }
    res.json({ success: true, user: publicUser(user), token: issueAuthToken(user) });
  } catch (err) {
    sendApiError(res, "login error", err, "Login gagal di server");
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.get("/api/me/slot-profile", requireAuth, async (req, res) => {
  try {
    const slotProfile = await storage.getSlotProfile(req.user.username);
    res.json({ username: req.user.username, slotProfile });
  } catch (err) {
    sendApiError(res, "me slot profile error", err, "Gagal memuat slot profile");
  }
});

app.get("/api/me/gacha-profile", requireAuth, async (req, res) => {
  try {
    const gachaProfile = await storage.getGachaProfile(req.user.username);
    const pity = await storage.getGachaPity(req.user.username);
    res.json({ username: req.user.username, gachaProfile, pity });
  } catch (err) {
    sendApiError(res, "me gacha profile error", err, "Gagal memuat gacha profile");
  }
});

app.get("/api/me/cardbattle-profile", requireAuth, async (req, res) => {
  try {
    const cardBattleProfile = await storage.getCardBattleProfile(req.user.username);
    res.json({ username: req.user.username, cardBattleProfile });
  } catch (err) {
    sendApiError(res, "me cardbattle profile error", err, "Gagal memuat cardbattle profile");
  }
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (req, res) => {
  try {
    const overview = await storage.getAdminOverview();
    res.json({ success: true, overview });
  } catch (err) {
    sendApiError(res, "admin overview error", err, "Gagal memuat dashboard admin");
  }
});

app.get("/api/admin/slot-profile", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.query.username);
  if (!username) return res.status(400).json({ error: "Username is required" });

  try {
    const slotProfile = await storage.getSlotProfile(username);
    res.json({ username, slotProfile });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "User not found" });
    sendApiError(res, "admin slot profile get error", err, "Gagal memuat slot profile");
  }
});

app.patch("/api/admin/slot-profile", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.body.username);
  if (!username) return res.status(400).json({ error: "Username is required" });

  try {
    await storage.setSlotProfile(username, req.body.slotProfile);
    const slotProfile = await storage.getSlotProfile(username);
    res.json({ success: true, username, slotProfile });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "User not found" });
    res.status(400).json({ error: err.message || "Invalid slot profile" });
  }
});

app.get("/api/admin/gacha-profile", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.query.username);
  if (!username) return res.status(400).json({ error: "Username is required" });

  try {
    const gachaProfile = await storage.getGachaProfile(username);
    const pity = await storage.getGachaPity(username);
    res.json({ username, gachaProfile, pity });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "User not found" });
    sendApiError(res, "admin gacha profile get error", err, "Gagal memuat gacha profile");
  }
});

app.patch("/api/admin/gacha-profile", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.body.username);
  if (!username) return res.status(400).json({ error: "Username is required" });

  try {
    await storage.setGachaProfile(username, req.body.gachaProfile);
    const gachaProfile = await storage.getGachaProfile(username);
    const pity = await storage.getGachaPity(username);
    res.json({ success: true, username, gachaProfile, pity });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "User not found" });
    res.status(400).json({ error: err.message || "Invalid gacha profile" });
  }
});

app.get("/api/admin/cardbattle-profile", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.query.username);
  if (!username) return res.status(400).json({ error: "Username is required" });

  try {
    const cardBattleProfile = await storage.getCardBattleProfile(username);
    res.json({ username, cardBattleProfile });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "User not found" });
    sendApiError(res, "admin cardbattle profile get error", err, "Gagal memuat cardbattle profile");
  }
});

app.patch("/api/admin/cardbattle-profile", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.body.username);
  if (!username) return res.status(400).json({ error: "Username is required" });

  try {
    await storage.setCardBattleProfile(username, req.body.cardBattleProfile);
    const cardBattleProfile = await storage.getCardBattleProfile(username);
    res.json({ success: true, username, cardBattleProfile });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: "User not found" });
    res.status(400).json({ error: err.message || "Invalid cardbattle profile" });
  }
});

app.delete("/api/admin/users/:username", requireAuth, requireAdmin, async (req, res) => {
  const username = cleanUsername(req.params.username);
  if (!username) return res.status(400).json({ success: false, error: "Username is required" });
  if (username.toLowerCase() === req.user.username.toLowerCase()) {
    return res.status(400).json({ success: false, error: "Tidak bisa menghapus akun admin yang sedang login" });
  }

  try {
    const result = await storage.deleteUser(username);
    res.json({ success: true, username: result.username });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ success: false, error: "User tidak ditemukan" });
    if (err.statusCode === 400) return res.status(400).json({ success: false, error: err.message });
    sendApiError(res, "admin delete user error", err, "Gagal menghapus user");
  }
});

app.post("/api/shop/exchange", requireAuth, async (req, res) => {
  const action = String(req.body.action || "");
  const coins = positiveInt(req.body.coins);
  if (action !== "coin_to_gems" || !coins) {
    return res.status(400).json({ success: false, error: "Aksi shop tidak valid" });
  }

  const gems = Math.floor((coins / 100) * 10);
  if (gems <= 0) return res.status(400).json({ success: false, error: "Jumlah koin terlalu kecil" });

  try {
    const user = await applyWalletAction(req.user.username, {
      coinsDelta: -coins,
      gemsDelta: gems,
      type: "coin_to_gems",
      note: `Tukar ${coins} koin menjadi ${gems} gems`,
    });
    res.json({ success: true, user: publicUser(user), delta: { coins: -coins, gems } });
  } catch (err) {
    sendApiError(res, "shop exchange error", err, "Gagal menukar koin");
  }
});

app.post("/api/gacha/pull", requireAuth, async (req, res) => {
  const action = String(req.body.action || "");
  const count = positiveInt(req.body.count);
  const config = GACHA_COSTS[action];
  if (!config || ![1, 10].includes(count)) {
    return res.status(400).json({ success: false, error: "Aksi gacha tidak valid" });
  }

  const cost = config[count];
  const change = {
    type: action === "premium_pull" ? "gacha_premium_pull" : "gacha_coin_pull",
    note: `${count}x gacha pull`,
    gemsDelta: config.currency === "gems" ? -cost : 0,
    coinsDelta: config.currency === "coins" ? -cost : 0,
  };

  try {
    const gachaProfile = await storage.getGachaProfile(req.user.username);
    let pity = await storage.getGachaPity(req.user.username);
    const user = await applyWalletAction(req.user.username, change);
    const cards = [];
    const isPremium = action === "premium_pull";
    for (let i = 0; i < count; i++) {
      const result = rollGachaCard(gachaProfile, pity, isPremium);
      pity = result.pity;
      cards.push(result);
    }
    await storage.setGachaPity(req.user.username, pity);
    res.json({
      success: true,
      user: publicUser(user),
      cost,
      currency: config.currency,
      cards,
      pityAfter: pity,
    });
  } catch (err) {
    sendApiError(res, "gacha pull error", err, "Gagal memproses gacha");
  }
});

app.post("/api/slot/spin", requireAuth, async (req, res) => {
  const action = String(req.body.action || "");
  const bet = positiveInt(req.body.bet);
  if (action !== "spin" || !SLOT_ALLOWED_BETS.has(bet)) {
    return res.status(400).json({ success: false, error: "Aksi slot tidak valid" });
  }

  try {
    const slotProfile = await storage.getSlotProfile(req.user.username);
    const result = rollSlotSpin(slotProfile);
    const user = await applyWalletAction(req.user.username, {
      gemsDelta: result.reward.gems - bet,
      coinsDelta: result.reward.coins,
      type: "slot_spin",
      note: `Spin slot bet ${bet}`,
    });
    res.json({ success: true, user: publicUser(user), result });
  } catch (err) {
    sendApiError(res, "slot spin error", err, "Gagal memproses spin");
  }
});

app.post("/api/cardbattle/reward", requireAuth, async (req, res) => {
  const action = String(req.body.action || "");
  let change = null;

  if (action === "entry_fee") {
    change = {
      gemsDelta: -CB_CONFIG.ENTRY_FEE_GEMS,
      type: "cardbattle_entry_fee",
      note: "Entry fee Card Battle",
    };
  } else if (action === "single_reward") {
    const prof = await storage.getCardBattleProfile(req.user.username);
    const mult = (prof && prof.rewardMultiplier) || 1;
    change = {
      gemsDelta: Math.round(CB_CONFIG.SINGLE_PLAYER_WIN_GEMS * mult),
      type: "cardbattle_single_reward",
      note: "Reward Cangkul single player",
    };
  } else if (action === "surrender_refund") {
    change = {
      gemsDelta: 0,
      type: "cardbattle_surrender",
      note: "Refund surrender Card Battle",
    };
  }

  if (!change) return res.status(400).json({ success: false, error: "Aksi Card Battle tidak valid" });

  try {
    const user = await applyWalletAction(req.user.username, change);
    res.json({ success: true, user: publicUser(user), delta: { gems: change.gemsDelta } });
  } catch (err) {
    sendApiError(res, "cardbattle reward error", err, "Gagal memproses Card Battle");
  }
});

app.post("/api/daily-claim", requireAuth, async (req, res) => {
  try {
    const result = await storage.claimDaily(req.user.username);
    res.json({ success: true, user: publicUser(result.user), message: result.message });
  } catch (err) {
    sendApiError(res, "daily claim error", err, "Gagal klaim daily reward");
  }
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/* ═══════════════════════════════════════════════════════════════
   CARD BATTLE ROYALE — MULTIPLAYER
   ═══════════════════════════════════════════════════════════════ */

const cbRooms = {}; // roomCode -> room state
const CB_CONFIG = {
  STARTING_CHIPS: 1000,
  HAND_SIZE: 5,
  BASE_ANTE: 10,
  ANTE_INCREMENT: 5,
  ANTE_INCREASE_EVERY: 3,
  ROUND_TIMER: 15,
  MAX_ROUNDS: 20,
  ENTRY_FEE_GEMS: 50,
  SINGLE_PLAYER_WIN_GEMS: 100,
  PAYOUT_RATIO: 0.5,
  DEAL_COUNT: 7,
};

function cbBroadcast(roomCode) {
  const r = cbRooms[roomCode];
  if (!r) return;

  const basePayload = {
    phase: r.phase,
    round: r.round,
    currentSuit: r.currentSuit || null,
    pileCount: r.pileCount || 0,
    currentLeaderId: r.currentLeaderId || null,
    currentTurnId: (r.turnOrder && r.turnOrder.length) ? (r.turnOrder[r.turnIndex] || null) : null,
    finishOrder: r.finishOrder || [],
    pot: 0, ante: 0, carryOver: false, // kept for compat
  };

  const playersPublic = r.players.map(p => ({
    id: p.id,
    username: p.username,
    chips: p.chips,
    handCount: p.hand.length,
    picked: p.picked,
    pickedCard: (r.phase === "resolving" || r.phase === "gameover") ? p.pickedCard : null,
    eliminated: p.eliminated,
    host: p.host,
    finishRank: p.finishRank || null,
  }));

  r.players.forEach(player => {
    const personal = {
      ...basePayload,
      timeLeft: r.timerLeft || 0,
      players: playersPublic.map(pp =>
        pp.id === player.id ? { ...pp, hand: player.hand } : pp
      ),
    };
    io.to(player.id).emit("cbRoomState", personal);
  });
}

function cbCheckEnd(room) {
  const remaining = room.players.filter(p => !p.eliminated);
  return remaining.length <= 1;
}

function cbRanked(room) {
  return room.players.slice().sort((a, b) => {
    const ra = a.finishRank != null ? a.finishRank : 999;
    const rb = b.finishRank != null ? b.finishRank : 999;
    return ra - rb;
  });
}
function clearRoomTimer(room) {
  if (room.timerId) {
    clearInterval(room.timerId);
    room.timerId = null;
  }
}
function removeLobbyPlayer(room, socketId) {
  clearRoomTimer(room);
  room.players = room.players.filter(p => p.id !== socketId);
  if (room.players.length === 0) {
    delete cbRooms[room.code];
    return;
  }
  if (!room.players.some(p => p.host)) room.players[0].host = true;
  cbBroadcast(room.code);
}
// Tangani pemain keluar saat game aktif (disconnect / surrender / leave).
// Cangkul = turn-based, jadi kita harus memajukan giliran bila yang keluar
// sedang gilirannya, atau memilih leader baru bila leader keluar sebelum lead.
function cbHandleExit(room, player) {
  if (!player || player.eliminated) return;

  const inTrick = room.phase === "leading" || room.phase === "following";
  const wasTurn = inTrick && room.turnOrder && room.turnOrder[room.turnIndex] === player.id;
  const wasLeader = room.currentLeaderId === player.id;
  const noCardLed = !room.currentSuit;
  const alreadyActed = player.picked != null && player.picked !== "skip";

  player.eliminated = true;
  // Pertahankan kartu yang SUDAH dimainkan trick ini agar tetap ikut resolusi;
  // hanya kosongkan bila pemain belum sempat beraksi.
  if (!alreadyActed) {
    player.picked = null;
    player.pickedCard = null;
  }
  io.to(room.code).emit("cbPlayerSurrendered", { playerId: player.id, username: player.username });

  const aliveNow = room.players.filter(p => !p.eliminated);
  if (aliveNow.length <= 1) {
    clearRoomTimer(room);
    setTimeout(() => cbEndGame(room), 1500);
    return;
  }

  if (inTrick) {
    if (wasLeader && noCardLed) {
      // Leader keluar sebelum melempar → pilih leader baru & ulang trick
      room.currentLeaderId = aliveNow[0].id;
      clearRoomTimer(room);
      return cbStartRound(room);
    }
    if (wasTurn) {
      // Sedang gilirannya → maju (cbAdvanceTurn melewati yang eliminated)
      return cbAdvanceTurn(room);
    }
  }
  cbBroadcast(room.code);
}
function eliminatePlayer(room, socketId) {
  const player = room.players.find(p => p.id === socketId);
  cbHandleExit(room, player);
}
function handleRoomExit(socket) {
  const code = socket.cbRoom;
  const room = cbRooms[code];
  if (!room) return;

  if (room.phase === "lobby") {
    removeLobbyPlayer(room, socket.id);
  } else {
    eliminatePlayer(room, socket.id);
  }
}

/* ── CB Socket Handlers ── */
io.on("connection", (socket) => {
  // (Dragon Tiger handlers are above)

  /* Card Battle */
  socket.on("cbCreateRoom", (_payload, cb) => {
    const username = socket.user.username;
    const code = generateRoomCode();
    cbRooms[code] = {
      code,
      players: [{
        id: socket.id,
        username,
        chips: CB_CONFIG.STARTING_CHIPS,
        hand: [],
        picked: null,
        pickedCard: null,
        eliminated: false,
        host: true,
        finishRank: null,
      }],
      round: 1,
      pot: 0,
      ante: CB_CONFIG.BASE_ANTE,
      carryOver: false,
      phase: "lobby",
      pile: [],
      pileCount: 0,
      currentSuit: null,
      currentLeaderId: null,
      finishOrder: [],
      skipCount: 0,
      turnOrder: [],
      turnIndex: 0,
      timerId: null,
      timerLeft: 0,
    };
    socket.join(code);
    socket.cbRoom = code;
    cb({ success: true, roomCode: code });
    cbBroadcast(code);
  });

  socket.on("cbJoinRoom", ({ roomCode }, cb) => {
    const username = socket.user.username;
    const room = cbRooms[roomCode.toUpperCase()];
    if (!room) return cb({ success: false, error: "Room tidak ditemukan" });
    if (room.players.length >= 6) return cb({ success: false, error: "Room penuh (max 6)" });
    if (room.phase !== "lobby") return cb({ success: false, error: "Game sudah dimulai" });
    if (room.players.some(p => p.username === username)) return cb({ success: false, error: "Username sudah ada di room" });

    room.players.push({
      id: socket.id,
      username,
      chips: CB_CONFIG.STARTING_CHIPS,
      hand: [],
      picked: null,
      pickedCard: null,
      eliminated: false,
      host: false,
      finishRank: null,
    });
    socket.join(roomCode.toUpperCase());
    socket.cbRoom = roomCode.toUpperCase();
    cb({ success: true });
    cbBroadcast(roomCode.toUpperCase());
  });

  socket.on("cbStartGame", async ({ roomCode }) => {
    const code = (roomCode || socket.cbRoom || "").toUpperCase();
    const room = cbRooms[code];
    if (!room || room.phase !== "lobby") return;
    const host = room.players.find(p => p.host);
    if (!host || host.id !== socket.id) return;
    if (room.players.length < 2) return;

    const dealt = cbDealHands(cbBuildDeck(), room.players.length, CB_CONFIG.DEAL_COUNT);

    room.players.forEach((p, i) => {
      p.hand = dealt.hands[i];
      p.picked = null; p.pickedCard = null;
      p.eliminated = false;
      p.finishRank = null;
      p.chips = CB_CONFIG.STARTING_CHIPS;
    });

    room.pile = dealt.pile;

    for (const p of room.players) {
      const prof = await storage.getCardBattleProfile(p.username).catch(() => null);
      p.luck = prof || { dealLuck: 0.5, cangkulLuck: 0.5, rewardMultiplier: 1 };
    }
    room.players.forEach((p, i) => cbApplyHandLuck(dealt.hands[i], room.pile, p.luck.dealLuck));
    room.pileCount = room.pile.length;

    room.currentSuit = null;
    room.finishOrder = [];
    room.skipCount = 0;
    room.turnOrder = [];
    room.turnIndex = 0;
    room.round = 1;
    room.pot = 0;
    room.carryOver = false;

    // Find 7♦ leader
    let leaderId = null;
    for (const p of room.players) {
      if (p.hand.some(c => c.rank === "7" && c.suit === "♦")) { leaderId = p.id; break; }
    }
    if (!leaderId) {
      let minVal = Infinity;
      room.players.forEach(p => p.hand.forEach(c => {
        if (c.value < minVal) { minVal = c.value; leaderId = p.id; }
      }));
    }
    room.currentLeaderId = leaderId;

    io.to(code).emit("cbGameStart");
    cbStartRound(room);
  });

  socket.on("cbPlayCard", ({ roomCode, cardIdx }) => {
    const code = (roomCode || socket.cbRoom || "").toUpperCase();
    const room = cbRooms[code];
    if (!room) return;
    if (room.phase !== "leading" && room.phase !== "following") return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p || p.eliminated || p.picked != null) return;
    if (room.phase === "leading" && p.id !== room.currentLeaderId) return;
    if (!room.turnOrder || room.turnOrder[room.turnIndex] !== p.id) return;
    cbHandlePlayCard(room, p, cardIdx);
  });

  socket.on("cbCangkul", ({ roomCode }) => {
    const code = (roomCode || socket.cbRoom || "").toUpperCase();
    const room = cbRooms[code];
    if (!room || room.phase !== "following") return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p || p.eliminated || p.picked != null) return;
    if (!room.turnOrder || room.turnOrder[room.turnIndex] !== p.id) return;
    if (p.hand.some(c => c.suit === room.currentSuit)) {
      io.to(p.id).emit("cbError", `Kamu punya suit ${room.currentSuit}!`);
      return;
    }
    cbHandleCangkul(room, p);
  });

  /* Player menyerah saat game aktif */
  socket.on("cbSurrender", ({ roomCode }) => {
    const code = (roomCode || socket.cbRoom || "").toUpperCase();
    const room = cbRooms[code];
    if (!room || room.phase === "lobby" || room.phase === "gameover") return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p || p.eliminated) return;
    cbHandleExit(room, p);
  });

  socket.on("cbLeaveRoom", () => {
    handleRoomExit(socket);
  });

  socket.on("disconnect", () => {
    handleRoomExit(socket);
  });
});

function cbStartRound(room) {
  room.players.forEach(p => { p.picked = null; p.pickedCard = null; });
  room.currentSuit = null;
  room.skipCount = 0;
  room.phase = "leading";

  const active = room.players.filter(p => !p.eliminated);
  if (active.length <= 1) return cbEndGame(room);

  const leaderIdx = active.findIndex(p => p.id === room.currentLeaderId);
  const ordered = leaderIdx >= 0
    ? [...active.slice(leaderIdx), ...active.slice(0, leaderIdx)]
    : active;
  room.turnOrder = ordered.map(p => p.id);
  room.turnIndex = 0;

  room.timerLeft = CB_CONFIG.ROUND_TIMER;
  cbBroadcast(room.code);
  cbAdvanceTurn(room);
}

function cbAdvanceTurn(room) {
  while (room.turnIndex < room.turnOrder.length) {
    const id = room.turnOrder[room.turnIndex];
    const p = room.players.find(x => x.id === id);
    if (p && !p.eliminated && p.picked == null) break;
    room.turnIndex++;
  }

  if (room.turnIndex >= room.turnOrder.length) {
    clearRoomTimer(room);
    return cbResolve(room);
  }

  clearRoomTimer(room);
  room.timerLeft = CB_CONFIG.ROUND_TIMER;
  cbBroadcast(room.code);

  room.timerId = setInterval(() => {
    room.timerLeft--;
    if (room.timerLeft <= 0) {
      clearInterval(room.timerId); room.timerId = null;
      const id = room.turnOrder[room.turnIndex];
      const p = room.players.find(x => x.id === id);
      if (p && !p.eliminated && p.picked == null) {
        const hasSuit = room.currentSuit && p.hand.some(c => c.suit === room.currentSuit);
        if (room.phase === "following" && !hasSuit) {
          cbHandleCangkul(room, p);
        } else {
          const playable = p.hand
            .map((c, i) => ({ c, i }))
            .filter(x => room.phase === "leading" || x.c.suit === room.currentSuit);
          if (playable.length > 0) {
            const pick = playable[Math.floor(Math.random() * playable.length)];
            cbHandlePlayCard(room, p, pick.i);
          } else {
            cbSkipPlayer(room, p);
          }
        }
      }
    }
  }, 1000);
}

function cbHandlePlayCard(room, player, cardIdx) {
  if (cardIdx < 0 || cardIdx >= player.hand.length) return;
  const card = player.hand[cardIdx];

  if (room.phase === "following" && card.suit !== room.currentSuit) {
    io.to(player.id).emit("cbError", `Harus buang suit ${room.currentSuit}!`);
    return;
  }

  player.hand.splice(cardIdx, 1);
  player.pickedCard = card;
  player.picked = cardIdx;

  if (room.phase === "leading") {
    room.currentSuit = card.suit;
    room.phase = "following";
  }

  if (player.hand.length === 0 && !player.finishRank) {
    player.eliminated = true;
    player.finishRank = room.finishOrder.length + 1;
    room.finishOrder.push(player.id);
  }

  io.to(room.code).emit("cbReveal", {
    playerId: player.id,
    card,
    currentSuit: room.currentSuit,
    currentTrick: room.round,
  });

  room.turnIndex++;
  cbAdvanceTurn(room);
}

function cbHandleCangkul(room, player) {
  const luck = (player.luck && player.luck.cangkulLuck) != null ? player.luck.cangkulLuck : 0.5;
  const result = cbDrawForSuitBiased(room.pile, room.currentSuit, luck);
  room.pileCount = room.pile.length;

  // Kirim kartu drawn+matched secara privat ke pemain ybs
  io.to(player.id).emit("cbCardDrawn", {
    toPlayerId: player.id,
    drawn: result.drawn,
    matched: result.matched,
    pileCount: room.pileCount,
  });

  // Broadcast pileCount update tanpa bocorkan kartu ke lawan
  room.players.forEach(p => {
    if (p.id !== player.id) {
      io.to(p.id).emit("cbCardDrawn", {
        toPlayerId: player.id,
        drawn: null,
        matched: null,
        pileCount: room.pileCount,
      });
    }
  });

  if (result.matched) {
    player.hand.push(...result.drawn, result.matched);
    // Cari index matched card (kartu terakhir yang ditambahkan)
    const matchedIdx = player.hand.length - 1;
    cbHandlePlayCard(room, player, matchedIdx);
  } else {
    cbSkipPlayer(room, player);
  }
}

function cbSkipPlayer(room, player) {
  player.picked = "skip";
  player.pickedCard = null;
  room.skipCount = (room.skipCount || 0) + 1;
  io.to(room.code).emit("cbReveal", {
    playerId: player.id,
    card: null,
    currentSuit: room.currentSuit,
    currentTrick: room.round,
    skipped: true,
  });
  room.turnIndex++;
  cbAdvanceTurn(room);
}

function cbResolve(room) {
  room.phase = "resolving";

  const nonSkippers = room.players.filter(p => p.picked !== "skip" && p.pickedCard);
  const suitPlayed = nonSkippers.filter(p => p.pickedCard.suit === room.currentSuit);

  if (suitPlayed.length === 0) {
    room.skipCount = 0;
    io.to(room.code).emit("cbRoundEnd", {
      winners: [], isTie: true,
      message: "Semua skip — trick batal. Leader tetap.",
      finishOrder: room.finishOrder,
    });
    setTimeout(() => {
      if (cbCheckEnd(room)) return cbEndGame(room);
      cbStartRound(room);
    }, 3000);
    return;
  }

  const maxVal = Math.max(...suitPlayed.map(p => cbRankValue(p.pickedCard)));
  const winner = suitPlayed.find(p => cbRankValue(p.pickedCard) === maxVal);

  let nextLeaderId = winner.id;
  if (winner.eliminated) {
    const idx = room.turnOrder.indexOf(winner.id);
    for (let i = 1; i <= room.turnOrder.length; i++) {
      const cand = room.players.find(
        p => p.id === room.turnOrder[(idx + i) % room.turnOrder.length] && !p.eliminated
      );
      if (cand) { nextLeaderId = cand.id; break; }
    }
  }
  room.currentLeaderId = nextLeaderId;
  room.round++;

  io.to(room.code).emit("cbRoundEnd", {
    winners: [winner.id],
    isTie: false,
    message: `${winner.username} menang trick #${room.round - 1}!`,
    finishOrder: room.finishOrder,
    newLeaderId: nextLeaderId,
  });

  setTimeout(() => {
    if (cbCheckEnd(room)) return cbEndGame(room);
    cbStartRound(room);
  }, 3500);
}

async function cbEndGame(room) {
  if (room.phase === "gameover") return;
  clearRoomTimer(room);
  room.phase = "gameover";

  const remaining = room.players.filter(p => !p.eliminated && !p.finishRank);
  remaining.forEach(p => {
    p.finishRank = room.finishOrder.length + 1;
    room.finishOrder.push(p.id);
    p.eliminated = true;
  });

  const ranked = cbRanked(room);
  const winner = ranked[0];
  const roomCode = room.code || "";
  let paidReward = 0;

  try {
    const mult = (winner.luck && winner.luck.rewardMultiplier) || 1;
    await applyWalletAction(winner.username, {
      gemsDelta: Math.round(CB_CONFIG.SINGLE_PLAYER_WIN_GEMS * mult),
      type: "cardbattle_multi_reward",
      note: "Reward Cangkul multiplayer",
    });
    paidReward = Math.round(CB_CONFIG.SINGLE_PLAYER_WIN_GEMS * mult);
  } catch (err) {
    console.error("cangkul multiplayer payout error", err);
  }

  room.players.forEach(p => {
    const gemsReward = p.id === winner.id ? paidReward : 0;
    io.to(p.id).emit("cbGameOver", {
      winner: { id: winner.id, username: winner.username },
      yourChips: p.chips,
      gemsReward,
      finishOrder: room.finishOrder,
      finalRanking: ranked.map(r => ({
        id: r.id, username: r.username,
        chips: r.chips, finishRank: r.finishRank,
      })),
    });
  });

  setTimeout(() => { delete cbRooms[roomCode]; }, 300000);
}

/* ═══════════════════════════════════════════════════════════════
   SERVER START
   ═══════════════════════════════════════════════════════════════ */

const PORT = process.env.PORT || 3000;
async function startServer() {
  if (storage.mode === "postgres") {
    await pool.query("SELECT 1");
  }

  server.listen(PORT, () => {
    console.log(`BASIKAL server running on port ${PORT}`);
    if (storage.mode === "postgres") {
      console.log("Storage: PostgreSQL (DATABASE_URL aktif)");
    } else {
      console.log(`Storage: local JSON (${storage.dataFile})`);
      console.log("DATABASE_URL kosong, jadi server memakai database lokal khusus development.");
    }
  });
}

startServer().catch((err) => {
  console.error("Server gagal start:", err.message);
  process.exit(1);
});
