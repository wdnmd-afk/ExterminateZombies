export const CAMPAIGN_PAGE_SIZE = 10;

export function campaignPageForIndex(index: number): number {
  return Math.floor(Math.max(0, index) / CAMPAIGN_PAGE_SIZE);
}

export function campaignPageRange(page: number, total: number): { page: number; start: number; end: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / CAMPAIGN_PAGE_SIZE));
  const boundedPage = Math.max(0, Math.min(pages - 1, page));
  const start = boundedPage * CAMPAIGN_PAGE_SIZE;
  return { page: boundedPage, start, end: Math.min(total, start + CAMPAIGN_PAGE_SIZE), pages };
}
