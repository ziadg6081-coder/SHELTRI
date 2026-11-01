import json
import google.generativeai as genai
from app.config import GEMINI_API_KEY
from app.schemas import AssessmentResult

genai.configure(api_key=GEMINI_API_KEY)

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    generation_config={
        "response_mime_type": "application/json",
        "response_schema": AssessmentResult
    }
)

def analyze_with_ai(image_bytes: bytes, mime_type: str):

    prompt = """
You are a veterinary AI assistant.

Analyze the image of a cat or dog.

Rules:

    DO NOT diagnose diseases
    ONLY describe visible symptoms
    Be conservative and safe
    If unsure, return "unknown"


Risk Levels (Must Return one of Those Three - The Risk Level denotes if the animal is on risk and needs help (Just Based On the Image)):

    SAFE
    MEDIUM_RISK
    HIGH_RISK


Note: Never Return UNKNOWN_RISK

Return JSON with:

    animal_type
    visible_conditions
    behavior_assessment
    risk_level
    explanation

"""

    response = model.generate_content([
        prompt,
        {"mime_type": mime_type, "data": image_bytes}
    ])

    return json.loads(response.text)