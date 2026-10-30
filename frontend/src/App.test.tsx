import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const item = {
  id: 'A1',
  source: 'MLS_A',
  address: '123 Main St',
  city: 'Springfield',
  state: 'VA',
  zip: '22150',
  price: 450000,
  bedrooms: 2,
  bathrooms: 1.5,
  sqft: 980,
  listedDate: '2026-08-29',
  status: 'active',
  description: 'Near transit.',
  relevanceScore: 80,
  budgetScore: 90,
  recencyScore: 56.67,
  ageDays: 62,
  budgetDifference: -50000,
  possibleDuplicates: [],
}
const result = { items: [item], total: 7, page: 1, pageSize: 6, totalPages: 2, asOf: '2026-10-30' }
const response = (body: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body,
})

describe('search experience', () => {
  it('renders API results, applies filters, and resets pagination on a new search', async () => {
    const fetch = vi.fn().mockResolvedValue(response(result))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: '123 Main St' })).toBeInTheDocument()
    expect(screen.getByText('$450,000')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(fetch.mock.calls.at(-1)?.[0]).toContain('page=2'))
    await user.type(screen.getByLabelText('City'), 'Reston')
    await user.click(screen.getByRole('button', { name: /Search listings/ }))
    await waitFor(() => {
      const url = fetch.mock.calls.at(-1)?.[0]
      expect(url).toContain('city=Reston')
      expect(url).toContain('page=1')
    })
  })

  it('shows a useful empty state and lets the user reset filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...result,
          items: [],
          total: 0,
          totalPages: 0,
          message: "No listings found in city 'Atlantis'.",
        }),
      ),
    )
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No listings found' })).toBeInTheDocument()
    expect(screen.getByText("No listings found in city 'Atlantis'.")).toBeInTheDocument()
    await user.type(screen.getByLabelText('City'), 'Atlantis')
    await user.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByLabelText('City')).toHaveValue('')
  })

  it('reports network failure and recovers when retried', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(response(result))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The search service is unavailable. Please try again.',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: '123 Main St' })).toBeInTheDocument()
  })

  it('explains each ranking in plain English and flags possible duplicates', async () => {
    const items = [
      { ...item, id: 'over', budgetDifference: 25000, ageDays: 58 },
      { ...item, id: 'under', budgetDifference: -1000, ageDays: 1 },
      { ...item, id: 'exact', budgetDifference: 0, ageDays: 0 },
      {
        ...item,
        id: 'none',
        budgetDifference: null,
        ageDays: 3,
        possibleDuplicates: [{ source: 'MLS_B', id: 'B7' }],
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...result, items })))
    render(<App />)
    expect(await screen.findByText('$25,000 over budget · listed 58 days ago')).toBeInTheDocument()
    expect(screen.getByText('$1,000 under budget · listed 1 day ago')).toBeInTheDocument()
    expect(screen.getByText('On budget · listed today')).toBeInTheDocument()
    expect(screen.getByText('Listed 3 days ago')).toBeInTheDocument()
    expect(screen.getAllByText(/Possibly the same home/)).toHaveLength(1)
    expect(screen.getByText('Possibly the same home as MLS_B · B7')).toBeInTheDocument()
  })

  it('keeps the submitted search and page in the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(result)))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('$450,000')
    expect(window.location.search).toBe('')
    await user.type(screen.getByLabelText('City'), 'Reston')
    expect(window.location.search).toBe('')
    await user.click(screen.getByRole('button', { name: /Search listings/ }))
    await waitFor(() => expect(window.location.search).toContain('city=Reston'))
    await screen.findByText('$450,000')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(window.location.search).toContain('page=2'))
    expect(window.location.search).toContain('city=Reston')
  })

  it('restores a shared search from the URL', async () => {
    window.history.replaceState(null, '', '/?city=Reston&pageSize=3&page=2')
    const fetch = vi.fn().mockResolvedValue(response(result))
    vi.stubGlobal('fetch', fetch)
    render(<App />)
    await screen.findByText('$450,000')
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('city=Reston')
    expect(url).toContain('pageSize=3')
    expect(url).toContain('page=2')
    expect(url).not.toContain('targetBudget')
    expect(screen.getByLabelText('City')).toHaveValue('Reston')
    expect(screen.getByLabelText('Target budget ($)')).toHaveValue(null)
    expect(screen.getByLabelText('Results per page')).toHaveValue('3')
  })

  it('restores the earlier search and form when going back', async () => {
    const fetch = vi.fn().mockResolvedValue(response(result))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('$450,000')
    await user.type(screen.getByLabelText('City'), 'Reston')
    await user.click(screen.getByRole('button', { name: /Search listings/ }))
    await waitFor(() => expect(window.location.search).toContain('city=Reston'))
    window.history.back()
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveValue(''))
    await waitFor(() => expect(fetch.mock.calls.at(-1)?.[0]).not.toContain('city=Reston'))
  })

  it('offers a reset instead of a retry when a shared URL is invalid', async () => {
    window.history.replaceState(null, '', '/?pageSize=0')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            details: [{ field: 'pageSize', message: 'Input should be greater than or equal to 1' }],
          },
          422,
        ),
      )
      .mockResolvedValue(response(result))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(await screen.findByText('$450,000')).toBeInTheDocument()
    expect(window.location.search).toContain('pageSize=6')
  })

  it('shows the field and message from a validation error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            details: [{ field: 'pageSize', message: 'Input should be greater than or equal to 1' }],
          },
          422,
        ),
      ),
    )
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'pageSize: Input should be greater than or equal to 1',
    )
  })

  it('disables Previous on the first page and Next on the last page', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(result))
      .mockResolvedValue(response({ ...result, page: 2 }))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('$450,000')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  it('prevents an inverted price range from making a request', async () => {
    const fetch = vi.fn().mockResolvedValue(response(result))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('$450,000')
    await user.type(screen.getByLabelText('Min price ($)'), '600000')
    await user.type(screen.getByLabelText('Max price ($)'), '400000')
    await user.click(screen.getByRole('button', { name: /Search listings/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Minimum price must not exceed maximum price.',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows loading and ignores a stale response after a newer search', async () => {
    let resolveFirst!: (value: unknown) => void
    const fetch = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValue(response({ ...result, items: [], total: 0, totalPages: 0 }))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('Searching')
    await user.type(screen.getByLabelText('City'), 'Atlantis')
    await user.click(screen.getByRole('button', { name: /Search listings/ }))
    await screen.findByRole('heading', { name: 'No listings found' })
    resolveFirst(response(result))
    await waitFor(() => expect(fetch.mock.calls[0][1].signal.aborted).toBe(true))
    expect(screen.queryByText('$450,000')).not.toBeInTheDocument()
  })
})
