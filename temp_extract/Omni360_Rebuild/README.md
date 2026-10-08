# Omni360 Rebuild

A clean rebuild of the Omni360 Community Digital Assistant.

## Backend

From the `Omni360_Rebuild` folder:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m backend.create_admin
python -m uvicorn backend.main:app --reload
```

Backend docs:
`http://127.0.0.1:8000/docs`

## Ollama AI

Install Ollama separately and make sure the local model is available:

```powershell
ollama pull qwen3:4b
ollama run qwen3:4b
```

The API uses the local Ollama service at `http://127.0.0.1:11434`.

## Frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite normally serves the frontend at:
`http://localhost:5173`

## Demo Admin

The seed helper creates:

Email: `admin@omni360.local`
Password: `Admin@12345`

Change this for any real deployment.

## Database

The SQLite database is created as:
`Omni360_Rebuild/omni360.db`

It is intentionally separate from any earlier Omni360 database.
