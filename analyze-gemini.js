import WebSocket from 'ws';
global.WebSocket = WebSocket;

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Перевірка змінних оточення
if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
  console.error('❌ ПОМИЛКА: SUPABASE_URL відсутній або має некоректний формат!');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ ПОМИЛКА: SUPABASE_SERVICE_KEY відсутній!');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('❌ ПОМИЛКА: GEMINI_API_KEY відсутній!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { disabled: true }
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function runAnalysis() {
  console.log('🚀 З’єднання встановлено! Розпочинаємо аналіз...');
  
  // Вставте сюди вашу основну логіку роботи з Supabase та Gemini
}

runAnalysis().catch((err) => {
  console.error('❌ Помилка виконання:', err);
  process.exit(1);
});
