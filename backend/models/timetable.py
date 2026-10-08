from sqlalchemy import Column, Integer, String
from backend.database.database import Base


class Timetable(Base):
    __tablename__ = "timetable"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, nullable=True, index=True)
    course = Column(String, nullable=False)
    semester = Column(String, nullable=False)
    day = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    room = Column(String, nullable=False)
    faculty = Column(String, nullable=True)
