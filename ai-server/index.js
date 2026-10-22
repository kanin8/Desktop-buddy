import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Initial configuration
let AI_CONFIG = {
  provider: process.env.AI_PROVIDER || 'anthropic',
  apiKey: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || 'gemma:2b',
};

// Load config from file if it exists
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    AI_CONFIG = { ...AI_CONFIG, ...savedConfig };
    console.log('[AI Server] Loaded configuration from config.json');
  } catch (e) {
    console.error('[AI Server] Error loading config.json:', e);
  }
}

app.post('/config', (req, res) => {
  const { provider, apiKey, model } = req.body;

  if (!provider) {
    return res.status(400).json({ error: 'Provider is required' });
  }

  AI_CONFIG = {
    provider,
    apiKey: apiKey || '',
    model: model || AI_CONFIG.model,
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(AI_CONFIG, null, 2));
    console.log('[AI Server] Configuration updated and saved:', AI_CONFIG);
    res.json({ status: 'ok', config: AI_CONFIG });
  } catch (e) {
    console.error('[AI Server] Error saving config.json:', e);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

app.post('/classify', async (req, res) => {
  const { appName, title, url } = req.body;

  const { appName, title, url } = req.body;

  console.log(`[AI Server] Classifying: ${appName} | ${title} | ${url || 'No URL'}`);

  if (!AI_CONFIG.apiKey && AI_CONFIG.provider !== 'ollama') {
    console.error('[AI Server] API Key missing. Returning simulation result.');
    // Fallback simulation so the app doesn't break while you set up the key
    const context = `${appName} ${title}`.toLowerCase();
    const isProductive = context.includes('study') || context.includes('code') || context.includes('work');
    return res.json({ category: isProductive ? 'productive' : 'leisure' });
  }

  try {
    let category = 'uncategorized';

    if (AI_CONFIG.provider === 'anthropic') {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `You are a productivity expert. Classify this activity as either 'productive' or 'leisure'.
          App: ${appName}
          Title: ${title}
          URL: ${url || 'N/A'}
          Reply with ONLY the word 'productive' or 'leisure'.`
        }]
      }, {
        headers: {
          'x-api-key': AI_CONFIG.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      });
      category = response.data.content[0].text.trim().toLowerCase();
    } else if (AI_CONFIG.provider === 'openai') {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: `Classify this activity as either 'productive' or 'leisure'.
          App: ${appName}
          Title: ${title}
          URL: ${url || 'N/A'}
          Reply with ONLY the word 'productive' or 'leisure'.`
        }]
      }, {
        headers: {
          'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      category = response.data.choices[0].message.content.trim().toLowerCase();
    } else if (AI_CONFIG.provider === 'ollama') {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: AI_CONFIG.model,
        prompt: `You are a strict productivity classifier. Your ONLY job is to classify an activity as either 'productive' or 'leisure'.

Classification Logic:
1. Productivity:
   - Applications that are primarily for work/study: VS Code, IntelliJ, Word, Excel, PowerPoint, Notion, Obsidian.
   - Academic pursuits: Research articles, university portals, digital libraries, PDF readers for papers.
   - Professional tools: Terminal, Docker, Figma, Jira.
   - Content: If the title/URL indicates a tutorial, documentation, or academic research.

2. Leisure:
   - Entertainment: YouTube (vlogs, gaming, music), Netflix, Twitch, Disney+.
   - Social Media: Twitter, Instagram, Reddit, Facebook.
   - Gaming: Steam, Epic Games, or any specific game title.
   - General browsing: Shopping sites, news sites (unless research-based).

Examples:
- App: Visual Studio Code, Title: index.ts -> productive
- App: Chrome, Title: arXiv.org - Quantum Computing Paper -> productive
- App: Chrome, Title: PewDiePie - Funny Moments -> leisure
- App: Spotify, Title: Gaming Beats -> leisure
- App: Microsoft Word, Title: Thesis Draft -> productive

Activity to classify:
App: ${appName}
Title: ${title}
URL: ${url || 'N/A'}

Reply with ONLY the word 'productive' or 'leisure'. No explanation, no punctuation.`,
        stream: false,
        options: {
          temperature: 0
        }
      });
      category = response.data.response.trim().toLowerCase();
    }

    // Final cleanup: extract the keyword if the AI added punctuation or extra text
    const lowerCategory = category.toLowerCase();
    if (lowerCategory.includes('productive')) {
      category = 'productive';
    } else if (lowerCategory.includes('leisure')) {
      category = 'leisure';
    } else {
      category = 'uncategorized';
    }

    console.log(`[AI Server] Decision: ${category}`);
    res.json({ category });
  } catch (error) {
    console.error('[AI Server] API Error:', error.response?.data || error.message);
    res.status(500).json({ category: 'uncategorized', error: 'AI classification failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AI Classification Server running on http://localhost:${PORT}`);
});
