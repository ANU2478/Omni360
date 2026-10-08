# backend/main.py

# =========================================================
# IMPORTS
# =========================================================

from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import secrets
import uuid
import json
import shutil

from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Form,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, inspect, text
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from backend.database.database import engine, Base, get_db
from backend.models.student import Student
from backend.models.attendance import Attendance
from backend.models.timetable import Timetable
from backend.models.assignment import Assignment
from backend.models.notice import Notice
from backend.models.application import Application
from backend.models.faculty import Faculty

# Import the Admin model.
from backend.models.admin import Admin

# Import the Admin OTP model.
from backend.models.admin_otp import AdminOTP

# Import the email function used to send Admin OTPs.
from backend.email_service import send_admin_otp_email

# Local read-only AI service (Ollama + Qwen3:4b).
from backend.ai_service import ask_omni_ai


# =========================================================
# PASSWORD HASHING
# =========================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


# =========================================================
# FILE STORAGE
# =========================================================

# Store uploaded certificate files inside the backend folder.
# This works correctly even when Uvicorn is started from the
# Omni360 project root.
BASE_DIR = Path(__file__).resolve().parent
CERTIFICATE_UPLOAD_DIR = BASE_DIR / "uploads" / "certificates"
PROFILE_UPLOAD_DIR = BASE_DIR / "uploads" / "profiles"
COMPLAINT_UPLOAD_DIR = BASE_DIR / "uploads" / "complaints"
ASSIGNMENT_UPLOAD_DIR = BASE_DIR / "uploads" / "assignments"
CERTIFICATE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
COMPLAINT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ASSIGNMENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Files returned by this backend will be available under:
# http://127.0.0.1:8000/uploads/...


# =========================================================
# CREATE FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="Omni360",
    description="Community Digital Assistant",
    version="2.1.0"
)


# =========================================================
# CORS CONFIGURATION
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================================================
# STATIC FILES FOR CERTIFICATE DOWNLOADS
# =========================================================

app.mount(
    "/uploads",
    StaticFiles(directory=str(BASE_DIR / "uploads")),
    name="uploads"
)


# =========================================================
# NEW OMNI360 MODULE MODELS
# =========================================================

class CampusIssue(Base):
    __tablename__ = "campus_issues"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, nullable=False, index=True)
    category = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    location = Column(String, nullable=False)
    photo_path = Column(String, nullable=True)
    status = Column(String, nullable=False, default="Pending")
    assigned_department = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class Complaint(Base):
    """Generic grievance table used by Faculty and Admin.

    Student campus issues remain in campus_issues because they have a
    location field and a department workflow. Faculty grievances use this
    table so they can be submitted directly to Admin/Higher Authority.
    """

    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    complainant_id = Column(Integer, nullable=False, index=True)
    complainant_role = Column(String, nullable=False)
    category = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    assigned_to_role = Column(String, nullable=True)
    status = Column(String, nullable=False, default="Pending")
    admin_response = Column(Text, nullable=True)
    photo_path = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class Certificate(Base):
    __tablename__ = "certificates"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    certificate_type = Column(String, nullable=False)
    file_path = Column(String, nullable=True)
    uploaded_by_role = Column(String, nullable=False)
    uploaded_by_id = Column(Integer, nullable=True)
    issued_by = Column(String, nullable=True)
    certificate_date = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


class Fee(Base):
    __tablename__ = "fees"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, nullable=False, index=True)
    semester = Column(String, nullable=False)
    fee_type = Column(String, nullable=False, default="Semester Fee")
    total_amount = Column(Float, nullable=False)
    paid_amount = Column(Float, nullable=False, default=0)
    pending_amount = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="Pending")
    due_date = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class FeeCreditTransfer(Base):
    """Log an intentional transfer of an overpayment to another fee record."""

    __tablename__ = "fee_credit_transfers"

    id = Column(Integer, primary_key=True, index=True)
    source_fee_id = Column(Integer, nullable=False, index=True)
    target_fee_id = Column(Integer, nullable=False, index=True)
    student_id = Column(Integer, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    created_at = Column(String, nullable=False)


class HostelResident(Base):
    __tablename__ = "hostel_residents"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, unique=True, nullable=False, index=True)
    hostel_name = Column(String, nullable=False)
    room_number = Column(String, nullable=False)


class GatePass(Base):
    __tablename__ = "gate_passes"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, nullable=False, index=True)
    reason = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    departure_date = Column(String, nullable=False)
    departure_time = Column(String, nullable=False)
    return_date = Column(String, nullable=False)
    return_time = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Pending Faculty Approval")
    current_approver_role = Column(String, nullable=True)
    current_approver_id = Column(Integer, nullable=True)
    faculty_approved_by_id = Column(Integer, nullable=True)
    faculty_approved_by_name = Column(String, nullable=True)
    faculty_approved_at = Column(String, nullable=True)
    warden_approved_by_id = Column(Integer, nullable=True)
    warden_approved_by_name = Column(String, nullable=True)
    warden_approved_at = Column(String, nullable=True)
    pass_code = Column(String, unique=True, nullable=True)
    exit_time = Column(String, nullable=True)
    actual_return_time = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class PasswordResetToken(Base):
    """
    Stores a hashed, short-lived password reset token.

    The raw token is never stored in the database.
    For local development the token is returned by the forgot-password
    endpoint so the frontend can complete the reset flow. Later, the same
    token should be sent by real email instead.
    """

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)


# =========================================================
# DATABASE COMPATIBILITY / MIGRATION
# =========================================================

def ensure_column(table_name: str, column_name: str, column_definition: str) -> None:
    """Add a missing SQLite column without destroying existing data."""
    inspector = inspect(engine)
    try:
        if table_name not in inspector.get_table_names():
            return
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    except Exception:
        return

    if column_name not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"))


def ensure_student_department_column():
    """Add the department column to older SQLite student tables."""
    ensure_column("students", "department", "VARCHAR")


def ensure_faculty_hostel_role_column():
    """Add an optional hostel authority role to Faculty records."""
    ensure_column("faculty", "hostel_role", "VARCHAR")


def ensure_gate_pass_approval_columns():
    """Add the Faculty -> Warden approval audit fields."""
    fields = {
        "faculty_approved_by_id": "INTEGER",
        "faculty_approved_by_name": "VARCHAR",
        "faculty_approved_at": "VARCHAR",
        "warden_approved_by_id": "INTEGER",
        "warden_approved_by_name": "VARCHAR",
        "warden_approved_at": "VARCHAR",
    }
    for name, definition in fields.items():
        ensure_column("gate_passes", name, definition)


def ensure_assignment_submission_columns():
    """Add optional assignment submission/review fields without losing old records."""
    fields = {
        "submission_path": "VARCHAR",
        "submission_comment": "TEXT",
        "submitted_at": "VARCHAR",
        "review_comment": "TEXT",
        "reviewed_at": "VARCHAR",
        "created_by_faculty_id": "INTEGER",
    }
    for name, definition in fields.items():
        ensure_column("assignments", name, definition)


def get_student_department(student_id: int) -> Optional[str]:
    """Read Student.department using raw SQL for old/new database compatibility."""
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text("SELECT department FROM students WHERE id = :student_id"),
                {"student_id": student_id}
            ).mappings().first()
            return row["department"] if row else None
    except Exception:
        return None


def set_student_department(student_id: int, department: Optional[str]) -> None:
    ensure_student_department_column()
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE students SET department = :department WHERE id = :student_id"),
            {"department": department, "student_id": student_id}
        )


ensure_student_department_column()
ensure_faculty_hostel_role_column()
ensure_gate_pass_approval_columns()


# =========================================================
# CREATE DATABASE TABLES
# =========================================================

Base.metadata.create_all(bind=engine)

# Assignment submission columns need to be added after the base table exists.
ensure_assignment_submission_columns()


# =========================================================
# HELPER FUNCTIONS
# =========================================================

def normalize_email(email: str) -> str:
    """Normalize an email before searching/storing it."""
    return email.strip().lower()


def is_password_hash(value: Optional[str]) -> bool:
    """Return True when the value looks like a Passlib bcrypt hash."""
    return bool(value) and (
        value.startswith("$2a$") or
        value.startswith("$2b$") or
        value.startswith("$2y$")
    )


def verify_password(plain_password: str, stored_value: Optional[str]) -> bool:
    """
    Verify a password against the stored value.

    Normal accounts use bcrypt hashes. A temporary legacy fallback also
    supports old development faculty records that may still contain a
    plaintext password; successful plaintext logins are immediately
    converted to bcrypt.
    """
    if not stored_value:
        return False

    if is_password_hash(stored_value):
        try:
            return pwd_context.verify(plain_password, stored_value)
        except Exception:
            return False

    # Temporary compatibility for any older plaintext faculty record.
    return secrets.compare_digest(str(stored_value), plain_password)


def validate_password(password: str) -> None:
    """Apply the minimum password rule used by the frontend."""
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters."
        )


def get_student_department_number(student_id: int, department: Optional[str]) -> int:
    """Return a display-only 1..N number inside the student's department."""
    department = (department or "").strip()
    if not department:
        return 0
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    """SELECT COUNT(*) AS number FROM students
                       WHERE COALESCE(NULLIF(TRIM(department), ''), TRIM(course)) = :department
                         AND id <= :student_id"""
                ),
                {"department": department, "student_id": student_id}
            ).mappings().first()
            return int(row["number"]) if row else 0
    except Exception:
        return 0


def get_faculty_department_number(faculty_id: int, department: Optional[str]) -> int:
    """Return a display-only 1..N number inside the faculty department."""
    department = (department or "").strip()
    if not department:
        return 0
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    """SELECT COUNT(*) AS number FROM faculty
                       WHERE LOWER(TRIM(department)) = LOWER(TRIM(:department))
                         AND id <= :faculty_id"""
                ),
                {"department": department, "faculty_id": faculty_id}
            ).mappings().first()
            return int(row["number"]) if row else 0
    except Exception:
        return 0


def get_faculty_hostel_role(faculty_id: int) -> str:
    ensure_faculty_hostel_role_column()
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text("SELECT hostel_role FROM faculty WHERE id = :faculty_id"),
                {"faculty_id": faculty_id}
            ).mappings().first()
            return str(row["hostel_role"] or "Faculty") if row else "Faculty"
    except Exception:
        return "Faculty"


def set_faculty_hostel_role(faculty_id: int, hostel_role: Optional[str]) -> None:
    ensure_faculty_hostel_role_column()
    value = (hostel_role or "Faculty").strip() or "Faculty"
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE faculty SET hostel_role = :hostel_role WHERE id = :faculty_id"),
            {"hostel_role": value, "faculty_id": faculty_id}
        )


def fee_financials(total_amount: float, paid_amount: float) -> dict:
    total = max(0.0, float(total_amount or 0))
    paid = max(0.0, float(paid_amount or 0))
    pending = max(total - paid, 0.0)
    overpaid = max(paid - total, 0.0)
    if overpaid > 0:
        status = "Overpaid"
    elif pending == 0:
        status = "Fully Paid"
    elif paid > 0:
        status = "Partially Paid"
    else:
        status = "Pending"
    return {"pending_amount": round(pending, 2), "overpaid_amount": round(overpaid, 2), "status": status}


def fee_credit_balance(db: Session, student_id: int) -> float:
    fees = db.query(Fee).filter(Fee.student_id == student_id).all()
    return round(sum(fee_financials(f.total_amount, f.paid_amount)["overpaid_amount"] for f in fees), 2)


def public_student(student: Student) -> dict:
    department = get_student_department(student.id) or student.course
    return {
        "id": student.id,
        "name": student.name,
        "roll_number": student.roll_number,
        "course": student.course,
        "semester": student.semester,
        "department": department,
        "department_student_number": get_student_department_number(student.id, department),
        "email": student.email,
        "profile_photo": student.profile_photo
    }


def public_faculty(faculty: Faculty) -> dict:
    return {
        "id": faculty.id,
        "name": faculty.name,
        "employee_id": faculty.employee_id,
        "department": faculty.department,
        "department_faculty_number": get_faculty_department_number(faculty.id, faculty.department),
        "designation": faculty.designation,
        "hostel_role": get_faculty_hostel_role(faculty.id),
        "email": faculty.email,
        "profile_photo": faculty.profile_photo
    }


def hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def find_registered_user(db: Session, email: str):
    """
    Find a registered Student or Faculty using the registered email.
    Student is checked first, followed by Faculty.
    """
    email = normalize_email(email)

    student = db.query(Student).filter(Student.email == email).first()
    if student:
        return "Student", student

    faculty = db.query(Faculty).filter(Faculty.email == email).first()
    if faculty:
        return "Faculty", faculty

    admin = db.query(Admin).filter(Admin.email == email).first()
    if admin:
        return "Admin", admin

    return None, None


# =========================================================
# ADMIN OTP HELPERS
# =========================================================

