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
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  for (const feed of feeds) {
    console.log(`Аналізуємо: ${feed.title || feed.name || feed.id}`);

    const prompt = `
Ви — ветеринарний дієтолог. Проаналізуйте склад та показники корму:
Корм: ${feed.title || feed.name || ''}
Інгредієнти: ${feed.ingredients || 'Не вказано'}
Протеїн: ${feed.protein || 'N/A'}%, Жир: ${feed.fat || 'N/A'}%, Зола: ${feed.ash || 'N/A'}%, Клітковина: ${feed.fiber || 'N/A'}%, Вологість: ${feed.moisture || 'N/A'}%

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

    try {
      const result = await model.generateContent(prompt);
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
