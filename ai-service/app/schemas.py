from pydantic import BaseModel
from typing import List

class AssessmentResult(BaseModel):
    animal_type: str
    visible_conditions: List[str]
    behavior_assessment: str
    risk_level: str
    explanation: str

class FinalReport(BaseModel):
    animal_type: str
    breed: str
    confidence: float
    visible_conditions: List[str]
    behavior_assessment: str
    risk_level: str
    explanation: str