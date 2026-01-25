import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from db import SessionLocal
from models import TicketModel


# -------------------------
# Pydantic models (API request/response shapes)
# -------------------------

class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)

class TicketOut(BaseModel):
    id: int
    subject: str
    status: str
    created_at: str


# -------------------------
# DB dependency (one session per request)
# -------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------
# App setup
# -------------------------

app = FastAPI(title="Inbox Pilot API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def healthz():
    return {"status": "ok"}


# -------------------------
# Ticket endpoints (now backed by Postgres)
# -------------------------

@app.post("/tickets", response_model=TicketOut)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db)):
    ticket = TicketModel(subject=payload.subject.strip(), status="open")
    db.add(ticket)
    db.commit()
    db.refresh(ticket)  # pulls generated id + timestamps from DB
    return {
        "id": ticket.id,
        "subject": ticket.subject,
        "status": ticket.status,
        "created_at": ticket.created_at.isoformat(),
    }


@app.get("/tickets", response_model=List[TicketOut])
def list_tickets(
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")

    stmt = select(TicketModel).order_by(desc(TicketModel.created_at)).limit(limit)
    if status:
        stmt = stmt.where(TicketModel.status == status)

    rows = db.execute(stmt).scalars().all()
    return [
        {
            "id": t.id,
            "subject": t.subject,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
        }
        for t in rows
    ]


@app.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {
        "id": t.id,
        "subject": t.subject,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
    }


@app.patch("/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket_status(ticket_id: int, status: str, db: Session = Depends(get_db)):
    allowed = {"open", "closed"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status. Use open or closed.")

    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    t.status = status
    db.commit()
    db.refresh(t)
    return {
        "id": t.id,
        "subject": t.subject,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
    }
