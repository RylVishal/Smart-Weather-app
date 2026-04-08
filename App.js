/* ══════════════════════════════════════════════════════
   SkyCast — app.js
   ══════════════════════════════════════════════════════ */

const API_KEY = '5f1772041b1f1087c5338dca0bfac7b3';
let clickMarker = null;
let currentLat = null, currentLon = null;

// ── Map Setup ───────────────────────────────────────────
const map = L.map('map', { center: [20, 78], zoom: 5, zoomControl: true });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19
}).addTo(map);

const pulseIcon = L.divIcon({
  className: '',
  html: '<div class="pulse-marker"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="24" height="32" viewBox="0 0 24 32" fill="none">
    <path d="M12 0C5.373 0 0 5.373 0 12C0 21 12 32 12 32S24 21 24 12C24 5.373 18.627 0 12 0Z" fill="#2b87e2" fill-opacity="0.9"/>
    <circle cx="12" cy="12" r="5" fill="#080c18"/>
  </svg>`,
  iconSize: [24, 32],
  iconAnchor: [12, 32]
});

// ── Travel Marker Icon ────────────────────────────────────
const travelIcon = L.divIcon({
  className: '',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none">
    <path d="M14 0C6.27 0 0 6.27 0 14C0 23.1 14 36 14 36S28 23.1 28 14C28 6.27 21.73 0 14 0Z" fill="#2dd4a0" fill-opacity="0.95"/>
    <circle cx="14" cy="13" r="6" fill="#080c18"/>
    <text x="14" y="17" font-family="Arial" font-size="12" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="middle">✈</text>
  </svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36]
});

let isTravelMode = false;

// ── API Calls ───────────────────────────────────────────
async function fetchCurrent(lat, lon) {
  const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
  if (!r.ok) throw new Error('current fetch failed');
  return r.json();
}

async function fetchForecast(lat, lon) {
  const r = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
  if (!r.ok) throw new Error('forecast fetch failed');
  return r.json();
}

async function fetchCurrentByCity(city) {
  const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
  if (!r.ok) throw new Error('city not found');
  return r.json();
}

async function fetchForecastByCity(city) {
  const r = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
  if (!r.ok) throw new Error('city not found');
  return r.json();
}

// ── Geocode search (OpenWeatherMap geo API) ─────────────
async function geocodeCity(query) {
  const r = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`);
  if (!r.ok) return [];
  return r.json();
}

// ── Helpers ─────────────────────────────────────────────

/**
 * Returns a weather emoji based on condition ID and the LOCAL hour at the location.
 * 18:00–04:59 → night/moon emojis; 05:00–17:59 → day/sun emojis.
 *
 * @param {number} id       - OpenWeatherMap weather condition id
 * @param {number} timezone - timezone offset in seconds from UTC (from API `timezone` field)
 */
function weatherEmoji(id, timezone) {
  // Derive local hour at the location
  const utcMs = Date.now();
  const localMs = utcMs + (timezone ?? 0) * 1000;
  const localHour = new Date(localMs).getUTCHours(); // 0-23 in local time

  const isNight = localHour >= 18 || localHour < 5; // 6 PM → 5 AM = night

  // Thunderstorm, drizzle, rain, snow, atmosphere — same day/night
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return isNight ? '🌧️' : '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';

  // Clear sky
  if (id === 800) return isNight ? '🌙' : '☀️';

  // Few clouds
  if (id === 801) return isNight ? '🌙' : '🌤️';

  // Scattered / broken / overcast clouds
  if (id > 801) return isNight ? '☁️' : '⛅';

  return isNight ? '🌙' : '🌡️';
}

/**
 * Same logic but for a forecast entry that has its own dt_txt (UTC string).
 * Uses the dt_txt time directly since forecast times are in UTC and we know the offset.
 */
function weatherEmojiForForecast(id, dtTxt, timezone) {
  // dt_txt is "YYYY-MM-DD HH:MM:SS" in UTC
  const utcMs = new Date(dtTxt.replace(' ', 'T') + 'Z').getTime();
  const localMs = utcMs + (timezone ?? 0) * 1000;
  const localHour = new Date(localMs).getUTCHours();

  const isNight = localHour >= 18 || localHour < 5;

  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return isNight ? '🌙' : '☀️';
  if (id === 801) return isNight ? '🌙' : '🌤️';
  if (id > 801)   return isNight ? '☁️' : '⛅';

  return isNight ? '🌙' : '🌡️';
}

