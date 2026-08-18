import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Помилка: Не задані ключі Supabase.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Точна сторінка корму
const testUrl = 'https://pethouse.ua/ua/shop/koshkam/suhoi-korm/naturesprotection/natures-protection-cat-neutered/';

async function scrapeSingleFeed() {
  console.log(`Завантажуємо сторінку: ${testUrl}`);
  
  try {
    const { data: html } = await axios.get(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    const $ = cheerio.load(html);

    // 1. Беремо назву товару
    const title = $('h1').text().trim();

    // 2. Витягуємо блоки, де Pethouse тримає опис, склад та аналітичний склад
    let compositionText = '';

    // Шукаємо вкладки/блоки з описом та складом
    $('.goods-description, .product-description, .tab-content, #tab-1, #tab-2, .goods-tabs').each((i, el) => {
      compositionText += $(el).text() + ' ';
    });

    // Якщо точкові блоки не знайшлися, беремо основний блок товару
    if (!compositionText || compositionText.trim().length < 50) {
      compositionText = $('.goods-card, .product-card, main').text();
    }

    // Очищаємо від зайвих пробілів
    const cleanIngredients = compositionText.replace(/\s+/g, ' ').trim();

    console.log("=== РЕЗУЛЬТАТ ПАРСИНГУ ===");
    console.log("Назва:", title);
    console.log("Розмір чистого складу:", cleanIngredients.length, "символів");
    console.log("Уривок тексту:", cleanIngredients.substring(0, 300));

    if (!title) {
      console.log("Не вдалося знайти назву.");
      return;
    }

    // 3. Записуємо чисті дані в Supabase
    const { data, error } = await supabase
      .from('feeds')
      .insert([
        { 
          title: title, 
          ingredients: cleanIngredients.substring(0, 4000) // 4000 символів - ідеально для 1 корму
        }
      ]);

    if (error) {
      console.error("Помилка запису в Supabase:", error);
    } else {
      console.log(`✅ Корм "${title}" успішно збережено з чистим складом!`);
    }

  } catch (error) {
    console.error("Помилка парсингу сайту:", error.message);
  }
}

scrapeSingleFeed();
