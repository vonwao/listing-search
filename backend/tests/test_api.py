import json

import pytest
from fastapi.testclient import TestClient

from backend.app import app, load_listings

client = TestClient(app)


def test_real_dataset_search_and_pagination():
    response = client.get('/api/listings', params={'city': 'Springfield', 'pageSize': 2})
    assert response.status_code == 200
    data = response.json()
    assert data['total'] == 4
    assert data['totalPages'] == 2
    assert len(data['items']) == 2
    assert all(row['city'] == 'Springfield' for row in data['items'])
    next_page = client.get('/api/listings', params={'city': 'Springfield', 'pageSize': 2, 'page': 2}).json()
    assert {r['id'] for r in data['items']}.isdisjoint(r['id'] for r in next_page['items'])


@pytest.mark.parametrize('query', [
    'minPrice=10&maxPrice=5', 'pageSize=0', 'page=banana', 'minBedrooms=1.5',
    'targetBudget=NaN', 'maxPrice=Infinity', 'pageSize=101', 'targetBudget=0', 'typo=1',
])
def test_invalid_http_input_returns_actionable_json(query):
    response = client.get('/api/listings?' + query)
    assert response.status_code == 422
    assert response.json()['error'] == 'Invalid search parameters.'
    assert response.json()['details'][0]['message']


def test_no_matches_and_out_of_range_page_are_successful_empty_results():
    missing = client.get('/api/listings', params={'city': 'Atlantis'}).json()
    assert missing['items'] == [] and missing['total'] == 0
    boundary = client.get('/api/listings', params={'page': 100}).json()
    assert boundary['items'] == [] and boundary['total'] == 12


def test_duplicate_source_id_fails_fast(tmp_path):
    row = client.get('/api/listings').json()['items'][0]
    path = tmp_path / 'duplicate.json'
    path.write_text(json.dumps([row, row]), encoding='utf-8')
    with pytest.raises(ValueError, match='duplicate'):
        load_listings(path)


def test_inverted_price_range_names_the_field_with_a_clear_message():
    response = client.get('/api/listings', params={'minPrice': 10, 'maxPrice': 5})
    assert response.status_code == 422
    assert response.json()['details'] == [
        {'field': 'maxPrice', 'message': 'Minimum price must not exceed maximum price.'},
    ]


def test_empty_results_explain_why():
    def message(**params):
        return client.get('/api/listings', params=params).json()['message']
    assert message(city='Atlantis') == "No listings found in city 'Atlantis'."
    assert message(city='Reston', minBedrooms=99) == 'No listings match these filters.'
    assert message(page=100) == 'Page 100 is past the last page (2).'
    assert message(city='Reston') is None
