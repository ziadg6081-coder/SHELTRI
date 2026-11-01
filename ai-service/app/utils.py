from fastapi import HTTPException
from app.config import MAX_FILE_SIZE

def validate_image(file, contents):

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")