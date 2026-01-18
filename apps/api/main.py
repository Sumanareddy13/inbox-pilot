from fastapi.middleware.cors import CORSMiddleware

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# -------------------------
# 1) Data models (the "shape" of our data)
# -------------------------

class TicketCreate(BaseModel):
    # This is what the frontend will send when creating a ticket
    subject: str = Field(min_length=3, max_length=200)


class Ticket(BaseModel):
    # This is what the backend returns (stored ticket)
    id: int
    subject: str
    status: str
    created_at: str


# -------------------------
# 2) In-memory storage (temporary "database")
# -------------------------

TICKETS: List[Ticket] = []
NEXT_ID: int = 1


def now_iso() -> str:
    # Returns current time in a standard text format
    return datetime.now(timezone.utc).isoformat()


# -------------------------
# 3) FastAPI app + endpoints (the "doors" frontend can knock on)
# -------------------------

app = FastAPI(title="Inbox Pilot API", version="0.1.0")

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


@app.post("/tickets", response_model=Ticket)
def create_ticket(payload: TicketCreate):
    """
    Create a new ticket.
    Frontend sends: { "subject": "Payment failed" }
    Backend returns the created ticket with id/status/time.
    """
    global NEXT_ID

    ticket = Ticket(
        id=NEXT_ID,
        subject=payload.subject.strip(),
        status="open",
        created_at=now_iso(),
    )
    TICKETS.append(ticket)
    NEXT_ID += 1
    return ticket


@app.get("/tickets", response_model=List[Ticket])
def list_tickets(status: Optional[str] = None):
    """
    List all tickets.
    Optional filter: /tickets?status=open
    """
    if status is None:
        return TICKETS
    return [t for t in TICKETS if t.status == status]


@app.get("/tickets/{ticket_id}", response_model=Ticket)
def get_ticket(ticket_id: int):
    """
    Get one ticket by ID.
    """
    for t in TICKETS:
        if t.id == ticket_id:
            return t
    raise HTTPException(status_code=404, detail="Ticket not found")


@app.patch("/tickets/{ticket_id}", response_model=Ticket)
def update_ticket_status(ticket_id: int, status: str):
    """
    Update ticket status (simple version for now).
    Example: PATCH /tickets/1?status=closed
    """
    allowed = {"open", "closed"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status. Use open or closed.")

    for idx, t in enumerate(TICKETS):
        if t.id == ticket_id:
            updated = Ticket(
                id=t.id,
                subject=t.subject,
                status=status,
                created_at=t.created_at,
            )
            TICKETS[idx] = updated
            return updated

    raise HTTPException(status_code=404, detail="Ticket not found")
