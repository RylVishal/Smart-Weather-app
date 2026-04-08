/* ══════════════════════════════════════════════════════
   SkyCast — navigate.js
   Route Weather Intelligence
   APIs used (all free):
     • OpenWeatherMap (existing key) — weather + geocoding
     • OSRM (project-osrm.org) — free routing, no key needed
     • Google Maps Embed — free iframe, no key needed
   ══════════════════════════════════════════════════════ */

const NAV_OWM_KEY = '5f1772041b1f1087c5338dca0bfac7b3';

// ── Severity classification ───────────────────────────────
const SEV = {
  thunderstorm: { level: 'danger',  color: '#ff4040', icon: '⛈️',  label: 'Severe Thunderstorm' },
  heavyRain:    { level: 'danger',  color: '#ff6b35', icon: '🌧️',  label: 'Heavy Rain' },
  rain:         { level: 'warning', color: '#ffc040', icon: '🌦️',  label: 'Rain' },
  drizzle:      { level: 'caution', color: '#78c8ff', icon: '🌦️',  label: 'Drizzle' },
  snow:         { level: 'danger',  color: '#a5d8ff', icon: '❄️',  label: 'Snow / Ice' },
  fog:          { level: 'warning', color: '#8ab4e0', icon: '🌫️',  label: 'Fog / Low Visibility' },
  clear:        { level: 'good',    color: '#2dd4a0', icon: '☀️',  label: 'Clear' },
  clouds:       { level: 'good',    color: '#4da6ff', icon: '⛅',   label: 'Cloudy' },
};

function classifyWeather(id, rain1h) {
  if (id >= 200 && id < 300) return SEV.thunderstorm;
  if (id >= 300 && id < 400) return SEV.drizzle;
  if (id >= 500 && id < 600) return (rain1h && rain1h > 7.6) ? SEV.heavyRain : SEV.rain;
  if (id >= 600 && id < 700) return SEV.snow;
  if (id >= 700 && id < 800) return SEV.fog;
  if (id === 800)             return SEV.clear;
  return SEV.clouds;
}

// Time-aware emoji (reuse logic from App.js via a local copy)
function navEmoji(id, tz) {
  const localHour = new Date(Date.now() + (tz ?? 0) * 1000).getUTCHours();
  const night = localHour >= 18 || localHour < 5;
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return night ? '🌙' : '☀️';
  if (id === 801) return night ? '🌙' : '🌤️';
  if (id > 801)  return night ? '☁️' : '⛅';
  return night ? '🌙' : '🌡️';
}

function fmtDist(m) { return m >= 1000 ? `${(m/1000).toFixed(0)} km` : `${Math.round(m)} m`; }
function fmtDur(s)  {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Geocoding ─────────────────────────────────────────────
async function navGeocode(query) {
  const r = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${NAV_OWM_KEY}`);
  if (!r.ok) throw new Error('Geocoding failed');
  const d = await r.json();
  if (!d.length) throw new Error(`Place not found: "${query}"`);
  return { lat: d[0].lat, lon: d[0].lon, name: d[0].name, country: d[0].country };
}

async function navGeocodeList(query) {
  const r = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${NAV_OWM_KEY}`);
  if (!r.ok) return [];
  return r.json();
}

// ── OSRM routing (completely free, no API key) ────────────
async function getOSRMRoute(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${origin.lon},${origin.lat};${dest.lon},${dest.lat}` +
    `?overview=full&geometries=geojson&steps=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Route calculation failed');
  const d = await r.json();
  if (!d.routes?.length) throw new Error('No driving route found between these locations');
  return {
    distance: d.routes[0].distance,
    duration: d.routes[0].duration,
    coords: d.routes[0].geometry.coordinates // [lon, lat] array
  };
}

// ── Sample evenly-spaced waypoints along route coords ─────
function sampleWaypoints(coords, n = 9) {
  if (coords.length <= n) return coords;
  const step = (coords.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => coords[Math.round(i * step)]);
}

// ── Reverse geocode to nearest city name ──────────────────
async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${NAV_OWM_KEY}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.length ? d[0].name : null;
  } catch { return null; }
}

// ── Fetch weather at one coordinate ───────────────────────
async function fetchPointWeather(lat, lon) {
  const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${NAV_OWM_KEY}&units=metric`);
  if (!r.ok) throw new Error('Weather fetch failed');
  return r.json();
}

// ── Google Maps Embed URL (free, no API key required) ─────
function googleMapsEmbedUrl(originName, destName) {
  const base = 'https://www.google.com/maps/embed/v1/directions';
  // Directions embed is free with an API key, but we can use the
  // legacy /maps?q= embed which is truly key-free and still shows routes
  const o = encodeURIComponent(originName);
  const d = encodeURIComponent(destName);
  return `https://maps.google.com/maps?saddr=${o}&daddr=${d}&output=embed`;
}

