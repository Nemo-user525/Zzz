"""Additive, versioned research store. Never replaces the legacy demo database."""
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from sqlalchemy import Column, String, Text, Integer, ForeignKey, UniqueConstraint
from .models import Base, engine, DB_PATH


class Entity(Base):
    __tablename__ = 'research_entities'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    ticker = Column(String, index=True)
    org_id = Column(String, unique=True)
    industry = Column(String, nullable=False)
    cohort = Column(String, nullable=False)
    metadata_json = Column(Text, nullable=False, default='{}')


class Document(Base):
    __tablename__ = 'document_versions'
    id = Column(String, primary_key=True)
    announcement_id = Column(String, nullable=False, index=True)
    company_id = Column(String, ForeignKey('research_entities.id'), nullable=False, index=True)
    title = Column(Text, nullable=False)
    url = Column(Text, nullable=False)
    published_at = Column(String, nullable=False, index=True)
    available_at = Column(String, nullable=False, index=True)
    fetched_at = Column(String, nullable=False)
    sha256 = Column(String, nullable=False, index=True)
    local_file = Column(Text, nullable=False)
    fetch_status = Column(String, nullable=False)
    integrity_status = Column(String, nullable=False)
    extraction_status = Column(String, nullable=False)
    verification_status = Column(String, nullable=False)
    supersedes_id = Column(String, ForeignKey('document_versions.id'))
    metadata_json = Column(Text, nullable=False, default='{}')
    __table_args__ = (UniqueConstraint('announcement_id', 'sha256'),)


class Fragment(Base):
    __tablename__ = 'evidence_fragments'
    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey('document_versions.id'), nullable=False, index=True)
    page = Column(Integer, nullable=False)
    excerpt = Column(Text, nullable=False)
    locator_json = Column(Text, nullable=False)
    method = Column(String, nullable=False)


class DocumentPage(Base):
    __tablename__ = 'document_pages'
    document_id = Column(String, ForeignKey('document_versions.id'), primary_key=True)
    page = Column(Integer, primary_key=True)
    text = Column(Text, nullable=False)
    extraction_method = Column(String, nullable=False)


class Assertion(Base):
    __tablename__ = 'research_assertions'
    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey('research_entities.id'), nullable=False, index=True)
    fragment_id = Column(String, ForeignKey('evidence_fragments.id'), nullable=False)
    category = Column(String, nullable=False)
    field = Column(String, nullable=False)
    value_json = Column(Text, nullable=False)
    status = Column(String, nullable=False)
    reviewed_at = Column(String)
    reviewer_type = Column(String, nullable=False)
    metadata_json = Column(Text, nullable=False)


class HistoricalEvent(Base):
    __tablename__ = 'historical_events'
    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey('research_entities.id'), nullable=False, index=True)
    assertion_id = Column(String, ForeignKey('research_assertions.id'), nullable=False)
    identity_key = Column(String, nullable=False, unique=True)
    event_type = Column(String, nullable=False)
    stage = Column(String, nullable=False)
    occurred_at = Column(String)
    effective_at = Column(String)
    metadata_json = Column(Text, nullable=False)


class Observation(Base):
    __tablename__ = 'outcome_observations'
    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey('research_entities.id'), nullable=False, index=True)
    event_id = Column(String, ForeignKey('historical_events.id'))
    start_at = Column(String, nullable=False)
    end_at = Column(String, nullable=False)
    label = Column(String, nullable=False)
    outcome_type = Column(String, nullable=False)
    confirmed_at = Column(String)
    rule_version = Column(String, nullable=False)
    coverage_json = Column(Text, nullable=False)


class MatchRun(Base):
    __tablename__ = 'comparison_runs'
    id = Column(String, primary_key=True)
    created_at = Column(String, nullable=False)
    input_json = Column(Text, nullable=False)
    result_json = Column(Text, nullable=False)


class PipelineRun(Base):
    __tablename__ = 'pipeline_runs'
    id = Column(String, primary_key=True)
    command = Column(String, nullable=False)
    started_at = Column(String, nullable=False)
    status = Column(String, nullable=False)
    details_json = Column(Text, nullable=False)


def migrate(db_engine=None):
    """SQLite backup API is safe while the local app has an open connection."""
    db_engine = db_engine or engine
    path = Path(db_engine.url.database) if db_engine.url.database and db_engine.url.database != ':memory:' else None
    if path and path.exists():
        with sqlite3.connect(path) as conn:
            exists = conn.execute("SELECT 1 FROM sqlite_master WHERE name='document_versions'").fetchone()
            if not exists:
                target = path.parent / 'backups' / ('pre-history-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '.sqlite3')
                target.parent.mkdir(exist_ok=True)
                with sqlite3.connect(target) as backup:
                    conn.backup(backup)
    Base.metadata.create_all(db_engine)
