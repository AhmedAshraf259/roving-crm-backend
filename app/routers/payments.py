from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Payment

router = APIRouter()

@router.get("/")
def list_payments(db: Session = Depends(get_db)):
    return db.query(Payment).order_by(Payment.id.desc()).all()

@router.post("/")
def create_payment(data: dict, db: Session = Depends(get_db)):
    obj = Payment(**data)
    db.add(obj); db.commit(); db.refresh(obj)
    return obj
