# Roving Travel CRM Backend

FastAPI + SQLAlchemy backend starter for Roving Travel.

## Run locally

1. Create a virtual environment.
2. Install dependencies:
   `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and change `SECRET_KEY`.
4. Create tables:
   `python -c "from app.database import Base,engine; import app.models; Base.metadata.create_all(engine)"`
5. Start:
   `uvicorn app.main:app --reload`

API docs:
`http://127.0.0.1:8000/docs`

## Notes

This is a functional backend starter, not a production deployment yet. Before real customer data is used, add Alembic migrations, JWT dependency enforcement on protected routes, refresh tokens, audit logs, rate limiting, secure file storage, backups, HTTPS, and production PostgreSQL.
