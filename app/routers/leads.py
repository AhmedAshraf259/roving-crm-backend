from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Lead
from app.schemas import LeadCreate, LeadOut

router = APIRouter()

@router.get("/", response_model=list[LeadOut])
def list_leads(db: Session = Depends(get_db)):
    return db.query(Lead).order_by(Lead.id.desc()).all()

@router.post("/", response_model=LeadOut)
def create_lead(data: LeadCreate, db: Session = Depends(get_db)):
    obj = Lead(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

@router.patch("/{lead_id}/status")
def update_status(lead_id: int, status: str, db: Session = Depends(get_db)):
    obj = db.get(Lead, lead_id)
    if not obj:
        return {"error": "Lead not found"}
    obj.status = status
    db.commit()
    return {"id": obj.id, "status": obj.status}
