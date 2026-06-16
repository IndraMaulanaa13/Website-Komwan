const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function cleanUsername(username) {
  return String(username || "").trim();
}

function isSeedAdminUsername(username) {
  const adminUsername = cleanUsername(process.env.ADMIN_USERNAME);
  return Boolean(adminUsername) && cleanUsername(username).toLowerCase() === adminUsername.toLowerCase();
}

function publicUser(row) {
  return {
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    joinedAt: Number(row.joined_at),
    gems: row.is_admin ? 999999999 : Number(row.gems),
    coins: row.is_admin ? 999999999 : Number(row.coins),
    fruit: Number(row.fruit),
    lastDailyClaim: Number(row.last_daily_claim),
    dailyStreak: Number(row.daily_streak),
  };
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
}

const SLOT_PROFILE_DEFAULTS = Object.freeze({
  jackpotChance: 0.05,
  winChance: 0.35,
  rewardMultiplier: 1.0,
  pityThreshold: 50,
});

const GACHA_RATE_KEYS = ["common", "rare", "epic", "legendary", "mythic"];
const GACHA_PROFILE_DEFAULTS = Object.freeze({
  rates: Object.freeze({
    common: 0.595,
    rare: 0.25,
    epic: 0.10,
    legendary: 0.04,
    mythic: 0.015,
  }),
  pityThreshold: 50,
});

function defaultSlotProfile() {
  return { ...SLOT_PROFILE_DEFAULTS };
}

function defaultGachaProfile() {
  return {
    rates: { ...GACHA_PROFILE_DEFAULTS.rates },
    pityThreshold: GACHA_PROFILE_DEFAULTS.pityThreshold,
  };
}

const CARDBATTLE_PROFILE_DEFAULTS = Object.freeze({
  dealLuck: 0.5,
  cangkulLuck: 0.5,
  rewardMultiplier: 1.0,
});

function defaultCardBattleProfile() {
  return { ...CARDBATTLE_PROFILE_DEFAULTS };
}

function validateCardBattleProfile(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    throw new Error("cardBattleProfile must be an object");
  }
  return {
    dealLuck: readNumberInRange(p, "dealLuck", 0, 1, "0 and 1"),
    cangkulLuck: readNumberInRange(p, "cangkulLuck", 0, 1, "0 and 1"),
    rewardMultiplier: readNumberInRange(p, "rewardMultiplier", 0.1, 5.0, "0.1 and 5.0"),
  };
}

function normalizeExistingCardBattleProfile(cardBattleProfile) {
  const source = cardBattleProfile && typeof cardBattleProfile === "object" ? cardBattleProfile : {};
  return {
    dealLuck: numberOrDefault(source.dealLuck, CARDBATTLE_PROFILE_DEFAULTS.dealLuck, 0, 1),
    cangkulLuck: numberOrDefault(source.cangkulLuck, CARDBATTLE_PROFILE_DEFAULTS.cangkulLuck, 0, 1),
    rewardMultiplier: numberOrDefault(source.rewardMultiplier, CARDBATTLE_PROFILE_DEFAULTS.rewardMultiplier, 0.1, 5.0),
  };
}

