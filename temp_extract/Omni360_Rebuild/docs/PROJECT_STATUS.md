# Omni360 Rebuild — Current Baseline

This rebuild recreates the working Omni360 backend/frontend baseline stored in the project references and adds the database-aware local AI layer.

## Implemented in this rebuild

- React + Vite frontend
- FastAPI backend
- SQLAlchemy + SQLite
- Student / Faculty / Admin authentication baseline
- Student academic modules
- Faculty management modules
- Admin management modules
- Attendance
- Timetable
- Assignments + submission/review workflow
- Applications / Leave
- Gate pass Faculty -> Warden approval workflow
- Certificates
- Notices
- Campus issues / complaints
- Hostel resident / gate pass functionality
- Fee management with pending/paid/credit calculations
- Ollama + Qwen3:4b local AI service
- Database-aware `/ai/student-chat`
- Deterministic AI answers for fee calculations, gate-pass approval questions and attendance summaries
- Student AI chat UI

## Important

The rebuild starts with a new SQLite file in this folder. It does not modify or depend on the previous Omni360 database.

The exact production data from the old project is not automatically copied because doing so could overwrite or mix database state.

Parent login, biometric login, facial recognition, fingerprint authentication and larger future modules are documented in the project plan but are not falsely marked as implemented here.
