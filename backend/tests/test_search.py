from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from backend.models import Listing, SearchParams
from backend.search import score, search

TODAY = date(2026, 9, 5)


def listing(id='1', source='A', **changes):
    data = dict(id=id, source=source, address='1 Main St', city='Springfield', state='VA',
                zip='22150', price=500_000, bedrooms=3, bathrooms=2, sqft=1500,
                latitude=38.8, longitude=-77.2, listedDate=TODAY, status='active',
                description='Sunny home near transit. No pets.')
    return Listing(**(data | changes))


def test_filters_combine_with_inclusive_boundaries_and_case_insensitivity():
    rows = [listing(), listing('2', price=600_000), listing('3', bedrooms=2),
            listing('4', city='Reston'), listing('5', description='Quiet house')]
    p = SearchParams(minPrice=500_000, maxPrice=500_000, minBedrooms=3,
                     city='  sPrInGfIeLd ', keyword=' TRANSIT ')
    assert [r.id for r in search(rows, p, today=TODAY).items] == ['1']


def test_unknown_city_returns_empty_success():
    result = search([listing()], SearchParams(city='Unknown'), today=TODAY)
    assert result.items == []
    assert result.total == result.totalPages == 0
    assert result.page == 1


def test_keyword_is_literal_description_substring_not_pet_policy():
    result = search([listing(address='Beach Road')], SearchParams(keyword='pets'), today=TODAY)
    assert result.total == 1  # 'No pets' contains the literal word.
    assert search([listing(address='Beach Road')], SearchParams(keyword='Beach'), today=TODAY).total == 0


def test_budget_and_recency_both_affect_ranking():
    rows = [listing('old', listedDate=TODAY-timedelta(days=30)),
            listing('far', price=900_000), listing('best')]
    result = search(rows, SearchParams(targetBudget=500_000), today=TODAY)
    assert [r.id for r in result.items] == ['best', 'old', 'far']
    assert [r.relevanceScore for r in result.items] == [100, 85, 44]


def test_no_budget_uses_only_recency():
    result = search([listing('old', listedDate=TODAY-timedelta(days=30)),
                     listing('new', price=999_000)], SearchParams(), today=TODAY)
    assert [r.relevanceScore for r in result.items] == [100, 50]
    assert result.items[0].budgetScore is None


def test_scores_stay_bounded_for_future_dates_and_remote_prices():
    total, budget, recency = score(listing(price=1_500_000, listedDate=TODAY+timedelta(days=2)), 500_000, TODAY)
    assert (total, budget, recency) == (0.3, 0, 1)


def test_ties_use_source_and_id_and_do_not_merge_feeds():
    rows = [listing('2', 'B'), listing('2', 'A'), listing('1', 'A'), listing('1', 'B')]
    result = search(rows, SearchParams(), today=TODAY)
    assert [(r.source, r.id) for r in result.items] == [('A','1'), ('A','2'), ('B','1'), ('B','2')]
    assert rows[0].source == 'B'  # Caller input is unchanged.


def test_pagination_has_no_gaps_overlaps_or_repeated_last_page():
    rows = [listing(str(n)) for n in range(5)]
    pages = [search(rows, SearchParams(page=p, pageSize=2), today=TODAY) for p in range(1,5)]
    assert [[r.id for r in p.items] for p in pages] == [['0','1'], ['2','3'], ['4'], []]
    assert all(p.total == 5 and p.totalPages == 3 for p in pages)


def test_all_statuses_are_kept_unless_requirement_changes():
    assert search([listing(status='pending')], SearchParams(), today=TODAY).total == 1


@pytest.mark.parametrize('params', [
    {'minPrice': -1}, {'maxPrice': -1}, {'minPrice': 2, 'maxPrice': 1},
    {'minBedrooms': -1}, {'minBedrooms': 1.5}, {'page': 0}, {'page': 1.5},
    {'pageSize': 0}, {'pageSize': -1}, {'pageSize': 101}, {'targetBudget': 0},
    {'targetBudget': float('nan')}, {'maxPrice': float('inf')}, {'unexpected': 'x'},
])
def test_invalid_filters_are_rejected(params):
    with pytest.raises(ValidationError):
        SearchParams(**params)


def test_equal_scores_prefer_the_lower_price():
    rows = [listing('a-over', price=550_000), listing('b-under', price=450_000)]
    result = search(rows, SearchParams(targetBudget=500_000), today=TODAY)
    assert [r.id for r in result.items] == ['b-under', 'a-over']
    assert result.items[0].relevanceScore == result.items[1].relevanceScore


def test_zero_filter_values_are_applied_rather_than_ignored():
    rows = [listing('free', price=0, bedrooms=0), listing('paid')]
    assert [r.id for r in search(rows, SearchParams(maxPrice=0), today=TODAY).items] == ['free']
    assert search(rows, SearchParams(minBedrooms=0), today=TODAY).total == 2


def test_exactly_full_last_page_has_no_extra_page():
    rows = [listing(str(n)) for n in range(4)]
    last = search(rows, SearchParams(page=2, pageSize=2), today=TODAY)
    past = search(rows, SearchParams(page=3, pageSize=2), today=TODAY)
    assert (len(last.items), last.totalPages, last.message) == (2, 2, None)
    assert (past.items, past.totalPages, past.message) == ([], 2, 'Page 3 is past the last page (2).')


def test_identical_coordinates_in_different_feeds_are_flagged_but_not_merged():
    rows = [listing('1', 'A'), listing('2', 'B'), listing('3', 'A'),
            listing('4', 'B', latitude=39.0)]
    items = {r.id: r for r in search(rows, SearchParams(), today=TODAY).items}
    assert len(items) == 4
    assert [(d.source, d.id) for d in items['1'].possibleDuplicates] == [('B', '2')]
    assert [(d.source, d.id) for d in items['2'].possibleDuplicates] == [('A', '1'), ('A', '3')]
    assert items['4'].possibleDuplicates == []


def test_ranking_details_report_age_and_signed_budget_difference():
    rows = [listing('over', price=525_000, listedDate=TODAY-timedelta(days=58)),
            listing('future', price=450_000, listedDate=TODAY+timedelta(days=2))]
    items = {r.id: r for r in search(rows, SearchParams(targetBudget=500_000), today=TODAY).items}
    assert (items['over'].ageDays, items['over'].budgetDifference) == (58, 25_000)
    assert (items['future'].ageDays, items['future'].budgetDifference) == (0, -50_000)
    assert search(rows, SearchParams(), today=TODAY).items[0].budgetDifference is None
