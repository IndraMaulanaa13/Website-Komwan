// LUCKY SLOT - judol.js

/* ═══════════════════════════════════════
   SYMBOLS & LABELS
═══════════════════════════════════════ */
const SYMBOLS = [
  "💀","💀",
  "🍒","🍒","🍒",
  "🍋","🍋","🍋",
  "🍊","🍊",
  "🍇","🍇",
  "💵",
  "💎",
  "⭐",
  "🎰","🎰","🎰"
];

const LABELS = {
  "💀":"ZONK","🍒":"CERI","🍋":"LEMON","🍊":"JERUK",
  "🍇":"ANGGUR","💵":"UANG","💎":"GEMS","⭐":"STAR","🎰":"JACKPOT"
};

const REWARDS = {
  "🍒": { gems: 30,   coins: 0    },
  "🍋": { gems: 40,   coins: 0    },
  "🍊": { gems: 60,   coins: 0    },
  "🍇": { gems: 80,   coins: 0    },
  "💵": { gems: 0,    coins: 1000 },
  "💎": { gems: 300,  coins: 0    },
  "⭐": { gems: 150,  coins: 500  },
  "💀": { gems: 0,    coins: 0    },
  "🎰": { gems: 1000, coins: 5000 }
};

/* ═══════════════════════════════════════
   WIN RATE — UBAH NILAI INI SESUAI SELERA
   Contoh: 0.25 = 25% chance
═══════════════════════════════════════ */
const JACKPOT_CHANCE = 0.05;  // 5%  chance semua reel 🎰
const WIN_CHANCE     = 0.35;  // 35% chance full line simbol sama
// Sisanya (60%) = ZONK

const WIN_SYMBOLS = ["🍒","🍋","🍊","🍇","💵","💎","⭐"];

const RATE_PANEL_ROWS = [
  { icon: "🎰", name: "Jackpot", chance: JACKPOT_CHANCE },
  { icon: "✨", name: "Full Line", chance: WIN_CHANCE },
  { icon: "💀", name: "Zonk", chance: Math.max(0, 1 - JACKPOT_CHANCE - WIN_CHANCE) },
];

function formatRate(chance) {
  return `${(chance * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

function renderRatePanel() {
  const list = document.getElementById("rates-list");
  if (!list) return;
  list.innerHTML = RATE_PANEL_ROWS.map(row => `
    <div class="rate-row">
      <div class="rate-icon">${row.icon}</div>
      <div class="rate-info">
        <div class="rate-name">${row.name}</div>
        <div class="rate-pct">${formatRate(row.chance)}</div>
      </div>
    </div>
  `).join("");
}

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
const currentUser = localStorage.getItem("currentUser");
const authToken = localStorage.getItem("authToken");
if (!currentUser || !authToken) {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
}

const users = JSON.parse(localStorage.getItem("users")) || {};
let userData = users[currentUser] || { username: currentUser, gems: 0, coins: 0, fruit: 0 };

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${authToken}` };
}

function isAdminUser() {
  return userData && userData.isAdmin === true;
}

let gems       = isAdminUser() ? 999999999 : (userData.gems || 0);
let coins      = isAdminUser() ? 999999999 : (userData.coins || 0);
let currentBet = 20;
let spinning   = false;
let autoMode   = false;
let freeSpins  = 0;

/* ═══════════════════════════════════════
   REEL ELEMENTS
═══════════════════════════════════════ */
const reelResults = [];
const reelEls = [
  document.getElementById("inner-0"),
  document.getElementById("inner-1"),
  document.getElementById("inner-2"),
  document.getElementById("inner-3"),
  document.getElementById("inner-4")
];

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function createCell(symbol) {
  const div = document.createElement("div");
  div.className = "reel-cell";
  div.innerHTML = `<div>${symbol}</div><div class="sym-label">${LABELS[symbol]}</div>`;
  return div;
}

function saveLocalWallet(nextUserData) {
  userData = { ...userData, ...nextUserData };
  users[currentUser] = userData;
  if (!isAdminUser()) {
    gems = userData.gems || 0;
    coins = userData.coins || 0;
  }
  localStorage.setItem("users", JSON.stringify(users));
}

