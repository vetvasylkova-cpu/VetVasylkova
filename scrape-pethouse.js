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

// Список категорій, які потрібно сканувати (коти і собаки, сухий та вологий корм)
const categories = [
  'https://pethouse.ua/ua/shop/koshkam/suhoi-korm/',
  'https://pethouse.ua/ua/shop/koshkam/vlazhnyi-korm/',
  'https://pethouse.ua/ua/shop/sobakam/suhoi-korm/',
  'https://pethouse.ua/ua/shop/sobakam/vlazhnyi-korm/'
];

async function scrapeMultipleCategories() {
  // Отримуємо список кормів, які вже є в базі Supabase
  const { data: existingFeeds, error: dbError } = await supabase
    .from('feeds')
    .select('title');

  if (dbError) {
    console.error("Помилка читання бази Supabase:", dbError);
    return;
  }

  let totalProcessed = 0;
  const limitPerRun = 5; // Загалом беремо до 5 нових кормів за один запуск воркфлоу

  for (const categoryUrl of categories) {
    if (totalProcessed >= limitPerRun) break;

    console.log(`\nЗавантажуємо категорію: ${categoryUrl}`);
    
    try {
      const { data: html } = await axios.get(categoryUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      const $ = cheerio.load(html);
      let feedUrls = [];
      
      // Збираємо посилання на товари з урахуванням різних розділів
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && (href.includes('/shop/koshkam/') || href.includes('/shop/sobakam/')) && 
           (href.includes('/suhoi-korm/') || href.includes('/vlazhnyi-korm/')) && href.length > 35) {
          const fullUrl = href.startsWith('http') ? href : `https://pethouse.ua${href}`;
          if (!feedUrls.includes(fullUrl)) {
            feedUrls.push(fullUrl);
          }
        }
      });

      console.log(`Знайдено посилань у цій категорії: ${feedUrls.length}`);

      for (const url of feedUrls) {
        if (totalProcessed >= limitPerRun) break;

        try {
          console.log(`Перевіряємо: ${url}`);
          
          const { data: pageHtml } = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          const page$ = cheerio.load(pageHtml);
          const title = page$('h1').text().trim();

          if (!title) continue;

          // Перевірка на дублікати в базі
          const alreadyExists = existingFeeds && existingFeeds.some(f => f.title === title);
          if (alreadyExists) {
            console.log(`Корм "${title}" вже є в базі.`);
            continue;
          }

          // Витягуємо склад
          let composition = '';
          page$('.goods-tab-content, .product-tabs__content, .tab-pane, .goods-description').each((_, el) => {
            const text = page$(el).text().trim();
            if (text.length > 20) composition += text + '\n\n';
          });

          if (!composition) {
            composition = page$('body').text().substring(0, 5000);
          }

          const cleanComposition = composition.replace(/\s+/g, ' ').trim();

          // Зберігаємо в Supabase
          const { error: insertError } = await supabase
            .from('feeds')
            .insert([{ title: title, ingredients: cleanComposition.substring(0, 4000) }]);

          if (insertError) {
            console.error("Помилка запису в Supabase:", insertError);
          } else {
            console.log(`✅ Додано новий корм: "${title}"`);
            // Додаємо до локального списку, щоб уникнути дублікатів у межах одного запуску
            existingFeeds.push({ title: title });
            totalProcessed++;
          }

        } catch (itemErr) {
          console.error(`Помилка обробки товару:`, itemErr.message);
        }
      }

    } catch (catErr) {
      console.error(`Помилка завантаження категорії ${categoryUrl}:`, catErr.message);
    }
  }

  console.log(`\nЗагалом за цей запуск додано нових кормів: ${totalProcessed}`);
}

scrapeMultipleCategories();
