import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# جلب رابط قاعدة البيانات أو استخدام SQLite مؤقتاً في مسار tmp الخاطف الخاص بـ Vercel
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # بيئة Vercel تقبل الكتابة فقط داخل المجلد المؤقت /tmp
    DATABASE_URL = "sqlite:////tmp/sql_app.db"

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()