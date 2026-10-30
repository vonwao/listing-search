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
