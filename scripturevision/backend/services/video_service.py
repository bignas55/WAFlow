import os
import uuid
from typing import List, Optional
from moviepy.editor import (
    TextClip, 
    AudioFileClip, 
    ColorClip, 
    CompositeVideoClip, 
    concatenate_videoclips
)
from moviepy.config import change_settings

# Ensure MoviePy finds ImageMagick (essential for TextClip on Mac/Homebrew)
# Homebrew installs 'magick' or 'convert' as a symlink
change_settings({"IMAGEMAGICK_BINARY": "/opt/homebrew/bin/magick"})

async def generate_video(
    scenes: List[dict], 
    audio_path: str, 
    output_filename: Optional[str] = None
) -> Optional[str]:
    """
    Synthesizes a 9:16 vertical video with text overlays synchronized with audio.
    """
    try:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
        abs_audio_path = os.path.join(base_dir, audio_path.lstrip("/"))
        
        # Verify audio exists
        if not os.path.exists(abs_audio_path):
            print(f"Audio file not found: {abs_audio_path}")
            return None

        audio = AudioFileClip(abs_audio_path)
        duration = audio.duration
        
        # Video settings (Vertical 9:16)
        width, height = 720, 1280
        fps = 24

        # Create a basic background (Indigo/Purple theme)
        background = ColorClip(size=(width, height), color=(30, 0, 80)).set_duration(duration)

        # Distribute scenes equally across duration
        # In a real app, we'd use timestamps, but for now we divide duration by scene count
        scene_duration = duration / len(scenes) if scenes else duration
        
        clips = [background]

        for i, scene in enumerate(scenes):
            start_time = i * scene_duration
            
            # Create text clip
            txt_clip = TextClip(
                scene.get("text", ""),
                fontsize=50,
                color='white',
                font='Arial-Bold',
                method='caption',
                size=(width * 0.8, None),
                align='center'
            ).set_start(start_time).set_duration(scene_duration).set_position(('center', 'center'))
            
            clips.append(txt_clip)

        # Combine with audio
        video = CompositeVideoClip(clips).set_audio(audio)

        # Output path
        output_dir = os.path.join(base_dir, "outputs/videos")
        os.makedirs(output_dir, exist_ok=True)
        
        filename = f"{uuid.uuid4()}.mp4" if not output_filename else output_filename
        output_path = os.path.join(output_dir, filename)

        # Render
        video.write_videofile(output_path, fps=fps, codec='libx264', audio_codec='aac')

        return f"/outputs/videos/{filename}"
    except Exception as e:
        print(f"Error generating video: {e}")
        return None
