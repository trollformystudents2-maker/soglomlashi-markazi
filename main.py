import os
import sqlite3
from datetime import datetime, date
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

import database

# Initialize DB on start
database.init_db()

app = FastAPI(title="Shifo Nur - Sog'lomlashtirish Markazi CRM", version="1.0.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# --- Pydantic Request Models ---

class PatientCreate(BaseModel):
    full_name: str
    category: str  # 'ayol' or 'bola'
    gender: Optional[str] = "ayol"
    birth_date: Optional[str] = None
    age: Optional[int] = 0
    phone: str
    address: Optional[str] = ""
    blood_group: Optional[str] = ""
    allergies: Optional[str] = ""
    initial_diagnosis: Optional[str] = ""
    notes: Optional[str] = ""

class AppointmentCreate(BaseModel):
    patient_id: int
    appointment_date: Optional[str] = None # Defaults to today YYYY-MM-DD
    scheduled_time: Optional[str] = None
    service_ids: List[int]
    notes: Optional[str] = ""
    force_over_limit: Optional[bool] = False # in case user approves exceeding 20

class StatusUpdate(BaseModel):
    status: str # 'kutmoqda', 'muolajada', 'yakunlandi', 'bekor_qilindi'
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None

class PaymentUpdate(BaseModel):
    payment_status: str # 'tolangan', 'kutilmoqda'
    payment_method: str # 'naqd', 'karta', 'click_payme'
    notes: Optional[str] = ""

class MedicalRecordCreate(BaseModel):
    patient_id: int
    appointment_id: Optional[int] = None
    record_date: Optional[str] = None
    complaints: Optional[str] = ""
    objective_findings: Optional[str] = ""
    diagnosis: str
    prescribed_procedures: Optional[str] = ""
    session_notes: Optional[str] = ""
    doctor_name: Optional[str] = "Dr. Nilufar Karimova"
    recommendations: Optional[str] = ""

class ServiceCreate(BaseModel):
    name: str
    category: Optional[str] = "Muolaja"
    price: float
    duration_min: Optional[int] = 30
    description: Optional[str] = ""

# --- Web Page Route ---

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from starlette.responses import Response
    return Response(content=b"", media_type="image/x-icon")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"today": date.today().strftime("%Y-%m-%d")}
    )

# --- API Endpoints ---

@app.get("/api/services")
def get_services():
    conn = database.get_connection()
    services = conn.execute("SELECT * FROM services WHERE is_active = 1 ORDER BY price ASC").fetchall()
    conn.close()
    return [dict(s) for s in services]