function tempClass(t) {
  if (t >= 35) return 'hot';
  if (t <= 10) return 'cold';
  return '';
}

function windDir(deg) {
  const d = ['N','NE','E','SE','S','SW','W','NW'];
  return d[Math.round(deg / 45) % 8];
}

function fmtHour(dtTxt) {
  const d = new Date(dtTxt.replace(' ', 'T'));
  const h = d.getHours();
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
}

function fmtDay(dtTxt) {
  const d = new Date(dtTxt.replace(' ', 'T'));
  return d.toLocaleDateString('en', { weekday: 'short' });
}

// ── Smart Feedback ───────────────────────────────────────
function getFeedback(current, forecastList) {
  const id   = current.weather[0].id;
  const temp = current.main.temp;
  const wind = current.wind.speed * 3.6; // km/h

  const next6 = forecastList ? forecastList.slice(0, 2) : [];
  const rainSoon = next6.some(f => f.weather[0].id >= 500 && f.weather[0].id < 700);

  const tips = [];
  let icon = '🌤️';
  let title = 'Weather Tips';

  // ── Temperature takes highest priority ─────────────────
  if (temp <= -10) {
    icon = '🥶'; title = 'Extreme Cold Warning';
    tips.push('Dangerous wind-chill — limit time outdoors to under 10 minutes.');
    tips.push('Wear a balaclava, thermal base layers, and insulated gloves.');
    tips.push('Watch for frostbite on exposed skin — cover everything.');
    tips.push('Keep emergency supplies in your car if driving.');
  } else if (temp <= 0) {
    icon = '🧊'; title = 'Freezing Conditions';
    tips.push('Temperatures are below freezing — bundle up fully.');
    tips.push('Roads and footpaths may be icy — walk and drive with care.');
    tips.push('Wear thermal layers, a heavy coat, gloves, and a hat.');
    tips.push('Hot drinks will help you stay warm outside.');
  } else if (temp < 10) {
    icon = '🥶'; title = 'Very Cold Outside';
    tips.push('Dress in warm layers — a heavy jacket is essential.');
    tips.push('Wear gloves and a scarf to protect against the chill.');
    if (id > 800) tips.push('Cloudy skies will make it feel even colder.');
  } else if (temp < 18) {
    if (id >= 200 && id < 300) {
      icon = '⛈️'; title = 'Cold Thunderstorm';
      tips.push('Stay indoors — lightning risk is high.');
      tips.push('It\'s also cold, so wrap up warmly if you must go out.');
      tips.push('Avoid open fields, trees, and metal structures.');
    } else if (id >= 500 && id < 600) {
      icon = '🌧️'; title = 'Cold & Rainy';
      tips.push('Take an umbrella and wear a waterproof jacket.');
      tips.push('Cold rain can cause a chill quickly — stay dry.');
      tips.push('Allow extra travel time — roads may be slippery.');
    } else if (id >= 600 && id < 700) {
      icon = '❄️'; title = 'Cold & Snowy';
      tips.push('Layer up with thermal clothing and a heavy coat.');
      tips.push('Paths may be icy — walk slowly and carefully.');
      tips.push('Keep hot drinks handy to stay warm.');
    } else {
      icon = '🧥'; title = 'Cool Day';
      tips.push('A jacket or coat is a good idea today.');
      tips.push('Pleasant for outdoor activity if you\'re dressed for it.');
      if (rainSoon) tips.push('Rain possible later — keep an umbrella handy.');
    }
  } else if (id >= 200 && id < 300) {
    icon = '⛈️'; title = 'Thunderstorm Warning';
    tips.push('Stay indoors if possible — lightning risk is high.');
    tips.push('Avoid open fields, trees, and metal structures.');
    tips.push('Unplug electronics as a precaution.');
  } else if (id >= 500 && id < 600) {
    icon = '🌧️'; title = "Don't Forget Your Umbrella!";
    tips.push('Carry an umbrella — rain is on the way.');
    tips.push('Wear waterproof shoes to keep your feet dry.');
    tips.push('Allow extra travel time — roads may be slippery.');
  } else if (id >= 300 && id < 400) {
    icon = '🌦️'; title = 'Light Drizzle Expected';
    tips.push('A light jacket or umbrella will keep you dry.');
    tips.push('Roads may be slick — drive carefully.');
  } else if (id >= 600 && id < 700) {
    icon = '❄️'; title = 'Snowy Conditions';
    tips.push('Layer up — wear thermal clothing and a heavy coat.');
    tips.push('Roads may be icy; walk and drive slowly.');
    tips.push('Keep hot drinks handy to stay warm.');
  } else if (id >= 700 && id < 800) {
    icon = '🌫️'; title = 'Low Visibility Alert';
    tips.push('Drive with fog lights on and reduce speed.');
    tips.push('Allow extra distance from the vehicle ahead.');
  } else if (temp >= 38) {
    icon = '🥵'; title = 'Extreme Heat Advisory';
    tips.push('Apply SPF 50+ sunscreen before heading out.');
    tips.push('Stay hydrated — drink water every 30 minutes.');
    tips.push('Avoid outdoor activity between 11am–4pm.');
    tips.push('Wear light, loose, breathable clothing.');
  } else if (temp >= 30) {
    icon = '☀️'; title = 'Hot & Sunny Day';
    tips.push('Apply sunscreen — UV levels are high.');
    tips.push('Carry a water bottle and stay hydrated.');
    tips.push('Great day for early morning outdoor activities!');
  } else if (temp >= 18) {
    if (id === 800) {
      icon = '😎'; title = 'Perfect Weather!';
      tips.push('Ideal conditions for a walk, jog, or outdoor lunch.');
      tips.push('Great day to spend time in nature or the park.');
      tips.push('Perfect for a bike ride — enjoy the sunshine!');
    } else if (id > 800 && temp >= 25) {
      icon = '⛅'; title = 'Warm & Cloudy';
      tips.push('Good time for outdoor plans — clouds keep it cooler.');
      tips.push('Still apply sunscreen — UV penetrates cloud cover.');
      if (rainSoon) tips.push('Rain possible later — keep an umbrella handy.');
    } else {
      icon = '🌥️'; title = 'Mild & Cloudy';
      tips.push('Comfortable for outdoor plans with a light layer.');
      if (rainSoon) tips.push('Rain possible later — keep an umbrella handy.');
    }
  }

  // ── Extra contextual tips ────────────────────────────────
  if (wind > 60) {
    tips.push('⚠️ Dangerous winds — avoid driving high-sided vehicles.');
  } else if (wind > 40) {
    tips.push('Strong gusts — secure loose outdoor items and hold on to your hat!');
  } else if (wind > 25 && temp < 10) {
    tips.push('Wind chill will make it feel significantly colder than the thermometer says.');
  }

  // ── Travel-Specific Tips ─────────────────────────────────
  if (isTravelMode) {
    if (wind < 15) {
      tips.push('✅ Perfect for flights — light winds');
    } else if (wind < 30) {
      tips.push('ℹ️ Moderate winds — possible minor flight delays');
    } else {
      tips.push('⚠️ High winds — check flight/train status');
    }
    if (current.visibility && current.visibility / 1000 > 10) {
      tips.push('👀 Excellent visibility — great for driving/travel');
    }
    if (rainSoon) {
      tips.push('☔ Rain expected — allow extra time for delays');
    }
  }

  if (!tips.length) {
    tips.push('Conditions look stable — enjoy your day!');
  }

  return { icon, title, tips };
}

