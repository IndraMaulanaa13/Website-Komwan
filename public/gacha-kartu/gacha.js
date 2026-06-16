/* ═══════════════════════════════════════════════════════════════════
   BASIKAL GACHA — gacha.js
   Tema: Cyberpunk Neon Casino (Balans & Inventori Terintegrasi)
   ═══════════════════════════════════════════════════════════════════ */

// 1. Authenticate Gate
const currentUser = localStorage.getItem("currentUser");
const authToken = localStorage.getItem("authToken");
if (!currentUser || !authToken) {
  localStorage.removeItem("currentUser");
  window.location.href = "../login.html";
}

// Global data loading
let users = JSON.parse(localStorage.getItem("users")) || {};
let userData = users[currentUser] || { username: currentUser, gems: 0, coins: 0, fruit: 0 };

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${authToken}` };
}

// Initialize gacha object and nested fields robustly
if (!userData.gacha) {
  userData.gacha = {};
}
if (userData.gacha.pity === undefined) userData.gacha.pity = 0;
if (userData.gacha.shards === undefined) userData.gacha.shards = 0;
if (userData.gacha.collection === undefined) userData.gacha.collection = {};
if (userData.gacha.history === undefined) userData.gacha.history = [];

function saveLocalUser(nextUserData) {
  const gachaState = userData.gacha;
  userData = { ...userData, ...nextUserData, gacha: gachaState };
  users[currentUser] = userData;
  localStorage.setItem("users", JSON.stringify(users));
}

async function syncWalletFromDatabase() {
  if (!currentUser || userData.isAdmin === true) return;
  try {
    const response = await fetch("/api/me", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Gagal sinkron wallet");
    saveLocalUser(data.user);
    updateBalancesUI();
  } catch (error) {
    console.warn("Gagal sinkron wallet gacha:", error.message);
  }
}

async function syncGachaProfileFromDatabase() {
  if (!currentUser) return;
  try {
    const response = await fetch("/api/me/gacha-profile", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok || !data.gachaProfile) throw new Error(data.error || "Gagal sinkron gacha profile");
    userData.gacha.profile = data.gachaProfile;
    userData.gacha.pity = Number(data.pity || 0);
    users[currentUser] = userData;
    localStorage.setItem("users", JSON.stringify(users));
    updatePityUI();
  } catch (error) {
    console.warn("Gagal sinkron gacha profile:", error.message);
  }
}

async function requestGachaPull(action, count) {
  const response = await fetch("/api/gacha/pull", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action, count }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Gagal memproses gacha");
  saveLocalUser(data.user);
  if (Number.isFinite(Number(data.pityAfter))) {
    userData.gacha.pity = Number(data.pityAfter);
  }
  updateBalancesUI();
  updatePityUI();
  return data;
}

// 2. Card Database (23 Cards Total)
const CARDS = [
  // Common (6 Cards)
  { id: "glitch_rookie", name: "Glitch Rookie", emoji: "👤", rarity: "common" },
  { id: "neon_bot", name: "Neon Bot", emoji: "🤖", rarity: "common" },
  { id: "static_skull", name: "Static Skull", emoji: "💀", rarity: "common" },
  { id: "dice_runner", name: "Dice Runner", emoji: "🎲", rarity: "common" },
  { id: "joker_cadet", name: "Joker Cadet", emoji: "🃏", rarity: "common" },
  { id: "cyber_goon", name: "Cyber Goon", emoji: "🔫", rarity: "common" },

  // Rare (6 Cards)
  { id: "shadow_hacker", name: "Shadow Hacker", emoji: "🥷", rarity: "rare" },
  { id: "volt_dancer", name: "Volt Dancer", emoji: "⚡", rarity: "rare" },
  { id: "neon_kitsune", name: "Neon Kitsune", emoji: "🦊", rarity: "rare" },
  { id: "bullet_diva", name: "Bullet Diva", emoji: "🎯", rarity: "rare" },
  { id: "pulse_oracle", name: "Pulse Oracle", emoji: "🔮", rarity: "rare" },
  { id: "drone_master", name: "Drone Master", emoji: "🛸", rarity: "rare" },

  // Epic (5 Cards)
  { id: "crimson_dragoon", name: "Crimson Dragoon", emoji: "🐉", rarity: "epic" },
  { id: "oni_bouncer", name: "Oni Bouncer", emoji: "👹", rarity: "epic" },
  { id: "toxic_empress", name: "Toxic Empress", emoji: "🦂", rarity: "epic" },
  { id: "phoenix_sniper", name: "Phoenix Sniper", emoji: "🦅", rarity: "epic" },
  { id: "glitch_phantom", name: "Glitch Phantom", emoji: "👻", rarity: "epic" },

  // Legendary (4 Cards)
  { id: "casino_boss", name: "Casino Boss \"Tigerlily\"", emoji: "👑", rarity: "legendary" },
  { id: "neon_samurai", name: "Neon Samurai \"Kuro\"", emoji: "⚔️", rarity: "legendary" },
  { id: "cyber_witch", name: "Cyber Witch \"Vex\"", emoji: "🧙‍♀️", rarity: "legendary" },
  { id: "slot_god", name: "Slot God \"Apollyon\"", emoji: "🎰", rarity: "legendary" },

  // Mythic (3 Cards)
  { id: "crimson_overlord", name: "The Crimson Overlord", emoji: "☠️", rarity: "mythic" },
  { id: "omega_lucky", name: "OMEGA — The Lucky Star", emoji: "🌌", rarity: "mythic" },
  { id: "inferna_empress", name: "Inferna, Burning Empress", emoji: "🔥", rarity: "mythic" }
];

// Coin reward when getting duplicate card (replaces shard system)
const COIN_VALUES = {
  common: 5,
  rare: 25,
  epic: 100,
  legendary: 500,
  mythic: 2000
};

// Helper to get image path for cards
function getCardImagePath(card) {
  // All cards with individual artwork
  const customImages = [
    // Mythic
    "omega_lucky", "crimson_overlord", "inferna_empress",
    // Legendary
    "casino_boss", "neon_samurai", "cyber_witch", "slot_god",
    // Common (individual art)
    "glitch_rookie", "neon_bot", "static_skull", "dice_runner", "joker_cadet", "cyber_goon"
  ];
  if (customImages.includes(card.id)) {
    return `assets/${card.id}.png`;
  }
  // Generic card images by rarity for cards without custom art
  return `assets/${card.rarity}_card.png`;
}

// Global variables for active timers
let activeFlipTimeouts = [];
let currentRollResult = [];
let highestRarityInRoll = "common";
let activeTab = "collection";
let activeFilter = "all";
let activeSearch = "";
let activeSort = "rarity-desc";
let hideLocked = false;

// Rarity ordering & display drop rates (for modal info)
const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const RARITY_DROP_RATES = {
  common:    "59.5%",
  rare:      "25%",
  epic:      "10%",
  legendary: "4%",
  mythic:    "1.5%"
};

function getRarityDropRate(rarity) {
  const rate = userData.gacha?.profile?.rates?.[rarity];
  return Number.isFinite(Number(rate)) ? `${(Number(rate) * 100).toFixed(1)}%` : RARITY_DROP_RATES[rarity] || "-";
}

// 3. Page Initialization
document.addEventListener("DOMContentLoaded", () => {
  updateBalancesUI();
  syncWalletFromDatabase();
  syncGachaProfileFromDatabase();
  updatePityUI();
  updatePlayerStatsUI();
  initDriftingBackground();
  switchTab("collection");
  initCollectionToolbar();

  // Profile dropdown trigger
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileBtn && profileDropdown) {
    document.getElementById("dd-username").textContent = currentUser;
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => {
      profileDropdown.classList.remove("open");
    });
  }
});

// Wire up search, sort, and hide-locked controls
function initCollectionToolbar() {
  const searchEl = document.getElementById("collection-search");
  const clearBtn = document.getElementById("search-clear");
  const sortEl   = document.getElementById("collection-sort");
  const hideEl   = document.getElementById("hide-locked");

  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      activeSearch = e.target.value.trim().toLowerCase();
      if (clearBtn) clearBtn.classList.toggle("show", activeSearch.length > 0);
      renderCollection();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchEl) searchEl.value = "";
      activeSearch = "";
      clearBtn.classList.remove("show");
      renderCollection();
      if (searchEl) searchEl.focus();
    });
  }
  if (sortEl) {
    sortEl.addEventListener("change", (e) => {
      activeSort = e.target.value;
      renderCollection();
    });
  }
  if (hideEl) {
    hideEl.addEventListener("change", (e) => {
      hideLocked = e.target.checked;
      renderCollection();
    });
  }
}

// Compute and update Player Stats strip + Collection Progress
function updatePlayerStatsUI() {
  const history = userData.gacha?.history || [];
  const collection = userData.gacha?.collection || {};

  // Total pulls
  const totalPulls = history.length;
  const totalPullsEl = document.getElementById("stat-total-pulls");
  if (totalPullsEl) totalPullsEl.textContent = totalPulls.toLocaleString();

  // Collection % (unique cards owned / total cards)
  const totalCards = CARDS.length;
  const ownedCards = Object.keys(collection).filter(id => collection[id] > 0).length;
  const collectionPercent = totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 0;
  const collEl = document.getElementById("stat-collection-percent");
  if (collEl) collEl.textContent = `${collectionPercent}%`;

  // Mythic owned (X / total mythic cards)
  const mythicCards = CARDS.filter(c => c.rarity === "mythic");
  const mythicOwned = mythicCards.filter(c => collection[c.id] > 0).length;
  const mythEl = document.getElementById("stat-mythic-owned");
  if (mythEl) mythEl.textContent = `${mythicOwned} / ${mythicCards.length}`;

  // Luck streak: count consecutive pulls without legendary/mythic at top of history
  const luckEl = document.getElementById("stat-luck-streak");
  if (luckEl) {
    if (history.length === 0) {
      luckEl.textContent = "—";
      luckEl.classList.remove("is-hot");
    } else {
      let streak = 0;
      for (const item of history) {
        if (item.rarity === "legendary" || item.rarity === "mythic") break;
        streak++;
      }
      luckEl.textContent = `${streak}`;
      luckEl.classList.toggle("is-hot", streak >= 10);
    }
  }
}

// Update collection progress bar + per-rarity breakdown
function updateCollectionProgress() {
  const collection = userData.gacha?.collection || {};
  const totalCards = CARDS.length;
  const ownedCards = Object.keys(collection).filter(id => collection[id] > 0).length;
  const pct = totalCards > 0 ? (ownedCards / totalCards) * 100 : 0;

  const fill = document.getElementById("cp-fill");
  if (fill) fill.style.width = `${pct}%`;
  const stats = document.getElementById("cp-stats");
  if (stats) stats.textContent = `${ownedCards} / ${totalCards} kartu (${Math.round(pct)}%)`;

  // Per rarity
  const rarities = ["common", "rare", "epic", "legendary", "mythic"];
  rarities.forEach(rarity => {
    const cardsOfRarity = CARDS.filter(c => c.rarity === rarity);
    const ownedOfRarity = cardsOfRarity.filter(c => collection[c.id] > 0).length;
    const el = document.getElementById(`cp-c-${rarity}`);
    if (el) el.textContent = `${ownedOfRarity}/${cardsOfRarity.length}`;
    const mini = el?.closest(".cp-mini");
    if (mini) {
      mini.classList.toggle("is-complete", ownedOfRarity === cardsOfRarity.length && cardsOfRarity.length > 0);
    }
  });
}

// 4. Update UI Utilities
function updateBalancesUI() {
  if (!userData) return;
  document.getElementById("gems-display").textContent = (userData.gems || 0).toLocaleString();
  document.getElementById("coins-display").textContent = (userData.coins || 0).toLocaleString();
}

function updatePityUI() {
  if (!userData || !userData.gacha) return;
  const pity = userData.gacha.pity || 0;
  const threshold = Number(userData.gacha.profile?.pityThreshold || 50);
  document.getElementById("pity-count").textContent = `${pity} / ${threshold}`;
  
  const percent = (pity / threshold) * 100;
  const fill = document.getElementById("pity-fill");
  if (fill) fill.style.width = `${Math.min(100, percent)}%`;

  const note = document.getElementById("pity-note");
  if (note) {
    const softStart = Math.ceil(threshold * 0.8);
    if (pity >= softStart) {
      note.textContent = `Soft pity aktif. Hard pity di pull ke-${threshold}.`;
    } else {
      note.textContent = `Soft pity aktif di pull ke-${softStart}+`;
    }
    return;
    if (pity >= 40) {
      const chance = (0.015 + ((pity - 40) / 10) * 0.985) * 100;
      note.innerHTML = `⚠️ Pity level tinggi! Rate Mythic saat ini: <b style="color:var(--gold-neon)">${chance.toFixed(1)}%</b>`;
    } else {
      note.textContent = "Soft pity aktif di pull ke-40+";
    }
  }
}

// 5. Server-authoritative gacha guard
// Pull results must come from /api/gacha/pull.
// isPremium = true → pull pakai diamond, rate Mythic dinaikkan 2× (1.5% → 3%)
function rollCard(isPremium = false) {
  throw new Error("Gacha rolls are server-authoritative");
  /*
  const pityCount = userData.gacha.pity || 0;
  const baseMythic = isPremium ? 0.03 : 0.015; // Premium 3%, Reguler 1.5%
  let mythicChance = baseMythic;

  if (pityCount >= 50) {
    mythicChance = 1.0; // Hard Pity
  } else if (pityCount >= 40) {
    // Soft Pity: Linear increase to 100%
    const extra = (pityCount - 40) / 10;
    mythicChance = baseMythic + extra * (1.0 - baseMythic);
  }

  const roll = Math.random();

  let selectedRarity = "common";
  if (roll < mythicChance) {
    selectedRarity = "mythic";
  } else {
    // Distribute remaining rate proportionally among other rarities
    // Base rates relative ratios:
    // Legendary: 4%, Epic: 10%, Rare: 25%, Common: 59.5%
    const scale = (1.0 - mythicChance) / (1.0 - baseMythic);
    const legendaryChance = mythicChance + (0.04 * scale);
    const epicChance = legendaryChance + (0.10 * scale);
    const rareChance = epicChance + (0.25 * scale);

    if (roll < legendaryChance) {
      selectedRarity = "legendary";
    } else if (roll < epicChance) {
      selectedRarity = "epic";
    } else if (roll < rareChance) {
      selectedRarity = "rare";
    } else {
      selectedRarity = "common";
    }
  }

  // Retrieve card candidates
  let candidates = CARDS.filter(c => c.rarity === selectedRarity);

  // Apply Rate-up Rule for Mythic: OMEGA (50% chance of Mythic cards)
  let chosenCard = null;
  if (selectedRarity === "mythic") {
    const rateUpRoll = Math.random();
    if (rateUpRoll < 0.5) {
      chosenCard = CARDS.find(c => c.id === "omega_lucky");
    }
  }

  if (!chosenCard) {
    chosenCard = candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Update pity counter
  if (selectedRarity === "mythic") {
    userData.gacha.pity = 0;
  } else {
    userData.gacha.pity = (userData.gacha.pity || 0) + 1;
  }

  return chosenCard;
  */
}

// 6. Pull Executions
async function pullCards(count) {
  // Balance checking
  const cost = count === 10 ? 450 : 50;
  if ((userData.coins || 0) < cost) {
    showToast("🪙 Koin tidak cukup! Klaim Daily Reward atau bermain.");
    return;
  }

  try {
    const result = await requestGachaPull("coin_pull", count);
    executeRolls(result.cards || [], result.pityAfter);
  } catch (err) {
    showToast(err.message);
  }
}

async function pullWithGems(count = 1) {
  const cost = count === 10 ? 45 : 5;
  if ((userData.gems || 0) < cost) {
    showToast("💎 Gems tidak cukup! Tukar koin di Shop.");
    return;
  }

  try {
    const result = await requestGachaPull("premium_pull", count);
    // Premium flag → boosted Mythic rate (×2)
    executeRolls(result.cards || [], result.pityAfter);
  } catch (err) {
    showToast(err.message);
  }
}

// Core rolling execution
function executeRolls(serverResults, pityAfter) {
  currentRollResult = [];
  highestRarityInRoll = "common";
  const results = Array.isArray(serverResults) ? serverResults : [];
  const count = results.length;

  const rarityPriority = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

  results.forEach((result) => {
    const serverCard = result.card || result;
    const card = CARDS.find(c => c.id === serverCard.id) || serverCard;
    const isDup = userData.gacha.collection[card.id] !== undefined && userData.gacha.collection[card.id] > 0;

    // Add to collection — kartu dianggap "owned" cukup 1 kali. Duplicate = konversi koin.
    let coinsGained = 0;
    if (!isDup) {
      userData.gacha.collection[card.id] = 1;
    } else {
      // Tetap simpan flag = 1 (owned), tidak menambah counter
      userData.gacha.collection[card.id] = 1;
      coinsGained = 0;
    }

    // Add to roll result with status
    currentRollResult.push({
      card: card,
      isDuplicate: isDup,
      coinsConverted: coinsGained
    });

    // Update highest rarity in batch
    if (rarityPriority[card.rarity] > rarityPriority[highestRarityInRoll]) {
      highestRarityInRoll = card.rarity;
    }

    // Add to log history (limit 50)
    userData.gacha.history.unshift({
      id: card.id,
      rarity: card.rarity,
      ts: Date.now()
    });
  });

  // Slice history to max 50
  if (userData.gacha.history.length > 50) {
    userData.gacha.history = userData.gacha.history.slice(0, 50);
  }

  if (Number.isFinite(Number(pityAfter))) {
    userData.gacha.pity = Number(pityAfter);
  }

  // Save back to localStorage
  users[currentUser] = userData;
  localStorage.setItem("users", JSON.stringify(users));
  // Sync balances and pity
  updateBalancesUI();
  updatePityUI();
  updatePlayerStatsUI();

  // Trigger animations
  runRevealSequence(count);
}

// 7. Visual Reveal Flow & Timing
function runRevealSequence(count) {
  const overlay = document.getElementById("reveal-overlay");
  const flash = document.getElementById("reveal-flash");
  const mythicFx = document.getElementById("mythic-fx");
  const skipBtn = document.getElementById("reveal-skip");
  const continueBtn = document.getElementById("reveal-continue");
  const cardsContainer = document.getElementById("reveal-cards");

  // Reset overlays
  overlay.classList.add("show");
  cardsContainer.innerHTML = "";
  cardsContainer.className = "reveal-cards";
  
  if (count === 10) {
    cardsContainer.classList.add("is-grid");
  }

  skipBtn.style.display = "block";
  continueBtn.classList.remove("show");
  
  // Clear any existing timeouts
  activeFlipTimeouts.forEach(clearTimeout);
  activeFlipTimeouts = [];

  stopConfetti();
  stopMythicParticles();
  
  // Trigger initial flash
  flash.className = "reveal-flash fire-" + highestRarityInRoll;
  setTimeout(() => {
    flash.className = "reveal-flash";
  }, 650);

  // Render cards (facedown initially)
  currentRollResult.forEach(item => {
    const cardEl = document.createElement("div");
    cardEl.className = `rc-card r-${item.card.rarity}`;
    if (count === 1) {
      cardEl.classList.add("is-hero");
    }

    let dupTagHTML = "";
    if (item.isDuplicate) {
      dupTagHTML = `<div class="rc-dup-tag">+${item.coinsConverted} 🪙</div>`;
    }

    cardEl.innerHTML = `
      <img class="card-art" src="${getCardImagePath(item.card)}" alt="${item.card.name}" />
      ${dupTagHTML}
      <div class="rc-name">${item.card.name}</div>
      <div class="rc-rarity">${item.card.rarity.toUpperCase()}</div>
    `;
    
    // Store data attribute for details modal trigger
    cardEl.addEventListener("click", () => {
      if (cardEl.classList.contains("flip")) {
        openCardModal(item.card);
      }
    });

    cardsContainer.appendChild(cardEl);
  });

  // Calculate reveal delay
  let startRevealDelay = 650; // default after flash

  if (highestRarityInRoll === "mythic") {
    startRevealDelay = 3000; // delay for vortex, pillar
    mythicFx.classList.add("active");
    startMythicParticles();
    
    // Screen crack screen-shake effect
    document.body.classList.add("screen-shake-active");
    setTimeout(() => {
      document.body.classList.remove("screen-shake-active");
    }, 800);

    // Stop vortex particles after some time
    setTimeout(() => {
      stopMythicParticles();
    }, 4500);
  } else if (highestRarityInRoll === "legendary") {
    startRevealDelay = 900;
  }

  // Trigger sequential flips
  const flipTimer = setTimeout(() => {
    const cards = cardsContainer.querySelectorAll(".rc-card");

    if (count === 1) {
      // 1 Pull reveal
      cards[0].classList.add("flip");
      
      // Trigger extra reward effects
      if (highestRarityInRoll === "mythic") {
        startConfetti("mythic");
      } else if (highestRarityInRoll === "legendary") {
        startConfetti("gold");
      }
      
      showRevealContinueBtn();
    } else {
      // 10 Pull reveal sequentially
      cards.forEach((card, idx) => {
        const timeout = setTimeout(() => {
          card.classList.add("flip");
          
          // Micro burst confetti on legendary/mythic reveal in grid
          const item = currentRollResult[idx];
          if (item.card.rarity === "mythic") {
            startConfetti("mythic");
          } else if (item.card.rarity === "legendary") {
            startConfetti("gold");
          }

          if (idx === cards.length - 1) {
            showRevealContinueBtn();
          }
        }, idx * 400);
        activeFlipTimeouts.push(timeout);
      });
    }
  }, startRevealDelay);
  activeFlipTimeouts.push(flipTimer);
}

function skipReveal() {
  activeFlipTimeouts.forEach(clearTimeout);
  activeFlipTimeouts = [];

  const cardsContainer = document.getElementById("reveal-cards");
  const cards = cardsContainer.querySelectorAll(".rc-card");
  
  cards.forEach((card, idx) => {
    card.classList.add("flip");
  });

  // Turn off mythic visual overlays
  document.getElementById("mythic-fx").classList.remove("active");
  stopMythicParticles();
  document.body.classList.remove("screen-shake-active");

  // Show generic confetti if mythic/legendary in batch
  if (highestRarityInRoll === "mythic") {
    startConfetti("mythic");
  } else if (highestRarityInRoll === "legendary") {
    startConfetti("gold");
  }

  showRevealContinueBtn();
}

function showRevealContinueBtn() {
  document.getElementById("reveal-skip").style.display = "none";
  document.getElementById("reveal-continue").classList.add("show");
}

function closeReveal() {
  document.getElementById("reveal-overlay").classList.remove("show");
  document.getElementById("mythic-fx").classList.remove("active");
  stopConfetti();
  stopMythicParticles();
  document.body.classList.remove("screen-shake-active");
  
  // Refresh views
  if (activeTab === "collection") {
    renderCollection();
  } else {
    renderHistory();
  }
}

// 8. Collection Album Render & Filters
function renderCollection() {
  const grid = document.getElementById("collection-grid");
  const emptyEl = document.getElementById("collection-empty");
  if (!grid) return;
  grid.innerHTML = "";

  const collection = userData.gacha?.collection || {};

  // Refresh progress bar / per-rarity breakdown
  updateCollectionProgress();

  // Count unique unlocked cards (header counter)
  const totalUnique = CARDS.length;
  const uniqueUnlocked = Object.keys(collection).filter(id => collection[id] > 0).length;
  const counterEl = document.getElementById("collection-counter");
  if (counterEl) counterEl.textContent = `${uniqueUnlocked} / ${totalUnique}`;

  // Apply rarity filter
  let filtered = CARDS;
  if (activeFilter !== "all") {
    filtered = filtered.filter(c => c.rarity === activeFilter);
  }

  // Apply search
  if (activeSearch) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(activeSearch) ||
      c.rarity.toLowerCase().includes(activeSearch)
    );
  }

  // Apply hide-locked
  if (hideLocked) {
    filtered = filtered.filter(c => (collection[c.id] || 0) > 0);
  }

  // Apply sort
  filtered = sortCards(filtered, activeSort, collection);

  // Empty state
  if (filtered.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  filtered.forEach(card => {
    const ownedCount = collection[card.id] || 0;
    const isUnlocked = ownedCount > 0;

    const cardEl = document.createElement("div");
    cardEl.className = `coll-card r-${card.rarity}`;
    if (!isUnlocked) {
      cardEl.classList.add("locked");
    }

    cardEl.innerHTML = `
      <img class="card-art" src="${getCardImagePath(card)}" alt="${card.name}" />
      <div class="coll-name">${card.name}</div>
      <div class="coll-rarity">${card.rarity.toUpperCase()}</div>
    `;

    // Click handler to open details
    cardEl.addEventListener("click", () => {
      openCardModal(card);
    });

    // 3D tilt effect on hover
    attachCardTilt(cardEl);

    grid.appendChild(cardEl);
  });
}

// Sorting helper
function sortCards(cards, mode, collection) {
  const sorted = [...cards];
  switch (mode) {
    case "rarity-desc":
      sorted.sort((a, b) => (RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]) || a.name.localeCompare(b.name));
      break;
    case "rarity-asc":
      sorted.sort((a, b) => (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) || a.name.localeCompare(b.name));
      break;
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "owned-first":
      sorted.sort((a, b) => {
        const oA = (collection[a.id] || 0) > 0 ? 0 : 1;
        const oB = (collection[b.id] || 0) > 0 ? 0 : 1;
        return oA - oB || (RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
      });
      break;
    case "locked-first":
      sorted.sort((a, b) => {
        const oA = (collection[a.id] || 0) > 0 ? 1 : 0;
        const oB = (collection[b.id] || 0) > 0 ? 1 : 0;
        return oA - oB || (RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
      });
      break;
  }
  return sorted;
}

// Attach a subtle 3D tilt effect on mouse move
function attachCardTilt(cardEl) {
  const MAX_TILT = 8; // degrees
  let rafId = null;

  function onMove(e) {
    const rect = cardEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;  // 0..1
    const y = (e.clientY - rect.top) / rect.height;  // 0..1
    const tiltX = (0.5 - y) * MAX_TILT * 2;
    const tiltY = (x - 0.5) * MAX_TILT * 2;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      cardEl.style.transform =
        `perspective(800px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-6px) scale(1.04)`;
    });
  }

  function onEnter() {
    cardEl.classList.add("is-tilting");
  }
  function onLeave() {
    cardEl.classList.remove("is-tilting");
    if (rafId) cancelAnimationFrame(rafId);
    cardEl.style.transform = "";
  }

  cardEl.addEventListener("mouseenter", onEnter);
  cardEl.addEventListener("mousemove", onMove);
  cardEl.addEventListener("mouseleave", onLeave);
}

function switchTab(tab) {
  activeTab = tab;
  
  // Update header buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  // Update panels
  document.getElementById("tab-collection").classList.toggle("active", tab === "collection");
  document.getElementById("tab-history").classList.toggle("active", tab === "history");

  if (tab === "collection") {
    renderCollection();
  } else {
    renderHistory();
  }
}

function filterCollection(rarity) {
  activeFilter = rarity;
  
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === rarity);
  });

  renderCollection();
}

// 9. History Tab Render
function renderHistory() {
  const historyList = document.getElementById("history-list");
  if (!historyList) return;
  historyList.innerHTML = "";

  const history = userData.gacha?.history || [];
  if (history.length === 0) {
    historyList.innerHTML = `<div class="history-empty">Belum ada pull. Tarik kartu pertamamu! 🃏</div>`;
    return;
  }

  history.forEach(item => {
    // Find card definition
    const card = CARDS.find(c => c.id === item.id);
    if (!card) return;

    const row = document.createElement("div");
    row.className = `history-row r-${item.rarity}`;

    // Formatting date
    const date = new Date(item.ts);
    const timeStr = date.toLocaleTimeString() + " - " + date.toLocaleDateString();

    row.innerHTML = `
      <div class="hist-thumb r-${item.rarity}">
        <img src="${getCardImagePath(card)}" alt="${card.name}" />
      </div>
      <div class="hist-info">
        <div class="hist-name">${card.name}</div>
        <div class="hist-time">${timeStr}</div>
      </div>
      <div class="hist-rarity ${item.rarity}">${item.rarity.toUpperCase()}</div>
    `;

    historyList.appendChild(row);
  });
}

// 10. Card Detail Modal
function openCardModal(card) {
  const modal = document.getElementById("card-modal");
  const inner = document.getElementById("card-modal-inner");
  if (!modal || !inner) return;

  const collection = userData.gacha?.collection || {};
  const isUnlocked = (collection[card.id] || 0) > 0;

  // Lookup info
  const dropRate    = getRarityDropRate(card.rarity);
  const coinValue   = COIN_VALUES[card.rarity] || 0;
  const statusLabel = isUnlocked ? "DIMILIKI" : "BELUM DIDAPAT";
  const statusClass = isUnlocked ? "unlocked" : "locked";

  // Cards with this rarity total
  const totalOfRarity = CARDS.filter(c => c.rarity === card.rarity).length;
  const indexInRarity = CARDS.filter(c => c.rarity === card.rarity).findIndex(c => c.id === card.id) + 1;
  const cardNumber    = `#${String(indexInRarity).padStart(2, "0")} / ${totalOfRarity}`;

  inner.innerHTML = `
    <button class="cmi-close" type="button" aria-label="Tutup" onclick="closeCardModal(event)">×</button>
    <div class="rc-card is-hero r-${card.rarity} ${!isUnlocked ? "locked" : ""}">
      <img class="card-art" src="${getCardImagePath(card)}" alt="${card.name}" />
      <div class="rc-name">${card.name}</div>
      <div class="rc-rarity">${card.rarity.toUpperCase()}</div>
    </div>
    <div class="card-modal-info">
      <span class="cmi-rarity-badge r-${card.rarity}">${card.rarity.toUpperCase()}</span>
      <h2 class="cmi-name">${card.name}</h2>
      <div class="cmi-status ${statusClass}">${statusLabel}</div>
      <div class="cmi-stats-grid">
        <div class="cmi-stat">
          <span class="cmi-stat-label">NOMOR KARTU</span>
          <span class="cmi-stat-value">${cardNumber}</span>
        </div>
        <div class="cmi-stat">
          <span class="cmi-stat-label">DROP RATE</span>
          <span class="cmi-stat-value">${dropRate}</span>
        </div>
        <div class="cmi-stat">
          <span class="cmi-stat-label">DUPLIKAT</span>
          <span class="cmi-stat-value"><span class="cmi-coin-icon">🪙</span>${coinValue.toLocaleString()}</span>
        </div>
        <div class="cmi-stat">
          <span class="cmi-stat-label">STATUS</span>
          <span class="cmi-stat-value" style="color:${isUnlocked ? '#4ade80' : 'var(--text-secondary)'}">
            ${isUnlocked ? "UNLOCKED" : "LOCKED"}
          </span>
        </div>
      </div>
    </div>
  `;

  modal.classList.add("show", "has-info");
}

