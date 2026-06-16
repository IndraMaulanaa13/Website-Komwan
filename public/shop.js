// LUCKY SLOT - shop.js

/* ── CEK LOGIN ── */
const currentUser = localStorage.getItem("currentUser");
const authToken = localStorage.getItem("authToken");
if (!currentUser || !authToken) {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
}

const users = JSON.parse(localStorage.getItem("users")) || {};
let userData = users[currentUser] || { username: currentUser, coins: 0, gems: 0, fruit: 0 };

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${authToken}` };
}

/* ── STATE ── */
let coins     = userData.coins || 0;
let gems      = userData.gems  || 0;
let flashSeconds = 9653;
let transactionHistory = [];

/* ── INIT ── */
updateBalance();
renderHistory();
syncWallet();

const ddName = document.getElementById("dd-username");
if (ddName) ddName.textContent = currentUser;

/* ── PROFILE DROPDOWN ── */
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

/* ── LOGOUT ── */
function logout() {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("authToken");
  window.location.href = "login.html";
}

/* ── UPDATE BALANCE DISPLAY ── */
function updateBalance() {
  document.getElementById("display-coins").textContent = coins.toLocaleString();
  document.getElementById("display-gems").textContent  = gems.toLocaleString();
}

function saveLocalUser(nextUserData) {
  userData = {
    ...userData,
    ...nextUserData,
  };
  users[currentUser] = userData;
  coins = userData.coins || 0;
  gems = userData.gems || 0;
  localStorage.setItem("users", JSON.stringify(users));
}

async function syncWallet() {
  try {
    const response = await fetch("/api/me", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Gagal sinkron wallet");
    saveLocalUser(data.user);
    updateBalance();
  } catch (err) {
    console.warn("Gagal sinkron database, memakai cache lokal:", err.message);
  }
}

/* ── SAVE DATA ke database + localStorage ── */
async function saveData(type, note) {
  saveLocalUser({ coins, gems });
  updateBalance();
}

/* ── SELECT PACKAGE ── */
function selectPackage(el) {
  document.querySelectorAll(".pkg-card").forEach(p => p.classList.remove("selected"));
  el.classList.add("selected");

  const cost = parseInt(el.dataset.cost);
  document.getElementById("custom-input").value = cost;
  calcCustom();
}

/* ── CALC CUSTOM ── */
function calcCustom() {
  const val    = parseInt(document.getElementById("custom-input").value) || 0;
  const result = Math.floor(val / 100 * 10);
  document.getElementById("custom-output").textContent = result.toLocaleString();
}

/* ── DO EXCHANGE ── */
async function doExchange() {
  const amt    = parseInt(document.getElementById("custom-input").value) || 0;
  const reward = Math.floor(amt / 100 * 10);

  if (amt <= 0 || reward <= 0) {
    showToast("MASUKKAN JUMLAH KOIN!");
    return;
  }

  if (coins < amt) {
    showSuccess("Koin tidak cukup!", false);
    return;
  }

  try {
    const response = await fetch("/api/shop/exchange", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "coin_to_gems", coins: amt }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Gagal menukar koin");
    saveLocalUser(data.user);
    updateBalance();
  } catch (err) {
    showSuccess(err.message, false);
    return;
  }

  addHistory("💎", "Tukar " + amt.toLocaleString() + " koin", "+" + reward + " 💎");
  showSuccess("+" + reward + " Gems berhasil ditambahkan!", true);

  document.querySelectorAll(".pkg-card").forEach(p => p.classList.remove("selected"));
  document.getElementById("custom-input").value = 100;
  calcCustom();
}

/* ── DAILY CLAIM ── */
async function claimDaily() {
  try {
    const response = await fetch("/api/daily-claim", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Gagal klaim daily reward");
    saveLocalUser(data.user);
    updateBalance();
  } catch (err) {
    showSuccess(err.message, false);
    return;
  }

  addHistory("🎁", "Daily Bonus", "+500 🪙 +50 💎");
  showSuccess("Daily bonus +500 koin dan +50 gems berhasil diklaim!", true);

  const btn = document.getElementById("daily-btn");
  btn.textContent = "CLAIMED";
  btn.classList.add("claimed");
}

/* ── ADD HISTORY ROW ── */
function addHistory(icon, title, gemsText) {
  const now  = new Date();
  const time = now.getHours().toString().padStart(2, "0") + ":" +
               now.getMinutes().toString().padStart(2, "0");

  transactionHistory.unshift({ icon, title, gemsText, time });
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("history-list");

  if (transactionHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">Belum ada transaksi</div>';
    return;
  }

  list.innerHTML = transactionHistory.map(item => `
    <div class="history-row">
      <div class="hist-icon">${item.icon}</div>
      <div class="hist-info">
        <div class="hist-title">${item.title}</div>
        <div class="hist-time">Hari ini, ${item.time}</div>
      </div>
      <div class="hist-gems">${item.gemsText}</div>
    </div>
  `).join("");
}

/* ── SHOW SUCCESS POPUP ── */
function showSuccess(msg, isSuccess) {
  const overlay = document.getElementById("success-overlay");
  const msgEl   = document.getElementById("success-msg");
  const icon    = overlay.querySelector(".success-icon");
  const title   = overlay.querySelector(".success-title");

  if (isSuccess) {
    icon.textContent  = "💎";
    title.textContent = "BERHASIL!";
  } else {
    icon.textContent  = "⚠️";
    title.textContent = "GAGAL!";
  }

  msgEl.textContent = msg;
  overlay.classList.add("show");
}

function closeSuccess() {
  document.getElementById("success-overlay").classList.remove("show");
}

/* ── TOAST ── */
function showToast(msg, dur) {
  dur = dur || 2000;
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), dur);
}

/* ── FLASH SALE TIMER ── */
setInterval(() => {
  if (flashSeconds > 0) flashSeconds--;
  const h = Math.floor(flashSeconds / 3600);
  const m = Math.floor((flashSeconds % 3600) / 60);
  const s = flashSeconds % 60;
  const el = document.getElementById("flash-timer");
  if (el) {
    el.textContent =
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0");
  }
}, 1000);

/* ── PARTICLES ── */
function initParticles() {
  const canvas = document.getElementById("particles-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let particles = [];

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const COLORS = ["#FFD700", "#FF9A00", "#ff6b6b", "#ffffff"];

  for (let i = 0; i < 40; i++) {
    particles.push({
      x:   Math.random() * window.innerWidth,
      y:   Math.random() * window.innerHeight,
      vx:  (Math.random() - 0.5) * 0.3,
      vy:  -Math.random() * 0.35 - 0.1,
      alpha: Math.random() * 0.5 + 0.1,
      size: Math.random() * 1.8 + 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }

  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.y < 0) {
        p.y     = canvas.height;
        p.x     = Math.random() * canvas.width;
        p.alpha = Math.random() * 0.5 + 0.1;
      }

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    requestAnimationFrame(animateParticles);
  }

  animateParticles();
}

initParticles();