def generate_admin_otp() -> str:
    """Generate a secure six-digit Admin OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_admin_otp(otp: str) -> str:
    """Hash the OTP before storing it in the database."""
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def invalidate_admin_otps(db: Session, admin_id: int) -> None:
    """Invalidate all previous unused OTPs for this Admin."""
    db.query(AdminOTP).filter(
        AdminOTP.admin_id == admin_id,
        AdminOTP.is_used == False
    ).update(
        {"is_used": True},
        synchronize_session=False
    )


def create_and_send_admin_otp(db: Session, admin: Admin) -> AdminOTP:
    """Create, store and email a new Admin OTP."""

    # Only one active OTP should exist for an Admin at a time.
    invalidate_admin_otps(db, admin.id)

    # Generate the six-digit OTP.
    otp = generate_admin_otp()

    # Use one timestamp for consistent expiry/creation values.
    now = datetime.utcnow()

    # Store only a hash of the OTP.
    otp_record = AdminOTP(
        admin_id=admin.id,
        otp_hash=hash_admin_otp(otp),
        expires_at=now + timedelta(minutes=5),
        attempts=0,
        is_used=False,
        created_at=now
    )

    db.add(otp_record)
    db.commit()
    db.refresh(otp_record)

    # Send the real OTP to the registered Admin email.
    email_sent = send_admin_otp_email(
        admin.email,
        otp
    )

    # Never leave an unusable OTP active.
    if not email_sent:
        otp_record.is_used = True
        db.commit()

        raise HTTPException(
            status_code=500,
            detail="Unable to send the Admin OTP email."
        )

    return otp_record


def public_admin(admin: Admin) -> dict:
    """Return safe Admin information for the frontend."""
    return {
        "id": admin.id,
        "name": admin.name,
        "email": admin.email,
        "department": admin.department,
        "profile_photo": admin.profile_photo
    }


def mask_admin_email(email: str) -> str:
    """Mask an Admin email for display without exposing the full address."""
    email = normalize_email(email)

    if "@" not in email:
        return "***"

    local_part, domain = email.split("@", 1)

    if len(local_part) <= 1:
        masked_local = "*"
    elif len(local_part) == 2:
        masked_local = local_part[0] + "*"
    else:
        masked_local = local_part[0] + "***" + local_part[-1]

    return f"{masked_local}@{domain}"


def verify_uploaded_file_name_and_type(upload: UploadFile) -> str:
    """Allow common certificate proof formats only."""
    allowed_types = {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg"
    }

    content_type = (upload.content_type or "").lower()
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, PNG, and JPG/JPEG certificate files are allowed."
        )

    return allowed_types[content_type]


# =========================================================
# AUTHENTICATION SCHEMAS
# =========================================================

class AuthLoginRequest(BaseModel):
    email: str
    password: str


# ============================================================
# ADMIN OTP SCHEMAS
# ============================================================

class AdminOTPVerifyRequest(BaseModel):
    # ID of the OTP challenge created during Admin login.
    otp_id: int

    # Six-digit OTP received by the Admin.
    otp: str


class AdminOTPResendRequest(BaseModel):
    # ID of the previous OTP challenge.
    otp_id: int


class ActivateAccountRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    email: str
    password: str


# =========================================================
# STUDENT REGISTRATION DATA
# =========================================================

class StudentCreate(BaseModel):
    name: str
    roll_number: str
    course: str
    semester: str
    email: str
    # Department is optional for backward compatibility.
    # When omitted, course is used as a temporary department fallback.
    department: Optional[str] = None

    # Optional on purpose.
    # Admin can register an account without setting the user's password.
    # If a password is supplied, the account is immediately active for
    # backward compatibility with the development API.
    password: Optional[str] = None

    profile_photo: Optional[str] = None


class FacultyCreate(BaseModel):
    name: str
    employee_id: str
    department: str
    designation: str
    email: str
    password: Optional[str] = None
    profile_photo: Optional[str] = None
    hostel_role: Optional[str] = "Faculty"


# ============================================================
# EXISTING MODULE SCHEMAS
# ============================================================

class ApplicationCreate(BaseModel):
    applicant_id: int
    applicant_role: str
    application_type: str
    title: str
    description: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CampusIssueCreate(BaseModel):
    student_id: int
    category: str
    description: str
    location: str
    photo_path: Optional[str] = None


class ComplaintCreate(BaseModel):
    complainant_id: int
    complainant_role: str = "Faculty"
    category: str
    title: str
    description: str
    assigned_to_role: str = "Admin"
    photo_path: Optional[str] = None


class ComplaintUpdate(BaseModel):
    status: str = "Pending"
    assigned_to_role: Optional[str] = None
    admin_response: Optional[str] = None


class CertificateCreate(BaseModel):
    student_id: int
    title: str
    certificate_type: str
    file_path: Optional[str] = None
    description: Optional[str] = None
    uploaded_by_role: str = "Student"
    uploaded_by_id: Optional[int] = None
    issued_by: Optional[str] = None
    certificate_date: Optional[str] = None


class FeeCreate(BaseModel):
    student_id: int
    semester: str
    fee_type: str = "Semester Fee"
    total_amount: float
    paid_amount: float = 0
    due_date: Optional[str] = None


class HostelResidentCreate(BaseModel):
    student_id: int
    hostel_name: str
    room_number: str


class GatePassCreate(BaseModel):
    student_id: int
    reason: str
    destination: str
    departure_date: str
    departure_time: str
    return_date: str
    return_time: str


# ============================================================
# FACULTY MANAGEMENT SCHEMAS
# ============================================================

class FacultyAttendanceUpdate(BaseModel):
    student_id: int
    subject: str
    attended_classes: int
    total_classes: int


class FacultyTimetableCreate(BaseModel):
    course: str
    semester: str
    day: str
    subject: str
    start_time: str
    end_time: str
    room: str


class FacultyAssignmentCreate(BaseModel):
    course: str
    semester: str
    subject: str
    title: str
    description: str
    due_date: str


class FacultyNoticeCreate(BaseModel):
    title: str
    content: str
    target_type: str = "All"
    target_value: Optional[str] = None


class FacultyCertificateCreate(BaseModel):
    student_id: int
    title: str
    certificate_type: str
    certificate_date: Optional[str] = None
    file_path: Optional[str] = None
    uploaded_by_role: str = "Faculty"
    uploaded_by_id: Optional[int] = None
    issued_by: Optional[str] = None


# =========================================================
# HOME API
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Welcome to Omni360!",
        "status": "Backend is running"
    }


# =========================================================
# ACCOUNT REGISTRATION / ADMIN-READY APIs
# =========================================================

@app.post("/students")
def create_student(
    student_data: StudentCreate,
    db: Session = Depends(get_db)
):
    """
    Development/admin-ready student registration.

    The account becomes activation-pending when password is omitted.
    Existing development usage can still send a password and get an
    immediately active account.

    A real Admin role/UI can use this same registration logic later.
    """
    email = normalize_email(str(student_data.email))

    if db.query(Student).filter(Student.email == email).first():
        raise HTTPException(status_code=409, detail="A student with this email is already registered.")

    if db.query(Student).filter(Student.roll_number == student_data.roll_number.strip()).first():
        raise HTTPException(status_code=409, detail="This roll number is already registered.")

    password_hash = ""
    if student_data.password:
        validate_password(student_data.password)
        password_hash = pwd_context.hash(student_data.password)

    new_student = Student(
        name=student_data.name.strip(),
        roll_number=student_data.roll_number.strip(),
        course=student_data.course.strip(),
        semester=student_data.semester.strip(),
        email=email,
        password_hash=password_hash,
        profile_photo=student_data.profile_photo
    )

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    # Save the optional department separately for compatibility with the
    # original Student ORM model.
    set_student_department(
        new_student.id,
        (student_data.department.strip() if student_data.department else None)
    )

    return {
        "success": True,
        "message": (
            "Student registered and ready for account activation."
            if not password_hash
            else "Student registered successfully."
        ),
        "account_status": "Active" if password_hash else "Activation Pending",
        "student": public_student(new_student)
    }


@app.post("/faculty")
def create_faculty(
    faculty_data: FacultyCreate,
    db: Session = Depends(get_db)
):
    """
    Development/admin-ready faculty registration.

    Omitting the password creates an activation-pending faculty account.
    """
    email = normalize_email(str(faculty_data.email))

    if db.query(Faculty).filter(Faculty.email == email).first():
        raise HTTPException(status_code=409, detail="A faculty member with this email is already registered.")

    if db.query(Faculty).filter(Faculty.employee_id == faculty_data.employee_id.strip()).first():
        raise HTTPException(status_code=409, detail="This employee ID is already registered.")

    password_hash = ""
    if faculty_data.password:
        validate_password(faculty_data.password)
        password_hash = pwd_context.hash(faculty_data.password)

    new_faculty = Faculty(
        name=faculty_data.name.strip(),
        employee_id=faculty_data.employee_id.strip(),
        department=faculty_data.department.strip(),
        designation=faculty_data.designation.strip(),
        email=email,
        password_hash=password_hash,
        profile_photo=faculty_data.profile_photo
    )

    db.add(new_faculty)
    db.commit()
    db.refresh(new_faculty)
    set_faculty_hostel_role(new_faculty.id, faculty_data.hostel_role)

    return {
        "success": True,
        "message": (
            "Faculty registered and ready for account activation."
            if not password_hash
            else "Faculty registered successfully."
        ),
        "account_status": "Active" if password_hash else "Activation Pending",
        "faculty": public_faculty(new_faculty)
    }


# =========================================================
# ACCOUNT ACTIVATION
# =========================================================

@app.post("/auth/activate")
def activate_account(
    data: ActivateAccountRequest,
    db: Session = Depends(get_db)
):
    """
    Activate a previously registered Student or Faculty account.

    The email must already exist in the database. This prevents arbitrary
    users from creating new accounts from the public frontend.
    """
    validate_password(data.password)

    role, user = find_registered_user(db, str(data.email))

    if not user:
        raise HTTPException(
            status_code=404,
            detail="This email is not registered by the college/admin."
        )

    if role == "Admin":
        return {
            "success": False,
            "message": "Admin passwords are managed separately. Please use the Admin login password."
        }

    if getattr(user, "password_hash", ""):
        return {
            "success": False,
            "message": "This account is already active. Please use Login."
        }

    user.password_hash = pwd_context.hash(data.password)
    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": f"{role} account activated successfully. You can now log in.",
        "role": role,
        "user": public_student(user) if role == "Student" else public_faculty(user)
    }


# =========================================================
# UNIFIED LOGIN
# =========================================================

@app.post("/auth/login")
def unified_login(
    data: AuthLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Unified login for Student, Faculty and Admin.

    Current development flow:
        Email + password -> direct dashboard login

    Admin OTP remains available through its separate endpoints and can be
    re-enabled later without redesigning the Admin dashboard.
    """

    email = normalize_email(str(data.email))

    # ========================================================
    # ADMIN LOGIN - EMAIL + PASSWORD ONLY FOR NOW
    # ========================================================

    admin = (
        db.query(Admin)
        .filter(Admin.email == email)
        .first()
    )

    if admin:
        # Block disabled Admin accounts.
        if not admin.is_active:
            return {
                "success": False,
                "message": "This Admin account is inactive."
            }

        # Verify the Admin password.
        if not verify_password(data.password, admin.password_hash):
            return {
                "success": False,
                "message": "Invalid email or password."
            }

        # Return only safe Admin fields - never the password hash.
        admin_data = public_admin(admin)

        return {
            "success": True,
            "message": "Admin login successful.",
            "role": "Admin",
            "user": admin_data,
            "admin": admin_data
        }

    # ========================================================
    # STUDENT / FACULTY LOGIN
    # ========================================================

    role, user = find_registered_user(
        db,
        email
    )

    if not user:
        return {
            "success": False,
            "message": "Invalid email or password."
        }

    stored_password = getattr(
        user,
        "password_hash",
        ""
    )

    if not stored_password:
        return {
            "success": False,
            "message": (
                "Your account is registered but not activated. "
                "Please activate it first."
            )
        }

    password_correct = verify_password(
        data.password,
        stored_password
    )

    if not password_correct:
        return {
            "success": False,
            "message": "Invalid email or password."
        }

    # Upgrade any old plaintext development password after successful login.
    if not is_password_hash(stored_password):
        user.password_hash = pwd_context.hash(
            data.password
        )
        db.commit()
        db.refresh(user)

    public_user = (
        public_student(user)
        if role == "Student"
        else public_faculty(user)
    )

    return {
        "success": True,
        "message": f"{role} login successful.",
        "role": role,
        "user": public_user,
        "student": public_user if role == "Student" else None,
        "faculty": public_user if role == "Faculty" else None
    }


# ============================================================
# ADMIN DASHBOARD SUMMARY
# ============================================================

@app.get("/admin/dashboard-summary")
def admin_dashboard_summary(
    db: Session = Depends(get_db)
):
    """
    Return live campus counts for the Admin dashboard.

    Authentication is intentionally kept simple during development.
    Later this endpoint can be protected with the completed Admin
    authentication / OTP session mechanism.
    """

    total_students = db.query(Student).count()
    total_faculty = db.query(Faculty).count()
    total_applications = db.query(Application).count()
    pending_applications = (
        db.query(Application)
        .filter(Application.status == "Pending")
        .count()
    )

    total_issues = db.query(CampusIssue).count()
    open_issues = (
        db.query(CampusIssue)
        .filter(CampusIssue.status.in_(["Pending", "In Progress"]))
        .count()
    )

    total_faculty_complaints = db.query(Complaint).count()
    open_faculty_complaints = (
        db.query(Complaint)
        .filter(Complaint.status.in_(["Pending", "In Progress"]))
        .count()
    )

    total_gate_passes = db.query(GatePass).count()
    pending_gate_passes = (
        db.query(GatePass)
        .filter(GatePass.current_approver_role.in_(["Faculty", "Warden"]))
        .count()
    )

    total_certificates = db.query(Certificate).count()

    pending_fees = (
        db.query(Fee)
        .filter(Fee.pending_amount > 0)
        .count()
    )

    hostel_residents = db.query(HostelResident).count()
    total_notices = db.query(Notice).count()

    return {
        "success": True,
        "summary": {
            "total_students": total_students,
            "total_faculty": total_faculty,
            "total_applications": total_applications,
            "pending_applications": pending_applications,
            "total_complaints": total_issues + total_faculty_complaints,
            "open_complaints": open_issues + open_faculty_complaints,
            "total_gate_passes": total_gate_passes,
            "pending_gate_passes": pending_gate_passes,
            "total_certificates": total_certificates,
            "students_with_pending_fees": pending_fees,
            "hostel_residents": hostel_residents,
            "total_notices": total_notices
        }
    }


# ============================================================
# ADMIN USER MANAGEMENT
# ============================================================

def admin_student_record(student: Student) -> dict:
    department = get_student_department(student.id) or student.course
    return {
        "id": student.id,
        "name": student.name,
        "roll_number": student.roll_number,
        "course": student.course,
        "semester": student.semester,
        "department": department,
        "department_student_number": get_student_department_number(student.id, department),
        "email": student.email,
        "profile_photo": student.profile_photo,
        "account_status": "Active" if getattr(student, "password_hash", "") else "Activation Pending"
    }


def admin_faculty_record(faculty: Faculty) -> dict:
    return {
        "id": faculty.id,
        "name": faculty.name,
        "employee_id": faculty.employee_id,
        "department": faculty.department,
        "department_faculty_number": get_faculty_department_number(faculty.id, faculty.department),
        "designation": faculty.designation,
        "hostel_role": get_faculty_hostel_role(faculty.id),
        "email": faculty.email,
        "profile_photo": faculty.profile_photo,
        "account_status": "Active" if getattr(faculty, "password_hash", "") else "Activation Pending"
    }