function closeCardModal(e) {
  // If the user clicks inside the modal content, ignore — only background click closes
  if (e && e.target && e.target.closest && e.target.closest(".card-modal-inner") && !e.target.classList.contains("cmi-close")) {
    return;
  }
  const modal = document.getElementById("card-modal");
  if (modal) {
    modal.classList.remove("show", "has-info");
  }
}

// 11. Toast System
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  
  toast.textContent = msg;
  toast.classList.add("show");
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// 12. Floating Background Particles (Drifting up)
function initDriftingBackground() {
  const canvas = document.getElementById("particles-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  const colors = ["#FFD700", "#D81B3A", "#ff4d6d", "#ffa200"];

  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -Math.random() * 0.3 - 0.1,
      alpha: Math.random() * 0.4 + 0.15,
      size: Math.random() * 2.5 + 0.8,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.y < 0) {
        p.y = canvas.height;
        p.x = Math.random() * canvas.width;
        p.alpha = Math.random() * 0.4 + 0.15;
      }
      if (p.x < 0) p.x = canvas.width;
      else if (p.x > canvas.width) p.x = 0;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1.0;
    requestAnimationFrame(loop);
  }
  loop();
}

// 13. Confetti Particle System
let confettiActive = false;
let confettiParticles = [];
function startConfetti(colorType) {
  const canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  confettiParticles = [];
  confettiActive = true;

  const colors = colorType === "mythic" ? 
    ["#ff2d4e", "#FFD700", "#a855f7", "#22d3ee", "#ffffff"] : 
    ["#FFD700", "#ffeb3b", "#ffc107", "#ff9800", "#ffffff"];

  for (let i = 0; i < 150; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height - 20,
      r: Math.random() * 6 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0,
      w: Math.random() * 8 + 4,
      h: Math.random() * 12 + 6,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 4
    });
  }

  function draw() {
    if (!confettiActive) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let finished = true;

    confettiParticles.forEach(p => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += p.vy;
      p.x += p.vx;
      p.tilt = Math.sin(p.tiltAngle) * 12;

      if (p.y < canvas.height + 20) {
        finished = false;
      }

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.w / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.h / 2);
      ctx.stroke();
    });

    if (!finished && confettiActive) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