@app.post("/api/services")
def create_service(s: ServiceCreate):
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO services (name, category, price, duration_min, description, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
    """, (s.name, s.category, s.price, s.duration_min, s.description))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "message": "Xizmat muvaffaqiyatli qo'shildi"}

@app.get("/api/stats")
def get_dashboard_stats(target_date: Optional[str] = None):
    if not target_date:
        target_date = date.today().strftime("%Y-%m-%d")

    current_month_prefix = target_date[:7] # 'YYYY-MM'

    conn = database.get_connection()

    # 1. Today's Queue stats (limit: 20)
    today_apps = conn.execute("""
        SELECT a.*, p.category, p.full_name 
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.appointment_date = ? AND a.status != 'bekor_qilindi'
        ORDER BY a.queue_number ASC
    """, (target_date,)).fetchall()

    today_count = len(today_apps)
    max_capacity = 20
    remaining_capacity = max(0, max_capacity - today_count)
    capacity_percentage = min(100, round((today_count / max_capacity) * 100))

    today_waiting = sum(1 for a in today_apps if a["status"] == "kutmoqda")
    today_in_progress = sum(1 for a in today_apps if a["status"] == "muolajada")
    today_completed = sum(1 for a in today_apps if a["status"] == "yakunlandi")

    today_women = sum(1 for a in today_apps if a["category"] == "ayol")
    today_children = sum(1 for a in today_apps if a["category"] == "bola")

    # Today revenue
    today_revenue_row = conn.execute("""
        SELECT 
            COALESCE(SUM(amount), 0) as total_paid
        FROM payments
        WHERE SUBSTR(paid_at, 1, 10) = ?
    """, (target_date,)).fetchone()
    today_revenue = today_revenue_row["total_paid"] if today_revenue_row else 0

    today_expected_row = conn.execute("""
        SELECT COALESCE(SUM(total_amount), 0) as total_expected
        FROM appointments
        WHERE appointment_date = ? AND status != 'bekor_qilindi'
    """, (target_date,)).fetchone()
    today_expected = today_expected_row["total_expected"] if today_expected_row else 0

    # 2. Monthly Stats
    month_revenue_row = conn.execute("""
        SELECT 
            COALESCE(SUM(amount), 0) as total_monthly,
            COUNT(id) as total_payments
        FROM payments
        WHERE SUBSTR(paid_at, 1, 7) = ?
    """, (current_month_prefix,)).fetchone()
    monthly_revenue = month_revenue_row["total_monthly"] if month_revenue_row else 0

    month_patients_row = conn.execute("""
        SELECT COUNT(DISTINCT patient_id) as unique_patients, COUNT(id) as total_visits
        FROM appointments
        WHERE SUBSTR(appointment_date, 1, 7) = ? AND status != 'bekor_qilindi'
    """, (current_month_prefix,)).fetchone()
    monthly_patient_count = month_patients_row["unique_patients"] if month_patients_row else 0
    monthly_visits_count = month_patients_row["total_visits"] if month_patients_row else 0

    # 3. Monthly Services Breakdown
    services_breakdown = conn.execute("""
        SELECT 
            aps.service_name, 
            COUNT(aps.id) as session_count,
            COALESCE(SUM(aps.price), 0) as total_sum
        FROM appointment_services aps
        JOIN appointments a ON aps.appointment_id = a.id
        WHERE SUBSTR(a.appointment_date, 1, 7) = ? AND a.status != 'bekor_qilindi'
        GROUP BY aps.service_name
        ORDER BY total_sum DESC
    """, (current_month_prefix,)).fetchall()

    # 4. Payment Methods Breakdown (Monthly)
    payment_methods = conn.execute("""
        SELECT 
            payment_method,
            COALESCE(SUM(amount), 0) as total_amount,
            COUNT(id) as count
        FROM payments
        WHERE SUBSTR(paid_at, 1, 7) = ?
        GROUP BY payment_method
    """, (current_month_prefix,)).fetchall()

    # 5. Daily Trend for current month
    daily_trend = conn.execute("""
        SELECT 
            SUBSTR(paid_at, 1, 10) as pay_date,
            COALESCE(SUM(amount), 0) as daily_sum
        FROM payments
        WHERE SUBSTR(paid_at, 1, 7) = ?
        GROUP BY SUBSTR(paid_at, 1, 10)
        ORDER BY pay_date ASC
    """, (current_month_prefix,)).fetchall()

    # 6. Total registered patients in system
    total_patients_count = conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0]

    conn.close()

    return {
        "today": {
            "date": target_date,
            "count": today_count,
            "max_capacity": max_capacity,
            "remaining": remaining_capacity,
            "percentage": capacity_percentage,
            "waiting": today_waiting,
            "in_progress": today_in_progress,
            "completed": today_completed,
            "women_count": today_women,
            "children_count": today_children,
            "revenue": today_revenue,
            "expected_revenue": today_expected
        },
        "month": {
            "month_prefix": current_month_prefix,
            "revenue": monthly_revenue,
            "unique_patients": monthly_patient_count,
            "total_visits": monthly_visits_count,
            "avg_bill": round(monthly_revenue / max(1, monthly_visits_count))
        },
        "total_patients": total_patients_count,
        "services_breakdown": [dict(r) for r in services_breakdown],
        "payment_methods": [dict(r) for r in payment_methods],
        "daily_trend": [dict(r) for r in daily_trend]
    }

@app.get("/api/patients")
def get_patients(q: Optional[str] = None, category: Optional[str] = "all"):
    conn = database.get_connection()
    sql = """
        SELECT p.*,
            (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status != 'bekor_qilindi') as total_visits,
            (SELECT COALESCE(SUM(amount), 0) FROM payments pm WHERE pm.patient_id = p.id) as total_spent,
            (SELECT MAX(appointment_date) FROM appointments a WHERE a.patient_id = p.id) as last_visit
        FROM patients p
        WHERE 1=1
    """
    params = []

    if category and category != "all":
        sql += " AND p.category = ?"
        params.append(category)

    if q and q.strip():
        search = f"%{q.strip()}%"
        sql += " AND (p.full_name LIKE ? OR p.phone LIKE ? OR p.card_number LIKE ? OR p.initial_diagnosis LIKE ?)"
        params.extend([search, search, search, search])

    sql += " ORDER BY p.id DESC"

    patients = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(p) for p in patients]

@app.post("/api/patients")
def create_patient(p: PatientCreate):
    conn = database.get_connection()
    cursor = conn.cursor()

    # Generate next card number
    cursor.execute("SELECT MAX(id) FROM patients")
    last_id = cursor.fetchone()[0] or 0
    next_num = last_id + 1
    year = date.today().year
    card_number = f"SH-{year}-{next_num:03d}"

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO patients (card_number, full_name, category, gender, birth_date, age, phone, address, blood_group, allergies, initial_diagnosis, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (card_number, p.full_name.strip(), p.category, p.gender, p.birth_date, p.age, p.phone.strip(), p.address, p.blood_group, p.allergies, p.initial_diagnosis, p.notes, now_str))

    patient_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"id": patient_id, "card_number": card_number, "message": "Bemor muvaffaqiyatli ro'yxatga olindi"}

@app.get("/api/patients/{patient_id}")
def get_patient_detail(patient_id: int):
    conn = database.get_connection()
    patient = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        conn.close()
        raise HTTPException(status_code=404, detail="Bemor topilmadi")

    # Appointments history
    appointments = conn.execute("""
        SELECT a.*, 
            (SELECT GROUP_CONCAT(service_name, ', ') FROM appointment_services WHERE appointment_id = a.id) as services_names
        FROM appointments a
        WHERE a.patient_id = ?
        ORDER BY a.appointment_date DESC, a.id DESC
    """, (patient_id,)).fetchall()

    # Medical records
    records = conn.execute("""
        SELECT * FROM medical_records
        WHERE patient_id = ?
        ORDER BY record_date DESC, id DESC
    """, (patient_id,)).fetchall()

    # Payments history
    payments = conn.execute("""
        SELECT * FROM payments
        WHERE patient_id = ?
        ORDER BY paid_at DESC
    """, (patient_id,)).fetchall()

    total_spent = sum(r["amount"] for r in payments)

    conn.close()

    return {
        "patient": dict(patient),
        "appointments": [dict(a) for a in appointments],
        "medical_records": [dict(m) for m in records],
        "payments": [dict(p) for p in payments],
        "total_spent": total_spent
    }

@app.put("/api/patients/{patient_id}")
def update_patient(patient_id: int, p: PatientCreate):
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE patients
        SET full_name = ?, category = ?, gender = ?, birth_date = ?, age = ?, phone = ?, address = ?, blood_group = ?, allergies = ?, initial_diagnosis = ?, notes = ?
        WHERE id = ?
    """, (p.full_name.strip(), p.category, p.gender, p.birth_date, p.age, p.phone.strip(), p.address, p.blood_group, p.allergies, p.initial_diagnosis, p.notes, patient_id))
    conn.commit()
    conn.close()
    return {"message": "Bemor ma'lumotlari yangilandi"}