async function syncWalletFromDatabase() {
  if (!currentUser || isAdminUser()) return;
  try {
    const response = await fetch("/api/me", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Gagal sinkron wallet");
    saveLocalWallet(data.user);
    updateUI();
  } catch (error) {
    console.warn("Gagal sinkron wallet slot:", error.message);
  }
}

async function requestSlotSpin(bet) {
  const response = await fetch("/api/slot/spin", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action: "spin", bet }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Gagal memproses spin");
  saveLocalWallet(data.user);
  updateUI();
  return data.result;
}

/* ═══════════════════════════════════════
   BUILD INITIAL REELS
═══════════════════════════════════════ */
function buildInitialReels() {
  reelEls.forEach(reel => {
    reel.innerHTML = "";
    for (let i = 0; i < 20; i++) {
      reel.appendChild(createCell(randomSymbol()));
    }
  });
}
buildInitialReels();

/* ═══════════════════════════════════════
   BET BUTTONS
═══════════════════════════════════════ */
document.querySelectorAll(".bet-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".bet-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentBet = parseInt(btn.dataset.val);
  });
});

/* ═══════════════════════════════════════
   FREE SPIN UI
═══════════════════════════════════════ */
function updateFreeSpinUI() {
  const btn = document.getElementById("btn-spin");
  if (freeSpins > 0) {
    btn.style.background  = "linear-gradient(135deg, #ff9a00, #ffb732)";
    btn.style.borderColor = "#ffb732";
    btn.style.color       = "#1a0000";
    btn.textContent       = "FREE SPIN (" + freeSpins + ")";
  } else {
    btn.style.background  = "";
    btn.style.borderColor = "";
    btn.style.color       = "";
    btn.textContent       = "SPIN";
  }
}

/* ═══════════════════════════════════════
   MAIN SPIN
═══════════════════════════════════════ */
async function doSpin() {
  if (spinning) return;

  if (!isAdminUser() && gems < currentBet) {
    alert("GEMS TIDAK CUKUP!");
    return;
  }

  spinning = true;
  document.getElementById("btn-spin").disabled = true;
  document.getElementById("win-banner").innerHTML = "&nbsp;";

  reelResults.length = 0;

  let serverResult;
  try {
    serverResult = await requestSlotSpin(currentBet);
  } catch (err) {
    alert(err.message);
    spinning = false;
    document.getElementById("btn-spin").disabled = false;
    return;
  }
  serverResult.reels.forEach((symbol, index) => {
    reelResults[index] = symbol;
  });

  // Jalankan animasi reel dengan target yang sudah ditentukan
  const promises = reelEls.map((reel, index) =>
    spinReel(reel, index, reelResults[index])
  );
  await Promise.all(promises);

  checkWin(serverResult);
  spinning = false;
  document.getElementById("btn-spin").disabled = false;

  if (autoMode) setTimeout(() => doSpin(), 900);
}

/* ═══════════════════════════════════════
   REEL ANIMATION
   Sekarang menerima targetSymbol sebagai parameter
═══════════════════════════════════════ */
function spinReel(reel, index, targetSymbol) {
  return new Promise(resolve => {
    reel.innerHTML = "";
    const total = 35;

    // Isi reel dengan simbol random, kecuali cell ke-(total-2) = targetSymbol (agar muncul di tengah row visible)
    for (let i = 0; i < total; i++) {
      const sym = (i === total - 2) ? targetSymbol : randomSymbol();
      reel.appendChild(createCell(sym));
    }

    reel.style.transition = "none";
    reel.style.transform  = "translateY(0px)";
    reel.offsetHeight;

    const duration = 1800 + index * 400;
    reel.style.transition = `transform ${duration}ms cubic-bezier(.17,.67,.25,1)`;
    reel.style.transform  = `translateY(-${(total - 3) * 90}px)`;

    setTimeout(() => resolve(), duration + 50);
  });
}

/* ═══════════════════════════════════════
   CHECK WIN
═══════════════════════════════════════ */
function checkWin(serverResult) {
  const banner  = document.getElementById("win-banner");
  const allSame = reelResults.every(s => s === reelResults[0]);
  const sym     = reelResults[0];

  if (allSame && sym === "🎰") {
    // ══ JACKPOT ══
    freeSpins += serverResult.freeSpinsAwarded || 0;
    banner.innerHTML = "🎰 JACKPOT! 🎰";
    updateUI();
    updateFreeSpinUI();
    triggerJackpotAnimation();

  } else if (allSame && sym !== "💀") {
    // ══ FULL LINE WIN ══
    const reward = serverResult.reward || { gems: 0, coins: 0 };
    freeSpins += serverResult.freeSpinsAwarded || 0;
    banner.innerHTML = sym + " FULL LINE! +" + (reward.gems || reward.coins) + (reward.gems ? " GEMS" : " KOIN") + " +1 FREE SPIN";
    updateUI();
    updateFreeSpinUI();
    triggerWinAnimation();

  } else {
    // ══ ZONK ══
    banner.innerHTML = "💀 ZONK — Coba lagi!";
  }
}

