(function () {
  'use strict';

  let allAreas = [];
  let currentRegion = 'all';
  let currentSearch = '';
  let currentStatus = 'all';
  const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const temperatures = {}; // { resortId: temperatureF }

  async function loadData() {
    // Cache-busting query string ensures the browser fetches the latest file
    const response = await fetch('data/ski-areas.json?t=' + Date.now());
    if (!response.ok) throw new Error('Failed to load ski area data');
    return response.json();
  }

  async function init() {
    try {
      const data = await loadData();
      allAreas = data.skiAreas;

      document.getElementById('last-updated').textContent =
        'Updated ' + formatTimestamp(data.lastUpdated);

      populateRegionFilter();
      renderStats();
      renderCards();
      bindEvents();

      // Fetch summit temperatures (non-blocking)
      fetchTemperatures().then(() => renderCards());

      // Auto-refresh data every 5 minutes without a full page reload
      setInterval(refresh, POLL_INTERVAL_MS);
    } catch (err) {
      console.error(err);
      document.getElementById('ski-areas-grid').innerHTML =
        '<div class="no-results"><div class="icon">⚠️</div><p>Unable to load ski area data.</p></div>';
    }
  }

  async function refresh() {
    try {
      const indicator = document.getElementById('last-updated');
      indicator.textContent = 'Refreshing…';

      const data = await loadData();
      allAreas = data.skiAreas;

      indicator.textContent = 'Updated ' + formatTimestamp(data.lastUpdated);

      renderStats();
      renderCards();

      // Refresh temperatures too
      fetchTemperatures().then(() => renderCards());
    } catch (err) {
      console.error('Auto-refresh failed:', err);
      document.getElementById('last-updated').textContent = 'Refresh failed – retrying soon';
    }
  }

  function formatTimestamp(isoStr) {
    const d = new Date(isoStr);
    // If the string is a full ISO datetime, show date + time; otherwise just date
    if (isoStr.includes('T')) {
      return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      });
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function fetchTemperatures() {
    try {
      const lats = allAreas.map(a => a.latitude).join(',');
      const lons = allAreas.map(a => a.longitude).join(',');
      const elevations = allAreas.map(a => Math.round(a.elevation.summit * 0.3048)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&elevation=${elevations}&current_weather=true&temperature_unit=fahrenheit`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Weather API error');
      const results = await resp.json();
      // Open-Meteo returns an array when multiple locations are queried
      const weatherList = Array.isArray(results) ? results : [results];
      weatherList.forEach((w, i) => {
        if (w.current_weather) {
          temperatures[allAreas[i].id] = Math.round(w.current_weather.temperature);
        }
      });
    } catch (err) {
      console.error('Failed to fetch temperatures:', err);
    }
  }

  function populateRegionFilter() {
    const regions = [...new Set(allAreas.map(a => a.region))].sort();
    const select = document.getElementById('region-filter');
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      select.appendChild(opt);
    });
  }

  function getFilteredAreas() {
    return allAreas.filter(area => {
      const matchRegion = currentRegion === 'all' || area.region === currentRegion;
      const matchSearch =
        !currentSearch ||
        area.name.toLowerCase().includes(currentSearch.toLowerCase()) ||
        area.region.toLowerCase().includes(currentSearch.toLowerCase());
      const openCount = area.lifts.filter(l => l.status === 'open').length;
      const matchStatus =
        currentStatus === 'all' ||
        (currentStatus === 'open' && openCount > 0) ||
        (currentStatus === 'closed' && openCount === 0);
      return matchRegion && matchSearch && matchStatus;
    });
  }

  function renderStats() {
    const totalAreas = allAreas.length;
    const totalLifts = allAreas.reduce((s, a) => s + a.lifts.length, 0);
    const openLifts = allAreas.reduce(
      (s, a) => s + a.lifts.filter(l => l.status === 'open').length,
      0
    );
    const openAreas = allAreas.filter(
      a => a.lifts.some(l => l.status === 'open')
    ).length;

    document.getElementById('stat-areas').textContent = totalAreas;
    document.getElementById('stat-open-areas').textContent = openAreas;
    document.getElementById('stat-open-lifts').textContent = openLifts;
    document.getElementById('stat-total-lifts').textContent = totalLifts;
  }

  function renderCards() {
    const grid = document.getElementById('ski-areas-grid');
    const filtered = getFilteredAreas();
    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.innerHTML =
        '<div class="no-results"><div class="icon">🏔️</div><p>No ski areas match your filters.</p></div>';
      return;
    }

    filtered.forEach(area => {
      grid.appendChild(createCard(area));
    });
  }

  function createCard(area) {
    const openLifts = area.lifts.filter(l => l.status === 'open');
    const closedLifts = area.lifts.filter(l => l.status === 'closed');
    const total = area.lifts.length;
    const pct = total > 0 ? Math.round((openLifts.length / total) * 100) : 0;

    const card = document.createElement('article');
    card.className = 'ski-area-card';
    card.dataset.id = area.id;

    const temp = temperatures[area.id];
    const tempHTML = temp !== undefined
      ? `<div class="summit-temp"><span class="temp-value">${temp}°F</span>summit temp</div>`
      : `<div class="summit-temp"><span class="temp-value">--</span>summit temp</div>`;

    card.innerHTML = `
      <div class="card-header">
        <h2>${escHtml(area.name)}</h2>
        <span class="region-badge">📍 ${escHtml(area.region)}</span>
        <div class="elevation-info">
          ${tempHTML}
          <span class="value">${area.elevation.summit.toLocaleString()} ft</span>
          summit
        </div>
      </div>
      <div class="card-stats">
        <div class="card-stat">
          <div class="num open-color">${openLifts.length}</div>
          <div class="lbl">Open</div>
        </div>
        <div class="card-stat">
          <div class="num closed-color">${closedLifts.length}</div>
          <div class="lbl">Closed</div>
        </div>
        <div class="card-stat">
          <div class="num total-color">${total}</div>
          <div class="lbl">Total</div>
        </div>
        <div class="card-stat">
          <div class="num total-color">${pct}%</div>
          <div class="lbl">Open</div>
        </div>
      </div>
      <div class="lift-progress">
        <div class="lift-progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="lifts-section">
        <div class="lifts-toggle" role="button" tabindex="0" aria-expanded="false">
          <span>View All Lifts</span>
          <span class="toggle-icon">▼</span>
        </div>
        <div class="lifts-list" role="list">
          ${buildLiftsHTML(area.lifts)}
        </div>
      </div>
      <a class="card-link" href="${escHtml(area.website)}" target="_blank" rel="noopener noreferrer">
        Visit Resort Website ↗
      </a>
    `;

    const toggle = card.querySelector('.lifts-toggle');
    const list = card.querySelector('.lifts-list');

    function doToggle() {
      const expanded = list.classList.toggle('expanded');
      toggle.classList.toggle('expanded', expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.querySelector('span').textContent = expanded ? 'Hide Lifts' : 'View All Lifts';
    }

    toggle.addEventListener('click', doToggle);
    toggle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doToggle();
      }
    });

    return card;
  }

  function buildLiftsHTML(lifts) {
    // Sort: open first, then alphabetically
    const sorted = [...lifts].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted
      .map(
        l => `
      <div class="lift-item ${escHtml(l.status)}" role="listitem">
        <span class="lift-status-dot"></span>
        <span class="lift-name">${escHtml(l.name)}</span>
        <span class="lift-type-badge">${escHtml(l.type)}</span>
      </div>`
      )
      .join('');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindEvents() {
    document.getElementById('search-input').addEventListener('input', e => {
      currentSearch = e.target.value.trim();
      renderCards();
    });

    document.getElementById('region-filter').addEventListener('change', e => {
      currentRegion = e.target.value;
      renderCards();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.dataset.status;
        renderCards();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
