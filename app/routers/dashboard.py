from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Customer, Lead, Booking, Payment, Task

router = APIRouter()

@router.get("/")
def dashboard(db: Session = Depends(get_db)):
    bookings = db.query(Booking).all()
    total_sales = sum(x.total_value or 0 for x in bookings)
    collected = db.query(func.sum(Payment.amount)).scalar() or 0
    return {
        "customers": db.query(Customer).count(),
        "leads": db.query(Lead).count(),
        "bookings": db.query(Booking).count(),
        "total_sales": total_sales,
        "collected": collected,
        "outstanding": total_sales - collected,
        "open_tasks": db.query(Task).filter(Task.status != "completed").count()
    }