// ── Render Current Weather ───────────────────────────────
function renderCurrent(data) {
  const t     = Math.round(data.main.temp);
  const feels = Math.round(data.main.feels_like);
  const id    = data.weather[0].id;
  const tz    = data.timezone; // seconds offset from UTC
  const emoji = weatherEmoji(id, tz);
  const tc    = tempClass(t);

  // Travel mode indicator — rendered ABOVE the card, not inside cw-top
  const travelBadge = isTravelMode
    ? '<div class="travel-badge" style="margin-bottom:10px;">✈ TRAVEL MODE</div>'
    : '';

  document.getElementById('current-card').innerHTML = `
    ${travelBadge}
    <div class="cw-top">
      <div class="cw-location">
        <div class="cw-city">${data.name || 'Unknown'}</div>
        <div class="cw-country">${data.sys?.country || ''}</div>
      </div>
      <div class="cw-temp-block">
        <div class="cw-temp ${tc}">${t}°</div>
        <div class="cw-feels">Feels ${feels}°C</div>
      </div>
    </div>
    <div class="cw-desc">
      <span class="cw-emoji">${emoji}</span>
      <span class="cw-desc-text">${data.weather[0].description}</span>
    </div>
    <div class="cw-stats">
      <div class="stat-box">
        <div class="stat-box-label">Humidity</div>
        <div class="stat-box-value">${data.main.humidity}%</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Wind</div>
        <div class="stat-box-value">${Math.round(data.wind.speed * 3.6)} km/h ${windDir(data.wind.deg)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Pressure</div>
        <div class="stat-box-value">${data.main.pressure} hPa</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Visibility</div>
        <div class="stat-box-value">${data.visibility ? (data.visibility/1000).toFixed(1)+' km' : 'N/A'}</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Min/Max</div>
        <div class="stat-box-value">${Math.round(data.main.temp_min)}° / ${Math.round(data.main.temp_max)}°</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-label">Clouds</div>
        <div class="stat-box-value">${data.clouds?.all ?? 0}%</div>
      </div>
    </div>
  `;
}