/* ═══════════════════════════════════════
   JACKPOT OVERLAY ANIMATION
═══════════════════════════════════════ */
function triggerJackpotAnimation() {
  let overlay = document.getElementById("jackpot-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "jackpot-overlay";
    overlay.innerHTML = `
      <div class="jk-box">
        <div class="jk-coins-wrap" id="jk-coins-container"></div>
        <div class="jk-emoji">🎰</div>
        <div class="jk-title">J A C K P O T !</div>
        <div class="jk-divider"></div>
        <div class="jk-rewards">
          <div class="jk-reward-item">💎 +1,000 GEMS</div>
          <div class="jk-reward-item">🪙 +5,000 KOIN</div>
        </div>
        <div class="jk-free">🎁 FREE SPIN x3 DIDAPAT!</div>
        <button class="jk-close" onclick="closeJackpotOverlay()">✨ KLAIM HADIAH ✨</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Inject CSS jackpot
    if (!document.getElementById("jackpot-style")) {
      const style = document.createElement("style");
      style.id = "jackpot-style";
      style.textContent = `
        #jackpot-overlay {
          position:fixed;inset:0;
          background:rgba(0,0,0,0.88);
          display:none;align-items:center;justify-content:center;
          z-index:9999;backdrop-filter:blur(5px);
        }
        #jackpot-overlay.show { display:flex; }
        .jk-box {
          background:radial-gradient(ellipse at top,#2a0010,#0a0005);
          border:2px solid #FFD700;border-radius:22px;
          padding:40px 52px;text-align:center;position:relative;
          overflow:hidden;max-width:440px;width:92%;
          animation:jkBoxPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275);
          box-shadow:0 0 60px rgba(255,215,0,0.35),0 0 120px rgba(192,24,42,0.25);
        }
        @keyframes jkBoxPop {
          0%{transform:scale(0.3) rotate(-5deg);opacity:0}
          70%{transform:scale(1.06) rotate(1deg)}
          100%{transform:scale(1) rotate(0);opacity:1}
        }
        .jk-box::before {
          content:'';position:absolute;inset:0;
          background:linear-gradient(45deg,transparent 30%,rgba(255,215,0,0.05) 50%,transparent 70%);
          animation:jkShimmer 2s linear infinite;pointer-events:none;
        }
        @keyframes jkShimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        .jk-coins-wrap{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
        .jk-coin{
          position:absolute;font-size:22px;top:-40px;
          animation:coinFall linear forwards;
        }
        @keyframes coinFall{
          0%{transform:translateY(0) rotate(0deg);opacity:1}
          100%{transform:translateY(600px) rotate(720deg);opacity:0}
        }
        .jk-emoji{
          font-size:76px;display:block;margin-bottom:10px;
          animation:jkBounce 0.6s ease infinite alternate;
          filter:drop-shadow(0 0 22px rgba(255,215,0,0.7));
        }
        @keyframes jkBounce{
          0%{transform:scale(1) translateY(0)}
          100%{transform:scale(1.12) translateY(-10px)}
        }
        .jk-title{
          font-family:'Cinzel',serif;font-size:34px;font-weight:900;
          color:#FFD700;letter-spacing:8px;margin-bottom:16px;
          animation:jkTitlePulse 1s ease infinite alternate;
          text-shadow:0 0 20px rgba(255,215,0,0.8),0 0 40px rgba(255,215,0,0.4);
        }
        @keyframes jkTitlePulse{
          0%{text-shadow:0 0 20px rgba(255,215,0,0.8),0 0 40px rgba(255,215,0,0.4)}
          100%{text-shadow:0 0 40px #FFD700,0 0 80px rgba(255,215,0,0.7),0 0 120px #ff9a00}
        }
        .jk-divider{
          width:60%;height:1px;margin:0 auto 16px;
          background:linear-gradient(to right,transparent,#FFD700,transparent);
        }
        .jk-rewards{display:flex;gap:14px;justify-content:center;margin-bottom:14px;}
        .jk-reward-item{
          background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.25);
          border-radius:8px;padding:8px 16px;
          font-family:'Oswald',sans-serif;font-size:15px;
          color:#FFD700;font-weight:600;letter-spacing:1px;
        }
        .jk-free{
          font-family:'Oswald',sans-serif;font-size:14px;
          color:#ff9a00;letter-spacing:2px;
          margin-bottom:22px;text-transform:uppercase;
        }
        .jk-close{
          background:linear-gradient(135deg,#C0182A,#e84155);
          border:2px solid #ff6b7a;border-radius:10px;
          padding:13px 34px;color:#fff;
          font-family:'Cinzel',serif;font-size:15px;
          font-weight:700;letter-spacing:2px;
          cursor:pointer;transition:all 0.15s;text-transform:uppercase;
        }
        .jk-close:hover{transform:scale(1.05);box-shadow:0 4px 20px rgba(192,24,42,0.5);}
        @keyframes winBannerFlash{
          0%,100%{color:#FFD700}
          50%{color:#fff;text-shadow:0 0 20px #FFD700}
        }
      `;
      document.head.appendChild(style);
    }
  }

  overlay.classList.add("show");

  // Spawn koin jatuh
  const container = document.getElementById("jk-coins-container");
  if (container) {
    container.innerHTML = "";
    const coinEmojis = ["💎","🪙","⭐","🎰","💰","✨"];
    for (let i = 0; i < 24; i++) {
      const coin = document.createElement("div");
      coin.className  = "jk-coin";
      coin.textContent = coinEmojis[Math.floor(Math.random() * coinEmojis.length)];
      coin.style.left              = Math.random() * 100 + "%";
      coin.style.animationDuration = (1.2 + Math.random() * 2) + "s";
      coin.style.animationDelay    = (Math.random() * 1.8) + "s";
      container.appendChild(coin);
    }
  }

  // Flash reels frame
  const frame = document.getElementById("reels-frame");
  if (frame) {
    frame.classList.add("jackpot");
    setTimeout(() => frame.classList.remove("jackpot"), 3000);
  }

  startFireworks(5000);
}

function closeJackpotOverlay() {
  const overlay = document.getElementById("jackpot-overlay");
  if (overlay) overlay.classList.remove("show");
}

/* ═══════════════════════════════════════
   WIN ANIMATION (non-jackpot)
═══════════════════════════════════════ */
function triggerWinAnimation() {
  const frame = document.getElementById("reels-frame");
  if (frame) {
    frame.classList.add("win");
    setTimeout(() => frame.classList.remove("win"), 1600);
  }
}

/* ═══════════════════════════════════════
   FIREWORKS
═══════════════════════════════════════ */
const fwCanvas = document.getElementById("fireworks-canvas");
const fwCtx    = fwCanvas ? fwCanvas.getContext("2d") : null;
let fwParticles = [];
let fwRunning   = false;
let fwTimer     = null;

function resizeFwCanvas() {
  if (!fwCanvas) return;
  fwCanvas.width  = window.innerWidth;
  fwCanvas.height = window.innerHeight;
}
if (fwCanvas) {
  window.addEventListener("resize", resizeFwCanvas);
  resizeFwCanvas();
}

function spawnFirework() {
  if (!fwCanvas) return;
  const x = Math.random() * fwCanvas.width;
  const y = Math.random() * fwCanvas.height * 0.65;
  const colors = ["#FFD700","#FF4444","#FF9A00","#FF69B4","#FFFFFF","#00FFAA"];
  const color  = colors[Math.floor(Math.random() * colors.length)];
  for (let i = 0; i < 55; i++) {
    const angle = (Math.PI * 2 / 55) * i;
    const speed = 2 + Math.random() * 5;
    fwParticles.push({ x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      alpha: 1, color, size: 2 + Math.random() * 2.5
    });
  }
}

function animateFireworks() {
  if (!fwRunning || !fwCanvas || !fwCtx) return;
  fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height);
  fwParticles.forEach(p => {
    p.x += p.vx; p.y += p.vy + 0.08; p.alpha -= 0.016;
    fwCtx.globalAlpha = Math.max(0, p.alpha);
    fwCtx.fillStyle   = p.color;
    fwCtx.beginPath();
    fwCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fwCtx.fill();
  });
  fwParticles = fwParticles.filter(p => p.alpha > 0);
  requestAnimationFrame(animateFireworks);
}

function startFireworks(duration) {
  if (!fwCanvas) return;
  fwCanvas.classList.add("active");
  fwRunning   = true;
  fwParticles = [];
  const interval = setInterval(spawnFirework, 220);
  animateFireworks();
  clearTimeout(fwTimer);
  fwTimer = setTimeout(() => {
    clearInterval(interval);
    fwRunning = false;
    setTimeout(() => {
      fwCanvas.classList.remove("active");
      fwParticles = [];
    }, 1200);
  }, duration);
}

/* ═══════════════════════════════════════
   AUTO MODE
═══════════════════════════════════════ */
function toggleAuto() {
  autoMode = !autoMode;
  const btn = document.getElementById("btn-auto");
  btn.classList.toggle("on");
  if (autoMode && !spinning) doSpin();
}

/* ═══════════════════════════════════════
   MAX BET
═══════════════════════════════════════ */
function setMaxBet() {
  currentBet = 200;
  document.querySelectorAll(".bet-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('.bet-btn[data-val="200"]').classList.add("active");
}

/* ═══════════════════════════════════════
   BONUS BUY
═══════════════════════════════════════ */
function buyBonus(type) {
  console.info(`Bonus buy '${type}' belum diimplementasikan, jadi tidak ada gems yang dipotong.`);
}

function disableBonusBuyButtons() {
  document.querySelectorAll(".btn-bonus").forEach(button => {
    button.disabled = true;
    button.title = "Bonus buy belum diimplementasikan";
  });
  console.info("Bonus buy dinonaktifkan sampai pity/multiplier diterapkan di checkWin().");
}

/* ═══════════════════════════════════════
   UPDATE UI & SAVE
═══════════════════════════════════════ */
function updateUI() {
  if (isAdminUser()) {
    document.getElementById("gems").innerText  = "UNLIMITED";
    document.getElementById("coins").innerText = "UNLIMITED";
  } else {
    document.getElementById("gems").innerText  = gems.toLocaleString();
    document.getElementById("coins").innerText = coins.toLocaleString();
  }
}

function saveData() {
  if (isAdminUser()) return;
  userData = { ...userData, gems, coins };
  users[currentUser] = userData;
  localStorage.setItem("users", JSON.stringify(users));
}

function logout() {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("authToken");
  window.location.href = "login.html";
}

updateUI();
renderRatePanel();
disableBonusBuyButtons();
syncWalletFromDatabase();

const ddName = document.getElementById("dd-username");
if (ddName) ddName.innerText = currentUser;

/* ═══════════════════════════════════════
   PROFILE DROPDOWN
═══════════════════════════════════════ */
const profileBtn      = document.getElementById("profileBtn");
const profileDropdown = document.getElementById("profileDropdown");

profileBtn.addEventListener("click", () => {
  profileDropdown.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
    profileDropdown.classList.remove("open");
  }
});

/* ═══════════════════════════════════════
   PARTICLES BACKGROUND
═══════════════════════════════════════ */
const pCanvas = document.getElementById("particles-canvas");
const pCtx    = pCanvas ? pCanvas.getContext("2d") : null;
let particles = [];

function resizePCanvas() {
  if (!pCanvas) return;
  pCanvas.width  = window.innerWidth;
  pCanvas.height = window.innerHeight;
}
if (pCanvas) {
  window.addEventListener("resize", resizePCanvas);
  resizePCanvas();
}

const P_COLORS = ["#FFD700","#FF9A00","#ff6b6b","#ffffff"];
for (let i = 0; i < 40; i++) {
  particles.push({
    x:     Math.random() * window.innerWidth,
    y:     Math.random() * window.innerHeight,
    vx:    (Math.random() - 0.5) * 0.3,
    vy:    -Math.random() * 0.35 - 0.1,
    alpha: Math.random() * 0.5 + 0.1,
    size:  Math.random() * 1.8 + 0.4,
    color: P_COLORS[Math.floor(Math.random() * P_COLORS.length)]
  });
}

function animateParticles() {
  if (!pCanvas || !pCtx) return;
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.y < 0) {
      p.y = pCanvas.height;
      p.x = Math.random() * pCanvas.width;
      p.alpha = Math.random() * 0.5 + 0.1;
    }
    pCtx.globalAlpha = p.alpha;
    pCtx.fillStyle   = p.color;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    pCtx.fill();
  });
  pCtx.globalAlpha = 1;
  requestAnimationFrame(animateParticles);
}
animateParticles();
