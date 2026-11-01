import asyncio
import traceback
from fastapi import FastAPI, UploadFile, File, HTTPException
from app.ai_service import analyze_with_ai
from app.utils import validate_image
from app.breed_service import predict_breed

app = FastAPI(title="Animal Risk Assessment API")


@app.get("/")
def root():
    return {"status": "running"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    validate_image(file, contents)

    try:
        ai_result = await asyncio.to_thread(analyze_with_ai, contents, file.content_type)
        breed_result = await asyncio.to_thread(predict_breed, contents)

        final = {
            "animal_type": ai_result.get("animal_type", "Unknown"),
            "breed": breed_result.get("breed", "Unknown"),
            "confidence": breed_result.get("confidence", 0.0),
            "visible_conditions": ai_result.get("visible_conditions", []),
            "behavior_assessment": ai_result.get("behavior_assessment", "Unknown"),
            "risk_level": ai_result.get("risk_level", "UNKNOWN_RISK"),
            "explanation": ai_result.get("explanation", "No explanation provided."),
        }

        return final

    except Exception as e:
        print("--- SERVER ERROR TRACEBACK ---")
        traceback.print_exc()
        print("------------------------------")

        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")