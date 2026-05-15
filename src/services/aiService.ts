import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getAIInvestmentThesis(startupData: any) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    You are an expert VC Analyst and Risk Modeler. Based on the provided startup metrics, provide a comprehensive analysis.
    
    Startup Data:
    - Name: ${startupData.name}
    - Sector: ${startupData.sector}
    - Market Potential: ${startupData.market_potential}/10
    - Revenue Growth: ${startupData.revenue_growth_pct}%
    - Funding: $${startupData.funding_total}M
    - Burn Rate: $${startupData.burn_rate}M/mo
    - Team Pedigree: ${startupData.team_pedigree}/10
    - Competitive Moat: ${startupData.competitive_moat}
    - Total Score: ${startupData.total_score}/100
    
    Respond in JSON format with the following structure:
    {
      "thesis": "3-sentence investment thesis",
      "green_flag": "One specific positive",
      "red_flag": "One specific risk",
      "risk_analysis": {
        "level": "Low" | "Moderate" | "High",
        "factors": ["factor 1", "factor 2", "factor 3"],
        "interpretation": "Brief qualitative interpretation of the risk for investor context"
      }
    }
  `;

  try {
    const response = await genAI.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return null;
  }
}