// ── Render Feedback ──────────────────────────────────────
function renderFeedback(currentData, forecastList) {
  const fb = getFeedback(currentData, forecastList);
  const el = document.getElementById('feedback-card');
  el.style.display = 'flex';
  el.innerHTML = `
    <div class="feedback-icon">${fb.icon}</div>
    <div class="feedback-content">
      <div class="feedback-title">${fb.title}</div>
      <ul class="feedback-tips">
        ${fb.tips.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>
  `;
}

// ── Render Hourly ────────────────────────────────────────
function renderHourly(list, timezone) {
  const el = document.getElementById('hourly-list');
  const items = list.slice(0, 8);
  el.innerHTML = items.map((f, i) => `
    <div class="hourly-item ${i === 0 ? 'now' : ''}">
      <div class="h-time">${i === 0 ? 'Now' : fmtHour(f.dt_txt)}</div>
      <div class="h-emoji">${weatherEmojiForForecast(f.weather[0].id, f.dt_txt, timezone)}</div>
      <div class="h-temp">${Math.round(f.main.temp)}°</div>
      <div class="h-rain">${f.pop ? Math.round(f.pop * 100) + '%' : ''}</div>
    </div>
  `).join('');
  document.getElementById('hourly-section').style.display = 'block';
}

// ── Render 7-Day ─────────────────────────────────────────
function renderDaily(list, timezone) {
  const days = {};
  list.forEach(f => {
    const day = f.dt_txt.split(' ')[0];
    if (!days[day]) days[day] = [];
    days[day].push(f);
  });

  const dayKeys = Object.keys(days).slice(0, 7);
  const rows = dayKeys.map(key => {
    const entries = days[key];
    const rep = entries.find(e => e.dt_txt.includes('12:00')) || entries[0];
    const maxT = Math.max(...entries.map(e => e.main.temp_max || e.main.temp));
    const minT = Math.min(...entries.map(e => e.main.temp_min || e.main.temp));
    const pop  = Math.max(...entries.map(e => e.pop || 0));
    return { key, rep, maxT, minT, pop };
  });

  document.getElementById('daily-list').innerHTML = rows.map(r => `
    <div class="daily-row">
      <div class="d-day">${fmtDay(r.rep.dt_txt)}</div>
      <div class="d-emoji">${weatherEmojiForForecast(r.rep.weather[0].id, r.rep.dt_txt, timezone)}</div>
      <div class="d-desc">${r.rep.weather[0].description}</div>
      <div class="d-rain">${r.pop > 0.1 ? Math.round(r.pop * 100) + '%' : ''}</div>
      <div class="d-range">${Math.round(r.maxT)}°<span class="lo">${Math.round(r.minT)}°</span></div>
    </div>
  `).join('');
  document.getElementById('daily-section').style.display = 'block';
}

// ── Main Fetch & Render ──────────────────────────────────
function showLoading(msg = 'Loading…') {
  document.getElementById('current-card').innerHTML = `
    <div class="loading-state"><div class="spinner"></div><span>${msg}</span></div>`;
  document.getElementById('feedback-card').style.display = 'none';
  document.getElementById('hourly-section').style.display = 'none';
  document.getElementById('daily-section').style.display = 'none';
}

function showError(msg) {
  document.getElementById('current-card').innerHTML = `<div class="error-state">⚠ ${msg}</div>`;
}

async function loadWeatherLatLon(lat, lon) {
  showLoading('Fetching weather…');
  try {
    const [cur, fc] = await Promise.all([fetchCurrent(lat, lon), fetchForecast(lat, lon)]);
    const tz = cur.timezone; // seconds offset from UTC
    renderCurrent(cur);
    renderFeedback(cur, fc.list);
    renderHourly(fc.list, tz);
    renderDaily(fc.list, tz);
  } catch (e) {
    showError('Could not load weather. Check your connection.');
  }
}

async function loadWeatherCity(city) {
  showLoading(`Looking up ${city}…`);
  try {
    const [cur, fc] = await Promise.all([fetchCurrentByCity(city), fetchForecastByCity(city)]);
    const tz = cur.timezone;
    map.setView([cur.coord.lat, cur.coord.lon], 11);
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.marker([cur.coord.lat, cur.coord.lon], { icon: pinIcon }).addTo(map);

    renderCurrent(cur);
    renderFeedback(cur, fc.list);
    renderHourly(fc.list, tz);
    renderDaily(fc.list, tz);
  } catch (e) {
    showError(`City "${city}" not found. Try another.`);
  }
}

// ── Map Click ───────────────────────────────────────────
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  if (clickMarker) map.removeLayer(clickMarker);
  clickMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
  await loadWeatherLatLon(lat, lng);
});

// ── Travel Search with Nominatim ──────────────────────────
let travelSearchTimeout = null;
const travelInput = document.getElementById('travel-input');
const travelSuggestions = document.createElement('div');
travelSuggestions.className = 'suggestions-box';
travelInput.parentElement.appendChild(travelSuggestions);

async function searchTravelLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
  const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!response.ok) return [];
  const data = await response.json();
  return data.filter(place => {
    const type     = place.type || '';
    const category = place.class || '';
    return category === 'aeroway' ||
           category === 'railway' ||
           category === 'highway' ||
           type.includes('airport') ||
           type.includes('station') ||
           type.includes('terminal');
  }).slice(0, 5);
}

travelInput.addEventListener('input', () => {
  clearTimeout(travelSearchTimeout);
  const query = travelInput.value.trim();
  if (query.length < 2) {
    travelSuggestions.classList.remove('open');
    travelSuggestions.innerHTML = '';
    return;
  }
  travelSearchTimeout = setTimeout(async () => {
    try {
      const results = await searchTravelLocation(query);
      if (!results.length) { travelSuggestions.classList.remove('open'); return; }
      travelSuggestions.innerHTML = results.map(place => {
        const name     = place.display_name.split(',')[0];
        const fullName = place.display_name;
        const lat      = parseFloat(place.lat);
        const lon      = parseFloat(place.lon);
        const type     = place.type || 'location';
        const category = place.class || '';
        let icon = '📍';
        if (category === 'aeroway' || type.includes('airport')) icon = '✈️';
        else if (category === 'railway' || type.includes('station')) icon = '🚉';
        else if (category === 'highway') icon = '🚌';
        return `
          <div class="suggestion-item" data-lat="${lat}" data-lon="${lon}" data-name="${name}">
            ${icon} <strong>${name}</strong><br>
            <small style="color:var(--text3);font-size:0.7rem;">${fullName}</small>
          </div>`;
      }).join('');
      travelSuggestions.classList.add('open');
      travelSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', async () => {
          const lat  = parseFloat(item.dataset.lat);
          const lon  = parseFloat(item.dataset.lon);
          const name = item.dataset.name;
          travelInput.value = name;
          travelSuggestions.classList.remove('open');
          map.setView([lat, lon], 12);
          if (clickMarker) map.removeLayer(clickMarker);
          clickMarker = L.marker([lat, lon], { icon: travelIcon }).addTo(map);
          await loadWeatherLatLon(lat, lon);
        });
      });
    } catch (error) {
      console.error('Travel search error:', error);
      travelSuggestions.classList.remove('open');
    }
  }, 400);
});

travelInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    travelSuggestions.classList.remove('open');
    const query = travelInput.value.trim();
    if (query.length >= 2) {
      searchTravelLocation(query).then(results => {
        if (results.length > 0) {
          const place = results[0];
          const lat   = parseFloat(place.lat);
          const lon   = parseFloat(place.lon);
          const name  = place.display_name.split(',')[0];
          travelInput.value = name;
          map.setView([lat, lon], 12);
          if (clickMarker) map.removeLayer(clickMarker);
          clickMarker = L.marker([lat, lon], { icon: travelIcon }).addTo(map);
          loadWeatherLatLon(lat, lon);
        }
      });
    }
  }
  if (e.key === 'Escape') travelSuggestions.classList.remove('open');
});

document.addEventListener('click', e => {
  if (!travelInput.contains(e.target) && !travelSuggestions.contains(e.target)) {
    travelSuggestions.classList.remove('open');
  }
});

// ── Travel Mode Toggle ────────────────────────────────────
// FIX: The toggle button was INSIDE the hidden travel-input-wrap, making it
// unclickable. It has been moved to the header in the HTML. This handler
// now targets the button that lives outside the collapsible area.
function toggleTravelMode() {
  isTravelMode = !isTravelMode;
  const wrap = document.getElementById('travel-input-wrap');
  const btn  = document.getElementById('travel-toggle');

  if (isTravelMode) {
    wrap.style.display = 'flex';
    btn.textContent = '🌍 Exit Travel';
    btn.classList.add('active');
    document.getElementById('travel-input').focus();
  } else {
    wrap.style.display = 'none';
    btn.textContent = '✈ Travel';
    btn.classList.remove('active');
  }
  map.invalidateSize();
}

document.getElementById('travel-toggle').addEventListener('click', toggleTravelMode);

// ── Geolocation ──────────────────────────────────────────
showLoading('Locating you…');
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      currentLat = lat; currentLon = lon;
      map.setView([lat, lon], 11);
      L.marker([lat, lon], { icon: pulseIcon })
        .addTo(map)
        .bindTooltip('You', { permanent: true, direction: 'top' });
      await loadWeatherLatLon(lat, lon);
    },
    async () => {
      // Fallback: Coimbatore
      map.setView([11.0168, 76.9558], 11);
      await loadWeatherLatLon(11.0168, 76.9558);
    },
    { timeout: 8000 }
  );
} else {
  loadWeatherLatLon(11.0168, 76.9558);
}

// ── Search (Header) ──────────────────────────────────────
let searchTimeout = null;
const searchInput    = document.getElementById('search-input');
const suggestionsBox = document.getElementById('search-suggestions');

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (q.length < 2) { suggestionsBox.classList.remove('open'); return; }
  searchTimeout = setTimeout(async () => {
    const results = await geocodeCity(q);
    if (!results.length) { suggestionsBox.classList.remove('open'); return; }
    suggestionsBox.innerHTML = results.map(r => `
      <div class="suggestion-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.name}, ${r.country}">
        ${r.name}${r.state ? ', ' + r.state : ''}, ${r.country}
      </div>
    `).join('');
    suggestionsBox.classList.add('open');
    suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        searchInput.value = item.dataset.name;
        suggestionsBox.classList.remove('open');
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        map.setView([lat, lon], 11);
        if (clickMarker) map.removeLayer(clickMarker);
        clickMarker = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
        loadWeatherLatLon(lat, lon);
      });
    });
  }, 350);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && searchInput.value.trim()) {
    suggestionsBox.classList.remove('open');
    loadWeatherCity(searchInput.value.trim());
  }
  if (e.key === 'Escape') suggestionsBox.classList.remove('open');
});

