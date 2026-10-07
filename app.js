let currentWeatherData = null;
let chartInstance = null;

// Backend direct link
const BACKEND_URL = 'http://localhost:3000';

const weatherCodeMap = {
  0: { label: 'Clear Sky', icon: 'sun', theme: 'sunny' },
  1: { label: 'Mainly Clear', icon: 'sun-medium', theme: 'sunny' },
  2: { label: 'Partly Cloudy', icon: 'cloud-sun', theme: 'sunny' },
  3: { label: 'Overcast', icon: 'cloud', theme: 'ocean' },
  45: { label: 'Foggy', icon: 'cloud-fog', theme: 'ocean' },
  51: { label: 'Light Drizzle', icon: 'cloud-drizzle', theme: 'ocean' },
  61: { label: 'Rainy', icon: 'cloud-rain', theme: 'ocean' },
  65: { label: 'Heavy Rain', icon: 'cloud-lightning', theme: 'ocean' },
  95: { label: 'Thunderstorm', icon: 'cloud-lightning', theme: 'sunset' }
};

function getWeatherMeta(code) {
  return weatherCodeMap[code] || { label: 'Clear', icon: 'sun', theme: 'sunny' };
}

// Direct Open-Meteo Fetcher (Live Server 5500 fallback)
async function fetchDirectWeather(city) {
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
  const geoData = await geoRes.json();
  if (!geoData.results || !geoData.results.length) throw new Error('City not found');
  const loc = geoData.results[0];

  const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`);
  const wData = await wRes.json();

  return {
    location: `${loc.name}, ${loc.country || ''}`,
    current: wData.current,
    hourly: wData.hourly,
    daily: wData.daily
  };
}

async function fetchWeather(city = 'Darbhanga') {
  try {
    let data;
    try {
      const res = await fetch(`${BACKEND_URL}/api/weather?city=${encodeURIComponent(city)}`);
      if (!res.ok) throw new Error('Backend offline');
      data = await res.json();
    } catch {
      data = await fetchDirectWeather(city);
    }

    currentWeatherData = data;
    renderCurrent(data);
    renderChart(data.hourly);
    renderForecast(data.daily);
    fetchAIInsight();
  } catch (err) {
    console.error(err);
    alert('Weather load nahi hua: ' + err.message);
  }
}

function renderCurrent(data) {
  const current = data.current;
  const meta = getWeatherMeta(current.weather_code);

  document.getElementById('location-name').textContent = data.location;
  document.getElementById('current-date').textContent = new Date().toDateString();
  document.getElementById('current-temp').textContent = Math.round(current.temperature_2m);
  document.getElementById('feels-like').textContent = Math.round(current.apparent_temperature);
  document.getElementById('condition-badge').textContent = meta.label;
  document.getElementById('humidity-val').textContent = `${current.relative_humidity_2m}%`;
  document.getElementById('wind-val').textContent = `${current.wind_speed_10m} km/h`;

  const uv = data.daily?.uv_index_max ? Math.round(data.daily.uv_index_max[0]) : 5;
  const precip = data.hourly?.precipitation_probability ? data.hourly.precipitation_probability[0] : 0;
  document.getElementById('uv-val').textContent = `${uv} / 11`;
  document.getElementById('precip-val').textContent = `${precip}%`;

  const iconBox = document.getElementById('weather-icon-wrapper');
  iconBox.innerHTML = `<i data-lucide="${meta.icon}" class="w-14 h-14 text-amber-300"></i>`;
  if (window.lucide) lucide.createIcons();
}

function renderChart(hourly) {
  if (!hourly?.time) return;
  const canvas = document.getElementById('hourlyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const labels = hourly.time.slice(0, 12).map(t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const temps = hourly.temperature_2m.slice(0, 12);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: temps,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.2)',
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#ffffff',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.08)' } }
      }
    }
  });
}

function renderForecast(daily) {
  if (!daily?.time) return;
  const container = document.getElementById('forecast-container');
  if (!container) return;
  container.innerHTML = '';

  daily.time.slice(0, 7).forEach((time, index) => {
    const meta = getWeatherMeta(daily.weather_code[index]);
    const day = new Date(time).toLocaleDateString(undefined, { weekday: 'short' });
    const max = Math.round(daily.temperature_2m_max[index]);
    const min = Math.round(daily.temperature_2m_min[index]);

    const card = document.createElement('div');
    card.className = 'bg-black/30 border border-white/10 rounded-2xl p-3 flex flex-col items-center justify-between text-center';
    card.innerHTML = `
      <span class="text-xs text-white/70">${day}</span>
      <div class="my-2 text-amber-300">
        <i data-lucide="${meta.icon}" class="w-6 h-6"></i>
      </div>
      <div class="text-xs font-semibold">
        <span>${max}°</span>
        <span class="text-white/50 ml-1 font-normal">${min}°</span>
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

async function fetchAIInsight(userQuery = null) {
  const box = document.getElementById('ai-insight-box');
  if (!box || !currentWeatherData) return;
  box.innerHTML = '<span class="animate-pulse">Gemini AI response tayar kar raha hai...</span>';

  const temp = currentWeatherData.current.temperature_2m;
  const meta = getWeatherMeta(currentWeatherData.current.weather_code);

  const localAdvice = () => {
    let cloth = temp < 18 ? 'Thand hai, jacket pehniye.' : (temp > 30 ? 'Garmi hai, light cotton kapde behtar rahenge.' : 'Mausam suhana hai.');
    let act = meta.label.toLowerCase().includes('rain') ? 'Barish ho sakti hai, umbrella sath rakhein.' : 'Outdoor ghumne ke liye badhiya waqt hai.';
    return `Mausam Report (${currentWeatherData.location}): Temp ${Math.round(temp)}°C, Condition "${meta.label}". ${cloth} ${act}`;
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/ai-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: currentWeatherData.location,
        temperature: temp,
        condition: meta.label,
        humidity: currentWeatherData.current.relative_humidity_2m,
        windSpeed: currentWeatherData.current.wind_speed_10m,
        userQuery: userQuery
      })
    });

    const data = await res.json();
    box.innerHTML = (data.result || localAdvice()).replace(/\n/g, '<br>');
  } catch {
    box.innerHTML = localAdvice();
  }
}

