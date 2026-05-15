export enum StartupStage {
  EARLY = "Early",
  GROWTH = "Growth",
  MATURE = "Mature"
}

export interface StartupProfile {
  startup_id: string;
  name: string;
  sector: string;
  stage: StartupStage;
  market_potential: number; // 1-10
  funding_total: number; // in millions
  burn_rate: number; // in millions per month
  revenue_growth_pct: number; // percentage
  team_pedigree: number; // 1-10
  competitive_moat: string;
  location?: string;
  founded_date?: string;
  last_funding_round?: string;
  last_funding_date?: string;
  risk_classification?: {
    level: 'Low' | 'Moderate' | 'High';
    factors: string[];
    interpretation: string;
  };
}

export interface ScoringResult {
  total_score: number;
  market_score: number;
  growth_score: number;
  financial_score: number;
}
