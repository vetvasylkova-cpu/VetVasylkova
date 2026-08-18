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

// Головна функція для пошуку нових кормів через Sitemap
async function scrapeNewFeedsFromSitemap() {
  console.log("Завантажуємо карту сайту Pethouse...");
  
  try {
    // 1. Завантажуємо головний sitemap або сторінку магазину з товарами
    // Зазвичай сайти мають головний sitemap.xml, або окремий для товарів
    const sitemapUrl = 'https://pethouse.ua/sitemap.xml'; 
    
    const { data: sitemapXml } = await axios.get(sitemapUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(sitemapXml, { xmlMode: true });
    
    // Збираємо всі URL, які містять шлях до сухого корму для котів
    let feedUrls = [];
    $('loc').each((_, el) => {
      const url = $(el).text().trim();
      // Фільтруємо тільки котячі сухі корми
      if (url.includes('/shop/koshkam/suhoi-korm/')) {
        feedUrls.push(url);
      }
    });

    console.log(`Знайдено посилань на сухі корми в Sitemap: ${feedUrls.length}`);

    if (feedUrls.length === 0) {
      console.log("Не вдалося знайти посилання у sitemap.xml. Перевірте структуру сайту.");
      return;
    }

    // 2. Отримуємо список посилань, які вже є в нашій базі Supabase, щоб не завантажувати їх повторно
    const { data: existingFeeds, error: dbError } = await supabase
      .from('feeds')
      .select('title'); // або якщо ви збережете шлях/URL, але поки порівнюватимемо за назвою/наявністю

    if (dbError) {
      console.error("Помилка читання бази Supabase:", dbError);
      return;
    }

    console.log(`Вже збережено в базі кормів: ${existingFeeds ? existingFeeds.length : 0}`);

    // Візьмемо для прикладу перші 3 нових посилання за один запуск (щоб не перевантажувати ліміти GitHub Actions / Gemini)
    let processedCount = 0;
    const limitToProcess = 3; 

    for (const url of feedUrls) {
      if (processedCount >= limitToProcess) break;

      try {
        console.log(`\nОбробляємо посилання: ${url}`);
        
        // Завантажуємо сторінку конкретного корму
        const { data: html } = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const page$ = cheerio.load(html);
        const title = page$('h1').text().trim();

        if (!title) {
          console.log("Не знайдено назву корму, пропускаємо.");
          continue;
        }

        // Перевіряємо, чи такий корм уже є в базі за назвою
        const alreadyExists = existingFeeds.some(f => f.title === title);
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

        // 3. Зберігаємо новий корм у Supabase
        const { error: insertError } = await supabase
          .from('feeds')
          .insert([{ title: title, ingredients: cleanComposition.substring(0, 4000) }]);

        if (insertError) {
          console.error("Помилка запису в Supabase:", insertError);
        } else {
          console.log(`✅ Новий корм "${title}" успішно додано до бази з Sitemap!`);
          processedCount++;
        }

      } catch (itemErr) {
        console.error(`Помилка обробки сторінки ${url}:`, itemErr.message);
      }
    }

    console.log(`\nСкрапінг завершено. Додано нових кормів: ${processedCount}`);

  } catch (error) {
    console.error("Помилка завантаження Sitemap:", error.message);
  }
}

scrapeNewFeedsFromSitemap();
