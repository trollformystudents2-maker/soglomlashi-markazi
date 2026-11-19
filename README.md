# «SHIFO NUR» Ayollar va Bolalar Sog'lomlashtirish Markazi CRM Tizimi

Ushbu veb-tizim sog'lomlashtirish markazi faoliyatini to'liq avtomatlashtirish, bemorlar hisobi, kunlik 20 kishilik qabul navbati, kelib-ketuvchilar vaqti, kasallik tarixi (ambulator karta) hamda kunlik/oylik moliyaviy daromadlarni nazorat qilish uchun maxsus ishlab chiqilgan.

---

## 🚀 Tizimni Ishga Tushirish

Eng oson usul — loyiha papkasidagi **`start.bat`** faylini sichqoncha bilan 2 marta bosish (Double Click).

Yoki buyruqlar satrida (Terminal):
```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Dastur avtomatik ravishda brauzeringizda ochiladi:
👉 **http://127.0.0.1:8000**

---

## 🎯 Asosiy Imkoniyatlar va Qulayliklar

### 1. 👥 Bemorlar Ro'yxati (Ayollar va Bolalar)
* Xizmat ko'rsatish maxsus **ayollar va bolalar** (o'g'il bola / qiz bola) uchun mo'ljallangan.
* Har bir bemor uchun avtomatik elektron raqamli karta ochiladi (masalan: `SH-2026-001`).
* Ism, telefon, yosh, qon guruhi, allergiyalar va boshlang'ich tashxislar saqlanadi.
* Bemorlar bo'yicha tezkor qidiruv va toifali filtrlash (`Ayollar 👩`, `Bolalar 🧒`).

### 2. 🕒 Bugungi Navbat va Kelib-Ketuvchilar Nazorati (Maksimal 20 nafar)
* **Kunlik 20 ta bemor kvotasi:** Markaz kuniga ko'pi bilan 20 ta bemor qabul qilishi belgilangan.
* Jonli monitor: `14 / 20 bemor band qilindi (70%)` va qolgan bo'sh o'rinlar hisoblagichi.
* 20 tadan oshganda tizim ogohlantiradi va ortiqcha yuklamani oldini oladi.
* **Kelish va ketish daqiqalari:** Bemor kelganda `Kutmoqda` ➔ `Chaqirish` (kelgan vaqti yoziladi) ➔ `Muolajada` ➔ `Yakunlash` (ketgan vaqti avtomatik belgilanadi).

### 3. 💉 Xizmatlar va Narxlar Katalogi
* **Fizioterapiya:** 25 000 so'm
* **Gidro vanna:** 30 000 so'm
* **Darsonval terapiya:** 35 000 so'm
* **Elektroforez:** 30 000 so'm
* **Ignaterapiya:** 60 000 so'm
* **Gelmentterapiya:** 65 000 so'm
*(Bir tashrifda bir nechta muolajani birgalikda tanlash imkoniyati va avtomatik kalkulyator mavjud)*

### 4. 💰 Kunlik va Oylik Daromad (Moliya)
* **Bugungi tushum** va **Oylik umumiy daromad** hisoboti.
* To'lov turlari bo'yicha taqsimot: **Naqd pul**, **Bank kartasi (Humo/Uzcard)**, **Click / Payme**.
* Har bir muolaja turining umumiy daromaddagi ulushi va seanslar soni.
* Oylik kunlik daromad dinamikasi grafigi (Chart.js).
* Moliyaviy hisobotni **Excel / CSV** formatida yuklab olish.

### 5. 📑 Kasallik Tarixi va Tibbiy Karta (EHR)
* Bemorning shikoyatlari, obyektiv ko'rik ko'rsatkichlari (qon bosimi, puls, harorat), qo'yilgan klinik tashxis.
* Buyurilgan muolajalar kursi va shifokor tavsiyalari.
* **Rasmiy A4 Ambulator Tibbiy Kartani** to'g'ridan-to'g'ri chop etish (Print).
* Har bir tashrif uchun **kassa chekini (kvitansiya)** chiqarish.

---

## 🛠 Texnologiyalar
* **Backend:** Python 3.13 / 3.11, FastAPI, SQLite3 (baza alohida o'rnatishni talab qilmaydi).
* **Frontend:** Tailwind CSS, FontAwesome 6, Chart.js, Vanilla JavaScript (hech qanday Node.js talab qilinmaydi).

---

## 🚂 Railway Hostingga Yuklash Qo'llanmasi

Loyiha Railway platformasida 100% ishlashi uchun barcha kerakli konfiguratsiya fayllari (`requirements.txt`, `Procfile`, `railway.json`, `nixpacks.toml`, `Dockerfile`) tayyorlandi.

### 1-qadam: O'zgarishlarni GitHub-ga yuborish (Push)
Terminalda:
```bash
git add .
git commit -m "Configure project for Railway deployment"
git push origin main
```

### 2-qadam: Railway-da loyihani ishga tushirish
1. [Railway.app](https://railway.app) ga kiring va GitHub akkauntingiz orqali ro'yxatdan o'ting / kiring.
2. **Dashboard**dan **"New Project"** tugmasini bosing.
3. **"Deploy from GitHub repo"** ni tanlang va `soglomlashi-markazi` repozitoriyasini tanlang.
4. Railway avtomatik tarzda `railway.json` va `requirements.txt` ni aniqlab, loyihani qurishni (build) boshlaydi.

### 3-qadam: Domen (Havola) yaratish
1. Railway loyihangiz paneli ochilgach, xizmat (Service) ustiga bosing.
2. **Settings** bo'limiga o'ting.
3. **Networking** qismidagi **"Generate Domain"** tugmasini bosing.
4. Sizga berilgan bepul havola (masalan: `https://soglomlashi-markazi-production.up.railway.app`) orqali saytga kiring.

### 4-qadam (Ixtiyoriy, tavsiya etiladi): Bazani saqlab qolish (Volume)
Har safar qayta deploy qilinganda bemorlar va hisobotlar o'chib ketmasligi uchun:
1. Railway servisida **Volumes** bo'limiga o'ting va **Add Volume** tugmasini bosing.
2. Mount path ga `/data` deb yozing.
3. **Variables** bo'limiga o'tib, yangi o'zgaruvchi qo'shing:
   * **Nomi:** `DB_PATH`
   * **Qiymati:** `/data/shifo_nur.db`
Shunda ma'lumotlar bazasi doimiy saqlanib qoladi.

