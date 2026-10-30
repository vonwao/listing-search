import { useEffect, useState, type FormEvent } from 'react'
import { fetchListings, type Filters, type SearchQuery, type SearchResponse } from './api'

const defaults: Filters = {
  minPrice: '',
  maxPrice: '',
  minBedrooms: '',
  city: '',
  keyword: '',
  targetBudget: '500000',
  pageSize: '6',
}
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export default function App() {
  const [form, setForm] = useState<Filters>({ ...defaults })
  const [query, setQuery] = useState<SearchQuery>({ ...defaults, page: 1 })
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inputError, setInputError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setData(null)
    fetchListings(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Could not load listings.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, retry])

  function search(event: FormEvent) {
    event.preventDefault()
    if (
      form.minPrice !== '' &&
      form.maxPrice !== '' &&
      Number(form.minPrice) > Number(form.maxPrice)
    ) {
      setInputError('Minimum price must not exceed maximum price.')
      return
    }
    setInputError('')
    setQuery({ ...form, page: 1 })
  }
  function reset() {
    setForm({ ...defaults })
    setInputError('')
    setQuery({ ...defaults, page: 1 })
  }
  function field(name: keyof Filters) {
    return {
      id: name,
      name,
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm({ ...form, [name]: e.target.value }),
    }
  }

  return (
    <>
      <header className="masthead">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            ⌂
          </span>
          <span>Listing Search</span>
        </div>
        <span className="header-note">Northern Virginia · Sample listings</span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">FIND YOUR NEXT PLACE</p>
          <h1>A home that fits.</h1>
          <p>Search across property feeds. Find the right balance of budget and freshness.</p>
        </section>
        <div className="layout">
          <aside className="sidebar">
            <form onSubmit={search} aria-label="Listing filters">
              <div className="section-heading">
                <h2>Your search</h2>
                <button type="button" className="text-button" onClick={reset}>
                  Reset
                </button>
              </div>
              <label htmlFor="city">City</label>
              <input {...field('city')} placeholder="Any city" maxLength={120} list="cities" />
              <datalist id="cities">
                {['Springfield', 'Fairfax', 'Reston', 'Vienna', 'Manassas', 'Chantilly'].map(
                  (c) => (
                    <option key={c} value={c} />
                  ),
                )}
              </datalist>
              <div className="field-pair">
                <div>
                  <label htmlFor="minPrice">Min price ($)</label>
                  <input
                    {...field('minPrice')}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="No min"
                  />
                </div>
                <div>
                  <label htmlFor="maxPrice">Max price ($)</label>
                  <input
                    {...field('maxPrice')}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="No max"
                  />
                </div>
              </div>
              <label htmlFor="minBedrooms">Min bedrooms</label>
              <input {...field('minBedrooms')} type="number" min="0" step="1" placeholder="Any" />
              <label htmlFor="keyword">Description contains</label>
              <input
                {...field('keyword')}
                maxLength={500}
                placeholder="e.g. garage, transit, kitchen"
              />
              <div className="budget-field">
                <label htmlFor="targetBudget">Target budget ($)</label>
                <input
                  {...field('targetBudget')}
                  type="number"
                  min="0.01"
                  step="any"
                  placeholder="Optional"
                  aria-describedby="budget-hint"
                />
                <p id="budget-hint">
                  Ranks by closeness to your budget. This does not set a price limit.
                </p>
              </div>
              <label htmlFor="pageSize">Results per page</label>
              <select {...field('pageSize')}>
                <option value="3">3 listings</option>
                <option value="6">6 listings</option>
                <option value="12">12 listings</option>
              </select>
              {inputError && (
                <p className="error-inline" role="alert">
                  {inputError}
                </p>
              )}
              <button type="submit" className="primary">
                Search listings <span aria-hidden="true">→</span>
              </button>
            </form>
            <details className="ranking">
              <summary>How ranking works</summary>
              <p>
                With a target budget: 70% price closeness + 30% recency. Without one: recency only.
                A listing from 30 days ago has a 50% recency score.
              </p>
              <p>
                Scores run from 0 to 100. All statuses are included; each feed’s record stays
                separate. Keywords are literal matches, so “pets” also matches “no pets”.
              </p>
            </details>
          </aside>
          <section className="results" aria-label="Search results" aria-busy={loading}>
            <div className="results-heading">
              <h2>
                {loading
                  ? 'Finding listings…'
                  : data
                    ? `${data.total} matching ${data.total === 1 ? 'listing' : 'listings'}`
                    : 'Search results'}
              </h2>
              <span>Sorted by relevance</span>
            </div>
            <div aria-live="polite" className="sr-only">
              {loading
                ? 'Loading listings'
                : data
                  ? `${data.total} results. Page ${data.page} of ${data.totalPages || 1}.`
                  : ''}
            </div>
            {loading && (
              <div className="state-panel" role="status">
                <span className="spinner" aria-hidden="true" />
                Searching the property feeds…
              </div>
            )}
            {error && (
              <div className="state-panel error-panel" role="alert">
                <h3>We couldn’t load the listings</h3>
                <p>{error}</p>
                <button onClick={() => setRetry(retry + 1)}>Try again</button>
              </div>
            )}
            {data?.items.length === 0 && (
              <div className="state-panel">
                <h3>No listings found</h3>
                {data.message && <p>{data.message}</p>}
                <p>Try a different city, a wider price range, or fewer filters.</p>
                <button onClick={reset}>Reset filters</button>
              </div>
            )}
            {data && data.items.length > 0 && (
              <>
                <div className="listing-grid">
                  {data.items.map((item) => (
                    <article className="listing" key={`${item.source}:${item.id}`}>
                      <div className="card-top">
                        <span className={`status ${item.status}`}>{item.status}</span>
                        <span className="source">
                          {item.source} · {item.id}
                        </span>
                      </div>
                      <p className="price">{usd.format(item.price)}</p>
                      <h3>{item.address}</h3>
                      <p className="locality">
                        {item.city}, {item.state} {item.zip}
                      </p>
                      <div className="facts">
                        <span>
                          <b>{item.bedrooms}</b> beds
                        </span>
                        <span>
                          <b>{item.bathrooms}</b> baths
                        </span>
                        <span>
                          <b>{item.sqft.toLocaleString()}</b> sqft
                        </span>
                      </div>
                      <p className="description">{item.description}</p>
                      <div className="card-bottom">
                        <div>
                          <span className="score">{item.relevanceScore.toFixed(1)}</span>
                          <span className="score-label"> / 100 relevance</span>
                        </div>
                        <span className="listed">Listed {item.listedDate}</span>
                      </div>
                      <details className="score-detail">
                        <summary>Score breakdown</summary>
                        <p>
                          {item.budgetScore === null
                            ? 'No budget set · '
                            : `Budget match ${item.budgetScore.toFixed(1)} · `}
                          Recency {item.recencyScore.toFixed(1)}. Ranked before rounding.
                        </p>
                      </details>
                    </article>
                  ))}
                </div>
                <nav className="pagination" aria-label="Results pages">
                  <button
                    disabled={data.page <= 1}
                    onClick={() => setQuery({ ...query, page: data.page - 1 })}
                  >
                    <span aria-hidden="true">← </span>Previous
                  </button>
                  <span>
                    Page <b>{data.page}</b> of <b>{data.totalPages}</b>
                  </span>
                  <button
                    disabled={data.page >= data.totalPages}
                    onClick={() => setQuery({ ...query, page: data.page + 1 })}
                  >
                    Next<span aria-hidden="true"> →</span>
                  </button>
                </nav>
              </>
            )}
            {data && (
              <p className="data-note">
                Sample data · Recency as of {data.asOf} (UTC) · Feed records may describe the same
                property.
              </p>
            )}
          </section>
        </div>
      </main>
      <footer>
        Listing Search <span>React + TypeScript / Python API</span>
      </footer>
    </>
  )
}
