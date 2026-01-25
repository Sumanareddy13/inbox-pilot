from sqlalchemy import Column, BigInteger, Text, String, DateTime, func
from db import Base

class TicketModel(Base):
    __tablename__ = "tickets"

    id = Column(BigInteger, primary_key=True, index=True)
    subject = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="open")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
