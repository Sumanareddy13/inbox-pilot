from sqlalchemy import Column, BigInteger, Text, String, DateTime, func, ForeignKey
from sqlalchemy.orm import relationship

from db import Base


class TicketModel(Base):
    __tablename__ = "tickets"

    id = Column(BigInteger, primary_key=True, index=True)
    subject = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="open")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    priority = Column(String, nullable=False, default="medium")
    category = Column(String, nullable=False, default="other")
    assignee = Column(String, nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)

    # A ticket has many messages
    messages = relationship(
        "MessageModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # A ticket has many audit logs
    audit_logs = relationship(
        "AuditLogModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MessageModel(Base):
    __tablename__ = "messages"

    id = Column(BigInteger, primary_key=True, index=True)
    ticket_id = Column(
        BigInteger,
        ForeignKey("tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sender_type = Column(String, nullable=False, default="customer")
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    ticket = relationship("TicketModel", back_populates="messages")


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger, primary_key=True, index=True)
    ticket_id = Column(
        BigInteger,
        ForeignKey("tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    actor = Column(String, nullable=False)     # e.g. "agent:Sam"
    action = Column(String, nullable=False)    # e.g. "ticket.created"
    meta_json = Column(Text, nullable=True)    # JSON string (keep it simple)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    ticket = relationship("TicketModel", back_populates="audit_logs")
