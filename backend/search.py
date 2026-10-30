"""Pure search: no network, global state, or implicit clock."""
from collections import defaultdict
from datetime import date
from math import ceil
from collections.abc import Sequence

from .models import Listing, ListingRef, SearchHit, SearchParams, SearchResponse


def score(listing: Listing, target_budget: float | None, today: date) -> tuple[float, float | None, float]:
    # A 30-day-old listing has 50% recency. Future dates are treated as today.
    age_days = max(0, (today - listing.listedDate).days)
    recency = 1 / (1 + age_days / 30)
    if target_budget is None:
        return recency, None, recency
    budget = max(0, 1 - abs(listing.price - target_budget) / target_budget)
    return 0.7 * budget + 0.3 * recency, budget, recency


def possible_duplicates(listings: Sequence[Listing]) -> dict[tuple[str, str], list[ListingRef]]:
    # Identical coordinates in different feeds suggest one home. Flag it, but do not merge:
    # that needs a rule for which feed to trust.
    by_location = defaultdict(list)
    for listing in listings:
        by_location[(listing.latitude, listing.longitude)].append(listing)
    return {
        (listing.source, listing.id): [
            ListingRef(source=other.source, id=other.id) for other in group if other.source != listing.source
        ]
        for group in by_location.values()
        for listing in group
    }


def empty_result_message(listings: Sequence[Listing], params: SearchParams, total: int, total_pages: int) -> str | None:
    # A valid search that finds nothing is a result, not a failed request, but it should say why.
    if total and params.page > total_pages:
        return f'Page {params.page} is past the last page ({total_pages}).'
    if total:
        return None
    city = params.city.casefold()
    if city and not any(listing.city.strip().casefold() == city for listing in listings):
        return f"No listings found in city '{params.city}'."
    return 'No listings match these filters.'


def search(listings: Sequence[Listing], params: SearchParams, *, today: date) -> SearchResponse:
    city, keyword = params.city.casefold(), params.keyword.casefold()
    ranked = []
    for listing in listings:
        if params.minPrice is not None and listing.price < params.minPrice:
            continue
        if params.maxPrice is not None and listing.price > params.maxPrice:
            continue
        if params.minBedrooms is not None and listing.bedrooms < params.minBedrooms:
            continue
        if city and listing.city.strip().casefold() != city:
            continue
        if keyword and keyword not in listing.description.casefold():
            continue
        relevance, budget, recency = score(listing, params.targetBudget, today)
        ranked.append((relevance, listing, budget, recency))

    # On a tie, prefer the lower price. IDs are unique only within a feed, so finish with
    # (source, id). Sort before slicing for stable pages.
    ranked.sort(key=lambda row: (-row[0], row[1].price, row[1].source, row[1].id))
    total_pages = ceil(len(ranked) / params.pageSize)
    start = (params.page - 1) * params.pageSize
    duplicates = possible_duplicates(listings)
    items = [
        SearchHit(
            **listing.model_dump(),
            relevanceScore=round(relevance * 100, 2),
            budgetScore=None if budget is None else round(budget * 100, 2),
            recencyScore=round(recency * 100, 2),
            possibleDuplicates=duplicates[(listing.source, listing.id)],
        )
        for relevance, listing, budget, recency in ranked[start:start + params.pageSize]
    ]
    return SearchResponse(
        items=items, total=len(ranked), page=params.page, pageSize=params.pageSize,
        totalPages=total_pages, asOf=today,
        message=empty_result_message(listings, params, len(ranked), total_pages),
    )