// ── Main: full route analysis ─────────────────────────────
async function runRouteAnalysis(originStr, destStr) {
  setNavLoading('Geocoding locations…');
  const [origin, dest] = await Promise.all([
    navGeocode(originStr),
    navGeocode(destStr)
  ]);

  setNavLoading('Calculating driving route…');
  const route = await getOSRMRoute(origin, dest);

  setNavLoading('Scanning weather along route…');
  const sampled = sampleWaypoints(route.coords, 9);

  // Fetch weather + reverse geocode for all points in parallel
  const waypoints = await Promise.all(
    sampled.map(async ([lon, lat], idx) => {
      const [wx, place] = await Promise.all([
        fetchPointWeather(lat, lon),
        reverseGeocode(lat, lon)
      ]);
      const rain1h = wx.rain?.['1h'] ?? 0;
      const sev    = classifyWeather(wx.weather[0].id, rain1h);
      const pct    = Math.round((idx / (sampled.length - 1)) * 100);
      return {
        lat, lon,
        name:        place || wx.name || `km ${Math.round(route.distance / 1000 * (idx / (sampled.length-1)))}`,
        temp:        Math.round(wx.main.temp),
        feels:       Math.round(wx.main.feels_like),
        desc:        wx.weather[0].description,
        id:          wx.weather[0].id,
        windKmh:     Math.round(wx.wind.speed * 3.6),
        humidity:    wx.main.humidity,
        rain1h,
        sev,
        tz:          wx.timezone,
        pct,         // % along route
        isOrigin:    idx === 0,
        isDest:      idx === sampled.length - 1,
      };
    })
  );

  return { origin, dest, route, waypoints };
}

// ── Determine trip safety from waypoints ──────────────────
function calcTripSummary(waypoints) {
  const hasDanger  = waypoints.some(w => w.sev.level === 'danger');
  const hasWarning = waypoints.some(w => w.sev.level === 'warning');
  const alerts = waypoints
    .filter(w => w.sev.level === 'danger' || w.sev.level === 'warning')
    .map(w => ({ name: w.name, sev: w.sev, pct: w.pct }));

  if (hasDanger)  return { status: 'danger',  alerts, msg: 'Hazardous conditions detected — exercise caution or delay travel' };
  if (hasWarning) return { status: 'warning', alerts, msg: 'Some adverse weather along route — stay alert and drive carefully' };
  return { status: 'good', alerts: [], msg: 'Route looks clear — good conditions for travel' };
}

// ══════════════════════════════════════════════════════════
//   UI rendering helpers
// ══════════════════════════════════════════════════════════

function setNavLoading(msg) {
  document.getElementById('nav-loading').style.display = 'flex';
  document.getElementById('nav-loading-text').textContent = msg;
  document.getElementById('nav-error').style.display = 'none';
  document.getElementById('trip-summary').style.display = 'none';
  document.getElementById('alert-list').style.display = 'none';
  document.getElementById('waypoint-section').style.display = 'none';
  document.getElementById('analyze-btn').disabled = true;
}

function hideNavLoading() {
  document.getElementById('nav-loading').style.display = 'none';
  document.getElementById('analyze-btn').disabled = false;
}

function showNavError(msg) {
  hideNavLoading();
  const el = document.getElementById('nav-error');
  el.textContent = `⚠ ${msg}`;
  el.style.display = 'block';
}

