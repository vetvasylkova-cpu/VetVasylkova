import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Підключення до бази (використовуємо ті ж самі секрети)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Помилка: Не задані ключі Supabase.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Тестове посилання на корм з Pethouse (можете замінити на будь-яке інше з їхнього сайту)
const testUrl = 'https://pethouse.ua/ua/shop/koshkam/suhoi-korm/naturesprotection/natures-protection-cat-neutered/';

async function scrapeSingleFeed() {
  console.log(`Завантажуємо сторінку: ${testUrl}`);
  
  try {
    // 1. Завантажуємо HTML сторінки
    const { data: html } = await axios.get(testUrl);
    const $ = cheerio.load(html);

    // 2. Шукаємо назву корму (зазвичай це тег <h1>)
    const title = $('h1').text().trim();
    
    // 3. Шукаємо блок з описом/складом. 
    // Увага: класи на сайтах змінюються, зараз беремо весь текст сторінки для тестів
    // Нам потрібно буде уточнити цей селектор після першого запуску
    const fullText = $('body').text().replace(/\s+/g, ' ').trim();

    console.log("=== ЗНАЙДЕНІ ДАНІ ===");
    console.log("Назва:", title);
    console.log("Довжина тексту сторінки:", fullText.length, "символів");
    
    if (!title) {
      console.log("Не вдалося знайти назву. Можливо, сайт блокує парсинг.");
      return;
    }

    // 4. Записуємо "сирі" дані в Supabase
    // Ми записуємо назву та тимчасово весь текст в поле ingredients, щоб Gemini сам його розібрав
    const { data, error } = await supabase
      .from('feeds')
      .insert([
        { 
          title: title, 
          ingredients: fullText.substring(0, 3000) // Беремо перші 3000 символів, щоб не перевантажувати базу
        }
      ]);

    if (error) {
      console.error("Помилка запису в Supabase:", error);
    } else {
      console.log(`✅ Корм "${title}" успішно додано в базу для подальшого аналізу!`);
    }

  } catch (error) {
    console.error("Помилка парсингу сайту:", error.message);
  }
}

scrapeSingleFeed();
