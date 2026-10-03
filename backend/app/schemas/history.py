"""Wire contracts for the additive research API. Currency amounts are yuan."""
from typing import Any
from pydantic import BaseModel, ConfigDict


class Wire(BaseModel):
    model_config = ConfigDict(extra='allow')


class EntityView(Wire):
    id: str
    name: str
    ticker: str | None
    industry: str


class EntityPage(Wire):
    items: list[EntityView]
    total: int
    dataset_version: str


class FactView(Wire):
    id: str
    category: str
    field: str
    value: Any
    evidence_ids: list[str]
    document_id: str
    excerpt: str
    page: int
    published_at: str
    available_at: str
    verification_status: str
    reviewer_type: str
    reviewed_at: str | None
    affected_entity: str | None
    period_end: str | None
    scope: str | None
    unit: str | None
    audited: bool | None
    raw_value: str | None = None
    raw_unit: str | None = None
    table_column: str | None = None


class SearchHit(Wire):
    document_id: str
    company_id: str
    title: str
    page: int
    published_at: str
    snippet: str
    verification_status: str


class SearchResponse(Wire):
    query: str
    as_of: str
    items: list[SearchHit]
    limit: int
    dataset_version: str
    limitations: list[str]


class TimelineItem(Wire):
    id: str
    assertion_id: str
    event_type: str
    stage: str
    occurred_at: str | None
    effective_at: str | None
    affected_entity: str | None


class DocumentIndex(Wire):
    id: str
    title: str
    published_at: str
    verification_status: str


class SnapshotResponse(Wire):
    company: EntityView
    as_of: str
    dataset_version: str
    facts: list[FactView]
    timeline: list[TimelineItem]
    documents: list[DocumentIndex]
    coverage: dict[str, Any]
    limitations: list[str]


class OutcomeView(Wire):
    id: str
    stage: str
    outcome_type: str
    confirmed_at: str
    occurred_at: str | None
    effective_at: str | None
    evidence_ids: list[str]
    document_id: str
    page: int
    excerpt: str
    affected_entity: str
    rule_version: str


class OutcomeResponse(Wire):
    company_id: str
    as_of: str
    window_days: int
    window_end: str
    observation_status: str
    outcomes: list[OutcomeView]
    dataset_version: str
    limitations: list[str]


class ComparisonResponse(Wire):
    id: str
    company_id: str
    as_of: str
    window_days: int
    method_version: str
    status: str
    matches: list[dict[str, Any]]
    excluded: list[dict[str, Any]]
    candidate_count: int
    dataset_version: str
    limitations: list[str]


class SourceResponse(Wire):
    id: str
    title: str
    url: str
    sha256: str
    published_at: str
    fetched_at: str
    extraction_status: str
    verification_status: str
    integrity_status: str
    local_available: bool


class QualityResponse(Wire):
    dataset_version: str
    entities: int
    documents: int
    unique_document_hashes: int
    local_documents: int
    parsed_documents: int
    supported_documents: int
    assertion_statuses: dict[str, int]
    events: int
    outcome_statuses: dict[str, int]
    human_reviewed: int
    publication_range: list[str | None]
    last_fetched_at: str | None
    last_reviewed_at: str | None
    limitations: list[str]


class DiscoveryResponse(Wire):
    status: str
    query: str
    companies: list[dict[str, Any]]
    announcements: list[dict[str, Any]]
    verification_status: str
    external_search_links: list[dict[str, str]]
    limitations: list[str]
