import os
import sys
import json
import pandas as pd
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Помилка: Змінні середовища SUPABASE_URL та SUPABASE_KEY не знайдені!")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def sync_ingredients():
    file_path = "База_продуктів_Vet_Vasylkova.xlsx"
    if not os.path.exists(file_path):
        print(f"⚠️ Файл {file_path} не знайдено. Пропускаємо.")
        return

    print(f"\n--- Синхронізація {file_path} ---")
    df = pd.read_excel(file_path, sheet_name="Продукти", header=1)
    batch = []

    for idx, row in df.iterrows():
        name_ukr = row.get("Назва (УКР)")
        if pd.isna(name_ukr):
            continue

        batch.append({
            "id": f"ing_{idx+1}",
            "category": str(row.get("Категорія", "other")).strip(),
            "name_ukr": str(name_ukr).strip(),
            "name_en": str(row.get("Назва (EN/RU)", "")).strip(),
            "me_fediaf": float(row.get("ME ккал", 120)) if not pd.isna(row.get("ME ккал")) else 120.0,
            "moisture": float(row.get("MO г\n(волога)", 70.0)) if not pd.isna(row.get("MO г\n(волога)")) else 70.0,
            "dm": float(row.get("DM г\n(суха р-на)", 30.0)) if not pd.isna(row.get("DM г\n(суха р-на)")) else 30.0,
            "cp": float(row.get("CP г\n(білок)", 0.0)) if not pd.isna(row.get("CP г\n(білок)")) else 0.0,
            "fat": float(row.get("CFa г\n(жир)", 0.0)) if not pd.isna(row.get("CFa г\n(жир)")) else 0.0,
            "fiber": float(row.get("CFi г\n(клітк)", 0.0)) if not pd.isna(row.get("CFi г\n(клітк)")) else 0.0,
            "ash": float(row.get("CAs г\n(зола)", 1.5)) if not pd.isna(row.get("CAs г\n(зола)")) else 1.5,
            "nfe": float(row.get("CH г\n(вуглев)", 0.0)) if not pd.isna(row.get("CH г\n(вуглев)")) else 0.0,
            "ca": float(row.get("Ca мг", 0.0)) if not pd.isna(row.get("Ca мг")) else 0.0,
            "p": float(row.get("P мг", 0.0)) if not pd.isna(row.get("P мг")) else 0.0,
            "mg": float(row.get("Mg мг", 0.0)) if not pd.isna(row.get("Mg мг")) else 0.0,
            "na": float(row.get("Na мг", 0.0)) if not pd.isna(row.get("Na мг")) else 0.0,
            "k": float(row.get("K мг", 0.0)) if not pd.isna(row.get("K мг")) else 0.0,
            "fe": float(row.get("Fe мг", 0.0)) if not pd.isna(row.get("Fe мг")) else 0.0,
            "cu": float(row.get("Cu мг", 0.0)) if not pd.isna(row.get("Cu мг")) else 0.0,
            "zn": float(row.get("Zn мг", 0.0)) if not pd.isna(row.get("Zn мг")) else 0.0
        })

    if batch:
        res = supabase.table("ingredients").upsert(batch).execute()
        print(f"✓ Успішно оновлено {len(batch)} натуральних інгредієнтів.")

def sync_feeds():
    file_path = "Vet_Feed_Database.xlsx"
    if not os.path.exists(file_path):
        print(f"⚠️ Файл {file_path} не знайдено. Пропускаємо.")
        return

    print(f"\n--- Синхронізація {file_path} ---")
    df = pd.read_excel(file_path, sheet_name="База кормів", header=1)
    batch = []

    for idx, row in df.iterrows():
        if pd.isna(row.get("Назва корму")):
            continue

        feed_title = f"{str(row.get('Бренд', '')).strip()} {str(row.get('Назва корму', '')).strip()}"
        ingredients_str = str(row.get("Повний склад", "")).strip()
        if ingredients_str == "nan":
            ingredients_str = ""

        moisture = float(row.get("Вологість %", 8.0)) if not pd.isna(row.get("Вологість %")) else 8.0
        dm_factor = max(1.0, 100.0 - moisture) / 100.0

        cp = float(row.get("Білок % (as fed)", 0.0)) if not pd.isna(row.get("Білок % (as fed)")) else 0.0
        fat = float(row.get("Жир % (as fed)", 0.0)) if not pd.isna(row.get("Жир % (as fed)")) else 0.0
        fiber = float(row.get("Клітковина % (as fed)", 0.0)) if not pd.isna(row.get("Клітковина % (as fed)")) else 0.0
        ash = float(row.get("Зола % (as fed)", 0.0)) if not pd.isna(row.get("Зола % (as fed)")) else 0.0
        carbs = max(0.0, 100.0 - (moisture + cp + fat + fiber + ash))

        batch.append({
            "title": feed_title,
            "ingredients": ingredients_str if ingredients_str else feed_title,
            "composition": ingredients_str,
            "moisture_pct": moisture,
            "protein_pct": cp,
            "fat_pct": fat,
            "fiber_pct": fiber,
            "ash_pct": ash,
            "carbs_pct": round(carbs, 2),
            "protein_dm_pct": round(cp / dm_factor, 2) if dm_factor > 0 else 0,
            "fat_dm_pct": round(fat / dm_factor, 2) if dm_factor > 0 else 0,
            "fiber_dm_pct": round(fiber / dm_factor, 2) if dm_factor > 0 else 0,
            "ash_dm_pct": round(ash / dm_factor, 2) if dm_factor > 0 else 0,
            "carbs_dm_pct": round(carbs / dm_factor, 2) if dm_factor > 0 else 0,
            "primary_protein_sources": str(row.get("Джерело білка 1", "")).strip(),
            "secondary_protein_sources": str(row.get("Джерело білка 2", "")).strip(),
            "source_url": str(row.get("URL джерела", "")).strip() if not pd.isna(row.get("URL джерела")) else None,
            "is_published": True
        })

    if batch:
        res = supabase.table("feeds").upsert(batch).execute()
        print(f"✓ Успішно оновлено {len(batch)} комерційних раціонів.")

if __name__ == "__main__":
    sync_ingredients()
    sync_feeds()
    print("\n🎉 Автоматичну синхронізацію завершено успішно!")
