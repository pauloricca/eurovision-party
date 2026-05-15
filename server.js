import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "party-state.json");
const countriesFile = path.join(__dirname, "countries.txt");
const port = Number(process.env.PORT || 3000);

const countryMeta = {
  Albania: { code: "AL", flag: "🇦🇱" },
  Australia: { code: "AU", flag: "🇦🇺" },
  Austria: { code: "AT", flag: "🇦🇹" },
  Belgium: { code: "BE", flag: "🇧🇪" },
  Bulgaria: { code: "BG", flag: "🇧🇬" },
  Croatia: { code: "HR", flag: "🇭🇷" },
  Cyprus: { code: "CY", flag: "🇨🇾" },
  Czechia: { code: "CZ", flag: "🇨🇿" },
  Denmark: { code: "DK", flag: "🇩🇰" },
  Finland: { code: "FI", flag: "🇫🇮" },
  France: { code: "FR", flag: "🇫🇷" },
  Germany: { code: "DE", flag: "🇩🇪" },
  Greece: { code: "GR", flag: "🇬🇷" },
  Israel: { code: "IL", flag: "🇮🇱" },
  Italy: { code: "IT", flag: "🇮🇹" },
  Lithuania: { code: "LT", flag: "🇱🇹" },
  Malta: { code: "MT", flag: "🇲🇹" },
  Moldova: { code: "MD", flag: "🇲🇩" },
  Norway: { code: "NO", flag: "🇳🇴" },
  Poland: { code: "PL", flag: "🇵🇱" },
  Romania: { code: "RO", flag: "🇷🇴" },
  Serbia: { code: "RS", flag: "🇷🇸" },
  Sweden: { code: "SE", flag: "🇸🇪" },
  Ukraine: { code: "UA", flag: "🇺🇦" },
  "United Kingdom": { code: "GB", flag: "🇬🇧" }
};

const countries = await loadCountries();

let state = {
  currentCountryCode: null,
  votingOpen: false,
  showResults: false,
  voters: {},
  votes: {},
  resetAt: null,
  updatedAt: new Date().toISOString()
};

const clients = new Set();

await fs.mkdir(dataDir, { recursive: true });
try {
  state = { ...state, ...JSON.parse(await fs.readFile(dataFile, "utf8")) };
} catch {
  await saveState();
}

async function loadCountries() {
  const text = await fs.readFile(countriesFile, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((name) => {
      const meta = countryMeta[name] || { code: slugCode(name), flag: "🎵" };
      return { code: meta.code, flag: meta.flag, name };
    });
}

function slugCode(name) {
  return name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
}

function getLanHost() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;

  const nets = os.networkInterfaces();
  for (const addresses of Object.values(nets)) {
    for (const item of addresses || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return "localhost";
}

function publicState() {
  const currentCountry = countries.find((country) => country.code === state.currentCountryCode) || null;
  return {
    countries,
    currentCountry,
    votingOpen: state.votingOpen,
    showResults: Boolean(state.showResults),
    voterCount: Object.keys(state.voters).length,
    voteCount: countVotes(),
    results: buildResults(),
    resetAt: state.resetAt || null,
    updatedAt: state.updatedAt
  };
}

function countVotes() {
  return Object.values(state.votes).reduce((total, countryVotes) => total + Object.keys(countryVotes).length, 0);
}

function buildResults() {
  const voters = Object.values(state.voters).sort((a, b) => a.name.localeCompare(b.name));
  const countryRows = countries.map((country) => {
    const voteEntries = Object.values(state.votes[country.code] || {});
    const total = voteEntries.reduce((sum, vote) => sum + vote.points, 0);
    const average = voteEntries.length ? total / voteEntries.length : 0;
    return {
      ...country,
      total,
      average,
      votes: voteEntries.length,
      byVoter: voters.map((voter) => state.votes[country.code]?.[voter.id]?.points ?? null)
    };
  });

  return {
    voters,
    countries: countryRows,
    top: [...countryRows]
      .filter((country) => country.votes > 0)
      .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, 3)
  };
}

async function saveState() {
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2));
}

