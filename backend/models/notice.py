from sqlalchemy import Column, Integer, String, Text
from backend.database.database import Base


class Notice(Base):
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    target_type = Column(String, nullable=False, default="All")
    target_value = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
