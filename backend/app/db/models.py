from sqlalchemy import Boolean, Column, ForeignKey, Integer, Numeric, String, Text, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[3]
DB_PATH = Path(os.getenv("XRAY_DB_PATH", ROOT / "data" / "xray.sqlite3"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(f"sqlite:///{DB_PATH.as_posix()}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Company(Base):
    __tablename__ = "companies"
    id = Column(String, primary_key=True)
    legal_name = Column(String, nullable=False)
    short_name = Column(String, nullable=False)
    uscc = Column(String, nullable=True)
    ticker = Column(String, unique=True, nullable=True)
    industry = Column(String, nullable=False)
    listed = Column(Boolean, nullable=False)
    coverage = Column(Text, nullable=False)
    updated_at = Column(String, nullable=False)


class Source(Base):
    __tablename__ = "sources"
    id = Column(String, primary_key=True)
    type = Column(String, nullable=False)
    institution = Column(String, nullable=False)
    title = Column(String, nullable=False)
    url = Column(String, unique=True, nullable=False)
    notice_number = Column(String)
    published_at = Column(String, nullable=False)
    fetched_at = Column(String, nullable=False)
    page = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    local_file = Column(String, nullable=False)
    accessible = Column(Boolean, nullable=False)
    excerpt = Column(Text, nullable=False)


class Fact(Base):
    __tablename__ = "facts"
    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    source_id = Column(String, ForeignKey("sources.id"), nullable=False)
    field = Column(String, nullable=False)
    value_yuan = Column(Numeric(20, 2), nullable=True)
    unit = Column(String, nullable=False)
    period = Column(String, nullable=False)
    scope = Column(String, nullable=False)
    audited = Column(Boolean, nullable=False)
    page = Column(Integer, nullable=False)
    excerpt = Column(Text, nullable=False)
    verification_status = Column(String, nullable=False)
    reviewed_by_human = Column(Boolean, nullable=False)
    review_note = Column(Text, nullable=False)


class RiskEvent(Base):
    __tablename__ = "risk_events"
    id = Column(String, primary_key=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    affected_entity = Column(String, nullable=False)
    type = Column(String, nullable=False)
    event_date = Column(String, nullable=False)
    stage = Column(String, nullable=False)
    amount_yuan = Column(Numeric(20, 2))
    status = Column(String, nullable=False)
    verification_status = Column(String, nullable=False)
    source_ids_json = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)


class DemoScenario(Base):
    __tablename__ = "demo_scenarios"
    id = Column(String, primary_key=True)
    payload_json = Column(Text, nullable=False)


class ImportLog(Base):
    __tablename__ = "import_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    imported_at = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
