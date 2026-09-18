from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task
from app.schemas import TaskCreate, TaskOut

router = APIRouter()

@router.get("/", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db)):
    return db.query(Task).order_by(Task.id.desc()).all()

@router.post("/", response_model=TaskOut)
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    obj = Task(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj
