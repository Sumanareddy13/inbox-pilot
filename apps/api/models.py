from sqlalchemy import Column, BigInteger, Text, String, DateTime, func
from db import Base

from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class TicketModel(Base):
    __tablename__ = "tickets"
    ...
    messages = relationship("MessageModel", backref="ticket", cascade="all, delete")

    id = Column(BigInteger, primary_key=True, index=True)
    subject = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="open")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MessageModel(Base):
    __tablename__ = "messages"

    id = Column(BigInteger, primary_key=True, index=True)
    ticket_id = Column(BigInteger, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)

    sender_type = Column(String, nullable=False, default="customer")
    body = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
