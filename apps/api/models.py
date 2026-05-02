from sqlalchemy import Column, BigInteger, Text, String, DateTime, Boolean, func, ForeignKey
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

    ai_category = Column(String, nullable=True)
    ai_priority = Column(String, nullable=True)
    ai_confidence = Column(String, nullable=True)
    ai_entities = Column(Text, nullable=True)
    ai_status = Column(String, nullable=False, default="pending")
    ai_summary = Column(Text, nullable=True)
    ai_last_error = Column(Text, nullable=True)
    ai_updated_at = Column(DateTime(timezone=True), nullable=True)

    messages = relationship(
        "MessageModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

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

    actor = Column(String, nullable=False)
    action = Column(String, nullable=False)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    ticket = relationship("TicketModel", back_populates="audit_logs")


class KnowledgeBaseModel(Base):
    __tablename__ = "knowledge_base"

    id = Column(BigInteger, primary_key=True, index=True)
    title = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String, nullable=False, default="other")
    tags_json = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())