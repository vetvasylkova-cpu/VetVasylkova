import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const geminiKey = process.env.GEMINI_API_KEY;

console.log("--- ПЕРЕВІРКА КЛЮЧІВ ---");
console.log("SUPABASE_URL:", supabaseUrl ? "ОК (підключено)" : "❌ ВІДСУТНІЙ");
console.log("SUPABASE_SERVICE_KEY:", supabaseKey ? "ОК (підключено)" : "❌ ВІДСУТНІЙ");
console.log("GEMINI_API_KEY:", geminiKey ? "ОК (підключено)" : "❌ ВІДСУТНІЙ");
console.log("------------------------");

if (!supabaseUrl || !supabaseKey || !geminiKey) {
    console.error("Зупинка: один або кілька ключів не передалися з GitHub.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

// Використовуємо актуальну модель Gemini 2.5 Flash
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function analyzeFeeds() {
    console.log("Шукаємо корми без аналізу в базі даних...");
    
    const { data: feeds, error } = await supabase
        .from('feeds')
        .select('*')
        .is('rating', null);

    if (error) {
        console.error("Помилка завантаження кормів з бази:", error.message);
        return;
    }

    if (!feeds || feeds.length === 0) {
        console.log("Немає нових кормів для аналізу. Все оновлено!");
        return;
    }

    console.log(`Знайдено кормів для аналізу: ${feeds.length}`);

    for (const feed of feeds) {
        console.log(`Аналізую корм: ${feed.title}`);

        const prompt = `
Проаналізуй склад цього корму для тварин: "${feed.title}"
Склад: ${feed.composition || 'Склад не вказано'}

Виконай наступне:
1. Постав рейтинг від 1 до 10 на основі біологічної відповідності (високий вміст м'яса та мінімум рослинних наповнювачів = 8-10, зернові на перших місцях або незрозумілі субпродукти = 1-4).
2. Знайди приховані недоліки (наприклад: "кукурудзяний глютен", "пшениця", "нечітке джерело жиру", "гідролізований білок невідомого походження" тощо).
3. Надай короткий ветеринарний висновок українською мовою.

Поверни відповідь СУВОРО у форматі JSON без жодних додаткових символів чи маркування формату (без \`\`\`json):
{
  "rating": 7,
  "flaws": "Вміст кукурудзи, нечітке джерело жиру",
  "vet_summary": "Середній корм, містить рослинні білки"
}
`;

        try {
            const result = await model.generateContent(prompt);
            let responseText = result.response.text().trim();
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            const analysis = JSON.parse(responseText);

            const { error: updateError } = await supabase
                .from('feeds')
                .update({
                    rating: analysis.rating,
                    flaws: analysis.flaws,
                    vet_summary: analysis.vet_summary
                })
                .eq('id', feed.id);

            if (updateError) {
                console.error(`Помилка оновлення бази для ${feed.title}:`, updateError.message);
            } else {
                console.log(`Успішно оновлено: ${feed.title} (Рейтинг: ${analysis.rating}/10)`);
            }

        } catch (err) {
            console.error(`Помилка під час обробки корму ${feed.title}:`, err.message);
        }
    }
}

analyzeFeeds();
