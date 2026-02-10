from dotenv import load_dotenv
load_dotenv()

import os
import json
import time
import requests
import jwt

from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from db import SessionLocal
from models import TicketModel, MessageModel, AuditLogModel
from datetime import datetime, timezone


ALLOWED_PRIORITY = {"low", "medium", "high"}
ALLOWED_CATEGORY = {"billing", "login", "refund", "other"}
ALLOWED_STATUS = {"open", "closed"}
ALLOWED_SENDER = {"customer", "agent", "system"}




SUPABASE_PROJECT_URL = os.getenv("SUPABASE_PROJECT_URL", "").strip()
if not SUPABASE_PROJECT_URL:
    # Fail fast so you don't get silent auth bugs later
    raise RuntimeError("Missing SUPABASE_PROJECT_URL in apps/api/.env")

JWKS_URL = f"{SUPABASE_PROJECT_URL}/auth/v1/.well-known/jwks.json"

_JWKS_CACHE: Dict[str, Any] = {"keys": None, "fetched_at": 0}
_JWKS_TTL_SECONDS = 60 * 10  # 10 minutes


def _get_jwks() -> Dict[str, Any]:
    now = int(time.time())
    if _JWKS_CACHE["keys"] and (now - _JWKS_CACHE["fetched_at"] < _JWKS_TTL_SECONDS):
        return _JWKS_CACHE["keys"]

    r = requests.get(JWKS_URL, timeout=10)
    r.raise_for_status()
    data = r.json()
    _JWKS_CACHE["keys"] = data
    _JWKS_CACHE["fetched_at"] = now
    return data


def _verify_supabase_jwt(token: str) -> dict:

    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token header")

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Invalid auth token (missing kid)")

    jwks = _get_jwks()
    key = None
    for k in jwks.get("keys", []):
        if k.get("kid") == kid:
            key = k
            break

    if not key:
        # JWKS may have rotated; force refresh once
        _JWKS_CACHE["keys"] = None
        jwks = _get_jwks()
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                key = k
                break

    if not key:
        raise HTTPException(status_code=401, detail="Auth key not found (kid mismatch)")

    try:
        alg = header.get("alg")

        if alg == "ES256":
            public_key = jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(key))
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                issuer=f"{SUPABASE_PROJECT_URL}/auth/v1",
                options={"verify_aud": False},
            )
        elif alg == "RS256":
            public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                issuer=f"{SUPABASE_PROJECT_URL}/auth/v1",
                options={"verify_aud": False},
            )
        else:
            raise HTTPException(status_code=401, detail=f"Unsupported JWT alg: {alg}")

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Auth token expired")
    except HTTPException:
        raise
    except Exception as e:
        print("JWT VERIFY ERROR >>>", repr(e))
        raise HTTPException(status_code=401, detail=f"Invalid auth token: {str(e)}")


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=f"Bad Authorization format: {authorization[:30]}")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token after Bearer")

    return _verify_supabase_jwt(token)



def actor_from_user(user: dict) -> str:
    email = user.get("email")
    if email:
        return f"agent:{email}"
    sub = user.get("sub") or "unknown"
    return f"agent:{sub}"




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


class AuditLogOut(BaseModel):
    id: int
    ticket_id: int
    actor: str
    action: str
    meta_json: Optional[str]
    created_at: str



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI(title="Inbox Pilot API", version="0.5.0")

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


def log_event(db: Session, ticket_id: int, actor: str, action: str, meta: Optional[dict] = None) -> None:
    meta_json = json.dumps(meta) if meta is not None else None
    row = AuditLogModel(
        ticket_id=ticket_id,
        actor=actor,
        action=action,
        meta_json=meta_json,
    )
    db.add(row)


@app.post("/tickets", response_model=TicketOut)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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

    log_event(
        db=db,
        ticket_id=ticket.id,
        actor=actor_from_user(user),
        action="ticket.created",
        meta={"subject": ticket.subject, "priority": ticket.priority, "category": ticket.category},
    )
    db.commit()

    return ticket_to_out(ticket)



