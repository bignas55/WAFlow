from fastapi import APIRouter, HTTPException
from models.schemas import GenerateRequest, GenerationResponse
from services.ai_service import generate_content_from_scripture
from services.audio_service import generate_audio
from services.video_service import generate_video
from services.storage_service import save_generation

router = APIRouter()

@router.post("/generate", response_model=GenerationResponse)
async def generate_content(request: GenerateRequest):
    try:
        # 1. Generate core content using AI
        content = generate_content_from_scripture(request.scripture)
        
        # 2. Generate Audio (narrating the explanation + scenes)
        narration_text = f"{content['explanation']} " + " ".join([s['text'] for s in content['scenes']])
        audio_url = await generate_audio(narration_text)
        
        # 3. Generate Video
        video_url = await generate_video(content['scenes'], audio_url) if audio_url else None
        
        # 4. Save record
        record = save_generation(
            scripture=request.scripture,
            data=content,
            audio_path=audio_url,
            video_path=video_url
        )
        
        return GenerationResponse(
            explanation=content['explanation'],
            scenes=content['scenes'],
            application=content['application'],
            caption=content['caption'],
            audio_url=audio_url,
            video_url=video_url,
            id=record['id']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
