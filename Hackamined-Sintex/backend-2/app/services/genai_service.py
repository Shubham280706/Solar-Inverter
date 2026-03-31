import os
import json
from dotenv import load_dotenv
from app.schemas import FeatureImpact
from typing import List

try:
    from groq import Groq
except ImportError:
    Groq = None

def generate_risk_narrative(inverter_id: str, risk_score: float, risk_band: str, top_factors: List[FeatureImpact]):
    """
    Constructs a diagnostic AI narrative using Groq API.
    """
    load_dotenv(override=True)
    api_key = os.environ.get("GROQ_API_KEY")
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    
    if not api_key:
        return f"System detected {risk_band} risk due to technical anomalies in inverter telemetry.", \
               ["Inspect electrical connections", "Check cooling systems", "Review maintenance logs"]

    if Groq is None:
        return f"System detected {risk_band} risk due to technical anomalies in inverter telemetry.", \
               ["Install the 'groq' package to enable AI narratives", "Check cooling systems", "Review maintenance logs"]

    client = Groq(api_key=api_key)

    factor_strings = [f"- {f.feature}: {f.impact}" for f in top_factors]
    prompt = f"""
    Analyze solar inverter risk:
    Inverter: {inverter_id}, Risk: {risk_score:.2%} ({risk_band})
    Factors: {', '.join(factor_strings)}

    Output JSON Format:
    {{
        "narrative_summary": "2-sentence technical root cause summary.",
        "recommended_actions": ["Action 1", "Action 2", "Action 3"]
    }}
    """

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[{'role': 'user', 'content': prompt}],
            response_format={"type": "json_object"}
        )
        
        data = json.loads(completion.choices[0].message.content)
        return data.get("narrative_summary"), data.get("recommended_actions")
        
    except Exception as e:
        print(f"Groq GenAI Error: {e}")
        # Local fallback if Groq fails
        return f"System detected {risk_band} risk due to technical anomalies in inverter telemetry.", \
               ["Inspect electrical connections", "Check cooling systems", "Review maintenance logs"]
