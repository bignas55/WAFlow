from pydantic import BaseModel
from typing import List, Optional

class GenerateRequest(BaseModel):
    scripture: str

class Scene(BaseModel):
    text: str
    description: str

class GenerationResponse(BaseModel):
    explanation: str
    scenes: List[Scene]
    application: List[str]
    caption: str
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    id: Optional[str] = None