@app.get("/tickets", response_model=List[TicketOut])
def list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    assignee: Optional[str] = None,
    overdue: Optional[bool] = None,   # ✅ NEW
    limit: int = 50,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _ = user

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

    if overdue is True:
        now = datetime.now(timezone.utc)
        stmt = stmt.where(TicketModel.due_at.isnot(None))
        stmt = stmt.where(TicketModel.due_at < now)
        stmt = stmt.where(TicketModel.status != "closed")  

    rows = db.execute(stmt).scalars().all()
    return [ticket_to_out(t) for t in rows]



@app.get("/tickets/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _ = user
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket_to_out(t)


@app.patch("/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    before = {
        "status": t.status,
        "priority": t.priority,
        "category": t.category,
        "assignee": t.assignee,
        "due_at": t.due_at.isoformat() if t.due_at else None,
    }

    changed_fields: dict = {}

    if payload.status is not None:
        if payload.status not in ALLOWED_STATUS:
            raise HTTPException(status_code=400, detail="Invalid status. Use open or closed.")
        if payload.status != t.status:
            changed_fields["status"] = {"from": t.status, "to": payload.status}
            t.status = payload.status

    if payload.priority is not None:
        if payload.priority not in ALLOWED_PRIORITY:
            raise HTTPException(status_code=400, detail="Invalid priority. Use low, medium, or high.")
        if payload.priority != t.priority:
            changed_fields["priority"] = {"from": t.priority, "to": payload.priority}
            t.priority = payload.priority

    if payload.category is not None:
        if payload.category not in ALLOWED_CATEGORY:
            raise HTTPException(status_code=400, detail="Invalid category. Use billing, login, refund, or other.")
        if payload.category != t.category:
            changed_fields["category"] = {"from": t.category, "to": payload.category}
            t.category = payload.category

    if payload.assignee is not None:
        cleaned = payload.assignee.strip()
        new_assignee = cleaned if cleaned else None
        if new_assignee != t.assignee:
            changed_fields["assignee"] = {"from": t.assignee, "to": new_assignee}
            t.assignee = new_assignee

    if payload.due_at is not None:
        if payload.due_at.strip() == "":
            new_due = None
        else:
            try:
                new_due = datetime.fromisoformat(payload.due_at.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="due_at must be ISO format like 2026-01-20T10:00:00+00:00 (or empty string to clear)",
                )
        old_due = t.due_at.isoformat() if t.due_at else None
        new_due_str = new_due.isoformat() if new_due else None
        if new_due_str != old_due:
            changed_fields["due_at"] = {"from": old_due, "to": new_due_str}
            t.due_at = new_due

    if not changed_fields:
        return ticket_to_out(t)

    db.commit()
    db.refresh(t)

    log_event(
        db=db,
        ticket_id=t.id,
        actor=actor_from_user(user),
        action="ticket.updated",
        meta={"changed": changed_fields, "before": before},
    )
    db.commit()

    return ticket_to_out(t)



@app.post("/tickets/{ticket_id}/messages", response_model=MessageOut)
def add_message(
    ticket_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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

    log_event(
        db=db,
        ticket_id=t.id,
        actor=actor_from_user(user),
        action="message.added",
        meta={"sender_type": m.sender_type, "body_preview": (m.body[:80] if m.body else "")},
    )
    db.commit()

    return {
        "id": m.id,
        "ticket_id": m.ticket_id,
        "sender_type": m.sender_type,
        "body": m.body,
        "created_at": m.created_at.isoformat(),
    }


@app.get("/tickets/{ticket_id}/messages", response_model=List[MessageOut])
def list_messages(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _ = user

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



@app.get("/tickets/{ticket_id}/audit", response_model=List[AuditLogOut])
def list_audit_logs(
    ticket_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _ = user

    t = db.get(TicketModel, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    stmt = (
        select(AuditLogModel)
        .where(AuditLogModel.ticket_id == ticket_id)
        .order_by(AuditLogModel.created_at.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).scalars().all()

    return [
        {
            "id": a.id,
            "ticket_id": a.ticket_id,
            "actor": a.actor,
            "action": a.action,
            "meta_json": a.meta_json,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]
