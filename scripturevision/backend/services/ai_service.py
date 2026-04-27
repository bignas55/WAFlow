import ollama
import json
import os
from typing import Dict, Any

def generate_content_from_scripture(scripture: str) -> Dict[str, Any]:
    """
    Transforms a scripture verse into a structured explanation, visual scenes,
    practical applications, and a social media caption.
    """
    model = os.getenv("AI_MODEL", "gemma4:latest")
    
    prompt = f"""
    You are a theological expert and creative content generator. 
    Analyze the following Bible scripture and provide a structured transformation for a multi-modal AI platform.

    Scripture: {scripture}

    Return your response EXCLUSIVELY in the following JSON format:
    {{
      "explanation": "A deep theological and contextual explanation our readers (3-4 sentences).",
      "scenes": [
        {{
          "text": "Short narrative text for Scene 1 (visual narration)",
          "description": "Visual description for an AI image generator for Scene 1"
        }},
        {{
          "text": "Short narrative text for Scene 2 (visual narration)",
          "description": "Visual description for an AI image generator for Scene 2"
        }},
        {{
          "text": "Short narrative text for Scene 3 (visual narration)",
          "description": "Visual description for an AI image generator for Scene 3"
        }}
      ],
      "application": [
        "Practical application 1",
        "Practical application 2",
        "Practical application 3"
      ],
      "caption": "A punchy social media caption with relevant hashtags."
    }}

    Rules:
    - The JSON must be valid and parsable.
    - The language should be inspiring and professional.
    - Scenes should tell a visual story related to the scripture.
    """

    try:
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            format="json"
        )
        
        content = response['message']['content']
        return json.loads(content)
    except Exception as e:
        print(f"Error calling Ollama: {e}")
        # Fallback structure
        return {
            "explanation": f"Failed to generate explanation for: {scripture}",
            "scenes": [],
            "application": ["Keep exploring God's word."],
            "caption": "Check out this scripture! #Bible #Faith"
        }
