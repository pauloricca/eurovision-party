const namePanel = document.querySelector("#namePanel");
const votePanel = document.querySelector("#votePanel");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#nameInput");
const nameMessage = document.querySelector("#nameMessage");
const pointsGrid = document.querySelector("#pointsGrid");
const flag = document.querySelector("#flag");
const status = document.querySelector("#status");
const countryName = document.querySelector("#countryName");
const songInfo = document.querySelector("#songInfo");
const message = document.querySelector("#message");
const phoneResults = document.querySelector("#phoneResults");
const phoneTopThree = document.querySelector("#phoneTopThree");

const voterIdKey = "eurovision-party-voter-id";
const voterNameKey = "eurovision-party-voter-name";
let voterId = localStorage.getItem(voterIdKey);
let voterName = localStorage.getItem(voterNameKey);
let state = null;
let selectedVotes = JSON.parse(localStorage.getItem("eurovision-party-selected-votes") || "{}");
let seenResetAt = localStorage.getItem("eurovision-party-seen-reset-at");

function flagImg(country, className = "flag-img") {
  return `<img class="${className}" src="https://flagcdn.com/w160/${country.code.toLowerCase()}.png" alt="${country.name} flag" loading="lazy" />`;
}

function setVisibleHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--visible-height", `${height}px`);
}

setVisibleHeight();
window.addEventListener("resize", setVisibleHeight);
window.visualViewport?.addEventListener("resize", setVisibleHeight);

if (!voterId) {
  voterId = makeVoterId();
  localStorage.setItem(voterIdKey, voterId);
}

if (voterName) {
  nameInput.value = voterName;
  showVotePanel();
  register(voterName).then(loadMyVotes).then(() => {
    if (state) render(state);
  });
}

function makeVoterId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `voter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showVotePanel() {
  namePanel.classList.add("hidden");
  votePanel.classList.remove("hidden");
}

async function register(name) {
  const response = await fetch("/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ voterId, name })
  });
  if (!response.ok) throw new Error((await response.json()).error || "Could not join");
}

async function loadMyVotes() {
  const response = await fetch(`/api/my-votes?voterId=${encodeURIComponent(voterId)}`);
  if (!response.ok) return;
  const payload = await response.json();
  selectedVotes = payload.votes || {};
  localStorage.setItem("eurovision-party-selected-votes", JSON.stringify(selectedVotes));
}

async function submitVote(points) {
  if (!state?.currentCountry || !state.votingOpen) return;
  const response = await fetch("/api/vote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      voterId,
      name: voterName,
      countryCode: state.currentCountry.code,
      points
    })
  });
  if (response.ok) {
    selectedVotes[state.currentCountry.code] = points;
    localStorage.setItem("eurovision-party-selected-votes", JSON.stringify(selectedVotes));
    message.textContent = "";
    render(state);
  } else {
    message.textContent = (await response.json()).error || "Could not save vote.";
  }
}

function render(nextState) {
  handleServerReset(nextState);
  state = nextState;
  renderResultsMode(state);
  const country = state.currentCountry;
  pointsGrid.innerHTML = "";

  if (state.showResults) return;

  if (!country) {
    flag.textContent = "🎤";
    status.textContent = "Waiting";
    countryName.textContent = "No country selected";
    songInfo.textContent = "The host will open voting soon.";
    message.textContent = "";
    return;
  }

  flag.innerHTML = flagImg(country, "hero-flag-img");
  status.textContent = state.votingOpen ? "Voting now" : "Voting closed";
  countryName.textContent = country.name;
  songInfo.textContent = state.votingOpen ? "Choose a score from 1 to 10." : "The host will open voting soon.";

  for (let points = 1; points <= 10; points += 1) {
    const button = document.createElement("button");
    button.className = "point-button";
    if (points === 10) button.classList.add("ten-button");
    if (selectedVotes[country.code] === points) button.classList.add("selected");
    button.textContent = points;
    button.disabled = !state.votingOpen || !voterName;
    button.addEventListener("click", () => submitVote(points));
    pointsGrid.append(button);
  }
}

function handleServerReset(nextState) {
  if (!nextState.resetAt || nextState.resetAt === seenResetAt) return;
  seenResetAt = nextState.resetAt;
  localStorage.setItem("eurovision-party-seen-reset-at", seenResetAt);
  localStorage.removeItem(voterNameKey);
  localStorage.removeItem("eurovision-party-selected-votes");
  voterName = null;
  selectedVotes = {};
  nameInput.value = "";
}

function renderResultsMode(state) {
  const showing = Boolean(state.showResults);
  const idle = !showing && voterName && (!state.currentCountry || !state.votingOpen);
  document.body.classList.toggle("results-mode", showing);
  document.body.classList.toggle("idle-mode", idle);
  namePanel.classList.toggle("hidden", showing || idle || Boolean(voterName));
  votePanel.classList.toggle("hidden", showing || idle || !voterName);
  phoneResults.classList.toggle("hidden", !showing);

  if (!showing) return;

  phoneTopThree.innerHTML = "";
  const winners = state.results.top;
  if (!winners.length) {
    phoneTopThree.innerHTML = "<p class=\"muted\">No votes yet.</p>";
    return;
  }

  for (const [index, country] of winners.entries()) {
    const card = document.createElement("article");
    card.className = `phone-winner place-${index + 1}`;
    card.innerHTML = `
      <span class="rank">${index + 1}</span>
      ${flagImg(country, "winner-flag-img")}
      <strong>${country.name}</strong>
      <span>${country.average.toFixed(1)} avg</span>
    `;
    phoneTopThree.append(card);
  }
}

nameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const submitButton = nameForm.querySelector("button");
  submitButton.disabled = true;
  try {
    nameMessage.textContent = "Joining...";
    await register(name);
    voterName = name;
    localStorage.setItem(voterNameKey, voterName);
    await loadMyVotes();
    nameMessage.textContent = "";
    showVotePanel();
    if (state) render(state);
    message.textContent = "You are in. Waiting for the host.";
  } catch (error) {
    nameMessage.textContent = error.message || "Could not join. Try again.";
  } finally {
    submitButton.disabled = false;
  }
});

fetch("/api/state").then((response) => response.json()).then(render);
new EventSource("/api/events").addEventListener("message", (event) => render(JSON.parse(event.data)));
