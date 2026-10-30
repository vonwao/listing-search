import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .models import Listing, SearchParams, SearchResponse
from .search import search

ROOT = Path(__file__).resolve().parent.parent


def load_listings(path: Path) -> tuple[Listing, ...]:
    records = tuple(Listing.model_validate(row) for row in json.loads(path.read_text(encoding='utf-8')))
    keys = {(row.source, row.id) for row in records}
    if len(keys) != len(records):
        raise ValueError('Dataset contains duplicate (source, id) keys.')
    return records


def create_app(data_path: Path = ROOT / 'data/sample_listings.json') -> FastAPI:
    app = FastAPI(title='Listing Search', version='1.0.0')
    listings = load_listings(data_path)

    @app.exception_handler(RequestValidationError)
    async def invalid_query(_request: Request, error: RequestValidationError) -> JSONResponse:
        # Keep error output small and JSON-safe, including non-finite numeric inputs.
        return JSONResponse(status_code=422, content={
            'error': 'Invalid search parameters.',
            'details': [{'field': '.'.join(map(str, e['loc'][1:])) or 'filters',
                         'message': e['msg']} for e in error.errors()],
        })

    @app.get('/api/health')
    def health() -> dict:
        return {'service': 'listing-search', 'status': 'ok', 'listings': len(listings)}

    @app.get('/api/listings', response_model=SearchResponse)
    def get_listings(params: Annotated[SearchParams, Query()]) -> SearchResponse:
        return search(listings, params, today=datetime.now(timezone.utc).date())

    dist = ROOT / 'frontend/dist'
    if dist.exists():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

        @app.get('/', include_in_schema=False)
        def index() -> FileResponse:
            return FileResponse(dist / 'index.html')

    return app


app = create_app()