@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
    conn.commit()
    conn.close()
    return {"message": "Bemor o'chirildi"}

@app.get("/api/appointments")
def get_appointments(target_date: Optional[str] = None):
    if not target_date:
        target_date = date.today().strftime("%Y-%m-%d")

    conn = database.get_connection()
    cursor = conn.cursor()

    apps = cursor.execute("""
        SELECT 
            a.*,
            p.card_number,
            p.full_name,
            p.category,
            p.gender,
            p.phone,
            p.age,
            p.initial_diagnosis
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.appointment_date = ?
        ORDER BY a.queue_number ASC
    """, (target_date,)).fetchall()

    result = []
    for app_row in apps:
        app_dict = dict(app_row)
        # Fetch services for this appointment
        srvs = cursor.execute("""
            SELECT service_id, service_name, price 
            FROM appointment_services 
            WHERE appointment_id = ?
        """, (app_dict["id"],)).fetchall()
        app_dict["services"] = [dict(s) for s in srvs]
        result.append(app_dict)

    conn.close()
    return {
        "date": target_date,
        "total_booked": len(result),
        "max_capacity": 20,
        "is_full": len(result) >= 20,
        "appointments": result
    }

@app.post("/api/appointments")
def create_appointment(app_req: AppointmentCreate):
    conn = database.get_connection()
    cursor = conn.cursor()

    target_date = app_req.appointment_date or date.today().strftime("%Y-%m-%d")

    # Check capacity limit: 20 patients per day
    cursor.execute("""
        SELECT COUNT(*) FROM appointments 
        WHERE appointment_date = ? AND status != 'bekor_qilindi'
    """, (target_date,))
    current_count = cursor.fetchone()[0]

    if current_count >= 20 and not app_req.force_over_limit:
        conn.close()
        return JSONResponse(
            status_code=400,
            content={
                "error": "capacity_exceeded",
                "message": f"{target_date} sanasida kunlik 20 ta bemor qabul qilish me'yori to'lgan!",
                "current_count": current_count,
                "allow_override": True
            }
        )

    # Calculate queue number for the day
    cursor.execute("""
        SELECT COALESCE(MAX(queue_number), 0) FROM appointments
        WHERE appointment_date = ?
    """, (target_date,))
    next_queue_num = cursor.fetchone()[0] + 1

    # Fetch services prices
    if not app_req.service_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="Kamida bitta muolaja xizmatini tanlang")

    placeholders = ",".join("?" for _ in app_req.service_ids)
    services_selected = cursor.execute(f"SELECT id, name, price FROM services WHERE id IN ({placeholders})", app_req.service_ids).fetchall()

    total_amount = sum(s["price"] for s in services_selected)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO appointments (
            patient_id, appointment_date, queue_number, scheduled_time, 
            status, total_amount, payment_status, payment_method, notes, created_at
        ) VALUES (?, ?, ?, ?, 'kutmoqda', ?, 'kutilmoqda', 'naqd', ?, ?)
    """, (
        app_req.patient_id, 
        target_date, 
        next_queue_num, 
        app_req.scheduled_time or datetime.now().strftime("%H:%M"),
        total_amount,
        app_req.notes,
        now_str
    ))
    appointment_id = cursor.lastrowid

    # Insert appointment services
    for s in services_selected:
        cursor.execute("""
            INSERT INTO appointment_services (appointment_id, service_id, service_name, price)
            VALUES (?, ?, ?, ?)
        """, (appointment_id, s["id"], s["name"], s["price"]))

    conn.commit()
    conn.close()

    return {
        "id": appointment_id,
        "queue_number": next_queue_num,
        "total_amount": total_amount,
        "message": f"Bemor {next_queue_num}-raqamli navbatga yozildi!"
    }

@app.patch("/api/appointments/{app_id}/status")
def update_appointment_status(app_id: int, req: StatusUpdate):
    conn = database.get_connection()
    cursor = conn.cursor()

    app_row = cursor.execute("SELECT * FROM appointments WHERE id = ?", (app_id,)).fetchone()
    if not app_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Navbat topilmadi")

    now_time = datetime.now().strftime("%H:%M")
    arrival = req.arrival_time or app_row["arrival_time"]
    departure = req.departure_time or app_row["departure_time"]

    if req.status in ["kutmoqda", "muolajada"] and not arrival:
        arrival = now_time

    if req.status == "yakunlandi" and not departure:
        departure = now_time

    cursor.execute("""
        UPDATE appointments 
        SET status = ?, arrival_time = ?, departure_time = ?
        WHERE id = ?
    """, (req.status, arrival, departure, app_id))

    conn.commit()
    conn.close()
    return {"message": f"Navbat holati '{req.status}' ga o'zgartirildi", "arrival_time": arrival, "departure_time": departure}

@app.patch("/api/appointments/{app_id}/payment")
def update_appointment_payment(app_id: int, req: PaymentUpdate):
    conn = database.get_connection()
    cursor = conn.cursor()

    app_row = cursor.execute("SELECT * FROM appointments WHERE id = ?", (app_id,)).fetchone()
    if not app_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Navbat topilmadi")

    cursor.execute("""
        UPDATE appointments 
        SET payment_status = ?, payment_method = ?
        WHERE id = ?
    """, (req.payment_status, req.payment_method, app_id))

    # If marked as paid, record in payments table
    if req.payment_status == "tolangan":
        # Check if already paid
        existing_pay = cursor.execute("SELECT id FROM payments WHERE appointment_id = ?", (app_id,)).fetchone()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        receipt_no = f"CHK-{date.today().strftime('%Y%m%d')}-{app_id:04d}"
        if not existing_pay:
            cursor.execute("""
                INSERT INTO payments (appointment_id, patient_id, amount, payment_method, paid_at, receipt_no, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (app_id, app_row["patient_id"], app_row["total_amount"], req.payment_method, now_str, receipt_no, req.notes or "Qabul qilingan to'lov"))
        else:
            cursor.execute("""
                UPDATE payments 
                SET amount = ?, payment_method = ?, paid_at = ?, notes = ?
                WHERE appointment_id = ?
            """, (app_row["total_amount"], req.payment_method, now_str, req.notes or "Yangilangan to'lov", app_id))

    conn.commit()
    conn.close()
    return {"message": "To'lov ma'lumoti muvaffaqiyatli saqlandi!"}