function numberOrDefault(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function integerOrDefault(value, fallback, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function normalizeExistingSlotProfile(slotProfile) {
  const source = slotProfile && typeof slotProfile === "object" ? slotProfile : {};
  return {
    jackpotChance: numberOrDefault(source.jackpotChance, SLOT_PROFILE_DEFAULTS.jackpotChance, 0, 0.20),
    winChance: numberOrDefault(source.winChance, SLOT_PROFILE_DEFAULTS.winChance, 0.05, 0.80),
    rewardMultiplier: numberOrDefault(source.rewardMultiplier, SLOT_PROFILE_DEFAULTS.rewardMultiplier, 0.1, 5.0),
    pityThreshold: integerOrDefault(source.pityThreshold, SLOT_PROFILE_DEFAULTS.pityThreshold, 10, 100),
  };
}

function normalizeGachaRates(rates, fallbackRates = GACHA_PROFILE_DEFAULTS.rates) {
  const source = rates && typeof rates === "object" ? rates : {};
  const nextRates = {};
  let total = 0;
  GACHA_RATE_KEYS.forEach((key) => {
    const fallback = fallbackRates[key];
    const value = numberOrDefault(source[key], fallback, 0, 1);
    nextRates[key] = value;
    total += value;
  });
  if (total <= 0) return { ...GACHA_PROFILE_DEFAULTS.rates };
  GACHA_RATE_KEYS.forEach((key) => {
    nextRates[key] /= total;
  });
  return nextRates;
}

function normalizeExistingGachaProfile(gachaProfile) {
  const source = gachaProfile && typeof gachaProfile === "object" ? gachaProfile : {};
  return {
    rates: normalizeGachaRates(source.rates),
    pityThreshold: integerOrDefault(
      source.pityThreshold,
      GACHA_PROFILE_DEFAULTS.pityThreshold,
      10,
      100
    ),
  };
}

function normalizeGachaPity(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function readNumberInRange(slotProfile, field, min, max, label) {
  const value = slotProfile[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${label}`);
  }
  return value;
}

function readIntegerInRange(slotProfile, field, min, max, label) {
  const value = slotProfile[field];
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${label}`);
  }
  return value;
}

function validateSlotProfile(slotProfile) {
  if (!slotProfile || typeof slotProfile !== "object" || Array.isArray(slotProfile)) {
    throw new Error("slotProfile must be an object");
  }
  return {
    jackpotChance: readNumberInRange(slotProfile, "jackpotChance", 0, 0.20, "0 and 0.20"),
    winChance: readNumberInRange(slotProfile, "winChance", 0.05, 0.80, "0.05 and 0.80"),
    rewardMultiplier: readNumberInRange(slotProfile, "rewardMultiplier", 0.1, 5.0, "0.1 and 5.0"),
    pityThreshold: readIntegerInRange(slotProfile, "pityThreshold", 10, 100, "10 and 100"),
  };
}

function readNumberClamped(source, field, min, max) {
  const value = source[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return Math.min(max, Math.max(min, value));
}

function validateGachaProfile(gachaProfile) {
  if (!gachaProfile || typeof gachaProfile !== "object" || Array.isArray(gachaProfile)) {
    throw new Error("gachaProfile must be an object");
  }
  if (!gachaProfile.rates || typeof gachaProfile.rates !== "object" || Array.isArray(gachaProfile.rates)) {
    throw new Error("rates must be an object");
  }

  const rates = {};
  let total = 0;
  GACHA_RATE_KEYS.forEach((key) => {
    const value = readNumberClamped(gachaProfile.rates, key, 0, 1);
    rates[key] = value;
    total += value;
  });
  if (total <= 0) throw new Error("rates total must be greater than 0");

  GACHA_RATE_KEYS.forEach((key) => {
    rates[key] /= total;
  });

  return {
    rates,
    pityThreshold: readIntegerInRange(gachaProfile, "pityThreshold", 10, 100, "10 and 100"),
  };
}

function createStorage({ pool, dataFile }) {
  if (pool) return createPostgresStorage(pool);
  return createLocalJsonStorage(dataFile);
}

function createPostgresStorage(pool) {
  let slotProfileTableReady = false;
  let gachaProfileTableReady = false;
  let cardBattleProfileTableReady = false;

  async function ensureSlotProfileTable() {
    if (slotProfileTableReady) return;
    await pool.query(
      `CREATE TABLE IF NOT EXISTS slot_profiles (
         user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         jackpot_chance DOUBLE PRECISION NOT NULL DEFAULT 0.05,
         win_chance DOUBLE PRECISION NOT NULL DEFAULT 0.35,
         reward_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
         pity_threshold INTEGER NOT NULL DEFAULT 50,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    slotProfileTableReady = true;
  }

  async function ensureGachaProfileTable() {
    if (gachaProfileTableReady) return;
    await pool.query(
      `CREATE TABLE IF NOT EXISTS gacha_profiles (
         user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         rate_common NUMERIC NOT NULL DEFAULT 0.595,
         rate_rare NUMERIC NOT NULL DEFAULT 0.25,
         rate_epic NUMERIC NOT NULL DEFAULT 0.10,
         rate_legendary NUMERIC NOT NULL DEFAULT 0.04,
         rate_mythic NUMERIC NOT NULL DEFAULT 0.015,
         pity_threshold INTEGER NOT NULL DEFAULT 50,
         pity_count INTEGER NOT NULL DEFAULT 0,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await pool.query(
      `ALTER TABLE gacha_profiles
         ADD COLUMN IF NOT EXISTS pity_count INTEGER NOT NULL DEFAULT 0`
    );
    gachaProfileTableReady = true;
  }

  async function ensureCardBattleProfileTable() {
    if (cardBattleProfileTableReady) return;
    await pool.query(
      `CREATE TABLE IF NOT EXISTS cardbattle_profiles (
         user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         deal_luck DOUBLE PRECISION NOT NULL DEFAULT 0.5,
         cangkul_luck DOUBLE PRECISION NOT NULL DEFAULT 0.5,
         reward_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    cardBattleProfileTableReady = true;
  }

  async function getUserByUsername(username) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.is_admin, u.joined_at,
              w.gems, w.coins, w.fruit, w.last_daily_claim, w.daily_streak
         FROM users u
         JOIN wallets w ON w.user_id = u.id
        WHERE LOWER(u.username) = LOWER($1)`,
      [username]
    );
    const user = result.rows[0] || null;
    if (user && !user.is_admin && isSeedAdminUsername(user.username)) {
      await pool.query("UPDATE users SET is_admin = TRUE, updated_at = NOW() WHERE id = $1", [user.id]);
      user.is_admin = true;
    }
    return user;
  }

  async function registerUser(username, password) {
    await ensureSlotProfileTable();
    await ensureGachaProfileTable();
    await ensureCardBattleProfileTable();
    const client = await pool.connect();
    try {
      const exists = await client.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [username]);
      if (exists.rows.length) throw httpError(409, "USERNAME SUDAH ADA!");

      await client.query("BEGIN");
      const isAdmin = isSeedAdminUsername(username);
      const passwordHash = await bcrypt.hash(password, 10);
      const joinedAt = Date.now();
      const userResult = await client.query(
        "INSERT INTO users (username, password_hash, is_admin, joined_at) VALUES ($1, $2, $3, $4) RETURNING id",
        [username, passwordHash, isAdmin, joinedAt]
      );
      const userId = userResult.rows[0].id;
      await client.query(
        `INSERT INTO wallets (user_id, gems, coins, fruit)
         VALUES ($1, $2, $3, 0)`,
        [userId, isAdmin ? 999999999 : 500, isAdmin ? 999999999 : 1000]
      );
      await client.query(
        `INSERT INTO slot_profiles (user_id, jackpot_chance, win_chance, reward_multiplier, pity_threshold)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          SLOT_PROFILE_DEFAULTS.jackpotChance,
          SLOT_PROFILE_DEFAULTS.winChance,
          SLOT_PROFILE_DEFAULTS.rewardMultiplier,
          SLOT_PROFILE_DEFAULTS.pityThreshold,
        ]
      );
      await client.query(
        `INSERT INTO gacha_profiles (
           user_id, rate_common, rate_rare, rate_epic, rate_legendary, rate_mythic, pity_threshold, pity_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
        [
          userId,
          GACHA_PROFILE_DEFAULTS.rates.common,
          GACHA_PROFILE_DEFAULTS.rates.rare,
          GACHA_PROFILE_DEFAULTS.rates.epic,
          GACHA_PROFILE_DEFAULTS.rates.legendary,
          GACHA_PROFILE_DEFAULTS.rates.mythic,
          GACHA_PROFILE_DEFAULTS.pityThreshold,
        ]
      );
      await client.query(
        `INSERT INTO cardbattle_profiles (user_id, deal_luck, cangkul_luck, reward_multiplier)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          CARDBATTLE_PROFILE_DEFAULTS.dealLuck,
          CARDBATTLE_PROFILE_DEFAULTS.cangkulLuck,
          CARDBATTLE_PROFILE_DEFAULTS.rewardMultiplier,
        ]
      );
      await client.query(
        "INSERT INTO transactions (user_id, type, gems_delta, coins_delta, note) VALUES ($1, $2, $3, $4, $5)",
        [userId, "register_bonus", isAdmin ? 0 : 500, isAdmin ? 0 : 1000, "Saldo awal register"]
      );
      await client.query("COMMIT");
      return getUserByUsername(username);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function deleteUser(username) {
    const user = await getUserByUsername(username);
    if (!user) throw httpError(404, "User tidak ditemukan");
    if (user.is_admin) throw httpError(400, "Akun admin tidak boleh dihapus");

    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 AND is_admin = FALSE RETURNING username",
      [user.id]
    );
    if (!result.rows.length) throw httpError(404, "User tidak ditemukan");
    return { success: true, username: result.rows[0].username };
  }

  async function applyWalletDelta(username, change) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT u.id, u.username, u.password_hash, u.is_admin, u.joined_at,
                w.gems, w.coins, w.fruit, w.last_daily_claim, w.daily_streak
           FROM users u
           JOIN wallets w ON w.user_id = u.id
          WHERE LOWER(u.username) = LOWER($1)
          FOR UPDATE OF w`,
        [username]
      );
      const before = result.rows[0] || null;
      if (!before) throw httpError(404, "User tidak ditemukan");
      if (before.is_admin) {
        await client.query("COMMIT");
        return before;
      }

      const gemsDelta = Math.trunc(asNumber(change.gemsDelta, 0));
      const coinsDelta = Math.trunc(asNumber(change.coinsDelta, 0));
      const fruitDelta = Math.trunc(asNumber(change.fruitDelta, 0));
      const next = {
        gems: Number(before.gems) + gemsDelta,
        coins: Number(before.coins) + coinsDelta,
        fruit: Number(before.fruit) + fruitDelta,
      };
      if (next.gems < 0 || next.coins < 0 || next.fruit < 0) {
        throw httpError(400, "Saldo tidak cukup");
      }

      await client.query(
        `UPDATE wallets
            SET gems = $1, coins = $2, fruit = $3, updated_at = NOW()
          WHERE user_id = $4`,
        [next.gems, next.coins, next.fruit, before.id]
      );
      await client.query(
        "INSERT INTO transactions (user_id, type, gems_delta, coins_delta, fruit_delta, note) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          before.id,
          String(change.type || "wallet_delta").slice(0, 40),
          gemsDelta,
          coinsDelta,
          fruitDelta,
          change.note || "Update wallet dari aksi server",
        ]
      );
      await client.query("COMMIT");
      return getUserByUsername(username);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function claimDaily(username) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await getUserByUsername(username);
      if (!user) throw httpError(404, "User tidak ditemukan");
      if (user.is_admin) {
        await client.query("COMMIT");
        return { user, message: "Admin sudah memiliki saldo tak terbatas!" };
      }

      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;
      const lastClaim = Number(user.last_daily_claim || 0);
      if (now - lastClaim < cooldown) throw httpError(429, "Daily Reward belum siap diklaim!");

      const streak = lastClaim > 0 && now - lastClaim < 2 * cooldown ? Number(user.daily_streak || 0) + 1 : 1;
      await client.query(
        `UPDATE wallets
            SET coins = coins + 500, gems = gems + 50, last_daily_claim = $1,
                daily_streak = $2, updated_at = NOW()
          WHERE user_id = $3`,
        [now, streak, user.id]
      );
      await client.query(
        "INSERT INTO transactions (user_id, type, gems_delta, coins_delta, note) VALUES ($1, $2, 50, 500, $3)",
        [user.id, "daily_claim", `Daily reward streak ${streak}`]
      );
      await client.query("COMMIT");
      return {
        user: await getUserByUsername(username),
        message: `Daily Reward diklaim! +500 koin, +50 gems. Streak: ${streak} hari`,
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function getSlotProfile(username) {
    await ensureSlotProfileTable();
    const user = await getUserByUsername(username);
    if (!user) throw httpError(404, "User not found");

    const result = await pool.query(
      `SELECT jackpot_chance, win_chance, reward_multiplier, pity_threshold
         FROM slot_profiles
        WHERE user_id = $1`,
      [user.id]
    );
    const row = result.rows[0] || null;
    if (!row) return defaultSlotProfile();

    return normalizeExistingSlotProfile({
      jackpotChance: Number(row.jackpot_chance),
      winChance: Number(row.win_chance),
      rewardMultiplier: Number(row.reward_multiplier),
      pityThreshold: Number(row.pity_threshold),
    });
  }

  async function setSlotProfile(username, slotProfile) {
    const nextProfile = validateSlotProfile(slotProfile);
    await ensureSlotProfileTable();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) FOR UPDATE",
        [username]
      );
      const user = result.rows[0] || null;
      if (!user) throw httpError(404, "User not found");

      await client.query(
        `INSERT INTO slot_profiles (user_id, jackpot_chance, win_chance, reward_multiplier, pity_threshold)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           jackpot_chance = EXCLUDED.jackpot_chance,
           win_chance = EXCLUDED.win_chance,
           reward_multiplier = EXCLUDED.reward_multiplier,
           pity_threshold = EXCLUDED.pity_threshold,
           updated_at = NOW()`,
        [
          user.id,
          nextProfile.jackpotChance,
          nextProfile.winChance,
          nextProfile.rewardMultiplier,
          nextProfile.pityThreshold,
        ]
      );
      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function getGachaProfile(username) {
    await ensureGachaProfileTable();
    const user = await getUserByUsername(username);
    if (!user) throw httpError(404, "User not found");

    const result = await pool.query(
      `SELECT rate_common, rate_rare, rate_epic, rate_legendary, rate_mythic, pity_threshold
         FROM gacha_profiles
        WHERE user_id = $1`,
      [user.id]
    );
    const row = result.rows[0] || null;
    if (!row) return defaultGachaProfile();

    return normalizeExistingGachaProfile({
      rates: {
        common: Number(row.rate_common),
        rare: Number(row.rate_rare),
        epic: Number(row.rate_epic),
        legendary: Number(row.rate_legendary),
        mythic: Number(row.rate_mythic),
      },
      pityThreshold: Number(row.pity_threshold),
    });
  }

  async function setGachaProfile(username, gachaProfile) {
    const nextProfile = validateGachaProfile(gachaProfile);
    await ensureGachaProfileTable();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) FOR UPDATE",
        [username]
      );
      const user = result.rows[0] || null;
      if (!user) throw httpError(404, "User not found");

      await client.query(
        `INSERT INTO gacha_profiles (
           user_id, rate_common, rate_rare, rate_epic, rate_legendary, rate_mythic, pity_threshold, pity_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         ON CONFLICT (user_id) DO UPDATE SET
           rate_common = EXCLUDED.rate_common,
           rate_rare = EXCLUDED.rate_rare,
           rate_epic = EXCLUDED.rate_epic,
           rate_legendary = EXCLUDED.rate_legendary,
           rate_mythic = EXCLUDED.rate_mythic,
           pity_threshold = EXCLUDED.pity_threshold,
           updated_at = NOW()`,
        [
          user.id,
          nextProfile.rates.common,
          nextProfile.rates.rare,
          nextProfile.rates.epic,
          nextProfile.rates.legendary,
          nextProfile.rates.mythic,
          nextProfile.pityThreshold,
        ]
      );
      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function getCardBattleProfile(username) {
    await ensureCardBattleProfileTable();
    const user = await getUserByUsername(username);
    if (!user) throw httpError(404, "User not found");

    const result = await pool.query(
      `SELECT deal_luck, cangkul_luck, reward_multiplier
         FROM cardbattle_profiles
        WHERE user_id = $1`,
      [user.id]
    );
    const row = result.rows[0] || null;
    if (!row) return defaultCardBattleProfile();

    return normalizeExistingCardBattleProfile({
      dealLuck: Number(row.deal_luck),
      cangkulLuck: Number(row.cangkul_luck),
      rewardMultiplier: Number(row.reward_multiplier),
    });
  }

  async function setCardBattleProfile(username, cardBattleProfile) {
    const nextProfile = validateCardBattleProfile(cardBattleProfile);
    await ensureCardBattleProfileTable();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) FOR UPDATE",
        [username]
      );
      const user = result.rows[0] || null;
      if (!user) throw httpError(404, "User not found");

      await client.query(
        `INSERT INTO cardbattle_profiles (user_id, deal_luck, cangkul_luck, reward_multiplier)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           deal_luck = EXCLUDED.deal_luck,
           cangkul_luck = EXCLUDED.cangkul_luck,
           reward_multiplier = EXCLUDED.reward_multiplier,
           updated_at = NOW()`,
        [
          user.id,
          nextProfile.dealLuck,
          nextProfile.cangkulLuck,
          nextProfile.rewardMultiplier,
        ]
      );
      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function getGachaPity(username) {
    await ensureGachaProfileTable();
    const user = await getUserByUsername(username);
    if (!user) throw httpError(404, "User not found");

    const result = await pool.query(
      `SELECT pity_count
         FROM gacha_profiles
        WHERE user_id = $1`,
      [user.id]
    );
    const row = result.rows[0] || null;
    return normalizeGachaPity(row ? row.pity_count : 0);
  }

  async function setGachaPity(username, pityCount) {
    const nextPity = normalizeGachaPity(pityCount);
    await ensureGachaProfileTable();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) FOR UPDATE",
        [username]
      );
      const user = result.rows[0] || null;
      if (!user) throw httpError(404, "User not found");

      await client.query(
        `INSERT INTO gacha_profiles (
           user_id, rate_common, rate_rare, rate_epic, rate_legendary, rate_mythic, pity_threshold, pity_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO UPDATE SET
           pity_count = EXCLUDED.pity_count,
           updated_at = NOW()`,
        [
          user.id,
          GACHA_PROFILE_DEFAULTS.rates.common,
          GACHA_PROFILE_DEFAULTS.rates.rare,
          GACHA_PROFILE_DEFAULTS.rates.epic,
          GACHA_PROFILE_DEFAULTS.rates.legendary,
          GACHA_PROFILE_DEFAULTS.rates.mythic,
          GACHA_PROFILE_DEFAULTS.pityThreshold,
          nextPity,
        ]
      );
      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Ignore rollback failures so the original error can be reported.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function getAdminOverview() {
    await ensureSlotProfileTable();
    await ensureGachaProfileTable();
    await ensureCardBattleProfileTable();
    const usersResult = await pool.query(
      `SELECT u.username, u.is_admin, u.joined_at,
              w.gems, w.coins, w.fruit, w.daily_streak, w.last_daily_claim,
              sp.jackpot_chance, sp.win_chance, sp.reward_multiplier, sp.pity_threshold AS slot_pity_threshold,
              gp.rate_common, gp.rate_rare, gp.rate_epic, gp.rate_legendary, gp.rate_mythic,
              gp.pity_threshold AS gacha_pity_threshold, gp.pity_count AS gacha_pity,
              cbp.deal_luck, cbp.cangkul_luck, cbp.reward_multiplier AS cb_reward_multiplier
         FROM users u
         JOIN wallets w ON w.user_id = u.id
         LEFT JOIN slot_profiles sp ON sp.user_id = u.id
         LEFT JOIN gacha_profiles gp ON gp.user_id = u.id
         LEFT JOIN cardbattle_profiles cbp ON cbp.user_id = u.id
        ORDER BY u.joined_at DESC
        LIMIT 100`
    );
    const totalsResult = await pool.query(
      `SELECT COUNT(*)::int AS users,
              COALESCE(SUM(w.gems), 0)::bigint AS gems,
              COALESCE(SUM(w.coins), 0)::bigint AS coins,
              COALESCE(SUM(w.fruit), 0)::bigint AS fruit
         FROM users u
         JOIN wallets w ON w.user_id = u.id`
    );
    const transactionsResult = await pool.query(
      `SELECT t.type, t.gems_delta, t.coins_delta, t.fruit_delta, t.note, t.created_at, u.username
         FROM transactions t
         JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at DESC
        LIMIT 25`
    );

    return {
      totals: totalsResult.rows[0],
      users: usersResult.rows.map((row) => ({
        ...publicUser(row),
        slotProfile: normalizeExistingSlotProfile({
          jackpotChance: Number(row.jackpot_chance),
          winChance: Number(row.win_chance),
          rewardMultiplier: Number(row.reward_multiplier),
          pityThreshold: Number(row.slot_pity_threshold),
        }),
        gachaProfile: normalizeExistingGachaProfile({
          rates: {
            common: Number(row.rate_common),
            rare: Number(row.rate_rare),
            epic: Number(row.rate_epic),
            legendary: Number(row.rate_legendary),
            mythic: Number(row.rate_mythic),
          },
          pityThreshold: Number(row.gacha_pity_threshold),
        }),
        gachaPity: normalizeGachaPity(row.gacha_pity),
        cardBattleProfile: normalizeExistingCardBattleProfile({
          dealLuck: Number(row.deal_luck),
          cangkulLuck: Number(row.cangkul_luck),
          rewardMultiplier: Number(row.cb_reward_multiplier),
        }),
      })),
      transactions: transactionsResult.rows.map((row) => ({
        username: row.username,
        type: row.type,
        gemsDelta: Number(row.gems_delta),
        coinsDelta: Number(row.coins_delta),
        fruitDelta: Number(row.fruit_delta),
        note: row.note || "",
        createdAt: row.created_at,
      })),
    };
  }

  return {
    mode: "postgres",
    dataFile: null,
    getUserByUsername,
    registerUser,
    deleteUser,
    applyWalletDelta,
    claimDaily,
    getSlotProfile,
    setSlotProfile,
    getGachaProfile,
    setGachaProfile,
    getGachaPity,
    setGachaPity,
    getCardBattleProfile,
    setCardBattleProfile,
    getAdminOverview,
  };
}

function createLocalJsonStorage(dataFile) {
  const emptyState = () => ({
    nextUserId: 1,
    nextTransactionId: 1,
    admins: [],
    users: [],
    wallets: {},
    transactions: [],
  });

  function normalizeState(state) {
    const next = {
      ...emptyState(),
      ...(state && typeof state === "object" ? state : {}),
    };
    next.users = Array.isArray(next.users) ? next.users : [];
    next.admins = Array.isArray(next.admins) ? next.admins : [];
    next.wallets = next.wallets && typeof next.wallets === "object" ? next.wallets : {};
    next.transactions = Array.isArray(next.transactions) ? next.transactions : [];
    next.users = next.users.map((user) => ({
      ...(user && typeof user === "object" ? user : {}),
      slotProfile: normalizeExistingSlotProfile(user && user.slotProfile),
      gachaProfile: normalizeExistingGachaProfile(user && user.gachaProfile),
      gachaPity: normalizeGachaPity(user && user.gachaPity),
      cardBattleProfile: normalizeExistingCardBattleProfile(user && user.cardBattleProfile),
    }));
    next.nextUserId = Number(next.nextUserId) || next.users.length + 1;
    next.nextTransactionId = Number(next.nextTransactionId) || next.transactions.length + 1;
    return next;
  }

  function ensureDataFile() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    if (!fs.existsSync(dataFile)) saveState(emptyState());
  }

  function loadState() {
    ensureDataFile();
    try {
      return normalizeState(JSON.parse(fs.readFileSync(dataFile, "utf8")));
    } catch (err) {
      const backup = `${dataFile}.broken-${Date.now()}`;
      fs.renameSync(dataFile, backup);
      const state = emptyState();
      saveState(state);
      console.warn(`Local store rusak, dibuat ulang. Backup: ${backup}`);
      return state;
    }
  }

  function saveState(state) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmpFile = `${dataFile}.tmp`;
    fs.writeFileSync(tmpFile, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
    fs.renameSync(tmpFile, dataFile);
  }

  function findUser(state, username) {
    const key = cleanUsername(username).toLowerCase();
    return state.users.find((user) => String(user.username).toLowerCase() === key) || null;
  }

  function toRow(state, user) {
    if (!user) return null;
    const wallet = state.wallets[String(user.id)] || {};
    const adminKey = String(user.username).toLowerCase();
    const isAdmin = Boolean(user.isAdmin) || state.admins.includes(adminKey);
    return {
      id: user.id,
      username: user.username,
      password_hash: user.passwordHash,
      is_admin: isAdmin,
      joined_at: Number(user.joinedAt || Date.now()),
      gems: asNumber(wallet.gems, isAdmin ? 999999999 : 500),
      coins: asNumber(wallet.coins, isAdmin ? 999999999 : 1000),
      fruit: asNumber(wallet.fruit, 0),
      last_daily_claim: asNumber(wallet.lastDailyClaim, 0),
      daily_streak: asNumber(wallet.dailyStreak, 0),
    };
  }

  function addTransaction(state, userId, entry) {
    state.transactions.push({
      id: state.nextTransactionId++,
      userId,
      type: entry.type,
      gemsDelta: asNumber(entry.gemsDelta, 0),
      coinsDelta: asNumber(entry.coinsDelta, 0),
      fruitDelta: asNumber(entry.fruitDelta, 0),
      note: entry.note || "",
      createdAt: new Date().toISOString(),
    });
  }

  async function getUserByUsername(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (user && isSeedAdminUsername(user.username)) {
      const adminKey = String(user.username).toLowerCase();
      if (!state.admins.includes(adminKey)) {
        state.admins.push(adminKey);
        user.isAdmin = true;
        user.updatedAt = new Date().toISOString();
        saveState(state);
      }
    }
    return toRow(state, user);
  }

  async function deleteUser(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User tidak ditemukan");
    const row = toRow(state, user);
    if (row.is_admin) throw httpError(400, "Akun admin tidak boleh dihapus");

    state.users = state.users.filter((entry) => entry.id !== user.id);
    delete state.wallets[String(user.id)];
    state.transactions = state.transactions.filter((entry) => entry.userId !== user.id);
    saveState(state);
    return { success: true, username: user.username };
  }

  async function registerUser(username, password) {
    let state = loadState();
    if (findUser(state, username)) throw httpError(409, "USERNAME SUDAH ADA!");

    const passwordHash = await bcrypt.hash(password, 10);
    state = loadState();
    if (findUser(state, username)) throw httpError(409, "USERNAME SUDAH ADA!");

    const isSeedAdmin = isSeedAdminUsername(username);
    const adminKey = username.toLowerCase();
    if (isSeedAdmin && !state.admins.includes(adminKey)) {
      state.admins.push(adminKey);
    }
    const isAdmin = state.admins.includes(adminKey);
    const user = {
      id: state.nextUserId++,
      username,
      passwordHash,
      isAdmin,
      joinedAt: Date.now(),
      slotProfile: defaultSlotProfile(),
      gachaProfile: defaultGachaProfile(),
      gachaPity: 0,
      cardBattleProfile: defaultCardBattleProfile(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.users.push(user);
    state.wallets[String(user.id)] = {
      gems: isAdmin ? 999999999 : 500,
      coins: isAdmin ? 999999999 : 1000,
      fruit: 0,
      lastDailyClaim: 0,
      dailyStreak: 0,
      updatedAt: new Date().toISOString(),
    };
    addTransaction(state, user.id, {
      type: "register_bonus",
      gemsDelta: isAdmin ? 0 : 500,
      coinsDelta: isAdmin ? 0 : 1000,
      note: "Saldo awal register",
    });
    saveState(state);
    return toRow(state, user);
  }

  async function applyWalletDelta(username, change) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User tidak ditemukan");

    const before = toRow(state, user);
    if (before.is_admin) return before;

    const wallet = state.wallets[String(user.id)];
    const gemsDelta = Math.trunc(asNumber(change.gemsDelta, 0));
    const coinsDelta = Math.trunc(asNumber(change.coinsDelta, 0));
    const fruitDelta = Math.trunc(asNumber(change.fruitDelta, 0));
    const next = {
      gems: Number(before.gems) + gemsDelta,
      coins: Number(before.coins) + coinsDelta,
      fruit: Number(before.fruit) + fruitDelta,
      lastDailyClaim: Number(before.last_daily_claim),
      dailyStreak: Number(before.daily_streak),
      updatedAt: new Date().toISOString(),
    };
    if (next.gems < 0 || next.coins < 0 || next.fruit < 0) {
      throw httpError(400, "Saldo tidak cukup");
    }

    state.wallets[String(user.id)] = next;
    user.updatedAt = new Date().toISOString();
    addTransaction(state, user.id, {
      type: String(change.type || "wallet_delta").slice(0, 40),
      gemsDelta,
      coinsDelta,
      fruitDelta,
      note: change.note || "Update wallet dari aksi server",
    });
    saveState(state);
    return toRow(state, user);
  }

  async function claimDaily(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User tidak ditemukan");

    const row = toRow(state, user);
    if (row.is_admin) return { user: row, message: "Admin sudah memiliki saldo tak terbatas!" };

    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const lastClaim = Number(row.last_daily_claim || 0);
    if (now - lastClaim < cooldown) throw httpError(429, "Daily Reward belum siap diklaim!");

    const streak = lastClaim > 0 && now - lastClaim < 2 * cooldown ? Number(row.daily_streak || 0) + 1 : 1;
    const wallet = state.wallets[String(user.id)];
    wallet.coins = Number(row.coins) + 500;
    wallet.gems = Number(row.gems) + 50;
    wallet.lastDailyClaim = now;
    wallet.dailyStreak = streak;
    wallet.updatedAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();
    addTransaction(state, user.id, {
      type: "daily_claim",
      gemsDelta: 50,
      coinsDelta: 500,
      note: `Daily reward streak ${streak}`,
    });
    saveState(state);

    return {
      user: toRow(state, user),
      message: `Daily Reward diklaim! +500 koin, +50 gems. Streak: ${streak} hari`,
    };
  }

  async function getSlotProfile(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");
    return normalizeExistingSlotProfile(user.slotProfile);
  }

  async function setSlotProfile(username, slotProfile) {
    const nextProfile = validateSlotProfile(slotProfile);
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");

    user.slotProfile = nextProfile;
    user.updatedAt = new Date().toISOString();
    saveState(state);
    return { success: true };
  }

  async function getGachaProfile(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");
    return normalizeExistingGachaProfile(user.gachaProfile);
  }

  async function setGachaProfile(username, gachaProfile) {
    const nextProfile = validateGachaProfile(gachaProfile);
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");

    user.gachaProfile = nextProfile;
    user.updatedAt = new Date().toISOString();
    saveState(state);
    return { success: true };
  }

  async function getGachaPity(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");
    return normalizeGachaPity(user.gachaPity);
  }

  async function setGachaPity(username, pityCount) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");

    user.gachaPity = normalizeGachaPity(pityCount);
    user.updatedAt = new Date().toISOString();
    saveState(state);
    return { success: true };
  }

  async function getCardBattleProfile(username) {
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");
    return normalizeExistingCardBattleProfile(user.cardBattleProfile);
  }

  async function setCardBattleProfile(username, cardBattleProfile) {
    const nextProfile = validateCardBattleProfile(cardBattleProfile);
    const state = loadState();
    const user = findUser(state, username);
    if (!user) throw httpError(404, "User not found");

    user.cardBattleProfile = nextProfile;
    user.updatedAt = new Date().toISOString();
    saveState(state);
    return { success: true };
  }

  async function getAdminOverview() {
    const state = loadState();
    const users = state.users
      .slice()
      .sort((a, b) => Number(b.joinedAt || 0) - Number(a.joinedAt || 0))
      .slice(0, 100)
      .map((user) => ({
        ...publicUser(toRow(state, user)),
        slotProfile: normalizeExistingSlotProfile(user.slotProfile),
        gachaProfile: normalizeExistingGachaProfile(user.gachaProfile),
        gachaPity: normalizeGachaPity(user.gachaPity),
        cardBattleProfile: normalizeExistingCardBattleProfile(user.cardBattleProfile),
      }));
    const totals = state.users.reduce((acc, user) => {
      const row = toRow(state, user);
      acc.users += 1;
      acc.gems += Number(row.gems || 0);
      acc.coins += Number(row.coins || 0);
      acc.fruit += Number(row.fruit || 0);
      return acc;
    }, { users: 0, gems: 0, coins: 0, fruit: 0 });
    const transactions = state.transactions
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 25)
      .map((entry) => {
        const user = state.users.find((item) => Number(item.id) === Number(entry.userId));
        return {
          username: user ? user.username : "Unknown",
          type: entry.type,
          gemsDelta: Number(entry.gemsDelta || 0),
          coinsDelta: Number(entry.coinsDelta || 0),
          fruitDelta: Number(entry.fruitDelta || 0),
          note: entry.note || "",
          createdAt: entry.createdAt,
        };
      });

    return { totals, users, transactions };
  }

  return {
    mode: "local-json",
    dataFile,
    getUserByUsername,
    registerUser,
    deleteUser,
    applyWalletDelta,
    claimDaily,
    getSlotProfile,
    setSlotProfile,
    getGachaProfile,
    setGachaProfile,
    getGachaPity,
    setGachaPity,
    getCardBattleProfile,
    setCardBattleProfile,
    getAdminOverview,
  };
}

module.exports = {
  cleanUsername,
  createStorage,
  publicUser,
};