document.addEventListener('click', e => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.classList.remove('open');
  }
});

// ── Tab switching ────────────────────────────────────────
document.getElementById('btn-main').addEventListener('click', () => switchTab('main'));
document.getElementById('btn-compare').addEventListener('click', () => switchTab('compare'));

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`btn-${tab}`).classList.add('active');
  if (tab === 'main') map.invalidateSize();
}

// ── Compare Cities ───────────────────────────────────────
const compareData = [null, null, null];
let compareTimeout = [null, null, null];

function getCmpFeedbackLine(currentData) {
  const fb = getFeedback(currentData, null);
  return `${fb.icon} ${fb.tips[0]}`;
}

async function renderCompareCard(idx, cityName) {
  const container = document.getElementById('compare-cards');
  let card = document.getElementById(`cmp-card-${idx}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `cmp-card-${idx}`;
    card.className = 'cmp-card';
    container.appendChild(card);
  }
  card.innerHTML = `<div class="cmp-loading"><div class="spinner"></div><span>Loading ${cityName}…</span></div>`;
  try {
    const data = await fetchCurrentByCity(cityName);
    compareData[idx] = data;
    const t  = Math.round(data.main.temp);
    const tc = tempClass(t);
    const id = data.weather[0].id;
    const tz = data.timezone;

    card.innerHTML = `
      <div class="cmp-city">${data.name}</div>
      <div class="cmp-country">${data.sys?.country || ''}</div>
      <div class="cmp-main">
        <div class="cmp-emoji">${weatherEmoji(id, tz)}</div>
        <div>
          <div class="cmp-temp-big ${tc}">${t}°C</div>
          <div class="cmp-desc-text">${data.weather[0].description}</div>
        </div>
      </div>
      <div class="cmp-grid">
        <div class="cmp-row">
          <div class="cmp-row-label">Feels Like</div>
          <div class="cmp-row-value">${Math.round(data.main.feels_like)}°C</div>
        </div>
        <div class="cmp-row">
          <div class="cmp-row-label">Humidity</div>
          <div class="cmp-row-value">${data.main.humidity}%</div>
        </div>
        <div class="cmp-row">
          <div class="cmp-row-label">Wind</div>
          <div class="cmp-row-value">${Math.round(data.wind.speed * 3.6)} km/h</div>
        </div>
        <div class="cmp-row">
          <div class="cmp-row-label">Clouds</div>
          <div class="cmp-row-value">${data.clouds?.all ?? 0}%</div>
        </div>
      </div>
      <div class="cmp-feedback">${getCmpFeedbackLine(data)}</div>
    `;
  } catch {
    card.innerHTML = `<div class="error-state">⚠ "${cityName}" not found</div>`;
  }
}

document.querySelectorAll('.city-search').forEach(input => {
  const idx   = parseInt(input.dataset.idx);
  const sugBox = document.getElementById(`cs-${idx}`);

  input.addEventListener('input', () => {
    clearTimeout(compareTimeout[idx]);
    const q = input.value.trim();
    if (q.length < 2) { sugBox.classList.remove('open'); return; }
    compareTimeout[idx] = setTimeout(async () => {
      const results = await geocodeCity(q);
      if (!results.length) { sugBox.classList.remove('open'); return; }
      sugBox.innerHTML = results.map(r => `
        <div class="suggestion-item" data-name="${r.name}${r.state ? ', ' + r.state : ''}, ${r.country}">
          ${r.name}${r.state ? ', ' + r.state : ''}, ${r.country}
        </div>
      `).join('');
      sugBox.classList.add('open');
      sugBox.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          input.value = item.dataset.name;
          sugBox.classList.remove('open');
          renderCompareCard(idx, item.dataset.name);
        });
      });
    }, 350);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      sugBox.classList.remove('open');
      renderCompareCard(idx, input.value.trim());
    }
    if (e.key === 'Escape') sugBox.classList.remove('open');
  });
});

document.addEventListener('click', e => {
  document.querySelectorAll('.city-suggestions').forEach((box, i) => {
    const inp = document.querySelectorAll('.city-search')[i];
    if (!inp.contains(e.target) && !box.contains(e.target)) {
      box.classList.remove('open');
    }
  });
});