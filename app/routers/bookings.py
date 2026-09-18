from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Booking
from app.schemas import BookingCreate, BookingOut

router = APIRouter()

@router.get("/", response_model=list[BookingOut])
def list_bookings(db: Session = Depends(get_db)):
    return db.query(Booking).order_by(Booking.id.desc()).all()

@router.post("/", response_model=BookingOut)
def create_booking(data: BookingCreate, db: Session = Depends(get_db)):
    obj = Booking(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj
