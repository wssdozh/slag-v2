// What every enrichment transport returns, regardless of protocol.
export interface EnrichmentResult {
  extractedText: string;
  summary: string;
}
