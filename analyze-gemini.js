import { GoogleGenerativeAI } from '@google/generative-ai": "^0.21.0';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("Помилка: Не задані необхідні змінні оточення.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

async function analyzeFeeds() {
  // Звертаємося до таблиці feeds
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
Ви — провідний ветеринарний дієтолог. Проаналізуйте склад та гарантований аналіз даного корму.

Корм: ${feed.title || feed.name || ''}
Інгредієнти: ${feed.ingredients || 'Не вказано'}
Показники (As Fed / Як є):
- Протеїн: ${feed.protein || 'N/A'}%
- Жир: ${feed.fat || 'N/A'}%
- Зола: ${feed.ash || 'N/A'}%
- Клітковина: ${feed.fiber || 'N/A'}%
- Вологість: ${feed.moisture || 'N/A'}%
- Кальцій: ${feed.calcium || 'N/A'}%
- Фосфор: ${feed.phosphorus || 'N/A'}%
- Магній: ${feed.magnesium || 'N/A'}%
- Натрій: ${feed.sodium || 'N/A'}%
- Омега-3: ${feed.omega_3 || 'N/A'}%
- Омега-6: ${feed.omega_6 || 'N/A'}%

Завдання:
1. Перерахуйте протеїн, жир, золу, клітковину та вуглеводи (NFE) на Суху Речовину (Dry Matter / DM). 
   Формула: DM % = Показник / (100 - Вологість) * 100. Якщо вологість не вказана, беріть 10% для сухого та 80% для вологого корму.
2. Розрахуйте співвідношення Ca:P (Кальцій до Фосфору) та Омега-6:Омега-3.
3. Оцініть відсоток м'ясних інгредієнтів та частку тваринного білка проти рослинного.
4. Оцініть вплив на pH сечі та ризик сечокам'яної хвороби (струвіти/оксалати).
5. Складіть короткий ветеринарний висновок українською мовою.

Поверніть ВИНЯТКОВО валидний JSON без маркдаун-обгорток (\`\`\`json):
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
  "urine_ph_estimate": "Нейтральний або слабокислий (6.2 - 6.5)",
  "urolithiasis_risk": "Низький ризик струвітів, оптимальний рівень мінералів",
  "vet_summary": "Збалансований корм з хорошим вмістом тваринного білка..."
}
`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      const cleanJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const { error: updateError } = await supabase
        .from('feeds')
        .update({
          moisture_pct: parsed.moisture_pct,
          protein_dm_pct: parsed.protein_dm_pct,
          fat_dm_pct: parsed.fat_dm_pct,
          ash_dm_pct: parsed.ash_dm_pct,
          fiber_dm_pct: parsed.fiber_dm_pct,
          carbs_dm_pct: parsed.carbs_dm_pct,
          calcium_pct: parsed.calcium_pct,
          phosphorus_pct: parsed.phosphorus_pct,
          ca_p_ratio: parsed.ca_p_ratio,
          magnesium_pct: parsed.magnesium_pct,
          sodium_pct: parsed.sodium_pct,
          omega_3_pct: parsed.omega_3_pct,
          omega_6_pct: parsed.omega_6_pct,
          omega_6_3_ratio: parsed.omega_6_3_ratio,
          meat_content_pct: parsed.meat_content_pct,
          animal_protein_pct: parsed.animal_protein_pct,
          plant_protein_pct: parsed.plant_protein_pct,
          urine_ph_estimate: parsed.urine_ph_estimate,
          urolithiasis_risk: parsed.urolithiasis_risk,
          vet_summary: parsed.vet_summary
        })
        .eq('id', feed.id);

      if (updateError) {
        console.error(`Помилка оновлення запису ID ${feed.id}:`, updateError);
      } else {
        console.log(`Успішно оновлено корм ID ${feed.id}`);
      }
    } catch (e) {
      console.error(`Помилка обробки корму ID ${feed.id}:`, e);
    }
  }
}

analyzeFeeds();
