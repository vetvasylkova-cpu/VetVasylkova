import WebSocket from 'ws';
global.WebSocket = WebSocket;

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
  console.error('❌ ПОМИЛКА: SUPABASE_URL відсутній!');
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
  console.log('🚀 З’єднання встановлено! Запитуємо неопрацьовані записи з "База кормів"...');

  // Отримуємо до 5 кормів, у яких ще не заповнено поле "Оцінка /10"
  const { data: feeds, error } = await supabase
    .from('База кормів')
    .select('*')
    .is('Оцінка /10', null)
    .limit(5);

  if (error) {
    console.error('❌ Помилка зчитування з Supabase:', error);
    return;
  }

  if (!feeds || feeds.length === 0) {
    console.log('✅ Усі корми в таблиці вже проаналізовані!');
    return;
  }

  console.log(`🔍 Знайдено кормів для обробки: ${feeds.length}`);

  for (const feed of feeds) {
    const feedName = feed['Назва корму'] || feed['Бренд'] || `ID ${feed.id}`;
    console.log(`🤖 Gemini аналізує: ${feedName}...`);

    const prompt = `
      Ти досвідчений ветеринарний дієтолог. Проаналізуй наступний корм для тварин за його параметрами:
      - Назва корму: ${feed['Назва корму'] || 'Не вказано'}
      - Бренд: ${feed['Бренд'] || 'Не вказано'}
      - Країна: ${feed['Країна'] || 'Не вказано'}
      - Для кого: ${feed['Для кого'] || 'Не вказано'}
      - Тип корму: ${feed['Тип корму'] || 'Не вказано'}
      - Grain-free: ${feed['Grain-free'] || 'Не вказано'}
      - Білки %: ${feed['Білки %'] ?? 'Не вказано'}
      - Жири %: ${feed['Жири %'] ?? 'Не вказано'}
      - Клітковина %: ${feed['Клітковина %'] ?? 'Не вказано'}
      - Зола %: ${feed['Зола %'] ?? 'Не вказано'}
      - Волога %: ${feed['Волога %'] ?? 'Не вказано'}
      - Вуглеводи %: ${feed['Вуглеводи %'] ?? 'Не вказано'}
      - Калорійність ккал/кг: ${feed['Калорійність ккал/кг'] ?? 'Не вказано'}
      - Ca:P: ${feed['Ca:P'] || 'Не вказано'}
      - Таурин мг/кг: ${feed['Таурин мг/кг'] ?? 'Не вказано'}

      Поверни відповідь СТРOГО у форматі JSON із такими полями:
      {
        "class": "Визначений клас корму (Економ, Преміум, Супер-преміум або Холістік)",
        "rating": число від 1 до 10 (оцінка якості та аналітичного складу),
        "suitable": "Лаконічний опис (1-2 речення), кому саме підійде цей корм",
        "not_suitable": "Лаконічний опис (1-2 речення), кому цей корм НЕ підійде або які є застереження"
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const result = JSON.parse(response.text);

      // Записуємо аналіз у відповідні колонки таблиці "База кормів"
      const { error: updateError } = await supabase
        .from('База кормів')
        .update({
          'Клас': result.class,
          'Оцінка /10': Number(result.rating),
          'Кому підійде': result.suitable,
          'Кому не підійде': result.not_suitable,
          'Дата': new Date().toISOString().split('T')[0] // Формат YYYY-MM-DD
        })
        .eq('id', feed.id);

      if (updateError) {
        console.error(`❌ Помилка запису в Supabase для ${feedName}:`, updateError);
      } else {
        console.log(`✅ Успішно оновлено: ${feedName} (Оцінка: ${result.rating}/10, Клас: ${result.class})`);
      }
    } catch (err) {
      console.error(`❌ Помилка під час обробки Gemini для ${feedName}:`, err);
    }
  }

  console.log('🎉 Усі записи з цієї партії успішно оброблені!');
}

runAnalysis().catch((err) => {
  console.error('❌ Критична помилка:', err);
  process.exit(1);
});
