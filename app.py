import streamlit as st
from supabase import create_client
import pandas as pd

# Налаштування сторінки
st.set_page_config(page_title="VetVasylkova Корми", layout="wide")

# Підключення до Supabase
supabase_url = st.secrets["SUPABASE_URL"]
supabase_key = st.secrets["SUPABASE_SERVICE_KEY"]
supabase = create_client(supabase_url, supabase_key)

st.title("🐾 VetVasylkova: Аналіз та порівняння кормів")

# Отримання даних
@st.cache_data(ttl=600)
def get_data():
    response = supabase.table("feeds").select("*").execute()
    return pd.DataFrame(response.data)

df = get_data()

# Бічна панель: Пошук та фільтри
st.sidebar.header("Фільтри")
search = st.sidebar.text_input("Пошук за назвою:")

filtered_df = df
if search:
    filtered_df = filtered_df[filtered_df['title'].str.contains(search, case=False, na=False)]

# Визначаємо доступні колонки
available_columns = ['title']
for col in ['rating', 'flaws', 'vet_summary']:
    if col in filtered_df.columns:
        available_columns.append(col)

st.subheader("Список кормів з аналізом")

# Виводимо таблицю
st.dataframe(filtered_df[available_columns], use_container_width=True)

# Порівняння
if not df.empty and 'title' in df.columns:
    st.subheader("Порівняння двох кормів")
    col1, col2 = st.columns(2)
    feed_names = df['title'].tolist()

    with col1:
        f1 = st.selectbox("Корм 1:", feed_names, key="f1")
    with col2:
        f2 = st.selectbox("Корм 2:", feed_names, key="f2")

    if st.button("Порівняти"):
        data1 = df[df['title'] == f1].iloc[0]
        data2 = df[df['title'] == f2].iloc[0]
        
        comp_df = pd.DataFrame([data1, data2]).T
        comp_df.columns = [f1, f2]
        st.table(comp_df)
