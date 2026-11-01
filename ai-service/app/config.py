import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 5242880))