@app.delete("/api/appointments/{app_id}")
def cancel_appointment(app_id: int):
    conn = database.get_connection()
    conn.execute("UPDATE appointments SET status = 'bekor_qilindi' WHERE id = ?", (app_id,))
    conn.commit()
    conn.close()
    return {"message": "Navbat bekor qilindi"}

@app.get("/api/medical-records")
def get_medical_records(patient_id: Optional[int] = None, q: Optional[str] = None):
    conn = database.get_connection()
    sql = """
        SELECT m.*, p.full_name, p.card_number, p.category, p.phone, p.age
        FROM medical_records m
        JOIN patients p ON m.patient_id = p.id
        WHERE 1=1
    """
    params = []
    if patient_id:
        sql += " AND m.patient_id = ?"
        params.append(patient_id)
    if q and q.strip():
        sql += " AND (p.full_name LIKE ? OR m.diagnosis LIKE ? OR m.complaints LIKE ?)"
        term = f"%{q.strip()}%"
        params.extend([term, term, term])

    sql += " ORDER BY m.record_date DESC, m.id DESC"
    records = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in records]

@app.post("/api/medical-records")
def create_medical_record(r: MedicalRecordCreate):
    conn = database.get_connection()
    cursor = conn.cursor()

    rec_date = r.record_date or date.today().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO medical_records (
            patient_id, appointment_id, record_date, complaints, objective_findings,
            diagnosis, prescribed_procedures, session_notes, doctor_name, recommendations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        r.patient_id, r.appointment_id, rec_date, r.complaints, r.objective_findings,
        r.diagnosis, r.prescribed_procedures, r.session_notes, r.doctor_name, r.recommendations, now_str
    ))

    # Also update patient's initial_diagnosis if empty
    cursor.execute("SELECT initial_diagnosis FROM patients WHERE id = ?", (r.patient_id,))
    current_diag = cursor.fetchone()
    if current_diag and not current_diag[0]:
        cursor.execute("UPDATE patients SET initial_diagnosis = ? WHERE id = ?", (r.diagnosis, r.patient_id))

    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "message": "Kasallik tarixi / Tibbiy karta yozuvi saqlandi!"}

