from fastapi import FastAPI

app = FastAPI(title="Inbox Pilot API", version="0.1.0")

@app.get("/")
def root():
    return {"service": "inbox-pilot-api"}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}