function renderNavResults(result) {
  const { route, waypoints } = result;
  const summary = calcTripSummary(waypoints);

  hideNavLoading();

  // ── Summary banner
  const statusIcon = { good: '✅', warning: '⚠️', danger: '🚨' };
  const statusLabel = { good: 'All Clear', warning: 'Caution', danger: 'Hazard Detected' };

  document.getElementById('summary-icon').textContent   = statusIcon[summary.status];
  document.getElementById('summary-status').textContent = statusLabel[summary.status];
  document.getElementById('summary-status').className   = `summary-status ${summary.status}`;
  document.getElementById('summary-msg').textContent    = summary.msg;

  const banner = document.getElementById('summary-banner');
  banner.className = `summary-banner ${summary.status}`;

  document.getElementById('meta-dist').textContent   = fmtDist(route.distance);
  document.getElementById('meta-dur').textContent    = fmtDur(route.duration);
  document.getElementById('meta-alerts').textContent = summary.alerts.length;

  document.getElementById('trip-summary').style.display = 'block';

  // ── Alert list (only hazards)
  const alertList = document.getElementById('alert-list');
  if (summary.alerts.length) {
    const alertItems = summary.alerts.map((a, i) => `
      <div class="alert-item ${a.sev.level}" style="animation-delay:${i * 0.07}s">
        <div class="alert-emoji">${a.sev.icon}</div>
        <div class="alert-info">
          <div class="alert-place">${a.name}</div>
          <div class="alert-label">${a.sev.label}</div>
        </div>
        <div class="alert-pct">${a.pct === 0 ? 'Start' : a.pct === 100 ? 'End' : `${a.pct}% in`}</div>
      </div>
    `).join('');
    alertList.innerHTML = `<div class="alert-list-title">Hazards Detected (${summary.alerts.length})</div>` + alertItems;
    alertList.style.display = 'flex';
  } else {
    alertList.style.display = 'none';
  }

  // ── Waypoint strip
  const strip = document.getElementById('waypoint-scroll');
  strip.innerHTML = waypoints.map(w => {
    let cls = '';
    if (w.isOrigin)             cls = 'wp-origin';
    else if (w.isDest)          cls = 'wp-dest';
    else if (w.sev.level === 'danger')  cls = 'wp-danger';
    else if (w.sev.level === 'warning') cls = 'wp-warning';
    const label = w.isOrigin ? '🟢 Start' : w.isDest ? '🔴 End' : `${w.pct}% in`;
    return `
      <div class="wp-item ${cls}" title="${w.desc} · ${w.windKmh} km/h wind · ${w.humidity}% humidity">
        <div class="wp-place">${w.name}</div>
        <div class="wp-emoji">${navEmoji(w.id, w.tz)}</div>
        <div class="wp-temp">${w.temp}°C</div>
        <div class="wp-cond">${w.desc}</div>
      </div>
    `;
  }).join('');
  document.getElementById('waypoint-section').style.display = 'block';
}

// ── Google Maps embed ─────────────────────────────────────
function showRouteMap(originName, destName) {
  const frame = document.getElementById('route-map-frame');
  const placeholder = document.getElementById('map-placeholder');
  const url = googleMapsEmbedUrl(originName, destName);
  frame.src = url;
  frame.style.display = 'block';
  placeholder.style.display = 'none';
}

// ══════════════════════════════════════════════════════════
//   Autocomplete for route inputs
// ══════════════════════════════════════════════════════════
function setupRouteAutocomplete(inputId, sugId) {
  const input = document.getElementById(inputId);
  const sug   = document.getElementById(sugId);
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { sug.classList.remove('open'); return; }
    timer = setTimeout(async () => {
      const results = await navGeocodeList(q);
      if (!results.length) { sug.classList.remove('open'); return; }
      sug.innerHTML = results.map(r => `
        <div class="suggestion-item" data-name="${r.name}, ${r.country}">
          ${r.name}${r.state ? ', ' + r.state : ''}, ${r.country}
        </div>
      `).join('');
      sug.classList.add('open');
      sug.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          input.value = item.dataset.name;
          sug.classList.remove('open');
        });
      });
    }, 320);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') sug.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !sug.contains(e.target)) sug.classList.remove('open');
  });
}

setupRouteAutocomplete('nav-origin', 'ns-origin');
setupRouteAutocomplete('nav-dest',   'ns-dest');

// ── Analyze button ────────────────────────────────────────
document.getElementById('analyze-btn').addEventListener('click', async () => {
  const originStr = document.getElementById('nav-origin').value.trim();
  const destStr   = document.getElementById('nav-dest').value.trim();

  if (!originStr || !destStr) {
    showNavError('Please enter both an origin and a destination.');
    return;
  }
  if (originStr.toLowerCase() === destStr.toLowerCase()) {
    showNavError('Origin and destination cannot be the same place.');
    return;
  }

  try {
    const result = await runRouteAnalysis(originStr, destStr);
    renderNavResults(result);
    showRouteMap(result.origin.name + ', ' + result.origin.country,
                 result.dest.name   + ', ' + result.dest.country);
  } catch (err) {
    showNavError(err.message || 'Something went wrong. Please try again.');
    console.error('Route analysis error:', err);
  }
});

// ── Also trigger on Enter key in either input ─────────────
['nav-origin', 'nav-dest'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('analyze-btn').click();
  });
});

// ── Tab integration (extend existing switchTab in App.js) ─
// Re-register btn-navigate since App.js only handles main/compare
document.getElementById('btn-navigate').addEventListener('click', () => {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-navigate').classList.add('active');
  document.getElementById('btn-navigate').classList.add('active');
});