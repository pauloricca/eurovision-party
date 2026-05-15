const countryGrid = document.querySelector("#countryGrid");
const currentCountry = document.querySelector("#currentCountry");
const currentSong = document.querySelector("#currentSong");
const currentCard = document.querySelector("#currentCard");
const voterUrl = document.querySelector("#voterUrl");
const voterCount = document.querySelector("#voterCount");
const voteCount = document.querySelector("#voteCount");
const resultsPanel = document.querySelector("#resultsPanel");
const topThree = document.querySelector("#topThree");
const matrix = document.querySelector("#matrix");
const votersModal = document.querySelector("#votersModal");
const votersList = document.querySelector("#votersList");

let appState = null;

async function post(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error((await response.json()).error || "Request failed");
  return response.json();
}

async function loadInfo() {
  const info = await fetch("/api/info").then((response) => response.json());
  voterUrl.textContent = info.voterUrl;
}

function render(state) {
  appState = state;
  voterCount.textContent = state.voterCount;
  voteCount.textContent = state.voteCount;
  renderCurrent(state);
  renderCountries(state);
  renderResults(state);
  renderVoters(state);
  renderResultsMode(state.showResults);
}

function renderVoters(state) {
  votersList.innerHTML = "";
  if (!state.results.voters.length) {
    votersList.innerHTML = "<li>No voters yet.</li>";
    return;
  }

  for (const voter of state.results.voters) {
    const item = document.createElement("li");
    item.textContent = voter.name;
    votersList.append(item);
  }
}

function renderCurrent(state) {
  const country = state.currentCountry;
  if (!country) {
    currentCard.querySelector(".big-flag").textContent = "🎤";
    currentCountry.textContent = "Pick a country";
    currentSong.textContent = "Voting is closed until you choose an act.";
    return;
  }

  currentCard.querySelector(".big-flag").textContent = country.flag;
  currentCountry.textContent = country.name;
  const countryResult = state.results.countries.find((row) => row.code === country.code);
  const votes = countryResult?.votes || 0;
  const voters = state.voterCount;
  const progress = voters > 0 && votes >= voters ? "Everyone voted" : `${votes} / ${voters} votes cast`;
  currentSong.textContent = `${state.votingOpen ? "Voting open" : "Voting closed"} - ${progress}`;
}

function renderCountries(state) {
  countryGrid.innerHTML = "";
  const countries = [...state.countries].sort((a, b) => a.name.localeCompare(b.name));
  for (const country of countries) {
    const button = document.createElement("button");
    button.className = "country-button";
    if (state.currentCountry?.code === country.code && state.votingOpen) button.classList.add("active");
    button.innerHTML = `
      <span class="flag">${country.flag}</span>
      <span>
        <strong>${country.name}</strong>
        <small>${state.results.countries.find((row) => row.code === country.code)?.votes || 0} votes</small>
      </span>
    `;
    button.addEventListener("click", () => {
      const isCurrent = state.currentCountry?.code === country.code && state.votingOpen;
      post("/api/current", { countryCode: isCurrent ? null : country.code, votingOpen: !isCurrent });
    });
    countryGrid.append(button);
  }
}

function renderResults(state) {
  topThree.innerHTML = "";
  for (const [index, country] of state.results.top.entries()) {
    const card = document.createElement("article");
    card.className = `top-card place-${index + 1}`;
    card.innerHTML = `
      <span class="rank">${index + 1}</span>
      <span class="flag">${country.flag}</span>
      <strong>${country.name}</strong>
      <span>${country.average.toFixed(1)} avg</span>
      <small>${country.votes} votes, ${country.total} pts</small>
    `;
    topThree.append(card);
  }

  const voters = state.results.voters;
  const countries = state.results.countries
    .filter((country) => country.votes > 0)
    .sort((a, b) => b.average - a.average || b.total - a.total || b.votes - a.votes || a.name.localeCompare(b.name));
  matrix.innerHTML = `
    <thead>
      <tr>
        <th>Country</th>
        <th>Avg</th>
        ${voters.map((voter) => `<th>${voter.name}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${countries.map((country) => `
        <tr>
          <th>${country.flag} ${country.name}</th>
          <td>${country.average.toFixed(1)}</td>
          ${country.byVoter.map((points) => `<td>${points ?? ""}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

document.querySelector("#closeVoting").addEventListener("click", () => {
  post("/api/current", { countryCode: appState?.currentCountry?.code || null, votingOpen: false });
});

document.querySelector("#showResults").addEventListener("click", () => {
  post("/api/results", { showResults: !appState?.showResults });
});

function renderResultsMode(showing) {
  resultsPanel.classList.toggle("hidden", !showing);
  document.body.classList.toggle("results-mode", showing);
  document.querySelector("#showResults").textContent = showing ? "Back to voting" : "Show results";
  if (showing) window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelector("#resetParty").addEventListener("click", () => {
  if (confirm("Reset all names and votes?")) post("/api/reset", {});
});

document.querySelector("#showVoters").addEventListener("click", () => {
  votersModal.showModal();
});

document.querySelector("#closeVoters").addEventListener("click", () => {
  votersModal.close();
});

votersModal.addEventListener("click", (event) => {
  if (event.target === votersModal) votersModal.close();
});

loadInfo();
fetch("/api/state").then((response) => response.json()).then(render);
new EventSource("/api/events").addEventListener("message", (event) => render(JSON.parse(event.data)));
