from sqlalchemy import Column, Integer, String
from backend.database.database import Base


class Faculty(Base):
    __tablename__ = "faculty"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    employee_id = Column(String, unique=True, nullable=False, index=True)
    department = Column(String, nullable=False)
    designation = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True, default="")
    profile_photo = Column(String, nullable=True)
