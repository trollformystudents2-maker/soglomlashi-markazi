"""
Database module for 'Shifo Nur' Ayollar va Bolalar Sog'lomlashtirish Markazi.
Uses SQLite with sqlite3 standard library for reliability and portability.
"""

import sqlite3
import os
from datetime import datetime, date

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "shifo_nur.db"))

def get_connection():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Services table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'Fizioterapiya',
        price REAL NOT NULL,
        duration_min INTEGER DEFAULT 30,
        description TEXT,
        is_active INTEGER DEFAULT 1
    );
    """)

    # 2. Patients table (Women & Children)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_number TEXT UNIQUE,
        full_name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'ayol' or 'bola'
        gender TEXT,            -- 'ayol', 'ogil_bola', 'qiz_bola'
        birth_date TEXT,
        age INTEGER,
        phone TEXT NOT NULL,
        address TEXT,
        blood_group TEXT,
        allergies TEXT,
        initial_diagnosis TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # 3. Appointments / Daily Queue table (Max 20 patients per day)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        appointment_date TEXT NOT NULL, -- 'YYYY-MM-DD'
        queue_number INTEGER NOT NULL,  -- 1 to 20
        scheduled_time TEXT,            -- e.g. '09:00'
        status TEXT DEFAULT 'kutmoqda', -- 'kutmoqda', 'muolajada', 'yakunlandi', 'bekor_qilindi'
        arrival_time TEXT,              -- 'HH:MM'
        departure_time TEXT,            -- 'HH:MM'
        total_amount REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'kutilmoqda', -- 'tolangan', 'qisman', 'kutilmoqda'
        payment_method TEXT DEFAULT 'naqd',      -- 'naqd', 'karta', 'click_payme'
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    """)

    # 4. Appointment Services (Many-to-many services per visit)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS appointment_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id)
    );
    """)

    # 5. Medical Records / Kasallik tarixi
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS medical_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        appointment_id INTEGER,
        record_date TEXT NOT NULL,
        complaints TEXT,
        objective_findings TEXT,
        diagnosis TEXT NOT NULL,
        prescribed_procedures TEXT,
        session_notes TEXT,
        doctor_name TEXT DEFAULT 'Dr. Nilufar Karimova',
        recommendations TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
    );
    """)

    # 6. Payments History
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER,
        patient_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL, -- 'naqd', 'karta', 'click_payme'
        paid_at TEXT NOT NULL,
        receipt_no TEXT,
        notes TEXT,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    """)

    conn.commit()

    # Seed default services as defined by user:
    # fizeoterapiya 25000, gidro vanna 30000, darsanval terapiya 35000, elektro forez 30000, ignaterapeya 60000, gelmentterapiya 65000
    cursor.execute("SELECT COUNT(*) FROM services")
    count = cursor.fetchone()[0]
    if count == 0:
        default_services = [
            ("Fizioterapiya", "Fizioterapiya", 25000, 30, "Bo'g'im, mushak va asab tizimini tabiiy jismoniy usullar bilan davolash va tiklash"),
            ("Gidro vanna", "Suv muolajasi", 30000, 25, "Shifobaxsh dorivor va tuzli suv vannasi, qon aylanishini yaxshilaydi va asabni tinchlantiradi"),
            ("Darsonval terapiya", "Aparatli terapiya", 35000, 20, "Yuqori chastotali impulsli tok bilan bosh terisi, soch va teri kasalliklarini davolash"),
            ("Elektroforez", "Aparatli terapiya", 30000, 25, "Doimiy tok yordamida dorilarni to'qimalarga chuqur kiritish muolajasi"),
            ("Ignaterapiya", "Xitoy tabobati", 60000, 40, "Akupunktura biologik faol nuqtalarga ta'sir orqali butun tana a'zolarini sog'lomlashtirish"),
            ("Gelmentterapiya", "Parazitologiya", 65000, 45, "Ayollar va bolalardagi parazit va gijjalarni tozalash, oshqozon-ichakni tiklash muolajasi")
        ]
        cursor.executemany("""
            INSERT INTO services (name, category, price, duration_min, description, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        """, default_services)
        conn.commit()

    cursor.execute("SELECT COUNT(*) FROM patients")
    patients_count = cursor.fetchone()[0]
    conn.close()

    if count == 0 and patients_count == 0:
        seed_sample_data()

def seed_sample_data():
    """Populates realistic test data for patients, today's queue, past visits, and medical records."""
    conn = get_connection()
    cursor = conn.cursor()

    # Clear existing dynamic data (leave services intact)
    cursor.execute("DELETE FROM appointment_services")
    cursor.execute("DELETE FROM medical_records")
    cursor.execute("DELETE FROM payments")
    cursor.execute("DELETE FROM appointments")
    cursor.execute("DELETE FROM patients")

    today_str = date.today().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Sample Patients (Ayollar va Bolalar)
    sample_patients = [
        ("SH-2026-001", "Dilnoza Rahimova", "ayol", "ayol", "1991-04-12", 35, "+998 90 123 45 67", "Toshkent sh., Chilonzor 7-mavze", "A(II) Rh+", "Yo'q", "Bo'yin osteoxondrozi, bel og'rig'i", "Doimiy bemor"),
        ("SH-2026-002", "Madina Karimova", "ayol", "ayol", "1988-08-23", 38, "+998 93 345 67 89", "Toshkent sh., Yunusobod 12-kvartal", "B(III) Rh+", "Penitsillinga allergiya", "Bosh og'rig'i, surunkali charchoq", "Darsonval tavsiya qilingan"),
        ("SH-2026-003", "Jasurbek Toirov", "bola", "ogil_bola", "2018-06-15", 8, "+998 97 765 43 21", "Toshkent sh., Shayxontohur tumani", "O(I) Rh+", "Yo'q", "Oshqozon-ichak bezovtaligi, gelmintoz", "Gelmentterapiya kursi"),
        ("SH-2026-004", "Zilola Usmonova", "ayol", "ayol", "1995-11-03", 31, "+998 99 876 54 32", "Toshkent sh., Sergeli 4", "AB(IV) Rh+", "Yo'q", "Tug'ruqdan keyingi bo'g'im og'riqlari", "Gidrovanna va Fizioterapiya"),
        ("SH-2026-005", "Imron Aliyev", "bola", "ogil_bola", "2020-02-10", 6, "+998 91 234 56 78", "Toshkent sh., Mirzo Ulug'bek", "A(II) Rh+", "Sitrus mevalarga", "Ishtaha pastligi, immunitet zaifligi", "Bolalar tekshiruvi"),
        ("SH-2026-006", "Shahnoza Mirzayeva", "ayol", "ayol", "1984-03-19", 42, "+998 94 654 32 10", "Toshkent sh., Uchtepa tumani", "B(III) Rh-", "Yo'q", "Radikulit, bel churrasi (grija)", "Ignaterapiya kursi"),
        ("SH-2026-007", "Fotima Ergasheva", "bola", "qiz_bola", "2019-09-08", 7, "+998 90 987 65 43", "Toshkent sh., Yakkasaroy", "O(I) Rh+", "Yo'q", "Skolioz boshlang'ich bosqichi", "Fizioterapiya va elektroforez"),
        ("SH-2026-008", "Gulsanam Qosimova", "ayol", "ayol", "1998-12-25", 28, "+998 93 111 22 33", "Toshkent sh., Mirobod tumani", "A(II) Rh+", "Yo'q", "Soch to'kilishi, asabiylik", "Darsonval terapiya"),
        ("SH-2026-009", "Bilolbek Shokirov", "bola", "ogil_bola", "2021-05-14", 5, "+998 97 222 33 44", "Toshkent sh., Chilonzor 19", "O(I) Rh+", "Yo'q", "Allergik diatez, gijja belgilari", "Gelmentterapiya"),
        ("SH-2026-010", "Nargiza Mahmudova", "ayol", "ayol", "1993-07-30", 33, "+998 99 333 44 55", "Toshkent sh., Olmazor tumani", "B(III) Rh+", "Yo'q", "Mialgiya, qon aylanishi buzilishi", "Gidrovanna va ignaterapiya")
    ]

    patient_ids = []
    for p in sample_patients:
        cursor.execute("""
            INSERT INTO patients (card_number, full_name, category, gender, birth_date, age, phone, address, blood_group, allergies, initial_diagnosis, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (*p, now_str))
        patient_ids.append(cursor.lastrowid)

    # Services lookup
    cursor.execute("SELECT id, name, price FROM services")
    services = {row["name"]: (row["id"], row["price"]) for row in cursor.fetchall()}

    # Create Today's Appointments (e.g., 9 patients out of max 20 capacity)
    # Different statuses to show real-time flow:
    today_queue_data = [
        # (patient_idx, queue_num, time, status, arrival, departure, services_list, payment_status, payment_method)
        (0, 1, "08:30", "yakunlandi", "08:25", "09:15", ["Fizioterapiya", "Elektroforez"], "tolangan", "karta"),
        (1, 2, "09:00", "yakunlandi", "08:55", "09:35", ["Darsonval terapiya"], "tolangan", "click_payme"),
        (2, 3, "09:30", "yakunlandi", "09:20", "10:15", ["Gelmentterapiya"], "tolangan", "naqd"),
        (3, 4, "10:00", "muolajada", "09:50", None, ["Gidro vanna", "Fizioterapiya"], "tolangan", "naqd"),
        (4, 5, "10:30", "muolajada", "10:20", None, ["Gelmentterapiya"], "kutilmoqda", "naqd"),
        (5, 6, "11:00", "kutmoqda", "10:45", None, ["Ignaterapiya"], "kutilmoqda", "karta"),
        (6, 7, "11:30", "kutmoqda", "11:10", None, ["Elektroforez"], "kutilmoqda", "click_payme"),
        (7, 8, "12:00", "kutmoqda", None, None, ["Darsonval terapiya"], "kutilmoqda", "naqd"),
        (8, 9, "13:30", "kutmoqda", None, None, ["Gelmentterapiya"], "kutilmoqda", "naqd"),
    ]

    for p_idx, q_num, s_time, status, arr, dep, s_names, pay_status, pay_method in today_queue_data:
        p_id = patient_ids[p_idx]
        total = sum(services[name][1] for name in s_names if name in services)

        cursor.execute("""
            INSERT INTO appointments (patient_id, appointment_date, queue_number, scheduled_time, status, arrival_time, departure_time, total_amount, payment_status, payment_method, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (p_id, today_str, q_num, s_time, status, arr, dep, total, pay_status, pay_method, "Bugungi reja bo'yicha qabul", now_str))
        app_id = cursor.lastrowid

        for s_name in s_names:
            if s_name in services:
                s_id, s_price = services[s_name]
                cursor.execute("""
                    INSERT INTO appointment_services (appointment_id, service_id, service_name, price)
                    VALUES (?, ?, ?, ?)
                """, (app_id, s_id, s_name, s_price))

        if pay_status == "tolangan":
            cursor.execute("""
                INSERT INTO payments (appointment_id, patient_id, amount, payment_method, paid_at, receipt_no, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (app_id, p_id, total, pay_method, now_str, f"CHK-{today_str.replace('-','')}-{app_id:04d}", "Qabul qilingan to'lov"))

        # Medical record for completed visits
        if status == "yakunlandi":
            cursor.execute("""
                INSERT INTO medical_records (patient_id, appointment_id, record_date, complaints, objective_findings, diagnosis, prescribed_procedures, session_notes, doctor_name, recommendations, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                p_id,
                app_id,
                today_str,
                "Bel va bo'yin sohasida og'riq, charchoq alomatlari",
                "Qon bosimi: 120/80 mm sim.ust., puls: 74 zarba/daq, harorat: 36.6 °C",
                sample_patients[p_idx][10],
                ", ".join(s_names),
                "Muolaja muvaffaqiyatli o'tkazildi. Bemor o'zini ancha yengil his qilmoqda. Salbiy ta'sirlar kuzatilmadi.",
                "Dr. Nilufar Karimova",
                "Davomiy suv iste'mol qilish, og'ir yuk ko'tarmaslik, ertangi kungi muolajaga vaqtida kelish.",
                now_str
            ))

    # Past visits this month to make charts and monthly revenue look rich and realistic
    # Let's add 25 past appointments across the last 15 days
    from datetime import timedelta
    past_days = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]
    for d in past_days:
        past_date = (date.today() - timedelta(days=d)).strftime("%Y-%m-%d")
        for q in range(1, 4):  # 3 patients per past day
            p_id = patient_ids[(d + q) % len(patient_ids)]
            s_name = list(services.keys())[(d * 2 + q) % len(services)]
            s_id, s_price = services[s_name]

            cursor.execute("""
                INSERT INTO appointments (patient_id, appointment_date, queue_number, scheduled_time, status, arrival_time, departure_time, total_amount, payment_status, payment_method, notes, created_at)
                VALUES (?, ?, ?, ?, 'yakunlandi', '09:00', '10:00', ?, 'tolangan', ?, ?, ?)
            """, (p_id, past_date, q, f"10:{q*15:02d}", s_price, 'naqd' if q % 2 == 0 else 'karta', "Avvalgi tashrif", past_date + " 10:00:00"))
            p_app_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO appointment_services (appointment_id, service_id, service_name, price)
                VALUES (?, ?, ?, ?)
            """, (p_app_id, s_id, s_name, s_price))

            cursor.execute("""
                INSERT INTO payments (appointment_id, patient_id, amount, payment_method, paid_at, receipt_no, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (p_app_id, p_id, s_price, 'naqd' if q % 2 == 0 else 'karta', past_date + " 10:30:00", f"CHK-{past_date.replace('-','')}-{p_app_id:04d}", "Tarixiy to'lov"))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_sample_data()
    print("Database initialized and sample data seeded successfully!")
