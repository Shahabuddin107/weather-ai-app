import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// 1. Root route to serve HTML
app.get('/', (req, res) => {
  const publicPath = path.join(__dirname, 'public', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  } else if (fs.existsSync(rootPath)) {
    return res.sendFile(rootPath);
  }
  res.status(404).send('index.html nahi mili!');
});

// Geocoding Helper
async function getCoordinates(city) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(geoUrl);
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('City not found');
  }
  return data.results[0];
}

// 2. Weather Route
app.get('/api/weather', async (req, res) => {
  try {
    const { city, lat, lon } = req.query;
    let targetLat = lat;
    let targetLon = lon;
    let locationName = city || 'Current Location';

    if (city) {
      const geo = await getCoordinates(city);
      targetLat = geo.latitude;
      targetLon = geo.longitude;
      locationName = `${geo.name}, ${geo.country || ''}`;
    }

    if (!targetLat || !targetLon) {
      targetLat = 28.6139;
      targetLon = 77.2090;
      locationName = 'New Delhi, India';
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`;

    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    return res.json({
      location: locationName,
      latitude: targetLat,
      longitude: targetLon,
      current: weatherData.current,
      hourly: weatherData.hourly,
      daily: weatherData.daily
    });
  } catch (error) {
    console.error('Weather error:', error.message);
    res.status(500).json({ error: error.message || 'Weather fetch fail hua' });
  }
});

// 3. AI Insights Route
app.post('/api/ai-insights', async (req, res) => {
  const { city, temperature, condition, humidity, windSpeed, userQuery } = req.body;

  const defaultInsight = () => {
    let cloth = temperature < 18 ? 'Thandi hawayein hain, jacket pehniye.' : (temperature > 32 ? 'Garmi zyada hai, light cotton kapde aur paani peete rahein.' : 'Mausam comfortable aur suhana hai.');
    let act = condition && condition.toLowerCase().includes('rain') ? 'Barish ho sakti hai, umbrella sath rakhein.' : 'Outdoor ghumne ke liye badhiya waqt hai.';
    return `Mausam Report (${city}): Abhi temperature ${temperature}°C hai aur mausam "${condition}" hai. ${cloth} ${act}`;
  };

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({ result: defaultInsight() });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let prompt = userQuery 
      ? `Aap ek friendly weather AI hain. Context: Location: ${city}, Temp: ${temperature}°C, Mausam: ${condition}, Humidity: ${humidity}%, Wind: ${windSpeed} km/h. User sawal: "${userQuery}". Chhota aur clear jawab dein Hinglish me.`
      : `Aap ek friendly weather AI hain. Context: Location: ${city}, Temp: ${temperature}°C, Mausam: ${condition}, Wind: ${windSpeed} km/h. 2-3 lines me advice dein: kya kapde pehne aur outdoor jaana theek hai ya nahi. Hinglish me likhein.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ result: response.text() });
  } catch (error) {
    res.json({ result: defaultInsight() });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Weather AI Server is running at http://localhost:${PORT}`);
});