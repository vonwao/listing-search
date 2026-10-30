"""Pure search: no network, global state, or implicit clock."""
from datetime import date
from math import ceil
from collections.abc import Sequence

from .models import Listing, SearchHit, SearchParams, SearchResponse


def score(listing: Listing, target_budget: float | None, today: date) -> tuple[float, float | None, float]:
    # A 30-day-old listing has 50% recency. Future dates are treated as today.
    age_days = max(0, (today - listing.listedDate).days)
    recency = 1 / (1 + age_days / 30)
    if target_budget is None:
        return recency, None, recency
    budget = max(0, 1 - abs(listing.price - target_budget) / target_budget)
    return 0.7 * budget + 0.3 * recency, budget, recency


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

    # IDs are unique only within a feed. Sort before slicing for stable pages.
    ranked.sort(key=lambda row: (-row[0], row[1].source, row[1].id))
    start = (params.page - 1) * params.pageSize
    items = [
        SearchHit(
            **listing.model_dump(),
            relevanceScore=round(relevance * 100, 2),
            budgetScore=None if budget is None else round(budget * 100, 2),
            recencyScore=round(recency * 100, 2),
        )
        for relevance, listing, budget, recency in ranked[start:start + params.pageSize]
    ]
    return SearchResponse(
        items=items, total=len(ranked), page=params.page, pageSize=params.pageSize,
        totalPages=ceil(len(ranked) / params.pageSize), asOf=today,
    )
