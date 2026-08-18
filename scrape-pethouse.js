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

// Сторінка категорії сухих кормів для котів на Pethouse
const categoryUrl = 'https://pethouse.ua/ua/shop/koshkam/suhoi-korm/';

async function scrapeNewFeedsFromCategory() {
  console.log(`Завантажуємо сторінку категорії: ${categoryUrl}`);
  
  try {
    const { data: html } = await axios.get(categoryUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);
    
    // Збираємо всі посилання на товари з картки товару в каталозі
    let feedUrls = [];
    
    // Шукаємо посилання, які ведуть на товари в категорії
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/ua/shop/koshkam/suhoi-korm/') && href.length > 35) {
        // Формуємо повне посилання, якщо воно відносне
        const fullUrl = href.startsWith('http') ? href : `https://pethouse.ua${href}`;
        if (!feedUrls.includes(fullUrl)) {
          feedUrls.push(fullUrl);
        }
      }
    });

    console.log(`Знайдено унікальних посилань на корми в каталозі: ${feedUrls.length}`);

    if (feedUrls.length === 0) {
      console.log("Не вдалося знайти посилання на товари на сторінці категорії.");
      return;
    }

    // Отримуємо список кормів, які вже є в базі Supabase
    const { data: existingFeeds, error: dbError } = await supabase
      .from('feeds')
      .select('title');

    if (dbError) {
      console.error("Помилка читання бази Supabase:", dbError);
      return;
    }

    let processedCount = 0;
    const limitToProcess = 3; // Обробляємо по 3 нові корми за раз

    for (const url of feedUrls) {
      if (processedCount >= limitToProcess) break;

      try {
        console.log(`\nПеревіряємо посилання: ${url}`);
        
        const { data: pageHtml } = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const page$ = cheerio.load(pageHtml);
        const title = page$('h1').text().trim();

        if (!title) {
          console.log("Не знайдено назву корму, пропускаємо.");
          continue;
        }

        // Перевіряємо, чи є вже такий корм у базі
        const alreadyExists = existingFeeds && existingFeeds.some(f => f.title === title);
        if (alreadyExists) {
          console.log(`Корм "${title}" вже є в базі. Пропускаємо.`);
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

        // Зберігаємо новий корм у Supabase
        const { error: insertError } = await supabase
          .from('feeds')
          .insert([{ title: title, ingredients: cleanComposition.substring(0, 4000) }]);

        if (insertError) {
          console.error("Помилка запису в Supabase:", insertError);
        } else {
          console.log(`✅ Новий корм "${title}" успішно додано до бази з категорії!`);
          processedCount++;
        }

      } catch (itemErr) {
        console.error(`Помилка обробки сторінки ${url}:`, itemErr.message);
      }
    }

    console.log(`\nСкрапінг завершено. Додано нових кормів: ${processedCount}`);

  } catch (error) {
    console.error("Помилка завантаження категорії:", error.message);
  }
}

scrapeNewFeedsFromCategory();
