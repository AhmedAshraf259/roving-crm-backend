from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, Token
from app.security import hash_password, verify_password, create_token

router = APIRouter()

@router.post("/register")
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password), role=data.role)
    db.add(user); db.commit(); db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}

@router.post("/login", response_model=Token)
def login(data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return {"access_token": create_token(user.id), "token_type": "bearer"}
