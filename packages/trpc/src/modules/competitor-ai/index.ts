export {
  digestSummarizer,
  offerLinks,
  summarizeChanges,
  summaryBudget,
  type AiDeps,
} from './service';
export {
  AiOutputError,
  DATA_CLOSE,
  UNTRUSTED_RULE,
  dataBlock,
  parseDraft,
  parsePrices,
  parseSummaries,
} from './prompt';
export { competitorAiRouter } from './router';
export { extractPrices, listPrices, priceTimeline, storeExtraction } from './prices';
export { autoPriceExtractor, AUTO_PRICE_DAILY, type AutoPriceStatus, type PriceChangeTarget } from './auto-prices';
export { comparePrices, type PriceEventData, type PricePoint } from './events';
export { recommend, recommendFacts } from './advice';
export { parseRecommendation, recommendInput, type Recommendation } from './recommend';
