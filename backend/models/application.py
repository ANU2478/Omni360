from sqlalchemy import Column, Integer, String, Text
from backend.database.database import Base


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    applicant_id = Column(Integer, nullable=False, index=True)
    applicant_role = Column(String, nullable=False)
    application_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    status = Column(String, nullable=False, default="Pending")
    current_approver_role = Column(String, nullable=True)
    current_approver_id = Column(Integer, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
