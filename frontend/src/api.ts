export type Filters = {
  minPrice: string
  maxPrice: string
  minBedrooms: string
  city: string
  keyword: string
  targetBudget: string
  pageSize: string
}
export type SearchQuery = Filters & { page: number }
export type Listing = {
  id: string
  source: string
  address: string
  city: string
  state: string
  zip: string
  price: number
  bedrooms: number
  bathrooms: number
  sqft: number
  listedDate: string
  status: 'active' | 'pending' | 'sold'
  description: string
  relevanceScore: number
  budgetScore: number | null
  recencyScore: number
  possibleDuplicates: { source: string; id: string }[]
}
export type SearchResponse = {
  items: Listing[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  asOf: string
  message: string | null
}

const unavailable = 'The search service is unavailable. Please try again.'

// Retrying cannot fix these, so the UI offers a reset instead.
export class InvalidSearchError extends Error {}

export function toParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (String(value).trim() !== '') params.set(key, String(value).trim())
  })
  return params
}

export async function fetchListings(
  query: SearchQuery,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const response = await fetch(`/api/listings?${toParams(query)}`, { signal }).catch(() => {
    throw new Error(unavailable)
  })
  if (!response.ok) {
    if (response.status === 422) {
      const error = await response.json()
      throw new InvalidSearchError(
        error.details
          ?.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`)
          .join(' ') || 'Check your search inputs.',
      )
    }
    throw new Error(unavailable)
  }
  return response.json()
}