// Theme Switcher
function setTheme(themeName) {
  document.body.className = `theme-${themeName} min-h-screen text-slate-100 p-4 md:p-8`;
  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.dataset.theme === themeName) {
      btn.className = 'theme-btn px-3 py-1 text-xs rounded-xl font-semibold bg-white/20 text-white border border-white/20';
    } else {
      btn.className = 'theme-btn px-3 py-1 text-xs rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/10';
    }
  });
  localStorage.setItem('user-theme', themeName);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('city-input').value.trim();
      if (val) fetchWeather(val);
    });
  }

  document.querySelectorAll('.ai-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      fetchAIInsight(btn.dataset.q);
    });
  });

  const askBtn = document.getElementById('ask-ai-btn');
  if (askBtn) {
    askBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const query = document.getElementById('ai-user-query').value.trim();
      if (query) {
        fetchAIInsight(query);
        document.getElementById('ai-user-query').value = '';
      }
    });
  }

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setTheme(btn.dataset.theme);
    });
  });

  const geoBtn = document.getElementById('geo-btn');
  if (geoBtn) {
    geoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`);
            const wData = await wRes.json();
            currentWeatherData = { location: 'Current Location', current: wData.current, hourly: wData.hourly, daily: wData.daily };
            renderCurrent(currentWeatherData);
            renderChart(currentWeatherData.hourly);
            renderForecast(currentWeatherData.daily);
            fetchAIInsight();
          },
          () => alert('GPS location access nahi mil saka.')
        );
      }
    });
  }

  setTheme(localStorage.getItem('user-theme') || 'ocean');
  fetchWeather('Darbhanga');
});