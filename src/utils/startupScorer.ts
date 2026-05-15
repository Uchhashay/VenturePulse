export class StartupScorer {
  static calculateScore(data: any) {
    // 1. Market Potential (40%)
    const marketScore = (data.market_potential / 10) * 40;
    
    // 2. Growth Trajectory (30%)
    const growthFactor = Math.min(data.revenue_growth_pct / 100, 1);
    const growthScore = growthFactor * 30;
    
    // 3. Financial Health (30%)
    const runway = data.funding_total / (data.burn_rate > 0 ? data.burn_rate : 0.1);
    let financialFactor = 0;
    if (runway >= 18) financialFactor = 1.0;
    else if (runway >= 12) financialFactor = 0.8;
    else if (runway >= 6) financialFactor = 0.5;
    else financialFactor = 0.2;
    const financialScore = financialFactor * 30;
    
    const totalScore = Math.round(marketScore + growthScore + financialScore);
    return {
      total_score: totalScore,
      market_score: Math.round(marketScore),
      growth_score: Math.round(growthScore),
      financial_score: Math.round(financialScore)
    };
  }
}
