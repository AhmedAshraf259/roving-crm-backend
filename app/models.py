from sqlalchemy import Column, Integer, String, Text, Float, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(30), default="sales", nullable=False)

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    whatsapp = Column(String(50))
    phone = Column(String(50))
    email = Column(String(255))
    source = Column(String(80))
    notes = Column(Text)
    assigned_to = Column(Integer, ForeignKey("users.id"))

class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    destination = Column(String(100))
    travel_date = Column(Date)
    travelers = Column(Integer, default=1)
    trip_type = Column(String(50))
    status = Column(String(40), default="new")
    lost_reason = Column(String(100))
    assigned_to = Column(Integer, ForeignKey("users.id"))
    last_contact = Column(DateTime)
    next_followup = Column(DateTime)
    notes = Column(Text)

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id"))
    destination = Column(String(100))
    departure = Column(Date)
    return_date = Column(Date)
    travelers = Column(Integer, default=1)
    package_name = Column(String(150))
    total_value = Column(Float, default=0)
    status = Column(String(40), default="confirmed")
    sales_id = Column(Integer, ForeignKey("users.id"))
    notes = Column(Text)

class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, server_default=func.current_date())
    method = Column(String(50))
    notes = Column(Text)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    assigned_to = Column(Integer, ForeignKey("users.id"))
    due_date = Column(DateTime)
    status = Column(String(30), default="todo")
    notes = Column(Text)
