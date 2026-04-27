import edge_tts
import os
import uuid
from typing import Optional

async def generate_audio(text: str, voice: str = "en-US-GuyNeural") -> Optional[str]:
    """
    Converts text to an MP3 audio file using Microsoft Edge TTS.
    Returns the relative path to the generated audio file.
    """
    try:
        # Resolve the output directory
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../outputs"))
        audio_dir = os.path.join(base_dir, "audio")
        os.makedirs(audio_dir, exist_ok=True)

        filename = f"{uuid.uuid4()}.mp3"
        file_path = os.path.join(audio_dir, filename)

        # Generate audio
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(file_path)

        # Return relative URL path for the frontend
        return f"/outputs/audio/{filename}"
    except Exception as e:
        print(f"Error generating audio: {e}")
        return None
