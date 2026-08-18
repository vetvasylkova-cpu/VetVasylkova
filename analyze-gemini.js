import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Ініціалізація клієнтів
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function analyzeFeeds() {
    // Отримуємо корми, у яких ще немає рейтингу або аналізу
    const { data: feeds, error } = await supabase
        .from('feeds')
        .select('*')
        .is('rating', null);

    if (error) {
        console.error("Помилка завантаження кормів:", error.message);
        return;
    }

    if (!feeds || feeds.length === 0) {
        console.log("Немає нових кормів для аналізу.");
        return;
    }

    for (const feed of feeds) {
        console.log(`Аналізую корм: ${feed.title}`);

        const prompt = `
Проаналізуй склад цього корму для тварин: "${feed.title}"
Склад: ${feed.composition || 'Склад не вказано'}

Виконай наступне:
1. Постав рейтинг від 1 до 10 на основі біологічної відповідності (високий вміст м'яса та мінімум рослинних наповнювачів = 8-10, зернові на перших місцях або незрозумілі субпродукти = 1-4).
2. Знайди приховані недоліки (наприклад: "кукурудзяний глютен", "пшениця", "нечітке джерело жиру", "гідролізований білок невідомого походження" тощо).
3. Надай короткий ветеринарний висновок.

Поверни відповідь СУВОРО у форматі JSON без жодних додаткових символів чи маркування формату (без \`\`\`json):
{
  "rating": 7,
  "flaws": "Вміст кукурудзи, нечітке джерело жиру",
  "vet_summary": "Середній корм, містить рослинні білки"
}
`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: prompt,
            });

            let responseText = response.text.trim();
            // Очищуємо від можливих markdown тегів
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            const analysis = JSON.parse(responseText);

            // Оновлюємо дані в Supabase
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