function stopConfetti() {
  confettiActive = false;
  const canvas = document.getElementById("confetti-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// 14. Mythic Particle Vortex System
let mythicParticlesActive = false;
let mythicParticles = [];
function startMythicParticles() {
  const canvas = document.getElementById("mythic-particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  mythicParticles = [];
  mythicParticlesActive = true;

  const colors = ["#ff2d4e", "#FFD700", "#ffa200", "#a855f7"];

  function spawnParticle() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(canvas.width, canvas.height) * 0.7 * (Math.random() * 0.5 + 0.5);
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      angle: angle,
      radius: radius,
      speed: Math.random() * 8 + 4,
      size: Math.random() * 3 + 1.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.8 + 0.2
    };
  }

  for (let i = 0; i < 100; i++) {
    mythicParticles.push(spawnParticle());
  }

  function draw() {
    if (!mythicParticlesActive) return;
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    mythicParticles.forEach((p, idx) => {
      p.radius -= p.speed * 0.7;
      p.angle += 0.04;
      p.x = centerX + Math.cos(p.angle) * p.radius;
      p.y = centerY + Math.sin(p.angle) * p.radius;

      if (p.radius < 15) {
        mythicParticles[idx] = spawnParticle();
        return;
      }

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1.0;
    if (mythicParticlesActive) {
      requestAnimationFrame(draw);
    }
  }
  draw();
}

function stopMythicParticles() {
  mythicParticlesActive = false;
  const canvas = document.getElementById("mythic-particles");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function logout() {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("authToken");
  window.location.href = "../login.html";
}
