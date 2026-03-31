import os
import sys
from dotenv import load_dotenv
from app.services.genai_service import generate_risk_narrative
from app.schemas import FeatureImpact

load_dotenv()

def test_genai():
    print("Testing GenAI Service with Groq...")
    api_key = os.environ.get('GROQ_API_KEY')
    if api_key:
        print(f"API Key: {api_key[:10]}...")
    else:
        print("Error: GROQ_API_KEY not found in environment.")
        return
    
    factors = [
        FeatureImpact(feature="temperature", impact=0.8),
        FeatureImpact(feature="voltage", impact=0.2)
    ]
    
    try:
        print("\nTesting Groq via genai_service.generate_risk_narrative...")
        narrative, actions = generate_risk_narrative(
            inverter_id="INV-001",
            risk_score=0.15,
            risk_band="LOW",
            top_factors=factors
        )
        print("\n--- RESULTS ---")
        print(f"Narrative: {narrative}")
        print(f"Actions: {actions}")
    except Exception as e:
        print(f"Error during test: {e}")

if __name__ == "__main__":
    test_genai()
