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
const testUrl = 'https://pethouse.ua/ua/shop/koshkam/suhoi-korm/naturesprotection/natures-protection-cat-neutered/';

async function scrapeSingleFeed() {
  console.log(`Завантажуємо сторінку: ${testUrl}`);
  
  try {
    const { data: html } = await axios.get(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(html);

    const title = $('h1').text().trim();

    // Витягуємо тільки блоки з описом, складом та аналізом, ігноруючи відгуки та шапку
    let composition = '';
    
    // Шукаємо текст у вкладках товару
    $('.goods-tab-content, .product-tabs__content, .tab-pane, .goods-description').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) {
        composition += text + '\n\n';
      }
    });

    // Якщо спеціальні блоки не витягнулися, беруться елементи з текстом "Склад" або "Аналіз"
    if (!composition) {
      $('p, div, li').each((_, el) => {
        const t = $(el).text();
        if (t.includes('Склад') || t.includes('Аналітичний склад') || t.includes('Протеїн') || t.includes('Білок')) {
          composition += t + ' ';
        }
      });
    }

    const cleanComposition = composition.replace(/\s+/g, ' ').trim();

    console.log("=== ТІЛЬКИ СКЛАД ТА АНАЛІЗ ===");
    console.log("Назва:", title);
    console.log("Знайдений склад (символів):", cleanComposition.length);
    console.log("Текст складових:", cleanComposition.substring(0, 500));

    // Оновлюємо або вставляємо запис у Supabase
    const { data, error } = await supabase
      .from('feeds')
      .insert([{ title: title, ingredients: cleanComposition || $('body').text().substring(0, 5000) }]);

    if (error) {
      console.error("Помилка Supabase:", error);
    } else {
      console.log(`✅ Успішно збережено в базу!`);
    }

  } catch (error) {
    console.error("Помилка парсингу:", error.message);
  }
}

scrapeSingleFeed();
