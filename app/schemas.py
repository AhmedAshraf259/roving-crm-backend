from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from typing import Optional

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "sales"

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class CustomerCreate(BaseModel):
    name: str
    whatsapp: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None

class CustomerOut(CustomerCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class LeadCreate(BaseModel):
    customer_id: int
    destination: Optional[str] = None
    travel_date: Optional[date] = None
    travelers: int = 1
    trip_type: Optional[str] = None
    status: str = "new"
    assigned_to: Optional[int] = None
    next_followup: Optional[datetime] = None
    notes: Optional[str] = None

class LeadOut(LeadCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class BookingCreate(BaseModel):
    customer_id: int
    lead_id: Optional[int] = None
    destination: Optional[str] = None
    departure: Optional[date] = None
    return_date: Optional[date] = None
    travelers: int = 1
    package_name: Optional[str] = None
    total_value: float = 0
    status: str = "confirmed"
    sales_id: Optional[int] = None
    notes: Optional[str] = None

class BookingOut(BookingCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class PaymentCreate(BaseModel):
    booking_id: int
    amount: float
    method: Optional[str] = None
    notes: Optional[str] = None

class PaymentOut(PaymentCreate):
    id: int
    payment_date: date
    model_config = ConfigDict(from_attributes=True)

class TaskCreate(BaseModel):
    title: str
    customer_id: Optional[int] = None
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None
    status: str = "todo"
    notes: Optional[str] = None

class TaskOut(TaskCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)
