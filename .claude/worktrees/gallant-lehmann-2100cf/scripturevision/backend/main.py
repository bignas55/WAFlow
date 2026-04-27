from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import generate, history
import os

app = FastAPI(title="ScriptureVision AI", description="AI-powered scripture content generator")

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure output directories exist
OUTPUTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../outputs"))
os.makedirs(os.path.join(OUTPUTS_DIR, "text"), exist_ok=True)
os.makedirs(os.path.join(OUTPUTS_DIR, "audio"), exist_ok=True)
os.makedirs(os.path.join(OUTPUTS_DIR, "videos"), exist_ok=True)

# Include routes
app.include_router(generate.router, prefix="/api")
app.include_router(history.router, prefix="/api")

# Serve static files
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "ScriptureVision AI Backend is running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
