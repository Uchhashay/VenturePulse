import { StartupProfile, StartupStage } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Service for fetching real-time startup data using Gemini with Google Search grounding.
 */
export class ExternalApiService {
  private static getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  static async fetchCompanies(query: string = ''): Promise<Partial<StartupProfile>[]> {
    if (!query || query.length < 2) return [];

    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Search for real-world startups matching the query: "${query}". 
        Provide a list of up to 5 relevant companies with their details. 
        Include: name, sector, location, founded_date (YYYY-MM-DD), last_funding_round (e.g. Seed, Series A), last_funding_date (YYYY-MM-DD), funding_total (in millions USD), burn_rate (estimated monthly in millions USD), revenue_growth_pct (estimated annual), team_pedigree (1-10), and competitive_moat (brief description).
        Ensure the data is as accurate as possible based on recent web information.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                sector: { type: Type.STRING },
                location: { type: Type.STRING },
                founded_date: { type: Type.STRING },
                last_funding_round: { type: Type.STRING },
                last_funding_date: { type: Type.STRING },
                funding_total: { type: Type.NUMBER },
                burn_rate: { type: Type.NUMBER },
                revenue_growth_pct: { type: Type.NUMBER },
                team_pedigree: { type: Type.NUMBER },
                competitive_moat: { type: Type.STRING },
              },
              required: ["name", "sector", "location", "last_funding_round"]
            }
          }
        },
      });

      const text = response.text;
      if (!text) return [];

      const results = JSON.parse(text);
      
      // Map to StartupProfile and ensure stage is set
      return results.map((res: any) => ({
        ...res,
        stage: this.inferStage(res.last_funding_round),
        market_potential: res.market_potential || 8, // Default if not found
      }));

    } catch (error) {
      console.error("Gemini search failed:", error);
      return [];
    }
  }

  private static inferStage(round: string = ''): StartupStage {
    const r = round.toLowerCase();
    if (r.includes('seed') || r.includes('angel') || r.includes('pre-seed')) return StartupStage.EARLY;
    if (r.includes('series a') || r.includes('series b')) return StartupStage.GROWTH;
    if (r.includes('series c') || r.includes('series d') || r.includes('ipo')) return StartupStage.MATURE;
    return StartupStage.EARLY;
  }
}
