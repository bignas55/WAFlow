import os
import json
from datetime import datetime
import uuid

def get_outputs_dir() -> str:
    # scripturevision/outputs
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../outputs"))
    return base_dir

def save_generation(scripture: str, data: dict, audio_path: str = None, video_path: str = None) -> dict:
    outputs_dir = get_outputs_dir()
    text_dir = os.path.join(outputs_dir, "text")
    os.makedirs(text_dir, exist_ok=True)
    
    gen_id = str(uuid.uuid4())
    
    record = {
        "id": gen_id,
        "timestamp": datetime.utcnow().isoformat(),
        "input_scripture": scripture,
        "data": data,
        "audio_path": audio_path,
        "video_path": video_path
    }
    
    file_path = os.path.join(text_dir, f"{gen_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2)
        
    return record

def get_history() -> list:
    text_dir = os.path.join(get_outputs_dir(), "text")
    if not os.path.exists(text_dir):
        return []
    
    history = []
    for filename in os.listdir(text_dir):
        if filename.endswith(".json"):
            with open(os.path.join(text_dir, filename), "r", encoding="utf-8") as f:
                history.append(json.load(f))
                
    history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return history

def get_content(gen_id: str) -> dict:
    text_dir = os.path.join(get_outputs_dir(), "text")
    file_path = os.path.join(text_dir, f"{gen_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None
