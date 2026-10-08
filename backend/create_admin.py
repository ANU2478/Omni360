from passlib.context import CryptContext

from backend.database.database import Base, SessionLocal, engine
from backend.models.admin import Admin

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    existing = db.query(Admin).filter(Admin.email == "admin@omni360.local").first()
    if existing:
        print("Admin already exists:", existing.email)
    else:
        admin = Admin(
            name="Omni360 Administrator",
            email="admin@omni360.local",
            department="Administration",
            password_hash=pwd_context.hash("Admin@12345"),
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("Created demo Admin: admin@omni360.local / Admin@12345")
finally:
    db.close()
