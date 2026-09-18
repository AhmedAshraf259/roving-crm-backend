from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Customer
from app.schemas import CustomerCreate, CustomerOut

router = APIRouter()

@router.get("/", response_model=list[CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    return db.query(Customer).order_by(Customer.id.desc()).all()

@router.post("/", response_model=CustomerOut)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    obj = Customer(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj
