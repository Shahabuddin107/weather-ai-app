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
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Static files serve karne ke liye
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Main page route
app.get('/', (req, res) => {
  const publicPath = path.join(__dirname, 'public', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  } else if (fs.existsSync(rootPath)) {
    return res.sendFile(rootPath);
  }
  res.status(404).send('index.html nahi mili. Check karein file public folder me hai.');
});

// Weather API Route
app.get('/api/weather', async (req, res) => {
  try {
    const { city, lat, lon } = req.query;
    let targetLat = lat;
    let targetLon = lon;
    let locationName = city || 'Current Location';

    if (city) {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (!geoData.results || geoData.results.length === 0) {
        return res.status(404).json({ error: 'City not found' });
      }
      targetLat = geoData.results[0].latitude;
      targetLon = geoData.results[0].longitude;
      locationName = `${geoData.results[0].name}, ${geoData.results[0].country || ''}`;
    }

    if (!targetLat || !targetLon) {
      targetLat = 26.1542;
      targetLon = 85.8918;
      locationName = 'Darbhanga, India';
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
    res.status(500).json({ error: 'Weather fetch failed' });
  }
});

// Gemini AI Route
app.post('/api/ai-insights', async (req, res) => {
  const { city, temperature, condition, humidity, windSpeed, userQuery } = req.body;

  const defaultInsight = () => {
    let cloth = temperature < 18 ? 'Thand hai, jacket pehniye.' : (temperature > 30 ? 'Garmi hai, light cotton kapde behtar rahenge.' : 'Mausam suhana hai.');
    let act = condition && condition.toLowerCase().includes('rain') ? 'Barish ho sakti hai, umbrella sath rakhein.' : 'Outdoor ghumne ke liye badhiya waqt hai.';
    return `Mausam Report (${city}): Temp ${Math.round(temperature)}°C, Condition "${condition}". ${cloth} ${act}`;
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ result: defaultInsight() });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let prompt = userQuery
      ? `Aap ek smart weather assistant hain. Location: ${city}, Temp: ${temperature}°C, Weather: ${condition}, Humidity: ${humidity}%, Wind: ${windSpeed} km/h. Sawal: "${userQuery}". Hinglish me 2-3 lines me clear jawab dein.`
      : `Aap ek smart weather assistant hain. Location: ${city}, Temp: ${temperature}°C, Weather: ${condition}, Humidity: ${humidity}%, Wind: ${windSpeed} km/h. 2-3 lines me Hinglish lifestyle advice dein (kapde, travel, precautions).`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ result: response.text() });
  } catch (error) {
    console.error('AI error:', error.message);
    res.json({ result: defaultInsight() });
  }
});

// Production binding for Render (0.0.0.0 is mandatory)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Weather AI Server is running on port ${PORT}`);
});