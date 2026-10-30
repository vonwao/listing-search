from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from pydantic_core import PydanticCustomError


class Listing(BaseModel):
    model_config = ConfigDict(frozen=True, allow_inf_nan=False)

    id: str
    source: str
    address: str
    city: str
    state: str
    zip: str
    price: float = Field(ge=0)
    bedrooms: int = Field(ge=0)
    bathrooms: float = Field(ge=0)
    sqft: int = Field(ge=0)
    latitude: float
    longitude: float
    listedDate: date
    status: Literal['active', 'pending', 'sold']
    description: str


class SearchParams(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)

    minPrice: float | None = Field(default=None, ge=0)
    maxPrice: float | None = Field(default=None, ge=0)
    minBedrooms: int | None = Field(default=None, ge=0)
    city: str = Field(default='', max_length=120)
    keyword: str = Field(default='', max_length=500)
    targetBudget: float | None = Field(default=None, gt=0)
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=6, ge=1, le=100)

    @field_validator('maxPrice')
    @classmethod
    def ordered_price_range(cls, max_price: float | None, info: ValidationInfo) -> float | None:
        min_price = info.data.get('minPrice')
        if min_price is not None and max_price is not None and min_price > max_price:
            raise PydanticCustomError('price_range', 'Minimum price must not exceed maximum price.')
        return max_price


class ListingRef(BaseModel):
    source: str
    id: str


class SearchHit(Listing):
    relevanceScore: float
    budgetScore: float | None
    recencyScore: float
    ageDays: int
    budgetDifference: float | None
    possibleDuplicates: list[ListingRef]


class SearchResponse(BaseModel):
    items: list[SearchHit]
    total: int
    page: int
    pageSize: int
    totalPages: int
    asOf: date
    message: str | None = None
