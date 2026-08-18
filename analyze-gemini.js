import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("Помилка: Не задані необхідні змінні оточення (Secrets).");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

async function analyzeFeeds() {
  const { data: feeds, error } = await supabase
    .from('feeds')
    .select('*')
    .or('protein_dm_pct.is.null,vet_summary.is.null');

  if (error) {
    console.error("Помилка отримання даних з Supabase:", error);
    return;
  }

  if (!feeds || feeds.length === 0) {
    console.log("Немає нових кормів для аналізу.");
    return;
  }

  console.log(`Знайдено ${feeds.length} кормів для аналізу.`);
  const model = genAI.getGenerativeModel({
  model: "gemini-3.6-flash",
  generationConfig: { responseMimeType: "application/json" }
});

  for (const feed of feeds) {
    console.log(`Аналізуємо: ${feed.title || feed.name || feed.id}`);

    // Оновлений промпт для Gemini
const prompt = `
Аналізуй склад цього корму: "${title}"
Склад: ${cleanComposition}

Виконай наступне:
1. Постав рейтинг від 1 до 10 на основі біологічної відповідності (високий вміст м'яса = 9-10, зернові на першому місці = 2-3).
2. Знайди приховані недоліки (наприклад: "продукти переробки тваринного походження", кукурудза, пшениця, незрозумілі джерела жиру, надлишок вуглеводів).
3. Надай короткий ветеринарний коментар.

Поверни відповідь виключно у форматі JSON:
{
  "rating": 7,
  "flaws": "Вміст кукурудзяного глютену, нечітке джерело жиру",
  "vet_summary": "Середній корм, потребує доповнення вітамінами"
}
`;

// Після отримання відповіді від Gemini:
const analysis = JSON.parse(result.response.text());

// Оновлення запису в Supabase
await supabase
  .from('feeds')
  .update({ 
    rating: analysis.rating, 
    flaws: analysis.flaws, 
    vet_summary: analysis.vet_summary 
  })
  .eq('title', title);

Поверни ВИНЯТКОВО валідний JSON без маркдауну:
{
  "moisture_pct": 10,
  "protein_dm_pct": 32.5,
  "fat_dm_pct": 16.2,
  "ash_dm_pct": 7.1,
  "fiber_dm_pct": 2.5,
  "carbs_dm_pct": 41.7,
  "calcium_pct": 1.1,
  "phosphorus_pct": 0.9,
  "ca_p_ratio": 1.22,
  "magnesium_pct": 0.08,
  "sodium_pct": 0.3,
  "omega_3_pct": 0.5,
  "omega_6_pct": 2.2,
  "omega_6_3_ratio": 4.4,
  "meat_content_pct": 60,
  "animal_protein_pct": 80,
  "plant_protein_pct": 20,
  "urine_ph_estimate": "Слабокислий (6.2 - 6.5)",
  "urolithiasis_risk": "Низький ризик струвітів",
  "vet_summary": "Збалансований корм з хорошим вмістом білка"
}
`;
// Додаємо функцію для повторної спроби при помилці 503
async function generateWithRetry(model, prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      if (err.status === 503 && attempt < maxRetries) {
        console.log(`Сервер перевантажений (503). Спроба ${attempt} з ${maxRetries}. Чекаємо 5 секунд...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // пауза 5 секунд
      } else {
        throw err;
      }
    }
  }
}
    try {
     const result = await generateWithRetry(model, prompt);
      const text = result.response.text().trim();
      const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const { error: updateError } = await supabase
        .from('feeds')
        .update(parsed)
        .eq('id', feed.id);

      if (updateError) {
        console.error(`Помилка оновлення ID ${feed.id}:`, updateError);
      } else {
        console.log(`Успішно оновлено корм ID ${feed.id}`);
      }
    } catch (e) {
      console.error(`Помилка обробки ID ${feed.id}:`, e);
    }
  }
}

analyzeFeeds();
