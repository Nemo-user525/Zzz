"""Separate, bounded cache of real investigations; never enterprise facts."""
import hashlib
import json
import time
from sqlalchemy import Column, String, Text, Float
from app.db.models import Base, SessionLocal
from app.schemas.consumer import Discovery


class ConsumerInvestigation(Base):
    __tablename__ = 'consumer_investigations'
    id = Column(String, primary_key=True)
    query_hash = Column(String, nullable=False, index=True)
    created_at = Column(Float, nullable=False, index=True)
    payload_json = Column(Text, nullable=False)


def key(query, location):
    return hashlib.sha256((query + '\n' + location).encode()).hexdigest()


def save(value):
    with SessionLocal() as db, db.begin():
        db.add(ConsumerInvestigation(id=value.investigation_id, query_hash=key(value.query, value.location),
                                    created_at=time.time(), payload_json=value.model_dump_json()))
        expired = db.query(ConsumerInvestigation).order_by(ConsumerInvestigation.created_at.desc()).offset(100).all()
        for row in expired:
            db.delete(row)


def get(ident=None, query=None, location=None):
    with SessionLocal() as db:
        q = db.query(ConsumerInvestigation).filter(ConsumerInvestigation.created_at > time.time()-86400)
        q = q.filter(ConsumerInvestigation.id == ident) if ident else q.filter(ConsumerInvestigation.query_hash == key(query, location))
        row = q.order_by(ConsumerInvestigation.created_at.desc()).first()
        return Discovery.model_validate_json(row.payload_json) if row else None
