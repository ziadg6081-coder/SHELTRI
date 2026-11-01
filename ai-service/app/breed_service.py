import torch
from transformers import AutoImageProcessor, AutoModelForImageClassification
from PIL import Image
import io

MODEL_NAME = "ISxOdin/vit-base-oxford-iiit-pets"

processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
model = AutoModelForImageClassification.from_pretrained(MODEL_NAME)
model.eval()


def predict_breed(image_bytes: bytes):

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        inputs = processor(images=image, return_tensors="pt")

        with torch.no_grad():
            outputs = model(**inputs)

        logits = outputs.logits
        probs = torch.nn.functional.softmax(logits, dim=1)

        confidence, predicted_class_idx = torch.max(probs, dim=1)

        label = model.config.id2label[predicted_class_idx.item()]

        return {
            "breed": label.replace("_", " ").title(),
            "confidence": float(confidence.item())
        }

    except Exception as e:
        print("BREED ERROR:", str(e))
        raise e
        #return {
            #"breed": "unknown",
            #"confidence": 0.0
        #}
