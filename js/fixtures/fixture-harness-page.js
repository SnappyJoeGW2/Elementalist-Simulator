import { loadAllData } from '../data/csv-loader.js';
import { compareSummaries, runFixtureWithData } from './fixture-harness-core.js';

const statusEl = document.getElementById('status');
const fixtureListEl = document.getElementById('fixture-list');
const runAllBtn = document.getElementById('run-all-btn');
const reloadBtn = document.getElementById('reload-btn');

let dataCache = null;
let fixtures = [];
let baselines = new Map();

function setStatus(text) {
    statusEl.textContent = text;
}

async function fetchJson(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Could not load ${path}`);
    return res.json();
}

async function loadRuntimeData() {
    if (!dataCache) dataCache = await loadAllData();
    return dataCache;
}

function formatNumber(value) {
    if (value === null || value === undefined) return 'n/a';
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function fixtureCard(fixture) {
    const wrap = document.createElement('article');
    wrap.className = 'fixture';
    wrap.dataset.fixtureId = fixture.id;
    wrap.innerHTML = `
        <div class="fixture-header">
            <div>
                <h2 class="fixture-title">${fixture.label}</h2>
                <div class="small">Target HP: ${formatNumber(fixture.targetHP || 0)}</div>
            </div>
            <div>
                <span class="badge badge-warn">Not run yet</span>
                <button type="button">Run Fixture</button>
            </div>
        </div>
        <div class="fixture-body hidden">
            <div class="metrics"></div>
            <div class="small comparison"></div>
            <ul class="mismatch-list hidden"></ul>
        </div>
    `;

    const button = wrap.querySelector('button');
    button.addEventListener('click', () => runFixture(fixture, wrap));
    return wrap;
}

function renderFixtures() {
    fixtureListEl.innerHTML = '';
    for (const fixture of fixtures) fixtureListEl.appendChild(fixtureCard(fixture));
}

function renderResult(card, result, comparison) {
    const badge = card.querySelector('.badge');
    const body = card.querySelector('.fixture-body');
    const metrics = card.querySelector('.metrics');
    const comparisonEl = card.querySelector('.comparison');
    const mismatchList = card.querySelector('.mismatch-list');

    const summary = result.summary;
    badge.className = `badge ${comparison.ok ? 'badge-ok' : 'badge-bad'}`;
    badge.textContent = comparison.ok ? 'Matches baseline' : 'Differs from baseline';

    metrics.innerHTML = `
        <div class="metric"><span class="metric-label">DPS</span><span class="metric-value">${formatNumber(summary.metrics.dps)}</span></div>
        <div class="metric"><span class="metric-label">Total Damage</span><span class="metric-value">${formatNumber(summary.metrics.totalDamage)}</span></div>
        <div class="metric"><span class="metric-label">Death Time</span><span class="metric-value">${formatNumber(summary.metrics.deathTime)}</span></div>
        <div class="metric"><span class="metric-label">Log Entries</span><span class="metric-value">${formatNumber(summary.counts.logEntries)}</span></div>
        <div class="metric"><span class="metric-label">Step Entries</span><span class="metric-value">${formatNumber(summary.counts.stepEntries)}</span></div>
        <div class="metric"><span class="metric-label">End Attunement</span><span class="metric-value">${summary.endState.att || 'n/a'}${summary.endState.att2 ? ` / ${summary.endState.att2}` : ''}</span></div>
    `;

    comparisonEl.textContent = comparison.ok
        ? 'All tracked metrics and hashes match the saved baseline.'
        : 'One or more tracked outputs changed. Check the mismatch list below before trusting the refactor.';

    mismatchList.innerHTML = comparison.mismatches.map(item => `<li>${item}</li>`).join('');
    mismatchList.classList.toggle('hidden', comparison.mismatches.length === 0);
    body.classList.remove('hidden');
}

async function runFixture(fixture, card) {
    const button = card.querySelector('button');
    button.disabled = true;
    setStatus(`Running ${fixture.label}...`);
    try {
        const data = await loadRuntimeData();
        const [buildState, rotationState] = await Promise.all([
            fetchJson(fixture.build),
            fetchJson(fixture.rotation),
        ]);
        const result = runFixtureWithData(data, fixture, buildState, rotationState);
        const comparison = compareSummaries(result.summary, baselines.get(fixture.id));
        renderResult(card, result, comparison);
        setStatus(`Finished ${fixture.label}.`);
    } catch (err) {
        const badge = card.querySelector('.badge');
        badge.className = 'badge badge-bad';
        badge.textContent = 'Run failed';
        card.querySelector('.fixture-body').classList.remove('hidden');
        card.querySelector('.comparison').textContent = err.message;
        setStatus(`Failed: ${err.message}`);
    } finally {
        button.disabled = false;
    }
}

async function loadFixturesAndBaselines() {
    setStatus('Loading fixtures and baselines...');
    const [fixtureData, baselineData] = await Promise.all([
        fetchJson('fixtures/manifest.json'),
        fetchJson('fixtures/baselines.json'),
    ]);
    fixtures = fixtureData;
    baselines = new Map(baselineData.map(entry => [entry.fixtureId, entry.summary]));
    renderFixtures();
    setStatus(`Loaded ${fixtures.length} fixtures.`);
}

async function runAllFixtures() {
    runAllBtn.disabled = true;
    try {
        const cards = [...fixtureListEl.querySelectorAll('.fixture')];
        for (const fixture of fixtures) {
            const card = cards.find(node => node.dataset.fixtureId === fixture.id);
            if (card) await runFixture(fixture, card);
        }
        setStatus(`Finished all ${fixtures.length} fixtures.`);
    } finally {
        runAllBtn.disabled = false;
    }
}

runAllBtn.addEventListener('click', runAllFixtures);
reloadBtn.addEventListener('click', async () => {
    await loadFixturesAndBaselines();
});

loadFixturesAndBaselines().catch(err => {
    setStatus(err.message);
});
