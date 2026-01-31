from dotenv import load_dotenv
load_dotenv()

from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from db import SessionLocal
from models import TicketModel, MessageModel


# -------------------------
# Guardrails (allowed values)
# -------------------------
ALLOWED_PRIORITY = {"low", "medium", "high"}
ALLOWED_CATEGORY = {"billing", "login", "refund", "other"}
ALLOWED_STATUS = {"open", "closed"}
ALLOWED_SENDER = {"customer", "agent", "system"}


# -------------------------
# Pydantic models (API request/response shapes)
# -------------------------

class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    priority: str = Field(default="medium")
    category: str = Field(default="other")


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assignee: Optional[str] = None
    due_at: Optional[str] = None  # ISO string; "" clears


class TicketOut(BaseModel):
    id: int
    subject: str
    status: str
    priority: str
    category: str
    assignee: Optional[str]
    due_at: Optional[str]
    created_at: str


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    sender_type: str = Field(default="customer")


class MessageOut(BaseModel):
    id: int
    ticket_id: int
    sender_type: str
    body: str
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

app = FastAPI(title="Inbox Pilot API", version="0.3.0")

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
# Helper: serialize TicketModel -> dict
# -------------------------

def ticket_to_out(t: TicketModel) -> dict:
    return {
        "id": t.id,
        "subject": t.subject,
        "status": t.status,
        "priority": t.priority,
        "category": t.category,
        "assignee": t.assignee,
        "due_at": t.due_at.isoformat() if t.due_at else None,
        "created_at": t.created_at.isoformat(),
    }


# -------------------------
# Ticket endpoints
# -------------------------

@app.post("/tickets", response_model=TicketOut)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db)):
    if payload.priority not in ALLOWED_PRIORITY:
        raise HTTPException(status_code=400, detail="Invalid priority. Use low, medium, or high.")
    if payload.category not in ALLOWED_CATEGORY:
        raise HTTPException(status_code=400, detail="Invalid category. Use billing, login, refund, or other.")

    ticket = TicketModel(
        subject=payload.subject.strip(),
        status="open",
        priority=payload.priority,
        category=payload.category,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket_to_out(ticket)


@app.get("/tickets", response_model=List[TicketOut])
def list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    assignee: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")

    stmt = select(TicketModel).order_by(desc(TicketModel.created_at)).limit(limit)

    if status:
        stmt = stmt.where(TicketModel.status == status)
    if priority:
        stmt = stmt.where(TicketModel.priority == priority)
    if category:
        stmt = stmt.where(TicketModel.category == category)
    if assignee:
        stmt = stmt.where(TicketModel.assignee == assignee)

    rows = db.execute(stmt).scalars().all()
    return [ticket_to_out(t) for t in rows]


@app.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket_to_out(t)


@app.patch("/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, payload: TicketUpdate, db: Session = Depends(get_db)):
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if payload.status is not None:
        if payload.status not in ALLOWED_STATUS:
            raise HTTPException(status_code=400, detail="Invalid status. Use open or closed.")
        t.status = payload.status

    if payload.priority is not None:
        if payload.priority not in ALLOWED_PRIORITY:
            raise HTTPException(status_code=400, detail="Invalid priority. Use low, medium, or high.")
        t.priority = payload.priority

    if payload.category is not None:
        if payload.category not in ALLOWED_CATEGORY:
            raise HTTPException(status_code=400, detail="Invalid category. Use billing, login, refund, or other.")
        t.category = payload.category

    if payload.assignee is not None:
        # empty string clears
        cleaned = payload.assignee.strip()
        t.assignee = cleaned if cleaned else None

    if payload.due_at is not None:
        # "" clears; otherwise parse ISO time
        if payload.due_at.strip() == "":
            t.due_at = None
        else:
            try:
                t.due_at = datetime.fromisoformat(payload.due_at.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="due_at must be ISO format like 2026-01-20T10:00:00+00:00 (or empty string to clear)",
                )

    db.commit()
    db.refresh(t)
    return ticket_to_out(t)


# -------------------------
# Message endpoints
# -------------------------

@app.post("/tickets/{ticket_id}/messages", response_model=MessageOut)
def add_message(ticket_id: int, payload: MessageCreate, db: Session = Depends(get_db)):
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if payload.sender_type not in ALLOWED_SENDER:
        raise HTTPException(status_code=400, detail="sender_type must be customer, agent, or system")

    m = MessageModel(
        ticket_id=ticket_id,
        sender_type=payload.sender_type,
        body=payload.body.strip(),
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    return {
        "id": m.id,
        "ticket_id": m.ticket_id,
        "sender_type": m.sender_type,
        "body": m.body,
        "created_at": m.created_at.isoformat(),
    }


@app.get("/tickets/{ticket_id}/messages", response_model=List[MessageOut])
def list_messages(ticket_id: int, db: Session = Depends(get_db)):
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    stmt = (
        select(MessageModel)
        .where(MessageModel.ticket_id == ticket_id)
        .order_by(MessageModel.created_at.asc())
    )
    rows = db.execute(stmt).scalars().all()

    return [
        {
            "id": m.id,
            "ticket_id": m.ticket_id,
            "sender_type": m.sender_type,
            "body": m.body,
            "created_at": m.created_at.isoformat(),
        }
        for m in rows
    ]