@app.get("/api/receipt/{appointment_id}")
def get_receipt(appointment_id: int):
    conn = database.get_connection()
    app_row = conn.execute("""
        SELECT a.*, p.full_name, p.card_number, p.phone, p.category, p.age, p.address
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.id = ?
    """, (appointment_id,)).fetchone()

    if not app_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Navbat topilmadi")

    services = conn.execute("""
        SELECT service_name, price FROM appointment_services WHERE appointment_id = ?
    """, (appointment_id,)).fetchall()

    payment = conn.execute("""
        SELECT receipt_no, paid_at, payment_method FROM payments WHERE appointment_id = ?
    """, (appointment_id,)).fetchone()

    conn.close()

    receipt_no = payment["receipt_no"] if payment else f"CHK-{date.today().strftime('%Y%m%d')}-{appointment_id:04d}"
    paid_time = payment["paid_at"] if payment else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pay_method = payment["payment_method"] if payment else app_row["payment_method"]

    return {
        "clinic": {
            "name": "«SHIFO NUR» Sog'lomlashtirish Markazi",
            "subtitle": "Ayollar va bolalar salomatligi maskani",
            "phone": "+998 71 200 44 88 / +998 90 123 45 67",
            "address": "Toshkent shahri, Shifokorlar ko'chasi, 14-uy",
            "license": "Tibbiy faoliyat litsenziyasi: #SS-88421"
        },
        "receipt_no": receipt_no,
        "date_time": paid_time,
        "queue_number": app_row["queue_number"],
        "appointment_date": app_row["appointment_date"],
        "patient": {
            "full_name": app_row["full_name"],
            "card_number": app_row["card_number"],
            "category": "Ayol" if app_row["category"] == "ayol" else "Bola",
            "age": app_row["age"],
            "phone": app_row["phone"]
        },
        "services": [dict(s) for s in services],
        "total_amount": app_row["total_amount"],
        "payment_status": app_row["payment_status"],
        "payment_method": pay_method
    }

@app.post("/api/seed-data")
def trigger_seed_data():
    database.seed_sample_data()
    return {"message": "Namunaviy ma'lumotlar qayta yuklandi!"}
