from sqlalchemy import Boolean, Column, Integer, String
from backend.database.database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    roll_number = Column(String, unique=True, nullable=False, index=True)
    course = Column(String, nullable=False)
    semester = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True, default="")
    profile_photo = Column(String, nullable=True)
