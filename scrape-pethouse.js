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

// Тестове посилання на корм
const testUrl = 'https://pethouse.ua/ua/shop/koshkam/suhoi-korm/naturesprotection/natures-protection-cat-neutered/';

async function scrapeSingleFeed() {
  console.log(`Завантажуємо сторінку: ${testUrl}`);
  
  try {
    const { data: html } = await axios.get(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(html);

    // 1. Шукаємо назву корму
    const title = $('h1').text().trim();
    
    // 2. Шукаємо основний блок опису корму та складу (прибираємо зайві меню)
    let productDetails = $('.product-description, .product-tabs, .tab-content, #tab-description').text();
    
    // Якщо спеціальні блоки не знайдено, беремо весь контент сторінки
    if (!productDetails || productDetails.trim().length < 100) {
      productDetails = $('body').text();
    }

    // Очищаємо від зайвих пробілів та переносів
    const cleanedText = productDetails.replace(/\s+/g, ' ').trim();

    console.log("=== ЗНАЙДЕНІ ДАНІ ===");
    console.log("Назва:", title);
    console.log("Довжина тексту для аналізу:", cleanedText.length, "символів");
    
    if (!title) {
      console.log("Не вдалося знайти назву.");
      return;
    }

    // 3. Записуємо в Supabase
    // Беремо до 8000 символів, щоб точно захопити і склад, і аналітичні показники
    const { data, error } = await supabase
      .from('feeds')
      .insert([
        { 
          title: title, 
          ingredients: cleanedText.substring(0, 8000)
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