function broadcast() {
  const message = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const client of clients) client.write(message);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/vote.html" : pathname === "/admin" ? "/admin.html" : pathname === "/vote" ? "/vote.html" : pathname;
  const fullPath = path.normalize(path.join(publicDir, requested));
  if (!fullPath.startsWith(publicDir)) return false;

  try {
    const file = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    response.writeHead(200, {
      "content-type": types[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(file);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/state") {
      return sendJson(response, 200, publicState());
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*"
      });
      response.write(`data: ${JSON.stringify(publicState())}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/qr") {
      const host = getLanHost();
      const voterUrl = `http://${host}:${port}/`;
      const png = await QRCode.toBuffer(voterUrl, { margin: 1, width: 320, color: { dark: "#111111", light: "#ffffff" } });
      response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      response.end(png);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/info") {
      const host = getLanHost();
      return sendJson(response, 200, {
        adminUrl: `http://localhost:${port}/admin`,
        voterUrl: `http://${host}:${port}/`,
        host,
        port
      });
    }

    if (request.method === "GET" && url.pathname === "/api/my-votes") {
      const voterId = url.searchParams.get("voterId");
      if (!voterId) return sendJson(response, 400, { error: "voterId is required" });

      const votes = {};
      for (const [countryCode, countryVotes] of Object.entries(state.votes)) {
        if (countryVotes[voterId]) votes[countryCode] = countryVotes[voterId].points;
      }
      return sendJson(response, 200, { votes });
    }

    if (request.method === "POST" && url.pathname === "/api/current") {
      const { countryCode, votingOpen = true } = await readBody(request);
      if (countryCode !== null && !countries.some((country) => country.code === countryCode)) {
        return sendJson(response, 400, { error: "Unknown country" });
      }
      state.currentCountryCode = countryCode;
      state.votingOpen = Boolean(votingOpen && countryCode);
      state.showResults = false;
      await saveState();
      broadcast();
      return sendJson(response, 200, publicState());
    }

    if (request.method === "POST" && url.pathname === "/api/results") {
      const { showResults } = await readBody(request);
      state.showResults = Boolean(showResults);
      if (state.showResults) state.votingOpen = false;
      await saveState();
      broadcast();
      return sendJson(response, 200, publicState());
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      const { voterId, name } = await readBody(request);
      const cleanName = String(name || "").trim().slice(0, 40);
      if (!voterId || !cleanName) return sendJson(response, 400, { error: "Name and voterId are required" });
      state.voters[voterId] = { id: voterId, name: cleanName };
      await saveState();
      broadcast();
      return sendJson(response, 200, { voter: state.voters[voterId] });
    }

    if (request.method === "POST" && url.pathname === "/api/vote") {
      const { voterId, name, countryCode, points } = await readBody(request);
      const cleanPoints = Number(points);
      if (!state.votingOpen || state.currentCountryCode !== countryCode) return sendJson(response, 409, { error: "Voting is not open for this country" });
      if (!countries.some((country) => country.code === countryCode)) return sendJson(response, 400, { error: "Unknown country" });
      if (!Number.isInteger(cleanPoints) || cleanPoints < 1 || cleanPoints > 10) return sendJson(response, 400, { error: "Points must be from 1 to 10" });
      const cleanName = String(name || "").trim().slice(0, 40);
      if (!voterId || !cleanName) return sendJson(response, 400, { error: "Register before voting" });

      state.voters[voterId] = { id: voterId, name: cleanName };
      state.votes[countryCode] ||= {};
      state.votes[countryCode][voterId] = { voterId, points: cleanPoints, at: new Date().toISOString() };
      await saveState();
      broadcast();
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      state = { currentCountryCode: null, votingOpen: false, showResults: false, voters: {}, votes: {}, resetAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveState();
      broadcast();
      return sendJson(response, 200, publicState());
    }

    if (await serveStatic(response, url.pathname)) return;
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Something went wrong" });
  }
});

server.listen(port, "0.0.0.0", () => {
  const host = getLanHost();
  console.log(`Admin: http://localhost:${port}/admin.html`);
  console.log(`Voters: http://${host}:${port}/vote.html`);
});
