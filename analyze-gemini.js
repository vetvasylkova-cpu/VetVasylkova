import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function processAllFeeds() {
  console.log('🚀 Починаємо аналіз кормів через Gemini API...');

  // 1. Отримуємо корми з таблиці "База кормів"
  const { data: feeds, error } = await supabase
    .from('База кормів')
    .select('*');

  if (error) {
    console.error('Помилка отримання кормів з Supabase:', error);
    return;
  }

  console.log(`Знайдено кормів: ${feeds.length}`);

  for (const feed of feeds) {
    const feedName = feed['Назва корму'] || 'Невідомий корм';
    console.log(`🤖 Аналізуємо через Gemini: ${feedName}...`);

    try {
      const prompt = `
        Проаналізуй склад корму для тварин та надай оцінку:
        - Назва: ${feed['Назва корму']}
        - Бренд: ${feed['Бренд']}
        - Клас: ${feed['Клас']}
        - Для кого: ${feed['Для кого']}
        - Тип корму: ${feed['Тип корму']}
        - Беззерновий: ${feed['Grain-free']}
        - Білки: ${feed['Білки %']}%, Жири: ${feed['Жири %']}%, Клітковина: ${feed['Клітковина %']}%, Зола: ${feed['Зола %']}%

        Поверни відповідь у форматі JSON з такими полями:
        {
          "rating": число від 1 до 10 (ціле або дробове),
          "suitableFor": "короткий текст (1-2 речення), кому підійде цей корм",
          "notSuitableFor": "короткий текст (1-2 речення), кому не підійде цей корм"
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

    const result = JSON.parse(response.text);

// Округлюємо оцінку до цілого числа для колонки int64
const roundedRating = Math.round(Number(result.rating) || 5);

const { error: updateError } = await supabase
  .from('База кормів')
  .update({
    'Оцінка /10': roundedRating,
    'Кому підійде': result.suitableFor,
    'Кому не підійде': result.notSuitableFor
  })
  .eq('Назва корму', feed['Назва корму']);

if (updateError) {
  console.error(`Помилка оновлення ${feedName}:`, updateError.message);
} else {
  console.log(`✅ Успішно проаналізовано: ${feedName} (Оцінка: ${roundedRating}/10)`);
}

// Пауза 1 секунда між запитами, щоб API не видавало помилку 503
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (err) {
      console.error(`Помилка під час аналізу ${feedName}:`, err.message);
    }
  }

  console.log('🎉 Безкоштовний аналіз усіх кормів завершено!');
}

processAllFeeds();
