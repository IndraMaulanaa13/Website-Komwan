/* LUCKYPORTAL - lobby.js */

// 1. Authenticate Gate: Check if user is logged in
const currentUser = localStorage.getItem("currentUser");
const authToken = localStorage.getItem("authToken");
if (!currentUser || !authToken) {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
}

// Global variables for user and data
let users = JSON.parse(localStorage.getItem("users")) || {};
let userData = users[currentUser] || { username: currentUser, gems: 0, coins: 0, fruit: 0 };

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${authToken}` };
}

// 2. Initialize Displays
document.addEventListener("DOMContentLoaded", () => {
  updateUserUI();
  initParticleBackground();
  checkDailyRewardCooldown();
  updatePersonalStats();
  initPromoCarousel();
  initProfileDropdown();
  initGameCardTilt();
  initOnlineCountAnim();

  // Update countdown active if needed
  setInterval(checkDailyRewardCooldown, 1000);
  syncCurrentUser();
});

function saveCurrentUser(nextUserData) {
  userData = {
    ...userData,
    ...nextUserData,
  };
  users[currentUser] = userData;
  localStorage.setItem("users", JSON.stringify(users));
}

async function syncCurrentUser() {
  try {
    const response = await fetch("/api/me", { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Gagal sinkron data user");
    saveCurrentUser(data.user);
    updateUserUI();
    checkDailyRewardCooldown();
    updatePersonalStats();
  } catch (err) {
    console.warn("Gagal sinkron database, memakai cache lokal:", err.message);
  }
}

// Profile dropdown toggle
function initProfileDropdown() {
  const btn = document.getElementById("profileBtn");
  const dd  = document.getElementById("profileDropdown");
  if (!btn || !dd) return;

  function positionDropdown() {
    const rect = btn.getBoundingClientRect();
    const gap = 10;
    const margin = 12;
    const width = Math.min(240, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    dd.style.setProperty("--profile-dd-top", `${rect.bottom + gap}px`);
    dd.style.setProperty("--profile-dd-left", `${left}px`);
    dd.style.setProperty("--profile-dd-right", "auto");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    positionDropdown();
    dd.classList.toggle("open");
    btn.classList.toggle("open");
  });
  window.addEventListener("resize", () => {
    if (dd.classList.contains("open")) positionDropdown();
  });
  window.addEventListener("scroll", () => {
    if (dd.classList.contains("open")) positionDropdown();
  }, { passive: true });
  document.addEventListener("click", () => {
    dd.classList.remove("open");
    btn.classList.remove("open");
  });
  dd.addEventListener("click", (e) => e.stopPropagation());
}

// Rotate promo badges every 4 seconds
function initPromoCarousel() {
  const carousel = document.getElementById("promo-carousel");
  if (!carousel) return;
  const badges = carousel.querySelectorAll(".promo-badge");
  if (badges.length < 2) return;

  let idx = 0;
  setInterval(() => {
    badges[idx].classList.remove("active");
    idx = (idx + 1) % badges.length;
    badges[idx].classList.add("active");
  }, 4500);
}

// Subtle 3D tilt on game cards
function initGameCardTilt() {
  const cards = document.querySelectorAll(".game-card.ready");
  const MAX_TILT = 6;

  cards.forEach(card => {
    let rafId = null;

    card.addEventListener("mouseenter", () => card.classList.add("is-tilting"));
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const tiltX = (0.5 - y) * MAX_TILT * 2;
      const tiltY = (x - 0.5) * MAX_TILT * 2;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        card.style.transform =
          `perspective(1000px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-8px) scale(1.02)`;
      });
    });
    card.addEventListener("mouseleave", () => {
      card.classList.remove("is-tilting");
      if (rafId) cancelAnimationFrame(rafId);
      card.style.transform = "";
    });
  });
}

// Slow live counter animation for online count
function initOnlineCountAnim() {
  const el = document.getElementById("online-count");
  if (!el) return;
  let base = 1247;
  setInterval(() => {
    base += Math.floor((Math.random() - 0.4) * 5);
    if (base < 1100) base = 1100;
    if (base > 1500) base = 1500;
    el.textContent = base.toLocaleString("id-ID");
  }, 3500);
}

// Compute & render personal stats panel
function updatePersonalStats() {
  if (!userData) return;

  // Pull data from existing gacha state if available
  const gacha = userData.gacha || {};
  const collection = gacha.collection || {};
  const history = gacha.history || [];

  // Games played proxy = total gacha pulls + judol spins + cardbattle games
  const gachaPulls = history.length;
  const slotSpins  = userData.totalSpins || 0;
  const cbGames    = userData.totalCBGames || 0;
  const totalGames = gachaPulls + slotSpins + cbGames;

  // Cards owned (unique)
  const totalCards = 23;
  const ownedCards = Object.keys(collection).filter(id => collection[id] > 0).length;

  // Daily streak (consecutive days; fallback to 1 if claimed today, else 0)
  const lastClaim = userData.lastDailyClaim || 0;
  const dayMs = 24 * 60 * 60 * 1000;
  let streak = userData.dailyStreak || 0;
  if (lastClaim === 0) streak = 0;

  // Joined date (best-effort: use first localStorage key or treat as today)
  const joinedTs = userData.joinedAt || Date.now();
  const joinedDate = new Date(joinedTs).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  // Level: based on totalGames (simple formula)
  const level = Math.max(1, Math.floor(Math.sqrt(totalGames / 5)) + 1);
  const xpForCurrent = (level - 1) * (level - 1) * 5;
  const xpForNext    = level * level * 5;
  const xpInLevel    = totalGames - xpForCurrent;
  const xpNeeded     = xpForNext - xpForCurrent;
  const xpPercent    = xpNeeded > 0 ? Math.min(100, (xpInLevel / xpNeeded) * 100) : 0;

  // Render
  setText("ps-level", level);
  setText("ps-xp-text", `${xpInLevel} / ${xpNeeded} XP`);
  const xpFill = document.getElementById("ps-xp-fill");
  if (xpFill) xpFill.style.width = `${xpPercent}%`;

  setText("ps-games-played", totalGames.toLocaleString("id-ID"));
  setText("ps-coins", isAdmin() ? "∞" : (userData.coins || 0).toLocaleString("id-ID"));
  setText("ps-gems",  isAdmin() ? "∞" : (userData.gems  || 0).toLocaleString("id-ID"));
  setText("ps-cards", `${ownedCards} / ${totalCards}`);
  setText("ps-streak", `${streak} hari`);
  setText("ps-joined", joinedDate);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function isAdmin() {
  return userData && userData.isAdmin === true;
}

// Update the user details and balances in the UI
function updateUserUI() {
  if (!userData) return;
  document.body.classList.toggle("is-admin", isAdmin());

  // Profile chip shows just the username
  const welcomeEl = document.getElementById("welcome-msg");
  if (welcomeEl) welcomeEl.textContent = currentUser;
  const ddNameEl = document.getElementById("dd-username");
  if (ddNameEl) ddNameEl.textContent = currentUser;

  // Avatar = first letter of username
  const initial = (currentUser || "U").charAt(0).toUpperCase();
  const avatarEl = document.getElementById("profile-avatar");
  if (avatarEl) avatarEl.textContent = initial;
  const ddAvatarEl = document.getElementById("dd-avatar");
  if (ddAvatarEl) ddAvatarEl.textContent = initial;

  const gemsEl = document.getElementById("gems-display");
  const coinsEl = document.getElementById("coins-display");

  if (isAdmin()) {
    gemsEl.textContent = "∞";
    coinsEl.textContent = "∞";
  } else {
    gemsEl.textContent = (userData.gems || 0).toLocaleString();
    coinsEl.textContent = (userData.coins || 0).toLocaleString();
  }
}

// 3. Logout function
function logout() {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("authToken");
  window.location.href = "login.html";
}

// 4. Daily Claim Logic
function checkDailyRewardCooldown() {
  const claimBtn = document.getElementById("daily-claim-btn");
  if (!claimBtn || !userData) return;

  const ringWrap = document.getElementById("dr-ring-wrap");
  const ringFill = document.getElementById("dr-ring-fill");
  const drStatus = document.getElementById("dr-status");
  const qaSub    = document.getElementById("qa-daily-sub");
  const drIcon   = document.getElementById("daily-reward-icon");

  const lastClaim = userData.lastDailyClaim || 0;
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;
  const RING_LEN = 276.46; // 2π * 44

  if (now - lastClaim < cooldown) {
    // Under cooldown
    claimBtn.disabled = true;
    const timeRemaining = cooldown - (now - lastClaim);
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    claimBtn.textContent = `Tersedia dalam ${hh}:${mm}:${ss}`;
    if (drStatus) drStatus.textContent = "Belum waktunya — cek lagi nanti";
    if (qaSub)    qaSub.textContent = `Lagi cooldown · ${hh}:${mm}:${ss}`;
    if (drIcon)   drIcon.textContent = "⏳";
    if (ringWrap) ringWrap.classList.remove("ready");

    // Progress ring: fills as time elapses (0 just claimed → full ready)
    const progress = 1 - (timeRemaining / cooldown);
    if (ringFill) ringFill.style.strokeDashoffset = `${RING_LEN * (1 - progress)}`;
  } else {
    // Ready to claim
    claimBtn.disabled = false;
    claimBtn.textContent = "Klaim Saldo Hari Ini";
    if (drStatus) drStatus.textContent = "Klaim saldo harian gratis Anda!";
    if (qaSub)    qaSub.textContent = "Siap diklaim! 🎁";
    if (drIcon)   drIcon.textContent = "🎁";
    if (ringWrap) ringWrap.classList.add("ready");
    if (ringFill) ringFill.style.strokeDashoffset = "0";
  }
}

async function claimDailyReward() {
  if (!userData) return;

  if (isAdmin()) {
    showToast("Admin sudah memiliki saldo tak terbatas!");
    return;
  }

  const lastClaim = userData.lastDailyClaim || 0;
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;

  if (now - lastClaim < cooldown) {
    showToast("Daily Reward belum siap diklaim!");
    return;
  }

  try {
    const response = await fetch("/api/daily-claim", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Gagal klaim daily reward");
    saveCurrentUser(data.user);
  } catch (err) {
    showToast(err.message);
    return;
  }

  // Update view
  updateUserUI();
  checkDailyRewardCooldown();
  updatePersonalStats();

  // Trigger animations
  triggerClaimAnimation();
  showToast(`Daily Reward diklaim! +500 🪙, +50 💎 · Streak: ${userData.dailyStreak} hari 🔥`);
}

// Flying Coins/Gems Emojis Animation
function triggerClaimAnimation() {
  const container = document.getElementById("claim-effects-container");
  const claimBtn = document.getElementById("daily-claim-btn");
  if (!container || !claimBtn) return;
  
  // Get button coordinates to emit particles from
  const btnRect = claimBtn.getBoundingClientRect();
  const startX = btnRect.left + btnRect.width / 2;
  const startY = btnRect.top + btnRect.height / 2;
  
  const emojis = ["🪙", "💎", "🪙", "💎", "✨", "✨"];
  
  // Emit 20 elements
  for (let i = 0; i < 20; i++) {
    const el = document.createElement("div");
    el.className = "flying-item";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    
    // Set start positions
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    
    // Calculate random trajectories (dx, dy)
    // Most particles fly upwards and outwards
    const angle = (Math.PI * 2 / 20) * i + (Math.random() - 0.5) * 0.5;
    const distance = 80 + Math.random() * 150;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 80; // extra lift
    const rotation = (Math.random() - 0.5) * 360;
    
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    el.style.setProperty("--rot", `${rotation}deg`);
    
    container.appendChild(el);
    
    // Clean up DOM after animation completes
    setTimeout(() => {
      el.remove();
    }, 1200);
  }
}

// 5. Toast Notification System
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

// 6. Slow Floating Canvas Particle Background
function initParticleBackground() {
  const canvas = document.getElementById("particles-canvas");
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  let particles = [];
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  
  // Color palette for particles: Neon gold and neon crimson
  const PARTICLE_COLORS = [
    "#FFD700", // Gold
    "#D81B3A", // Crimson
    "#ff4d6d", // Light red
    "#ffa200"  // Amber
  ];
  
  // Instantiate 50 particles
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25, // slow drifting x
      vy: -Math.random() * 0.3 - 0.1,    // slow drifting y (upwards)
      alpha: Math.random() * 0.4 + 0.1,  // translucent glow
      size: Math.random() * 2.5 + 0.6,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]
    });
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      
      // Wrap particles around borders
      if (p.y < 0) {
        p.y = canvas.height;
        p.x = Math.random() * canvas.width;
        p.alpha = Math.random() * 0.4 + 0.1;
      }
      if (p.x < 0) {
        p.x = canvas.width;
      } else if (p.x > canvas.width) {
        p.x = 0;
      }
      
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      
      // Draw smooth circular glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.globalAlpha = 1.0;
    requestAnimationFrame(animate);
  }
  
  animate();
}
