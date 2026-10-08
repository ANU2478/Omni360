from sqlalchemy import Column, Integer, String, Text
from backend.database.database import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, nullable=False, index=True)
    course = Column(String, nullable=False)
    semester = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    due_date = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Pending")
