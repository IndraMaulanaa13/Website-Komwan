const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const serverDir = path.resolve(__dirname, "..");
const port = String(process.env.PORT || 3000);
const localUrl = `http://127.0.0.1:${port}`;
const ngrokApiUrl = "http://127.0.0.1:4040/api/tunnels";

let serverChild = null;
let ngrokChild = null;
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} dari ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy(new Error(`Timeout saat akses ${url}`));
    });
  });
}

async function waitUntil(label, check, retries = 40) {
  for (let i = 0; i < retries; i++) {
    const result = await check().catch(() => null);
    if (result) return result;
    await wait(500);
  }
  throw new Error(`${label} belum siap`);
}

async function isServerRunning() {
  const health = await requestJson(`${localUrl}/api/health`);
  return health && health.success;
}

function spawnServer() {
  console.log(`Menyalakan server di ${localUrl}`);
  serverChild = spawn(process.execPath, ["server.js"], {
    cwd: serverDir,
    env: { ...process.env, PORT: port },
    stdio: "inherit",
  });
  serverChild.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`Server berhenti dengan kode ${code}`);
      cleanup(code || 1);
    }
  });
}

function spawnNgrok() {
  console.log(`Membuka ngrok untuk port ${port}`);
  ngrokChild = spawn("ngrok", ["http", port], {
    cwd: serverDir,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  ngrokChild.stdout.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(text);
  });
  ngrokChild.stderr.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(text);
  });
  ngrokChild.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`ngrok berhenti dengan kode ${code}`);
      cleanup(code || 1);
    }
  });
}

async function getTunnelUrl() {
  const data = await requestJson(ngrokApiUrl);
  const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
  const matchingTunnel = tunnels.find((tunnel) => {
    const addr = tunnel.config && String(tunnel.config.addr || "");
    return addr.includes(port);
  });
  const tunnel = matchingTunnel || tunnels.find((item) => item.proto === "https") || tunnels[0];
  return tunnel && tunnel.public_url;
}

function cleanup(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (ngrokChild && !ngrokChild.killed) ngrokChild.kill();
  if (serverChild && !serverChild.killed) serverChild.kill();
  process.exit(exitCode);
}

async function main() {
  const serverAlreadyRunning = await isServerRunning().catch(() => false);
  if (!serverAlreadyRunning) {
    spawnServer();
    await waitUntil("Server lokal", isServerRunning);
  } else {
    console.log(`Server sudah aktif di ${localUrl}`);
  }

  spawnNgrok();
  const publicUrl = await waitUntil("Tunnel ngrok", getTunnelUrl, 50);

  console.log("");
  console.log(`URL lokal : ${localUrl}`);
  console.log(`URL ngrok : ${publicUrl}`);
  console.log("Tekan Ctrl+C untuk mematikan server dan ngrok.");
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

main().catch((err) => {
  console.error(err.message);
  cleanup(1);
});
