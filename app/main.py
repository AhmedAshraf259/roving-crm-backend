from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, bookings, customers, dashboard, leads, payments, tasks

# استيراد نموذج User مباشرة من ملف models.py ليقوم SQLAlchemy بإنشاء الجدول
from app.models import User

# إنشاء جميع الجداول في قاعدة البيانات عند التشغيل
Base.metadata.create_all(bind=engine)

# إنشاء تطبيق FastAPI
app = FastAPI(title="Roving Travel CRM API", version="0.1.0")

# 1. تفعيل سياسة CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. ربط الـ Routers الخاصة بالمشروع
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(customers.router, prefix="/customers", tags=["Customers"])
app.include_router(leads.router, prefix="/leads", tags=["Leads"])
app.include_router(bookings.router, prefix="/bookings", tags=["Bookings"])
app.include_router(payments.router, prefix="/payments", tags=["Payments"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "Roving Travel CRM"}