@app.get("/admin/students")
def admin_get_students(
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Return all registered students for Admin User Management."""
    query = db.query(Student).order_by(Student.id.desc())
    students = query.all()

    search_text = (search or "").strip().lower()
    if search_text:
        students = [
            student for student in students
            if search_text in str(student.name or "").lower()
            or search_text in str(student.roll_number or "").lower()
            or search_text in str(student.email or "").lower()
            or search_text in str(student.course or "").lower()
            or search_text in str(student.semester or "").lower()
            or search_text in str(get_student_department(student.id) or "").lower()
        ]

    return {
        "success": True,
        "count": len(students),
        "students": [admin_student_record(student) for student in students]
    }


@app.get("/admin/faculty")
def admin_get_faculty(
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Return all registered faculty members for Admin User Management."""
    query = db.query(Faculty).order_by(Faculty.id.desc())
    faculty_members = query.all()

    search_text = (search or "").strip().lower()
    if search_text:
        faculty_members = [
            faculty
            for faculty in faculty_members
            if search_text in str(faculty.name or "").lower()
            or search_text in str(faculty.employee_id or "").lower()
            or search_text in str(faculty.email or "").lower()
            or search_text in str(faculty.department or "").lower()
            or search_text in str(faculty.designation or "").lower()
        ]

    return {
        "success": True,
        "count": len(faculty_members),
        "faculty": [admin_faculty_record(faculty) for faculty in faculty_members]
    }


@app.post("/admin/students")
def admin_create_student(
    student_data: StudentCreate,
    db: Session = Depends(get_db)
):
    """Create a new student directly from Admin User Management."""
    return create_student(student_data, db)


@app.post("/admin/faculty")
def admin_create_faculty(
    faculty_data: FacultyCreate,
    db: Session = Depends(get_db)
):
    """Create a new faculty member directly from Admin User Management."""
    return create_faculty(faculty_data, db)


@app.put("/admin/students/{student_id}")
def admin_update_student(
    student_id: int,
    department: Optional[str] = None,
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return {"success": False, "message": "Student not found."}

    if department is not None:
        cleaned_department = department.strip() or None
        set_student_department(student.id, cleaned_department)

    db.refresh(student)

    return {
        "success": True,
        "message": "Student profile updated successfully.",
        "student": admin_student_record(student)
    }


@app.put("/admin/faculty/{faculty_id}")
def admin_update_faculty(
    faculty_id: int,
    department: Optional[str] = None,
    hostel_role: Optional[str] = None,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    if department is not None:
        faculty.department = department.strip()
    if hostel_role is not None:
        set_faculty_hostel_role(faculty.id, hostel_role)

    db.commit()
    db.refresh(faculty)
    return {"success": True, "message": "Faculty profile updated successfully.", "faculty": admin_faculty_record(faculty)}


# ============================================================
# VERIFY ADMIN OTP
# ============================================================

@app.post("/auth/admin/verify-otp")
def verify_admin_otp(
    data: AdminOTPVerifyRequest,
    db: Session = Depends(get_db)
):
    """Verify the six-digit OTP sent to an Admin's email."""

    # Find the OTP challenge.
    otp_record = (
        db.query(AdminOTP)
        .filter(AdminOTP.id == data.otp_id)
        .first()
    )

    if not otp_record:
        raise HTTPException(
            status_code=404,
            detail="OTP request was not found."
        )

    # Prevent OTP reuse.
    if otp_record.is_used:
        raise HTTPException(
            status_code=400,
            detail="This OTP has already been used."
        )

    # Check whether the five-minute validity period has passed.
    if datetime.utcnow() > otp_record.expires_at:
        otp_record.is_used = True
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP."
        )

    # Stop brute-force guessing after five failed attempts.
    if otp_record.attempts >= 5:
        otp_record.is_used = True
        db.commit()

        raise HTTPException(
            status_code=429,
            detail=(
                "Too many incorrect OTP attempts. "
                "Please request a new OTP."
            )
        )

    # Clean up the value entered by the Admin.
    entered_otp = str(data.otp).strip()

    # OTP must contain exactly six digits.
    if len(entered_otp) != 6 or not entered_otp.isdigit():
        otp_record.attempts += 1
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP must contain exactly 6 digits."
        )

    # Compare the entered OTP hash with the stored hash.
    if not secrets.compare_digest(
        hash_admin_otp(entered_otp),
        otp_record.otp_hash
    ):
        otp_record.attempts += 1
        db.commit()

        remaining_attempts = max(
            0,
            5 - otp_record.attempts
        )

        raise HTTPException(
            status_code=401,
            detail=(
                f"Incorrect OTP. {remaining_attempts} "
                "attempt(s) remaining."
            )
        )

    # OTP is correct, so it can never be used again.
    otp_record.is_used = True
    db.commit()

    # Load the Admin associated with this OTP.
    admin = (
        db.query(Admin)
        .filter(Admin.id == otp_record.admin_id)
        .first()
    )

    if not admin:
        raise HTTPException(
            status_code=404,
            detail="Admin account not found."
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=403,
            detail="This Admin account is inactive."
        )

    return {
        "success": True,
        "message": "Admin OTP verified successfully.",
        "role": "Admin",
        "admin": public_admin(admin)
    }


# ============================================================
# RESEND ADMIN OTP
# ============================================================

@app.post("/auth/admin/resend-otp")
def resend_admin_otp(
    data: AdminOTPResendRequest,
    db: Session = Depends(get_db)
):
    """Create a fresh OTP and email it to the Admin."""

    # Find the previous OTP challenge.
    old_otp = (
        db.query(AdminOTP)
        .filter(AdminOTP.id == data.otp_id)
        .first()
    )

    if not old_otp:
        raise HTTPException(
            status_code=404,
            detail="OTP request was not found."
        )

    # Find the Admin.
    admin = (
        db.query(Admin)
        .filter(Admin.id == old_otp.admin_id)
        .first()
    )

    if not admin:
        raise HTTPException(
            status_code=404,
            detail="Admin account not found."
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=403,
            detail="This Admin account is inactive."
        )

    # Generate and send a brand-new OTP.
    new_otp = create_and_send_admin_otp(
        db,
        admin
    )

    return {
        "success": True,
        "message": (
            "A new OTP has been sent to your registered Admin email."
        ),
        "otp_id": new_otp.id,
        "masked_email": mask_admin_email(admin.email)
    }


# =========================================================
# PROFILE PHOTO UPLOAD
# =========================================================

@app.post("/profile-photo")
async def upload_profile_photo(
    role: str = Form(...),
    user_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload or replace a Student, Faculty or Admin profile photo."""

    normalized_role = role.strip().lower()
    if normalized_role == "student":
        user = db.query(Student).filter(Student.id == user_id).first()
        public_user = public_student
        role_name = "Student"
    elif normalized_role == "faculty":
        user = db.query(Faculty).filter(Faculty.id == user_id).first()
        public_user = public_faculty
        role_name = "Faculty"
    elif normalized_role in {"admin", "administrator"}:
        user = db.query(Admin).filter(Admin.id == user_id).first()
        public_user = public_admin
        role_name = "Admin"
    else:
        raise HTTPException(status_code=400, detail="Role must be Student, Faculty or Admin.")

    if not user:
        raise HTTPException(status_code=404, detail=f"{role_name} account not found.")

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    suffix = allowed_types.get((file.content_type or "").lower())
    if not suffix:
        raise HTTPException(status_code=400, detail="Only JPG, PNG and WEBP profile photos are allowed.")

    content = await file.read()
    await file.close()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Profile photo is too large. Maximum size is 5 MB.")

    old_photo = user.profile_photo

    file_name = f"profile_{normalized_role}_{user_id}_{uuid.uuid4().hex}{suffix}"
    target_path = PROFILE_UPLOAD_DIR / file_name
    target_path.write_bytes(content)

    relative_path = f"uploads/profiles/{file_name}"
    user.profile_photo = relative_path
    db.commit()
    db.refresh(user)

    # Remove the previous locally stored photo after the database points to
    # the new file. Only files inside our own profile directory are removed.
    if old_photo:
        old_name = Path(str(old_photo).replace("\\", "/")).name
        old_path = PROFILE_UPLOAD_DIR / old_name
        try:
            if old_path.exists() and old_path.is_file():
                old_path.unlink()
        except OSError:
            pass

    return {
        "success": True,
        "message": "Profile photo updated successfully.",
        "profile_photo": relative_path,
        "file_url": f"/uploads/profiles/{file_name}",
        "role": role_name,
        "user": public_user(user),
    }


@app.delete("/profile-photo")
def delete_profile_photo(
    role: str,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Delete the current Student, Faculty or Admin profile photo."""
    normalized_role = role.strip().lower()

    if normalized_role == "student":
        user = db.query(Student).filter(Student.id == user_id).first()
        role_name = "Student"
    elif normalized_role == "faculty":
        user = db.query(Faculty).filter(Faculty.id == user_id).first()
        role_name = "Faculty"
    elif normalized_role in {"admin", "administrator"}:
        user = db.query(Admin).filter(Admin.id == user_id).first()
        role_name = "Admin"
    else:
        raise HTTPException(status_code=400, detail="Role must be Student, Faculty or Admin.")

    if not user:
        raise HTTPException(status_code=404, detail=f"{role_name} account not found.")

    old_photo = user.profile_photo
    user.profile_photo = None
    db.commit()
    db.refresh(user)

    if old_photo:
        old_name = Path(str(old_photo).replace("\\", "/")).name
        old_path = PROFILE_UPLOAD_DIR / old_name
        try:
            if old_path.exists() and old_path.is_file():
                old_path.unlink()
        except OSError:
            pass

    public_user = public_student if role_name == "Student" else public_faculty if role_name == "Faculty" else public_admin
    return {
        "success": True,
        "message": "Profile photo removed successfully.",
        "role": role_name,
        "user": public_user(user)
    }


# =========================================================
# STUDENT LOGIN (LEGACY / COMPATIBILITY)
# =========================================================

class StudentLogin(BaseModel):
    email: str
    password: str


@app.post("/student/login")
def student_login(
    login_data: StudentLogin,
    db: Session = Depends(get_db)
):
    email = normalize_email(str(login_data.email))
    student = db.query(Student).filter(Student.email == email).first()

    if not student:
        return {
            "success": False,
            "message": "Invalid email or password"
        }

    if not student.password_hash:
        return {
            "success": False,
            "message": "Account not activated. Please activate your account first."
        }

    password_correct = verify_password(
        login_data.password,
        student.password_hash
    )

    if not password_correct:
        return {
            "success": False,
            "message": "Invalid email or password"
        }

    if not is_password_hash(student.password_hash):
        student.password_hash = pwd_context.hash(login_data.password)
        db.commit()
        db.refresh(student)

    return {
        "success": True,
        "message": "Student login successful",
        "role": "Student",
        "student": public_student(student)
    }


# ============================================================
# FACULTY LOGIN (LEGACY / COMPATIBILITY)
# ============================================================

class FacultyLoginRequest(BaseModel):
    email: str
    password: str


@app.post("/faculty/login")
def faculty_login(
    login_data: FacultyLoginRequest,
    db: Session = Depends(get_db)
):
    email = normalize_email(str(login_data.email))
    faculty = db.query(Faculty).filter(Faculty.email == email).first()

    if not faculty:
        raise HTTPException(
            status_code=401,
            detail="Invalid faculty email or password."
        )

    if not faculty.password_hash:
        raise HTTPException(
            status_code=403,
            detail="Faculty account is registered but not activated."
        )

    if not verify_password(login_data.password, faculty.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid faculty email or password."
        )

    if not is_password_hash(faculty.password_hash):
        faculty.password_hash = pwd_context.hash(login_data.password)
        db.commit()
        db.refresh(faculty)

    return {
        "success": True,
        "message": "Faculty login successful.",
        "role": "Faculty",
        "faculty": public_faculty(faculty)
    }


# =========================================================
# FORGOT PASSWORD
# =========================================================

@app.post("/auth/forgot-password")
def forgot_password(
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Start a password-reset flow.

    In this development build the reset token is returned directly so we
    can test the full reset workflow without configuring an SMTP/email provider.
    Later, send this same token in a real email and do not return it in the API.
    """
    email = normalize_email(str(data.email))
    role, user = find_registered_user(db, email)

    # Do not reveal whether an arbitrary email exists.
    generic_message = "If this email is registered, a password reset token has been generated."

    if not user:
        return {
            "success": True,
            "message": generic_message
        }

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_reset_token(raw_token)

    # Invalidate older unused tokens for this email.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.email == email,
        PasswordResetToken.used == False
    ).update({"used": True})

    now = datetime.utcnow()
    reset_record = PasswordResetToken(
        email=email,
        role=role,
        token_hash=token_hash,
        expires_at=now + timedelta(minutes=15),
        used=False,
        created_at=now
    )

    db.add(reset_record)
    db.commit()

    return {
        "success": True,
        "message": generic_message,
        "reset_token": raw_token,
        "expires_in_minutes": 15,
        "development_mode": True
    }


# =========================================================
# RESET PASSWORD
# =========================================================

@app.post("/auth/reset-password")
def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    validate_password(data.password)

    email = normalize_email(str(data.email))
    token_hash = hash_reset_token(data.token.strip())

    reset_record = db.query(PasswordResetToken).filter(
        PasswordResetToken.email == email,
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used == False
    ).first()

    if not reset_record:
        raise HTTPException(
            status_code=400,
            detail="Invalid or already-used reset token."
        )

    if reset_record.expires_at < datetime.utcnow():
        reset_record.used = True
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="This reset token has expired. Please request a new one."
        )

    role, user = find_registered_user(db, email)

    if not user or role != reset_record.role:
        reset_record.used = True
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Account associated with this reset token was not found."
        )

    user.password_hash = pwd_context.hash(data.password)
    reset_record.used = True

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": "Password reset successfully. You can now log in.",
        "role": role
    }


@app.get("/students/{student_id}")
def get_student_profile(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return {"success": False, "message": "Student not found."}
    return {"success": True, "student": public_student(student)}


# =====================================================
# ATTENDANCE
# =====================================================

@app.get("/students/{student_id}/attendance")
def get_student_attendance(student_id: int, db: Session = Depends(get_db)):
    records = (
        db.query(Attendance)
        .filter(Attendance.student_id == student_id)
        .all()
    )

    return {
        "student_id": student_id,
        "attendance": [
            {
                "id": record.id,
                "subject": record.subject,
                "attended_classes": record.attended_classes,
                "total_classes": record.total_classes,
                "percentage": round(
                    (record.attended_classes / record.total_classes) * 100,
                    2
                ) if record.total_classes > 0 else 0
            }
            for record in records
        ]
    }


@app.post("/students/{student_id}/attendance")
def add_attendance(
    student_id: int,
    subject: str,
    attended_classes: int,
    total_classes: int,
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        return {"success": False, "message": "Student not found"}

    if total_classes <= 0:
        return {"success": False, "message": "Total classes must be greater than zero."}

    if attended_classes < 0 or attended_classes > total_classes:
        return {"success": False, "message": "Invalid attendance values."}

    new_attendance = Attendance(
        student_id=student_id,
        subject=subject.strip(),
        attended_classes=attended_classes,
        total_classes=total_classes
    )

    db.add(new_attendance)
    db.commit()
    db.refresh(new_attendance)

    return {
        "success": True,
        "message": "Attendance added successfully",
        "attendance": {
            "id": new_attendance.id,
            "student_id": new_attendance.student_id,
            "subject": new_attendance.subject,
            "attended_classes": new_attendance.attended_classes,
            "total_classes": new_attendance.total_classes,
            "percentage": round(
                (new_attendance.attended_classes / new_attendance.total_classes) * 100,
                2
            )
        }
    }


# =====================================================
# TIMETABLE
# =====================================================

@app.get("/students/{student_id}/timetable")
def get_student_timetable(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        return {"success": False, "message": "Student not found"}

    records = (
        db.query(Timetable)
        .filter(Timetable.student_id == student_id)
        .all()
    )

    return {
        "success": True,
        "student_id": student_id,
        "timetable": [
            {
                "id": record.id,
                "day": record.day,
                "subject": record.subject,
                "start_time": record.start_time,
                "end_time": record.end_time,
                "room": record.room,
                "faculty": record.faculty
            }
            for record in records
        ]
    }


@app.post("/students/{student_id}/timetable")
def add_timetable(
    student_id: int,
    day: str,
    subject: str,
    start_time: str,
    end_time: str,
    room: str,
    faculty: str,
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        return {"success": False, "message": "Student not found"}

    new_timetable = Timetable(
        student_id=student_id,
        day=day,
        subject=subject,
        start_time=start_time,
        end_time=end_time,
        room=room,
        faculty=faculty
    )

    db.add(new_timetable)
    db.commit()
    db.refresh(new_timetable)

    return {
        "success": True,
        "message": "Timetable added successfully",
        "timetable": {
            "id": new_timetable.id,
            "student_id": new_timetable.student_id,
            "day": new_timetable.day,
            "subject": new_timetable.subject,
            "start_time": new_timetable.start_time,
            "end_time": new_timetable.end_time,
            "room": new_timetable.room,
            "faculty": new_timetable.faculty
        }
    }


# =====================================================
# ASSIGNMENTS
# =====================================================

@app.get("/students/{student_id}/assignments")
def get_student_assignments(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return {"success": False, "message": "Student not found"}

    records = (
        db.query(Assignment)
        .filter(Assignment.student_id == student_id)
        .order_by(Assignment.id.desc())
        .all()
    )

    extra_rows = db.execute(
        text("SELECT id, submission_path, submission_comment, submitted_at, review_comment, reviewed_at, created_by_faculty_id FROM assignments WHERE student_id = :student_id"),
        {"student_id": student_id}
    ).mappings().all()
    extra_by_id = {int(row["id"]): row for row in extra_rows}

    result = []
    for record in records:
        extra = extra_by_id.get(record.id, {})
        result.append({
            "id": record.id,
            "student_id": record.student_id,
            "subject": record.subject,
            "title": record.title,
            "description": record.description,
            "due_date": record.due_date,
            "status": record.status,
            "submission_path": extra.get("submission_path"),
            "submission_comment": extra.get("submission_comment"),
            "submitted_at": extra.get("submitted_at"),
            "review_comment": extra.get("review_comment"),
            "reviewed_at": extra.get("reviewed_at"),
        })

    return {"success": True, "student_id": student_id, "assignments": result}


@app.post("/students/{student_id}/assignments")
def add_assignment(
    student_id: int,
    subject: str,
    title: str,
    description: str,
    due_date: str,
    status: str = "Pending",
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        return {"success": False, "message": "Student not found"}

    new_assignment = Assignment(
        student_id=student_id,
        subject=subject,
        title=title,
        description=description,
        due_date=due_date,
        status=status
    )

    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)

    return {
        "success": True,
        "message": "Assignment added successfully",
        "assignment": {
            "id": new_assignment.id,
            "student_id": new_assignment.student_id,
            "subject": new_assignment.subject,
            "title": new_assignment.title,
            "description": new_assignment.description,
            "due_date": new_assignment.due_date,
            "status": new_assignment.status
        }
    }


# =====================================================
# STUDENT NOTICES
# =====================================================

@app.get("/students/{student_id}/notices")
def get_student_notices(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        return {"success": False, "message": "Student not found."}

    notices = db.query(Notice).order_by(Notice.id.desc()).all()

    return {
        "success": True,
        "student_id": student_id,
        "notices": [
            {
                "id": notice.id,
                "title": notice.title,
                "content": notice.content,
                "target_type": notice.target_type,
                "target_value": notice.target_value,
                "created_at": notice.created_at,
                "created_by": notice.created_by
            }
            for notice in notices
        ]
    }


# =====================================================
# APPLICATIONS
# =====================================================

@app.post("/applications")
def create_application(application: ApplicationCreate, db: Session = Depends(get_db)):
    applicant_role = application.applicant_role.strip().title()

    if applicant_role == "Student":
        applicant = db.query(Student).filter(Student.id == application.applicant_id).first()
    elif applicant_role == "Faculty":
        applicant = db.query(Faculty).filter(Faculty.id == application.applicant_id).first()
    else:
        return {"success": False, "message": "Applicant role must be Student or Faculty."}

    if not applicant:
        return {"success": False, "message": "Applicant not found."}

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    next_approver = "Faculty" if applicant_role == "Student" else "Admin"

    new_application = Application(
        applicant_id=application.applicant_id,
        applicant_role=applicant_role,
        application_type=application.application_type,
        title=application.title,
        description=application.description,
        start_date=application.start_date,
        end_date=application.end_date,
        status="Pending",
        current_approver_role=next_approver,
        current_approver_id=None,
        created_at=current_time,
        updated_at=current_time
    )

    db.add(new_application)
    db.commit()
    db.refresh(new_application)

    return {
        "success": True,
        "message": "Application submitted successfully.",
        "application": {
            "id": new_application.id,
            "applicant_id": new_application.applicant_id,
            "applicant_role": new_application.applicant_role,
            "application_type": new_application.application_type,
            "title": new_application.title,
            "description": new_application.description,
            "start_date": new_application.start_date,
            "end_date": new_application.end_date,
            "status": new_application.status,
            "current_approver_role": new_application.current_approver_role,
            "created_at": new_application.created_at
        }
    }


@app.get("/students/{student_id}/applications")
def get_student_applications(student_id: int, db: Session = Depends(get_db)):
    applications = (
        db.query(Application)
        .filter(
            Application.applicant_id == student_id,
            Application.applicant_role == "Student"
        )
        .order_by(Application.id.desc())
        .all()
    )

    return {
        "success": True,
        "student_id": student_id,
        "applications": [
            {
                "id": item.id,
                "applicant_id": item.applicant_id,
                "application_type": item.application_type,
                "title": item.title,
                "description": item.description,
                "start_date": item.start_date,
                "end_date": item.end_date,
                "status": item.status,
                "current_approver_role": item.current_approver_role,
                "created_at": item.created_at
            }
            for item in applications
        ]
    }


@app.get("/applications")
def get_all_applications(db: Session = Depends(get_db)):
    applications = db.query(Application).order_by(Application.id.desc()).all()

    records = []
    for item in applications:
        applicant = None
        if item.applicant_role == "Student":
            applicant = db.query(Student).filter(Student.id == item.applicant_id).first()
        elif item.applicant_role == "Faculty":
            applicant = db.query(Faculty).filter(Faculty.id == item.applicant_id).first()

        records.append({
            "id": item.id,
            "applicant_id": item.applicant_id,
            "applicant_role": item.applicant_role,
            "applicant_name": getattr(applicant, "name", "Unknown"),
            "application_type": item.application_type,
            "title": item.title,
            "description": item.description,
            "start_date": item.start_date,
            "end_date": item.end_date,
            "status": item.status,
            "current_approver_role": item.current_approver_role,
            "current_approver_id": item.current_approver_id,
            "created_at": item.created_at,
            "updated_at": item.updated_at
        })

    return {
        "success": True,
        "applications": records
    }


# Faculty submits their own request; Admin is the next authority.
@app.post("/faculty/{faculty_id}/applications")
def create_faculty_application(
    faculty_id: int,
    application: ApplicationCreate,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_application = Application(
        applicant_id=faculty.id,
        applicant_role="Faculty",
        application_type=application.application_type,
        title=application.title.strip(),
        description=application.description.strip(),
        start_date=application.start_date,
        end_date=application.end_date,
        status="Pending",
        current_approver_role="Admin",
        current_approver_id=None,
        created_at=current_time,
        updated_at=current_time
    )

    db.add(new_application)
    db.commit()
    db.refresh(new_application)

    return {
        "success": True,
        "message": "Faculty application submitted to Admin successfully.",
        "application": {
            "id": new_application.id,
            "applicant_id": new_application.applicant_id,
            "applicant_role": new_application.applicant_role,
            "application_type": new_application.application_type,
            "title": new_application.title,
            "description": new_application.description,
            "start_date": new_application.start_date,
            "end_date": new_application.end_date,
            "status": new_application.status,
            "current_approver_role": new_application.current_approver_role,
            "created_at": new_application.created_at
        }
    }


@app.get("/faculty/{faculty_id}/my-applications")
def get_faculty_my_applications(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    applications = db.query(Application).filter(
        Application.applicant_id == faculty_id,
        Application.applicant_role == "Faculty"
    ).order_by(Application.id.desc()).all()

    return {
        "success": True,
        "applications": [
            {
                "id": item.id,
                "application_type": item.application_type,
                "title": item.title,
                "description": item.description,
                "start_date": item.start_date,
                "end_date": item.end_date,
                "status": item.status,
                "current_approver_role": item.current_approver_role,
                "created_at": item.created_at,
                "updated_at": item.updated_at
            }
            for item in applications
        ]
    }


@app.put("/applications/{application_id}/approve")
def approve_application(
    application_id: int,
    approver_role: str = "Faculty",
    approver_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    application = db.query(Application).filter(Application.id == application_id).first()

    if not application:
        return {"success": False, "message": "Application not found."}

    application.status = "Approved"
    application.current_approver_role = None
    application.current_approver_id = approver_id
    application.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()

    return {
        "success": True,
        "message": f"Application approved by {approver_role}.",
        "application_id": application.id,
        "status": application.status
    }


@app.put("/applications/{application_id}/reject")
def reject_application(
    application_id: int,
    approver_role: str = "Faculty",
    approver_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    application = db.query(Application).filter(Application.id == application_id).first()

    if not application:
        return {"success": False, "message": "Application not found."}

    application.status = "Rejected"
    application.current_approver_role = None
    application.current_approver_id = approver_id
    application.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()

    return {
        "success": True,
        "message": f"Application rejected by {approver_role}.",
        "application_id": application.id,
        "status": application.status
    }


# =====================================================
# CAMPUS ISSUES
# =====================================================

@app.post("/campus-issues")
def create_campus_issue(issue: CampusIssueCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == issue.student_id).first()

    if not student:
        return {"success": False, "message": "Student not found."}

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    new_issue = CampusIssue(
        student_id=issue.student_id,
        category=issue.category,
        description=issue.description,
        location=issue.location,
        photo_path=issue.photo_path,
        status="Pending",
        assigned_department=None,
        created_at=current_time,
        updated_at=current_time
    )

    db.add(new_issue)
    db.commit()
    db.refresh(new_issue)

    return {
        "success": True,
        "message": "Campus issue reported successfully.",
        "issue": {
            "id": new_issue.id,
            "student_id": new_issue.student_id,
            "category": new_issue.category,
            "description": new_issue.description,
            "location": new_issue.location,
            "photo_path": new_issue.photo_path,
            "status": new_issue.status,
            "assigned_department": new_issue.assigned_department,
            "created_at": new_issue.created_at
        }
    }


@app.post("/campus-issues/upload-photo")
async def upload_campus_issue_photo(
    student_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
    }
    suffix = allowed_types.get((file.content_type or "").lower())
    if not suffix:
        raise HTTPException(status_code=400, detail="Only JPG, PNG and WEBP images are allowed.")

    content = await file.read()
    await file.close()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Complaint photo is too large. Maximum size is 8 MB.")

    file_name = f"issue_{student_id}_{uuid.uuid4().hex}{suffix}"
    (COMPLAINT_UPLOAD_DIR / file_name).write_bytes(content)
    relative_path = f"uploads/complaints/{file_name}"

    return {
        "success": True,
        "message": "Complaint photo uploaded successfully.",
        "file_path": relative_path,
        "file_url": f"/uploads/complaints/{file_name}"
    }


@app.get("/students/{student_id}/campus-issues")
def get_student_campus_issues(student_id: int, db: Session = Depends(get_db)):
    issues = (
        db.query(CampusIssue)
        .filter(CampusIssue.student_id == student_id)
        .order_by(CampusIssue.id.desc())
        .all()
    )

    return {
        "success": True,
        "student_id": student_id,
        "issues": [
            {
                "id": item.id,
                "category": item.category,
                "description": item.description,
                "location": item.location,
                "photo_path": item.photo_path,
                "status": item.status,
                "assigned_department": item.assigned_department,
                "created_at": item.created_at,
                "updated_at": item.updated_at
            }
            for item in issues
        ]
    }


@app.get("/campus-issues")
def get_all_campus_issues(db: Session = Depends(get_db)):
    issues = db.query(CampusIssue).order_by(CampusIssue.id.desc()).all()

    return {
        "success": True,
        "issues": [
            {
                "id": item.id,
                "student_id": item.student_id,
                "category": item.category,
                "description": item.description,
                "location": item.location,
                "photo_path": item.photo_path,
                "status": item.status,
                "assigned_department": item.assigned_department,
                "created_at": item.created_at,
                "updated_at": item.updated_at
            }
            for item in issues
        ]
    }


# =====================================================
# FACULTY COMPLAINTS / GRIEVANCES
# =====================================================

@app.post("/complaints")
def create_complaint(complaint: ComplaintCreate, db: Session = Depends(get_db)):
    role = complaint.complainant_role.strip().title()
    if role != "Faculty":
        return {"success": False, "message": "This complaint endpoint is for Faculty grievances."}

    faculty = db.query(Faculty).filter(Faculty.id == complaint.complainant_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    record = Complaint(
        complainant_id=faculty.id,
        complainant_role="Faculty",
        category=complaint.category.strip(),
        title=complaint.title.strip(),
        description=complaint.description.strip(),
        assigned_to_role=complaint.assigned_to_role.strip() or "Admin",
        status="Pending",
        admin_response=None,
        photo_path=complaint.photo_path,
        created_at=now,
        updated_at=now
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "message": "Faculty complaint submitted successfully.",
        "complaint": {
            "id": record.id,
            "title": record.title,
            "category": record.category,
            "description": record.description,
            "assigned_to_role": record.assigned_to_role,
            "status": record.status,
            "photo_path": record.photo_path,
            "created_at": record.created_at
        }
    }


@app.post("/complaints/upload-photo")
async def upload_complaint_photo(
    faculty_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found.")

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
    }
    suffix = allowed_types.get((file.content_type or "").lower())
    if not suffix:
        raise HTTPException(status_code=400, detail="Only JPG, PNG and WEBP images are allowed.")

    content = await file.read()
    await file.close()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Complaint photo is too large. Maximum size is 8 MB.")

    file_name = f"faculty_complaint_{faculty_id}_{uuid.uuid4().hex}{suffix}"
    (COMPLAINT_UPLOAD_DIR / file_name).write_bytes(content)
    relative_path = f"uploads/complaints/{file_name}"

    return {"success": True, "file_path": relative_path, "file_url": f"/uploads/complaints/{file_name}"}


@app.get("/faculty/{faculty_id}/complaints")
def get_faculty_complaints(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    complaints = db.query(Complaint).filter(
        Complaint.complainant_id == faculty_id,
        Complaint.complainant_role == "Faculty"
    ).order_by(Complaint.id.desc()).all()

    return {
        "success": True,
        "complaints": [
            {
                "id": item.id,
                "category": item.category,
                "title": item.title,
                "description": item.description,
                "assigned_to_role": item.assigned_to_role,
                "status": item.status,
                "admin_response": item.admin_response,
                "photo_path": item.photo_path,
                "created_at": item.created_at,
                "updated_at": item.updated_at
            }
            for item in complaints
        ]
    }


@app.get("/faculty/{faculty_id}/student-complaints")
def get_faculty_student_complaints(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    issues = db.query(CampusIssue).order_by(CampusIssue.id.desc()).all()
    result = []
    for item in issues:
        student = db.query(Student).filter(Student.id == item.student_id).first()
        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "category": item.category,
            "title": item.category,
            "description": item.description,
            "location": item.location,
            "photo_path": item.photo_path,
            "status": item.status,
            "assigned_department": item.assigned_department,
            "created_at": item.created_at,
            "updated_at": item.updated_at
        })

    return {"success": True, "complaints": result, "read_only": True}


@app.get("/admin/complaints")
def admin_get_faculty_complaints(db: Session = Depends(get_db)):
    complaints = db.query(Complaint).order_by(Complaint.id.desc()).all()
    result = []
    for item in complaints:
        faculty = db.query(Faculty).filter(Faculty.id == item.complainant_id).first()
        result.append({
            "id": item.id,
            "complainant_id": item.complainant_id,
            "complainant_name": faculty.name if faculty else "Unknown",
            "complainant_role": item.complainant_role,
            "category": item.category,
            "title": item.title,
            "description": item.description,
            "assigned_to_role": item.assigned_to_role,
            "status": item.status,
            "admin_response": item.admin_response,
            "photo_path": item.photo_path,
            "created_at": item.created_at,
            "updated_at": item.updated_at
        })
    return {"success": True, "complaints": result}


@app.put("/admin/complaints/{complaint_id}/update")
def admin_update_faculty_complaint(
    complaint_id: int,
    update: ComplaintUpdate,
    db: Session = Depends(get_db)
):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        return {"success": False, "message": "Complaint not found."}

    allowed_statuses = {"Pending", "In Progress", "Resolved", "Rejected"}
    if update.status not in allowed_statuses:
        return {"success": False, "message": "Invalid complaint status."}

    complaint.status = update.status
    if update.assigned_to_role is not None:
        complaint.assigned_to_role = update.assigned_to_role.strip() or None
    if update.admin_response is not None:
        complaint.admin_response = update.admin_response.strip() or None
    complaint.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()
    db.refresh(complaint)

    return {
        "success": True,
        "message": "Faculty complaint updated successfully.",
        "complaint": {
            "id": complaint.id,
            "status": complaint.status,
            "assigned_to_role": complaint.assigned_to_role,
            "admin_response": complaint.admin_response,
            "updated_at": complaint.updated_at
        }
    }


@app.put("/campus-issues/{issue_id}/update")
def update_campus_issue(
    issue_id: int,
    status: str,
    assigned_department: Optional[str] = None,
    db: Session = Depends(get_db)
):
    issue = db.query(CampusIssue).filter(CampusIssue.id == issue_id).first()

    if not issue:
        return {"success": False, "message": "Campus issue not found."}

    issue.status = status
    if assigned_department is not None:
        issue.assigned_department = assigned_department

    issue.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.commit()

    return {
        "success": True,
        "message": "Campus issue updated successfully.",
        "issue": {
            "id": issue.id,
            "status": issue.status,
            "assigned_department": issue.assigned_department,
            "updated_at": issue.updated_at
        }
    }


# =====================================================
# CERTIFICATES
# =====================================================

@app.post("/certificates/upload")
def upload_certificate_file(
    file: UploadFile = File(...),
    student_id: int = Form(...),
    uploaded_by_role: str = Form("Student"),
    uploaded_by_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Upload only the proof file.

    The file itself is saved to backend/uploads/certificates/.
    The metadata record is created later by /certificates or the faculty
    certificate endpoint.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    normalized_role = uploaded_by_role.strip().lower()

    if normalized_role == "student":
        uploader = db.query(Student).filter(Student.id == uploaded_by_id).first()
        if not uploader:
            raise HTTPException(status_code=404, detail="Uploading student was not found.")
        if uploader.id != student.id:
            raise HTTPException(status_code=403, detail="A student can upload only their own certificate proof.")

    elif normalized_role == "faculty":
        uploader = db.query(Faculty).filter(Faculty.id == uploaded_by_id).first()
        if not uploader:
            raise HTTPException(status_code=404, detail="Uploading faculty member was not found.")

    elif normalized_role == "admin":
        uploader = db.query(Admin).filter(Admin.id == uploaded_by_id).first()
        if not uploader:
            raise HTTPException(status_code=404, detail="Uploading Admin was not found.")
    else:
        raise HTTPException(status_code=400, detail="uploaded_by_role must be Student, Faculty or Admin.")

    suffix = verify_uploaded_file_name_and_type(file)

    # 10 MB maximum file size.
    max_size = 10 * 1024 * 1024
    total_size = 0
    file_name = f"certificate_{student_id}_{uuid.uuid4().hex}{suffix}"
    target_path = CERTIFICATE_UPLOAD_DIR / file_name

    try:
        with target_path.open("wb") as output_file:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break

                total_size += len(chunk)
                if total_size > max_size:
                    output_file.close()
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail="Certificate file is too large. Maximum size is 10 MB."
                    )

                output_file.write(chunk)
    finally:
        file.file.close()

    relative_path = f"uploads/certificates/{file_name}"
    file_url = f"/uploads/certificates/{file_name}"

    return {
        "success": True,
        "message": "Certificate file uploaded successfully.",
        "file_path": relative_path,
        "file_url": file_url,
        "file_name": file.filename,
        "file_size": total_size,
        "content_type": file.content_type
    }


@app.post("/certificates")
def add_certificate(certificate: CertificateCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == certificate.student_id).first()

    if not student:
        return {"success": False, "message": "Student not found."}

    role = certificate.uploaded_by_role.strip().title()
    if role not in {"Student", "Faculty", "Admin"}:
        return {"success": False, "message": "Invalid certificate uploader role."}

    if role == "Student":
        if certificate.uploaded_by_id not in (None, certificate.student_id):
            return {"success": False, "message": "A student can add only their own certificate."}
        uploader_id = certificate.uploaded_by_id or certificate.student_id
    elif role == "Faculty":
        uploader = db.query(Faculty).filter(Faculty.id == certificate.uploaded_by_id).first() if certificate.uploaded_by_id else None
        if not uploader:
            return {"success": False, "message": "Faculty uploader not found."}
        uploader_id = uploader.id
    else:
        uploader = db.query(Admin).filter(Admin.id == certificate.uploaded_by_id).first() if certificate.uploaded_by_id else None
        if not uploader:
            return {"success": False, "message": "Admin uploader not found."}
        uploader_id = uploader.id

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    new_certificate = Certificate(
        student_id=certificate.student_id,
        title=certificate.title.strip(),
        certificate_type=certificate.certificate_type.strip(),
        file_path=certificate.file_path,
        uploaded_by_role=role,
        uploaded_by_id=uploader_id,
        issued_by=certificate.issued_by,
        certificate_date=certificate.certificate_date,
        created_at=current_time
    )

    db.add(new_certificate)
    db.commit()
    db.refresh(new_certificate)

    return {
        "success": True,
        "message": "Certificate added successfully.",
        "certificate": {
            "id": new_certificate.id,
            "student_id": new_certificate.student_id,
            "title": new_certificate.title,
            "certificate_type": new_certificate.certificate_type,
            "file_path": new_certificate.file_path,
            "uploaded_by_role": new_certificate.uploaded_by_role,
            "uploaded_by_id": new_certificate.uploaded_by_id,
            "issued_by": new_certificate.issued_by,
            "certificate_date": new_certificate.certificate_date,
            "created_at": new_certificate.created_at
        }
    }


@app.get("/students/{student_id}/certificates")
def get_student_certificates(student_id: int, db: Session = Depends(get_db)):
    certificates = (
        db.query(Certificate)
        .filter(Certificate.student_id == student_id)
        .order_by(Certificate.id.desc())
        .all()
    )

    return {
        "success": True,
        "student_id": student_id,
        "certificates": [
            {
                "id": item.id,
                "title": item.title,
                "certificate_type": item.certificate_type,
                "file_path": item.file_path,
                "file_url": (
                    "/" + item.file_path.lstrip("/")
                    if item.file_path and not item.file_path.startswith("http")
                    else item.file_path
                ),
                "uploaded_by_role": item.uploaded_by_role,
                "uploaded_by_id": item.uploaded_by_id,
                "issued_by": item.issued_by,
                "certificate_date": item.certificate_date,
                "created_at": item.created_at
            }
            for item in certificates
        ]
    }


# =====================================================
# FEES
# =====================================================

@app.post("/fees")
def add_fee(fee: FeeCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == fee.student_id).first()
    if not student:
        return {"success": False, "message": "Student not found."}
    if fee.paid_amount < 0 or fee.total_amount < 0:
        return {"success": False, "message": "Fee amounts cannot be negative."}

    financials = fee_financials(fee.total_amount, fee.paid_amount)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_fee = Fee(
        student_id=fee.student_id,
        semester=fee.semester.strip(),
        fee_type=fee.fee_type.strip(),
        total_amount=fee.total_amount,
        paid_amount=fee.paid_amount,
        pending_amount=financials["pending_amount"],
        status=financials["status"],
        due_date=fee.due_date,
        created_at=now,
        updated_at=now
    )
    db.add(new_fee)
    db.commit()
    db.refresh(new_fee)
    return {
        "success": True,
        "message": "Fee record added successfully.",
        "fee": {
            "id": new_fee.id,
            "student_id": new_fee.student_id,
            "semester": new_fee.semester,
            "fee_type": new_fee.fee_type,
            "total_amount": new_fee.total_amount,
            "paid_amount": new_fee.paid_amount,
            "pending_amount": financials["pending_amount"],
            "overpaid_amount": financials["overpaid_amount"],
            "status": financials["status"],
            "due_date": new_fee.due_date
        }
    }


# =====================================================
# ADMIN CERTIFICATE MANAGEMENT
# =====================================================

@app.get("/admin/certificates")
def admin_get_certificates(db: Session = Depends(get_db)):
    records = db.query(Certificate).order_by(Certificate.id.desc()).all()
    result = []
    for item in records:
        student = db.query(Student).filter(Student.id == item.student_id).first()
        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "title": item.title,
            "certificate_type": item.certificate_type,
            "file_path": item.file_path,
            "uploaded_by_role": item.uploaded_by_role,
            "issued_by": item.issued_by,
            "certificate_date": item.certificate_date,
            "created_at": item.created_at
        })
    return {"success": True, "certificates": result}


@app.post("/admin/certificates")
def admin_add_certificate(certificate: CertificateCreate, db: Session = Depends(get_db)):
    certificate.uploaded_by_role = "Admin"
    certificate.uploaded_by_id = certificate.uploaded_by_id
    return add_certificate(certificate, db)


@app.delete("/admin/certificates/{certificate_id}")
def admin_delete_certificate(certificate_id: int, db: Session = Depends(get_db)):
    record = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not record:
        return {"success": False, "message": "Certificate not found."}
    db.delete(record)
    db.commit()
    return {"success": True, "message": "Certificate deleted successfully."}


# =====================================================
# ADMIN FEE MANAGEMENT
# =====================================================

@app.get("/admin/fees")
def admin_get_fees(db: Session = Depends(get_db)):
    records = db.query(Fee).order_by(Fee.id.desc()).all()
    result = []
    for item in records:
        student = db.query(Student).filter(Student.id == item.student_id).first()
        financials = fee_financials(item.total_amount, item.paid_amount)
        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "semester": item.semester,
            "fee_type": item.fee_type,
            "total_amount": item.total_amount,
            "paid_amount": item.paid_amount,
            "pending_amount": financials["pending_amount"],
            "overpaid_amount": financials["overpaid_amount"],
            "status": financials["status"],
            "due_date": item.due_date,
            "updated_at": item.updated_at
        })
    return {"success": True, "fees": result}


class AdminFeeUpdate(BaseModel):
    semester: Optional[str] = None
    fee_type: Optional[str] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    due_date: Optional[str] = None


@app.put("/admin/fees/{fee_id}")
def admin_update_fee(fee_id: int, update: AdminFeeUpdate, db: Session = Depends(get_db)):
    fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if not fee:
        return {"success": False, "message": "Fee record not found."}

    total = fee.total_amount if update.total_amount is None else float(update.total_amount)
    paid = fee.paid_amount if update.paid_amount is None else float(update.paid_amount)
    if total < 0 or paid < 0:
        return {"success": False, "message": "Fee amounts cannot be negative."}

    financials = fee_financials(total, paid)
    fee.semester = update.semester.strip() if update.semester else fee.semester
    fee.fee_type = update.fee_type.strip() if update.fee_type else fee.fee_type
    fee.total_amount = total
    fee.paid_amount = paid
    fee.pending_amount = financials["pending_amount"]
    fee.status = financials["status"]
    if update.due_date is not None:
        fee.due_date = update.due_date
    fee.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.commit()
    db.refresh(fee)
    return {
        "success": True,
        "message": "Fee record updated successfully.",
        "fee_id": fee.id,
        "status": fee.status,
        "pending_amount": financials["pending_amount"],
        "overpaid_amount": financials["overpaid_amount"]
    }


class FeeCreditTransferRequest(BaseModel):
    target_fee_id: int
    amount: Optional[float] = None


@app.post("/admin/fees/{source_fee_id}/transfer-credit")
def transfer_fee_credit(
    source_fee_id: int,
    transfer: FeeCreditTransferRequest,
    db: Session = Depends(get_db)
):
    source = db.query(Fee).filter(Fee.id == source_fee_id).first()
    target = db.query(Fee).filter(Fee.id == transfer.target_fee_id).first()

    if not source or not target:
        return {"success": False, "message": "Source or target fee record was not found."}
    if source.student_id != target.student_id:
        return {"success": False, "message": "Fee credit can only be transferred between the same student's fee records."}

    available_credit = fee_financials(source.total_amount, source.paid_amount)["overpaid_amount"]
    target_pending = fee_financials(target.total_amount, target.paid_amount)["pending_amount"]
    requested = available_credit if transfer.amount is None else float(transfer.amount)

    if requested <= 0:
        return {"success": False, "message": "Transfer amount must be greater than zero."}
    amount = min(requested, available_credit, target_pending)
    if amount <= 0:
        return {"success": False, "message": "There is no transferable credit or the target fee is already fully paid."}

    source.paid_amount -= amount
    target.paid_amount += amount

    source_financials = fee_financials(source.total_amount, source.paid_amount)
    target_financials = fee_financials(target.total_amount, target.paid_amount)
    source.pending_amount = source_financials["pending_amount"]
    source.status = source_financials["status"]
    target.pending_amount = target_financials["pending_amount"]
    target.status = target_financials["status"]
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    source.updated_at = now
    target.updated_at = now

    db.add(FeeCreditTransfer(
        source_fee_id=source.id,
        target_fee_id=target.id,
        student_id=source.student_id,
        amount=round(amount, 2),
        created_at=now
    ))
    db.commit()

    return {
        "success": True,
        "message": f"₹{amount:.2f} fee credit moved from {source.semester} to {target.semester}.",
        "amount": round(amount, 2),
        "remaining_source_credit": source_financials["overpaid_amount"]
    }


@app.get("/students/{student_id}/fees")
def get_student_fees(student_id: int, db: Session = Depends(get_db)):
    fees = db.query(Fee).filter(Fee.student_id == student_id).order_by(Fee.id.desc()).all()
    credit = fee_credit_balance(db, student_id)
    return {
        "success": True,
        "student_id": student_id,
        "credit_balance": credit,
        "fees": [
            {
                "id": item.id,
                "semester": item.semester,
                "fee_type": item.fee_type,
                "total_amount": item.total_amount,
                "paid_amount": item.paid_amount,
                "pending_amount": fee_financials(item.total_amount, item.paid_amount)["pending_amount"],
                "overpaid_amount": fee_financials(item.total_amount, item.paid_amount)["overpaid_amount"],
                "status": fee_financials(item.total_amount, item.paid_amount)["status"],
                "due_date": item.due_date
            }
            for item in fees
        ]
    }


# =====================================================
# ADMIN NOTICE MANAGEMENT
# =====================================================

@app.get("/admin/notices")
def admin_get_notices(db: Session = Depends(get_db)):
    notices = db.query(Notice).order_by(Notice.id.desc()).all()
    return {
        "success": True,
        "notices": [
            {
                "id": item.id,
                "title": item.title,
                "content": item.content,
                "target_type": item.target_type,
                "target_value": item.target_value,
                "created_at": item.created_at,
                "created_by": item.created_by
            }
            for item in notices
        ]
    }


@app.post("/admin/notices")
def admin_create_notice(notice: FacultyNoticeCreate, db: Session = Depends(get_db)):
    admin = db.query(Admin).first()
    if not admin:
        return {"success": False, "message": "Admin account not found."}

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    record = Notice(
        title=notice.title.strip(),
        content=notice.content.strip(),
        target_type=notice.target_type.strip(),
        target_value=notice.target_value.strip() if notice.target_value else None,
        created_at=now,
        created_by=admin.name
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {"success": True, "message": "Admin notice published successfully.", "notice_id": record.id}


@app.delete("/admin/notices/{notice_id}")
def admin_delete_notice(notice_id: int, db: Session = Depends(get_db)):
    record = db.query(Notice).filter(Notice.id == notice_id).first()
    if not record:
        return {"success": False, "message": "Notice not found."}
    db.delete(record)
    db.commit()
    return {"success": True, "message": "Notice deleted successfully."}


# =====================================================
# ADMIN GATE PASS MONITORING
# =====================================================

@app.get("/admin/gate-passes")
def admin_get_gate_passes(db: Session = Depends(get_db)):
    passes = db.query(GatePass).order_by(GatePass.id.desc()).all()
    result = []
    for item in passes:
        student = db.query(Student).filter(Student.id == item.student_id).first()
        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "reason": item.reason,
            "destination": item.destination,
            "departure_date": item.departure_date,
            "departure_time": item.departure_time,
            "return_date": item.return_date,
            "return_time": item.return_time,
            "status": item.status,
            "current_approver_role": item.current_approver_role,
            "pass_code": item.pass_code,
            "faculty_approved_by_id": item.faculty_approved_by_id,
            "faculty_approved_by_name": item.faculty_approved_by_name,
            "faculty_approved_at": item.faculty_approved_at,
            "warden_approved_by_id": item.warden_approved_by_id,
            "warden_approved_by_name": item.warden_approved_by_name,
            "warden_approved_at": item.warden_approved_at,
            "exit_time": item.exit_time,
            "actual_return_time": item.actual_return_time,
            "created_at": item.created_at
        })
    return {"success": True, "gate_passes": result}


# =====================================================
# ADMIN REPORTS / ANALYTICS
# =====================================================

@app.get("/admin/reports")
def admin_reports(db: Session = Depends(get_db)):
    applications = db.query(Application).all()
    issues = db.query(CampusIssue).all()
    complaints = db.query(Complaint).all()
    gate_passes = db.query(GatePass).all()
    fees = db.query(Fee).all()

    attendance = db.query(Attendance).all()
    total_attended = sum(max(0, item.attended_classes) for item in attendance)
    total_classes = sum(max(0, item.total_classes) for item in attendance)
    attendance_percentage = round((total_attended / total_classes) * 100, 2) if total_classes else 0

    def count_by(records, attribute):
        result = {}
        for record in records:
            key = getattr(record, attribute, None) or "Unknown"
            result[key] = result.get(key, 0) + 1
        return result

    total_fee = round(sum(item.total_amount for item in fees), 2)
    paid_fee = round(sum(item.paid_amount for item in fees), 2)
    pending_fee = round(sum(fee_financials(item.total_amount, item.paid_amount)["pending_amount"] for item in fees), 2)
    overpaid_fee = round(sum(fee_financials(item.total_amount, item.paid_amount)["overpaid_amount"] for item in fees), 2)

    student_departments = {}
    for student in db.query(Student).all():
        department = get_student_department(student.id) or student.course or "Unknown"
        student_departments[department] = student_departments.get(department, 0) + 1

    return {
        "success": True,
        "reports": {
            "applications_by_status": count_by(applications, "status"),
            "applications_by_role": count_by(applications, "applicant_role"),
            "campus_issues_by_status": count_by(issues, "status"),
            "faculty_complaints_by_status": count_by(complaints, "status"),
            "gate_passes_by_status": count_by(gate_passes, "status"),
            "students_by_department": student_departments,
            "total_attended_classes": total_attended,
            "total_classes": total_classes,
            "overall_attendance_percentage": attendance_percentage,
            "fee_totals": {
                "total": total_fee,
                "paid": paid_fee,
                "pending": pending_fee,
                "overpaid": overpaid_fee
            }
        }
    }


# =====================================================
# HOSTEL RESIDENT
# =====================================================

@app.post("/hostel/residents")
def add_hostel_resident(resident: HostelResidentCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == resident.student_id).first()

    if not student:
        return {"success": False, "message": "Student not found."}

    existing = db.query(HostelResident).filter(
        HostelResident.student_id == resident.student_id
    ).first()

    if existing:
        existing.hostel_name = resident.hostel_name
        existing.room_number = resident.room_number
        db.commit()
        db.refresh(existing)

        return {
            "success": True,
            "message": "Hostel information updated.",
            "hostel": {
                "student_id": existing.student_id,
                "hostel_name": existing.hostel_name,
                "room_number": existing.room_number
            }
        }

    new_resident = HostelResident(
        student_id=resident.student_id,
        hostel_name=resident.hostel_name,
        room_number=resident.room_number
    )

    db.add(new_resident)
    db.commit()
    db.refresh(new_resident)

    return {
        "success": True,
        "message": "Student added as hostel resident.",
        "hostel": {
            "student_id": new_resident.student_id,
            "hostel_name": new_resident.hostel_name,
            "room_number": new_resident.room_number
        }
    }


# =====================================================
# HOSTEL OUTING / GATE PASS
# =====================================================

@app.post("/hostel/gate-passes")
def create_gate_pass(gate_pass: GatePassCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == gate_pass.student_id).first()
    if not student:
        return {"success": False, "message": "Student not found."}
    resident = db.query(HostelResident).filter(HostelResident.student_id == gate_pass.student_id).first()
    if not resident:
        return {"success": False, "message": "Only hostel students can apply for an outing/gate pass."}

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_gate_pass = GatePass(
        student_id=gate_pass.student_id,
        reason=gate_pass.reason.strip(),
        destination=gate_pass.destination.strip(),
        departure_date=gate_pass.departure_date,
        departure_time=gate_pass.departure_time,
        return_date=gate_pass.return_date,
        return_time=gate_pass.return_time,
        status="Pending Faculty Approval",
        current_approver_role="Faculty",
        current_approver_id=None,
        pass_code=None,
        exit_time=None,
        actual_return_time=None,
        created_at=now,
        updated_at=now
    )
    db.add(new_gate_pass)
    db.commit()
    db.refresh(new_gate_pass)
    return {"success": True, "message": "Gate pass submitted and sent for Faculty approval.", "gate_pass": {"id": new_gate_pass.id, "student_id": new_gate_pass.student_id, "reason": new_gate_pass.reason, "destination": new_gate_pass.destination, "departure_date": new_gate_pass.departure_date, "departure_time": new_gate_pass.departure_time, "return_date": new_gate_pass.return_date, "return_time": new_gate_pass.return_time, "status": new_gate_pass.status, "current_approver_role": new_gate_pass.current_approver_role}}


@app.get("/students/{student_id}/gate-passes")
def get_student_gate_passes(student_id: int, db: Session = Depends(get_db)):
    passes = db.query(GatePass).filter(GatePass.student_id == student_id).order_by(GatePass.id.desc()).all()
    return {"success": True, "student_id": student_id, "gate_passes": [{
        "id": item.id, "reason": item.reason, "destination": item.destination,
        "departure_date": item.departure_date, "departure_time": item.departure_time,
        "return_date": item.return_date, "return_time": item.return_time,
        "status": item.status, "current_approver_role": item.current_approver_role,
        "pass_code": item.pass_code, "exit_time": item.exit_time,
        "actual_return_time": item.actual_return_time,
        "faculty_approved_by_name": item.faculty_approved_by_name,
        "faculty_approved_at": item.faculty_approved_at,
        "warden_approved_by_name": item.warden_approved_by_name,
        "warden_approved_at": item.warden_approved_at,
        "created_at": item.created_at
    } for item in passes]}


@app.put("/hostel/gate-passes/{gate_pass_id}/approve")
def approve_gate_pass(
    gate_pass_id: int,
    approver_role: str = "Faculty",
    approver_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    gate_pass = db.query(GatePass).filter(GatePass.id == gate_pass_id).first()
    if not gate_pass:
        return {"success": False, "message": "Gate pass not found."}
    if not approver_id:
        return {"success": False, "message": "Approver ID is required."}

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if gate_pass.current_approver_role == "Faculty":
        if approver_role.strip().lower() not in {"faculty", "teacher"}:
            return {"success": False, "message": "This stage can only be approved by a Faculty member."}
        faculty = db.query(Faculty).filter(Faculty.id == approver_id).first()
        if not faculty:
            return {"success": False, "message": "Faculty approver not found."}
        gate_pass.faculty_approved_by_id = faculty.id
        gate_pass.faculty_approved_by_name = faculty.name
        gate_pass.faculty_approved_at = now
        gate_pass.current_approver_role = "Warden"
        gate_pass.current_approver_id = None
        gate_pass.status = "Pending Warden Approval"
        gate_pass.updated_at = now
        db.commit()
        return {"success": True, "message": f"Faculty approval recorded for {faculty.name}. Sent to Warden for final approval.", "gate_pass": {"id": gate_pass.id, "status": gate_pass.status, "current_approver_role": gate_pass.current_approver_role}}

    if gate_pass.current_approver_role == "Warden":
        warden = db.query(Faculty).filter(Faculty.id == approver_id).first()
        if not warden:
            return {"success": False, "message": "Warden account not found."}
        hostel_role = get_faculty_hostel_role(warden.id).strip().lower()
        designation = str(warden.designation or "").strip().lower()
        if hostel_role not in {"warden", "assistant warden"} and "warden" not in designation:
            return {"success": False, "message": "Only a designated Warden or Assistant Warden can approve the final stage."}

        gate_pass.warden_approved_by_id = warden.id
        gate_pass.warden_approved_by_name = warden.name
        gate_pass.warden_approved_at = now
        gate_pass.current_approver_role = None
        gate_pass.current_approver_id = warden.id
        gate_pass.status = "Approved"
        gate_pass.pass_code = f"OGP-{gate_pass.id:06d}"
        gate_pass.updated_at = now
        db.commit()
        return {"success": True, "message": f"Gate pass fully approved by Warden {warden.name}.", "gate_pass": {"id": gate_pass.id, "status": gate_pass.status, "pass_code": gate_pass.pass_code}}

    return {"success": False, "message": "This gate pass is not currently awaiting an approval stage."}


@app.put("/hostel/gate-passes/{gate_pass_id}/reject")
def reject_gate_pass(
    gate_pass_id: int,
    approver_role: str = "Faculty",
    approver_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    gate_pass = db.query(GatePass).filter(GatePass.id == gate_pass_id).first()
    if not gate_pass:
        return {"success": False, "message": "Gate pass not found."}
    approver = db.query(Faculty).filter(Faculty.id == approver_id).first() if approver_id else None
    if not approver:
        return {"success": False, "message": "Approver not found."}

    if gate_pass.current_approver_role == "Faculty":
        gate_pass.status = "Rejected by Faculty"
    elif gate_pass.current_approver_role == "Warden":
        hostel_role = get_faculty_hostel_role(approver.id).strip().lower()
        designation = str(approver.designation or "").strip().lower()
        if hostel_role not in {"warden", "assistant warden"} and "warden" not in designation:
            return {"success": False, "message": "Only a designated Warden or Assistant Warden can reject the final stage."}
        gate_pass.status = "Rejected by Warden"
    else:
        return {"success": False, "message": "This gate pass is no longer awaiting approval."}

    gate_pass.current_approver_role = None
    gate_pass.current_approver_id = approver.id
    gate_pass.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.commit()
    return {"success": True, "message": f"Gate pass rejected by {approver.name} ({approver_role}).", "gate_pass_id": gate_pass.id, "status": gate_pass.status}


@app.put("/hostel/gate-passes/{gate_pass_id}/exit")
def mark_gate_pass_exit(gate_pass_id: int, db: Session = Depends(get_db)):
    gate_pass = db.query(GatePass).filter(GatePass.id == gate_pass_id).first()

    if not gate_pass:
        return {"success": False, "message": "Gate pass not found."}

    if gate_pass.status != "Approved":
        return {
            "success": False,
            "message": "Only an approved gate pass can be used for exit."
        }

    gate_pass.exit_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    gate_pass.status = "Out"
    gate_pass.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()

    return {
        "success": True,
        "message": "Student exit recorded.",
        "gate_pass_id": gate_pass.id,
        "exit_time": gate_pass.exit_time,
        "status": gate_pass.status
    }


@app.put("/hostel/gate-passes/{gate_pass_id}/return")
def mark_gate_pass_return(gate_pass_id: int, db: Session = Depends(get_db)):
    gate_pass = db.query(GatePass).filter(GatePass.id == gate_pass_id).first()

    if not gate_pass:
        return {"success": False, "message": "Gate pass not found."}

    gate_pass.actual_return_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    gate_pass.status = "Returned"
    gate_pass.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()

    return {
        "success": True,
        "message": "Student return recorded.",
        "gate_pass_id": gate_pass.id,
        "return_time": gate_pass.actual_return_time,
        "status": gate_pass.status
    }


# ============================================================
# FACULTY MANAGEMENT APIs
# ============================================================

@app.get("/faculty/{faculty_id}")
def get_faculty_profile(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    return {"success": True, "faculty": public_faculty(faculty)}


@app.get("/faculty/{faculty_id}/students")
def get_faculty_students(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    # Keep the current development behavior: faculty can see the available
    # student list. A future course/section mapping can narrow this down.
    students = db.query(Student).all()

    return {
        "success": True,
        "faculty_id": faculty_id,
        "students": [public_student(student) for student in students]
    }


@app.get("/faculty/{faculty_id}/attendance")
def get_faculty_attendance(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    records = db.query(Attendance).all()
    result = []

    for record in records:
        student = db.query(Student).filter(Student.id == record.student_id).first()
        if not student:
            continue

        result.append({
            "id": record.id,
            "student_id": student.id,
            "student_name": student.name,
            "roll_number": student.roll_number,
            "course": student.course,
            "semester": student.semester,
            "subject": record.subject,
            "attended_classes": record.attended_classes,
            "total_classes": record.total_classes,
            "percentage": round(
                (record.attended_classes / record.total_classes) * 100,
                2
            ) if record.total_classes > 0 else 0
        })

    return {"success": True, "attendance": result}


@app.post("/faculty/{faculty_id}/attendance")
def update_faculty_attendance(
    faculty_id: int,
    attendance: FacultyAttendanceUpdate,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    student = db.query(Student).filter(Student.id == attendance.student_id).first()

    if not student:
        return {"success": False, "message": "Student not found."}

    if attendance.attended_classes < 0:
        return {"success": False, "message": "Attended classes cannot be negative."}

    if attendance.total_classes <= 0:
        return {"success": False, "message": "Total classes must be greater than zero."}

    if attendance.attended_classes > attendance.total_classes:
        return {
            "success": False,
            "message": "Attended classes cannot be greater than total classes."
        }

    existing = db.query(Attendance).filter(
        Attendance.student_id == attendance.student_id,
        Attendance.subject == attendance.subject
    ).first()

    if existing:
        existing.attended_classes = attendance.attended_classes
        existing.total_classes = attendance.total_classes
        db.commit()
        db.refresh(existing)
        record = existing
        message = "Attendance updated successfully."
    else:
        record = Attendance(
            student_id=attendance.student_id,
            subject=attendance.subject,
            attended_classes=attendance.attended_classes,
            total_classes=attendance.total_classes
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        message = "Attendance added successfully."

    return {
        "success": True,
        "message": message,
        "attendance": {
            "id": record.id,
            "student_id": record.student_id,
            "subject": record.subject,
            "attended_classes": record.attended_classes,
            "total_classes": record.total_classes,
            "percentage": round(
                (record.attended_classes / record.total_classes) * 100,
                2
            )
        }
    }


@app.get("/faculty/{faculty_id}/timetable")
def get_faculty_timetable(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    records = db.query(Timetable).filter(Timetable.faculty == faculty.name).all()

    return {
        "success": True,
        "timetable": [
            {
                "id": record.id,
                "student_id": record.student_id,
                "day": record.day,
                "subject": record.subject,
                "start_time": record.start_time,
                "end_time": record.end_time,
                "room": record.room,
                "faculty": record.faculty
            }
            for record in records
        ]
    }


@app.post("/faculty/{faculty_id}/timetable")
def create_faculty_timetable(
    faculty_id: int,
    timetable: FacultyTimetableCreate,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    students = db.query(Student).filter(
        Student.course == timetable.course,
        Student.semester == timetable.semester
    ).all()

    if not students:
        return {
            "success": False,
            "message": "No students found for this course and semester."
        }

    created_records = []

    for student in students:
        new_record = Timetable(
            student_id=student.id,
            day=timetable.day,
            subject=timetable.subject,
            start_time=timetable.start_time,
            end_time=timetable.end_time,
            room=timetable.room,
            faculty=faculty.name
        )
        db.add(new_record)
        created_records.append(new_record)

    db.commit()

    return {
        "success": True,
        "message": "Timetable created successfully.",
        "students_updated": len(created_records)
    }


@app.get("/faculty/{faculty_id}/assignments")
def get_faculty_assignments(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    assignments = db.query(Assignment).order_by(Assignment.id.desc()).all()
    extra_rows = db.execute(
        text("SELECT id, submission_path, submission_comment, submitted_at, review_comment, reviewed_at, created_by_faculty_id FROM assignments")
    ).mappings().all()
    extra_by_id = {int(row["id"]): row for row in extra_rows}

    result = []
    for item in assignments:
        student = db.query(Student).filter(Student.id == item.student_id).first()
        extra = extra_by_id.get(item.id, {})
        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown Student",
            "roll_number": student.roll_number if student else "Unknown",
            "semester": student.semester if student else "Unknown",
            "course": student.course if student else "Unknown",
            "subject": item.subject,
            "title": item.title,
            "description": item.description,
            "due_date": item.due_date,
            "status": item.status,
            "submission_path": extra.get("submission_path"),
            "submission_comment": extra.get("submission_comment"),
            "submitted_at": extra.get("submitted_at"),
            "review_comment": extra.get("review_comment"),
            "reviewed_at": extra.get("reviewed_at"),
            "created_by_faculty_id": extra.get("created_by_faculty_id"),
        })

    return {"success": True, "assignments": result}


@app.post("/faculty/{faculty_id}/assignments")
def create_faculty_assignment(
    faculty_id: int,
    assignment: FacultyAssignmentCreate,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    students = db.query(Student).filter(
        Student.course == assignment.course,
        Student.semester == assignment.semester
    ).all()
    if not students:
        return {"success": False, "message": "No students found for this course and semester."}

    created_ids = []
    for student in students:
        new_assignment = Assignment(
            student_id=student.id,
            subject=assignment.subject,
            title=assignment.title,
            description=assignment.description,
            due_date=assignment.due_date,
            status="Pending"
        )
        db.add(new_assignment)
        db.flush()
        created_ids.append(new_assignment.id)

    db.commit()
    if created_ids:
        placeholders = ",".join(str(int(x)) for x in created_ids)
        db.execute(
            text(f"UPDATE assignments SET created_by_faculty_id = :faculty_id WHERE id IN ({placeholders})"),
            {"faculty_id": faculty_id}
        )
        db.commit()

    return {"success": True, "message": "Assignment created successfully.", "students_updated": len(created_ids)}


@app.post("/students/{student_id}/assignments/{assignment_id}/submit")
async def submit_student_assignment(
    student_id: int,
    assignment_id: int,
    comment: str = Form(""),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id,
        Assignment.student_id == student_id
    ).first()
    if not student:
        return {"success": False, "message": "Student not found."}
    if not assignment:
        return {"success": False, "message": "Assignment not found for this student."}

    if not comment.strip() and not file:
        raise HTTPException(status_code=400, detail="Add a submission note or upload your completed assignment file.")

    submission_path = None
    if file:
        allowed = {
            "application/pdf": ".pdf",
            "application/msword": ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "text/plain": ".txt",
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
        }
        suffix = allowed.get((file.content_type or "").lower())
        if not suffix:
            raise HTTPException(status_code=400, detail="Allowed submission files: PDF, DOC, DOCX, TXT, PNG or JPG/JPEG.")
        content = await file.read()
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Assignment file must be 15 MB or smaller.")
        file_name = f"assignment_{assignment_id}_{student_id}_{uuid.uuid4().hex}{suffix}"
        (ASSIGNMENT_UPLOAD_DIR / file_name).write_bytes(content)
        submission_path = f"uploads/assignments/{file_name}"

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        text("""
            UPDATE assignments
            SET status = 'Submitted',
                submission_path = :submission_path,
                submission_comment = :submission_comment,
                submitted_at = :submitted_at,
                review_comment = NULL,
                reviewed_at = NULL
            WHERE id = :assignment_id AND student_id = :student_id
        """),
        {
            "submission_path": submission_path,
            "submission_comment": comment.strip() or None,
            "submitted_at": now,
            "assignment_id": assignment_id,
            "student_id": student_id,
        }
    )
    db.commit()
    return {"success": True, "message": "Assignment submitted successfully. It is now waiting for Faculty review.", "status": "Submitted", "submission_path": submission_path, "submitted_at": now}


class AssignmentReviewRequest(BaseModel):
    status: str
    review_comment: Optional[str] = None


@app.put("/faculty/{faculty_id}/assignments/{assignment_id}/review")
def review_student_assignment(
    faculty_id: int,
    assignment_id: int,
    review: AssignmentReviewRequest,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not faculty:
        return {"success": False, "message": "Faculty member not found."}
    if not assignment:
        return {"success": False, "message": "Assignment not found."}

    allowed_statuses = {"Pending", "Submitted", "Under Review", "Revision Required", "Completed"}
    status = review.status.strip().title()
    if status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid assignment review status.")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        text("""
            UPDATE assignments
            SET status = :status, review_comment = :review_comment, reviewed_at = :reviewed_at
            WHERE id = :assignment_id
        """),
        {"status": status, "review_comment": review.review_comment.strip() if review.review_comment else None, "reviewed_at": now, "assignment_id": assignment_id}
    )
    db.commit()
    return {"success": True, "message": "Assignment status updated successfully.", "status": status, "reviewed_at": now}


@app.get("/faculty/{faculty_id}/applications")
def get_faculty_applications(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    applications = db.query(Application).filter(
        Application.current_approver_role == "Faculty"
    ).order_by(Application.id.desc()).all()

    result = []

    for item in applications:
        student = db.query(Student).filter(Student.id == item.applicant_id).first()

        result.append({
            "id": item.id,
            "student_id": item.applicant_id,
            "applicant_id": item.applicant_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "application_type": item.application_type,
            "title": item.title,
            "description": item.description,
            "start_date": item.start_date,
            "end_date": item.end_date,
            "status": item.status,
            "current_approver_role": item.current_approver_role,
            "created_at": item.created_at
        })

    return {"success": True, "applications": result}


@app.get("/faculty/{faculty_id}/gate-passes")
def get_faculty_gate_passes(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    hostel_role = get_faculty_hostel_role(faculty.id).strip().lower()
    designation = str(faculty.designation or "").strip().lower()
    is_warden = hostel_role in {"warden", "assistant warden"} or "warden" in designation

    if is_warden:
        passes = db.query(GatePass).filter(
            GatePass.current_approver_role.in_(["Faculty", "Warden"])
        ).order_by(GatePass.id.desc()).all()
    else:
        passes = db.query(GatePass).filter(
            GatePass.current_approver_role == "Faculty"
        ).order_by(GatePass.id.desc()).all()

    result = []

    for item in passes:
        student = db.query(Student).filter(Student.id == item.student_id).first()

        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "reason": item.reason,
            "destination": item.destination,
            "departure_date": item.departure_date,
            "departure_time": item.departure_time,
            "return_date": item.return_date,
            "return_time": item.return_time,
            "status": item.status,
            "current_approver_role": item.current_approver_role,
            "pass_code": item.pass_code,
            "faculty_approved_by_name": item.faculty_approved_by_name,
            "faculty_approved_at": item.faculty_approved_at,
            "warden_approved_by_name": item.warden_approved_by_name,
            "warden_approved_at": item.warden_approved_at
        })

    return {"success": True, "gate_passes": result}


@app.post("/faculty/{faculty_id}/notices")
def create_faculty_notice(
    faculty_id: int,
    notice: FacultyNoticeCreate,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    new_notice = Notice(
        title=notice.title.strip(),
        content=notice.content.strip(),
        target_type=notice.target_type.strip(),
        target_value=notice.target_value.strip() if notice.target_value else None,
        created_at=current_time,
        created_by=faculty.name
    )

    db.add(new_notice)
    db.commit()
    db.refresh(new_notice)

    return {
        "success": True,
        "message": "Notice published successfully.",
        "notice": {
            "id": new_notice.id,
            "title": new_notice.title,
            "content": new_notice.content,
            "target_type": new_notice.target_type,
            "target_value": new_notice.target_value,
            "created_at": new_notice.created_at,
            "created_by": new_notice.created_by
        }
    }


# ============================================================
# FACULTY → CERTIFICATES
# ============================================================

@app.post("/faculty/{faculty_id}/certificates")
def issue_faculty_certificate(
    faculty_id: int,
    certificate: FacultyCertificateCreate,
    db: Session = Depends(get_db)
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    student = db.query(Student).filter(Student.id == certificate.student_id).first()

    if not student:
        return {"success": False, "message": "Student not found."}

    # The frontend may omit these fields because the route already identifies
    # the faculty user. We therefore fill them from the authenticated-looking
    # route identity used by the current development app.
    file_path = certificate.file_path
    uploaded_by_id = faculty.id
    issued_by = certificate.issued_by or faculty.name

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    new_certificate = Certificate(
        student_id=certificate.student_id,
        title=certificate.title.strip(),
        certificate_type=certificate.certificate_type.strip(),
        file_path=file_path,
        uploaded_by_role="Faculty",
        uploaded_by_id=uploaded_by_id,
        issued_by=issued_by,
        certificate_date=certificate.certificate_date,
        created_at=current_time
    )

    db.add(new_certificate)
    db.commit()
    db.refresh(new_certificate)

    return {
        "success": True,
        "message": "Certificate issued successfully.",
        "certificate": {
            "id": new_certificate.id,
            "student_id": new_certificate.student_id,
            "title": new_certificate.title,
            "certificate_type": new_certificate.certificate_type,
            "file_path": new_certificate.file_path,
            "uploaded_by_role": new_certificate.uploaded_by_role,
            "uploaded_by_id": new_certificate.uploaded_by_id,
            "issued_by": new_certificate.issued_by,
            "certificate_date": new_certificate.certificate_date,
            "created_at": new_certificate.created_at
        }
    }


# Faculty can view student complaints/issues but not modify them.
@app.get("/faculty/{faculty_id}/campus-issues")
def get_faculty_campus_issues(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    issues = db.query(CampusIssue).order_by(CampusIssue.id.desc()).all()

    result = []
    for item in issues:
        student = db.query(Student).filter(Student.id == item.student_id).first()

        result.append({
            "id": item.id,
            "student_id": item.student_id,
            "student_name": student.name if student else "Unknown",
            "roll_number": student.roll_number if student else "Unknown",
            "category": item.category,
            "description": item.description,
            "location": item.location,
            "photo_path": item.photo_path,
            "status": item.status,
            "assigned_department": item.assigned_department,
            "created_at": item.created_at,
            "updated_at": item.updated_at
        })

    return {"success": True, "issues": result, "read_only": True}


# ============================================================
# FACULTY → PENDING ACTIONS
# ============================================================

@app.get("/faculty/{faculty_id}/pending-actions")
def get_faculty_pending_actions(faculty_id: int, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()

    if not faculty:
        return {"success": False, "message": "Faculty member not found."}

    pending_applications = db.query(Application).filter(
        Application.current_approver_role == "Faculty"
    ).count()

    hostel_role = get_faculty_hostel_role(faculty.id).strip().lower()
    designation = str(faculty.designation or "").strip().lower()
    if hostel_role in {"warden", "assistant warden"} or "warden" in designation:
        pending_gate_passes = db.query(GatePass).filter(
            GatePass.current_approver_role.in_(["Faculty", "Warden"])
        ).count()
    else:
        pending_gate_passes = db.query(GatePass).filter(
            GatePass.current_approver_role == "Faculty"
        ).count()

    return {
        "success": True,
        "pending_actions": {
            "applications": pending_applications,
            "gate_passes": pending_gate_passes,
            "total": pending_applications + pending_gate_passes
        }
    }


# =========================================================
# OMNI360 LOCAL AI ASSISTANT
# =========================================================

class AIChatRequest(BaseModel):
    question: str


class AIStudentChatRequest(BaseModel):
    student_id: int
    question: str


def _money(value: float) -> str:
    return f"₹{float(value or 0):,.2f}"


def _fee_snapshot(db: Session, student_id: int):
    """Read the student's fee records and calculate financial values from source fields."""
    records = db.query(Fee).filter(Fee.student_id == student_id).order_by(Fee.id.desc()).all()
    rows = []
    total = 0.0
    paid = 0.0
    pending = 0.0
    credit = 0.0

    for item in records:
        financials = fee_financials(item.total_amount, item.paid_amount)
        total += float(item.total_amount or 0)
        paid += float(item.paid_amount or 0)
        pending += financials["pending_amount"]
        credit += financials["overpaid_amount"]
        rows.append({
            "id": item.id,
            "semester": item.semester,
            "fee_type": item.fee_type,
            "total_amount": round(float(item.total_amount or 0), 2),
            "paid_amount": round(float(item.paid_amount or 0), 2),
            "pending_amount": financials["pending_amount"],
            "overpaid_amount": financials["overpaid_amount"],
            "status": financials["status"],
            "due_date": item.due_date,
        })

    return rows, {
        "total": round(total, 2),
        "paid": round(paid, 2),
        "pending": round(pending, 2),
        "credit": round(credit, 2),
    }


def _is_fee_question(question: str) -> bool:
    q = question.lower()
    fee_words = [
        "fee", "fees", "tuition", "payment", "paid", "pending",
        "due date", "due", "credit", "overpaid", "overpayment"
    ]
    return any(word in q for word in fee_words)


def _deterministic_fee_answer(question: str, records: list[dict], totals: dict) -> str:
    """Return exact fee answers for common financial questions without model arithmetic."""
    q = question.lower()

    if not records:
        return "No fee records are available for your account in the database."

    if "overpaid" in q or "overpayment" in q:
        if totals["credit"] > 0:
            return f"You currently have {_money(totals['credit'])} in fee credit/overpayment."
        return "You currently have no fee credit or overpayment recorded."

    if "credit" in q:
        return f"Your current recorded fee credit balance is {_money(totals['credit'])}."

    if "pending" in q:
        pending_rows = [r for r in records if r["pending_amount"] > 0]
        if not pending_rows:
            return "You have no pending fee amount recorded."
        lines = [f"Total pending fee: {_money(totals['pending'])}."]
        lines.extend(
            f"- {r['semester']} — {r['fee_type']}: {_money(r['pending_amount'])} pending"
            for r in pending_rows
        )
        return "\n".join(lines)

    if "how much" in q and "paid" in q:
        return f"You have paid {_money(totals['paid'])} in total across your recorded fee records."

    if "how much" in q and ("total fee" in q or "total fees" in q):
        return f"Your total recorded fee amount is {_money(totals['total'])}."

    if "total fee" in q or "total fees" in q:
        return f"Your total recorded fee amount is {_money(totals['total'])}, of which {_money(totals['paid'])} is paid and {_money(totals['pending'])} is pending."

    if "due" in q:
        due_rows = [r for r in records if r.get("due_date")]
        if not due_rows:
            return "No fee due date is recorded in the database."
        return "Fee due dates in your records:\n" + "\n".join(
            f"- {r['semester']} — {r['fee_type']}: {r['due_date']} ({r['status']})"
            for r in due_rows
        )

    if "details" in q or "show" in q or "list" in q or "status" in q:
        lines = ["Your recorded fee details:"]
        for r in records:
            due = f", due {r['due_date']}" if r.get("due_date") else ""
            lines.append(
                f"- {r['semester']} — {r['fee_type']}: total {_money(r['total_amount'])}, "
                f"paid {_money(r['paid_amount'])}, pending {_money(r['pending_amount'])}, "
                f"status {r['status']}{due}"
            )
        lines.append(f"Overall credit balance: {_money(totals['credit'])}.")
        return "\n".join(lines)

    return None


def _gate_pass_approval_answer(question: str, gate_pass_records: list[dict]) -> str | None:
    q = question.lower()
    approval_terms = [
        "who approved", "who has approved", "who needs to approve",
        "approval", "approved my gate pass", "gate pass approved"
    ]
    if not any(term in q for term in approval_terms):
        return None
    if not gate_pass_records:
        return "No gate-pass record is available for your account."

    record = gate_pass_records[0]
    status = str(record.get("status") or "Unknown")
    faculty_name = record.get("faculty_approved_by_name")
    warden_name = record.get("warden_approved_by_name")

    if status in {"Approved", "Out", "Returned"}:
        if faculty_name and warden_name:
            return f"Your gate pass has completed all required approval stages. Faculty approval: {faculty_name}. Warden approval: {warden_name}. Current status: {status}."
        return f"Your gate pass has completed all required approval stages and is currently marked '{status}'. However, the names of the Faculty and Warden approvers are not recorded in the current database record."

    if status == "Pending Faculty Approval":
        return "Your gate pass is currently waiting for Faculty approval."

    if status == "Pending Warden Approval":
        if faculty_name:
            return f"Faculty approval has been completed by {faculty_name}. The gate pass is now waiting for Warden approval."
        return "Faculty approval has been completed, but the Faculty approver name is not recorded. The gate pass is now waiting for Warden approval."

    if status in {"Rejected by Faculty", "Rejected by Warden"}:
        return f"Your gate pass status is '{status}'. No further approval is pending."

    return f"Your gate pass status is '{status}'. The current approval stage cannot be determined further from the database record."


def _attendance_answer(question: str, attendance_records: list[dict]) -> str | None:
    q = question.lower()
    if not any(word in q for word in ["attendance", "attended", "classes attended"]):
        return None
    if not attendance_records:
        return "No attendance records are available for your account."

    lines = ["Your attendance is as follows:"]
    for r in attendance_records:
        attended = int(r["attended_classes"])
        total = int(r["total_classes"])
        if total <= 0 or attended < 0 or attended > total:
            lines.append(f"- {r['subject']}: INVALID DATA - {attended} attended out of {total} total classes. This record needs verification by faculty or admin.")
        else:
            percentage = round((attended / total) * 100, 1)
            lines.append(f"- {r['subject']}: {attended}/{total} classes attended ({percentage}%).")
    return "\n".join(lines)


def build_student_ai_context(db: Session, student_id: int) -> tuple[str, dict]:
    """Build trusted read-only context for the logged-in student."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    attendance_records = []
    for item in db.query(Attendance).filter(Attendance.student_id == student_id).order_by(Attendance.id).all():
        attendance_records.append({
            "id": item.id, "subject": item.subject,
            "attended_classes": item.attended_classes,
            "total_classes": item.total_classes,
        })

    timetable_records = []
    for item in db.query(Timetable).filter(Timetable.student_id == student_id).order_by(Timetable.id).all():
        timetable_records.append({
            "day": item.day, "subject": item.subject,
            "start_time": item.start_time, "end_time": item.end_time,
            "room": item.room, "faculty": item.faculty,
            "course": item.course, "semester": item.semester,
        })

    assignment_records = []
    for item in db.query(Assignment).filter(Assignment.student_id == student_id).order_by(Assignment.id.desc()).all():
        assignment_records.append({
            "id": item.id, "subject": item.subject, "title": item.title,
            "description": item.description, "due_date": item.due_date,
            "status": item.status,
        })

    application_records = []
    for item in db.query(Application).filter(Application.applicant_id == student_id, Application.applicant_role == "Student").order_by(Application.id.desc()).all():
        application_records.append({
            "id": item.id, "application_type": item.application_type,
            "title": item.title, "description": item.description,
            "start_date": item.start_date, "end_date": item.end_date,
            "status": item.status, "current_approver_role": item.current_approver_role,
        })

    gate_pass_records = []
    for item in db.query(GatePass).filter(GatePass.student_id == student_id).order_by(GatePass.id.desc()).all():
        gate_pass_records.append({
            "id": item.id, "reason": item.reason, "destination": item.destination,
            "departure_date": item.departure_date, "departure_time": item.departure_time,
            "return_date": item.return_date, "return_time": item.return_time,
            "status": item.status, "current_approver_role": item.current_approver_role,
            "pass_code": item.pass_code, "exit_time": item.exit_time,
            "actual_return_time": item.actual_return_time,
            "faculty_approved_by_name": item.faculty_approved_by_name,
            "faculty_approved_at": item.faculty_approved_at,
            "warden_approved_by_name": item.warden_approved_by_name,
            "warden_approved_at": item.warden_approved_at,
        })

    fee_records, fee_totals = _fee_snapshot(db, student_id)

    certificate_records = []
    for item in db.query(Certificate).filter(Certificate.student_id == student_id).order_by(Certificate.id.desc()).all():
        certificate_records.append({
            "title": item.title, "certificate_type": item.certificate_type,
            "issued_by": item.issued_by, "certificate_date": item.certificate_date,
            "created_at": item.created_at,
        })

    # Relevant notices: global notices plus course/semester-targeted notices.
    department = get_student_department(student_id) or student.course
    notice_records = []
    for item in db.query(Notice).order_by(Notice.id.desc()).all():
        target = str(item.target_type or "All").strip().lower()
        target_value = str(item.target_value or "").strip().lower()
        relevant = target in {"all", "student", "students"}
        if target in {"course", "department", "semester"}:
            value = {"course": student.course, "department": department, "semester": student.semester}.get(target, "")
            relevant = target_value == str(value or "").strip().lower()
        if relevant:
            notice_records.append({
                "title": item.title, "content": item.content,
                "target_type": item.target_type, "target_value": item.target_value,
                "created_at": item.created_at, "created_by": item.created_by,
            })

    hostel_records = []
    for item in db.query(HostelResident).filter(HostelResident.student_id == student_id).all():
        hostel_records.append({"hostel_name": item.hostel_name, "room_number": item.room_number})

    campus_issue_records = []
    for item in db.query(CampusIssue).filter(CampusIssue.student_id == student_id).order_by(CampusIssue.id.desc()).all():
        campus_issue_records.append({
            "category": item.category, "description": item.description,
            "location": item.location, "status": item.status,
            "assigned_department": item.assigned_department,
            "created_at": item.created_at, "updated_at": item.updated_at,
        })

    context = f"""
READ-ONLY STUDENT RECORD
Student ID: {student.id}
Student Name: {student.name}
Roll Number: {student.roll_number}
Course: {student.course}
Semester: {student.semester}
Department: {department}
Email: {student.email}

ATTENDANCE:
{json.dumps(attendance_records, ensure_ascii=False, indent=2)}

TIMETABLE:
{json.dumps(timetable_records, ensure_ascii=False, indent=2)}

ASSIGNMENTS:
{json.dumps(assignment_records, ensure_ascii=False, indent=2)}

APPLICATIONS / LEAVE:
{json.dumps(application_records, ensure_ascii=False, indent=2)}

GATE PASSES:
{json.dumps(gate_pass_records, ensure_ascii=False, indent=2)}

FEES:
{json.dumps({"records": fee_records, "totals": fee_totals}, ensure_ascii=False, indent=2)}

CERTIFICATES:
{json.dumps(certificate_records, ensure_ascii=False, indent=2)}

RELEVANT NOTICES:
{json.dumps(notice_records, ensure_ascii=False, indent=2)}

HOSTEL:
{json.dumps(hostel_records, ensure_ascii=False, indent=2)}

CAMPUS ISSUES:
{json.dumps(campus_issue_records, ensure_ascii=False, indent=2)}

IMPORTANT: This context is read-only. Do not change, infer, fabricate or replace database data.
""".strip()

    return context, {
        "student": student,
        "attendance_records": attendance_records,
        "timetable_records": timetable_records,
        "assignment_records": assignment_records,
        "application_records": application_records,
        "gate_pass_records": gate_pass_records,
        "fee_records": fee_records,
        "fee_totals": fee_totals,
    }


@app.post("/ai/chat")
def ai_chat(data: AIChatRequest):
    """General campus AI endpoint without access to personal database records."""
    question = data.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")
    try:
        answer = ask_omni_ai(question, trusted_context="General Omni360 campus assistant. No personal database records are available.")
        return {"success": True, "question": question, "answer": answer}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/ai/student-chat")
def ai_student_chat(data: AIStudentChatRequest, db: Session = Depends(get_db)):
    """Database-aware, read-only AI chat for one authenticated Student identity."""
    question = data.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    context, snapshot = build_student_ai_context(db, data.student_id)

    # Deterministic answers protect important database-derived values.
    fee_answer = _deterministic_fee_answer(question, snapshot["fee_records"], snapshot["fee_totals"]) if _is_fee_question(question) else None
    if fee_answer:
        return {"success": True, "student_id": data.student_id, "question": question, "answer": fee_answer}

    gate_answer = _gate_pass_approval_answer(question, snapshot["gate_pass_records"])
    if gate_answer:
        return {"success": True, "student_id": data.student_id, "question": question, "answer": gate_answer}

    attendance_answer = _attendance_answer(question, snapshot["attendance_records"])
    if attendance_answer and ("what is my attendance" in question.lower() or "my attendance" in question.lower()):
        return {"success": True, "student_id": data.student_id, "question": question, "answer": attendance_answer}

    try:
        answer = ask_omni_ai(question, trusted_context=context, student_name=snapshot["student"].name)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"success": True, "student_id": data.student_id, "question": question, "answer": answer}
