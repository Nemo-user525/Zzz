"""Contracts for source-grounded company research, separate from risk scoring."""
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ResearchInput(Strict):
    name: str = Field(min_length=2, max_length=80, pattern=r'^[^\x00-\x1f\x7f]+$')
    ticker: str = Field(default='', pattern=r'^(\d{6}(\.(SH|SZ|BJ))?)?$')
    industry: str = Field(default='', max_length=40)
    founded_year: int | None = Field(default=None, ge=1800)

    @field_validator('founded_year')
    @classmethod
    def not_future(cls, value):
        if value and value > date.today().year:
            raise ValueError('成立年份不能晚于当前年份')
        return value


class DiscoveryInput(Strict):
    query: str = Field(min_length=2, max_length=80, pattern=r'^[^\x00-\x1f\x7f]+$')


class Citation(Strict):
    source_id: str
    quote: str = Field(min_length=4, max_length=240)


class Finding(Strict):
    dimension: Literal['cash', 'credit', 'dependency', 'reputation', 'policy', 'history']
    title: str = Field(min_length=2, max_length=100)
    analysis: str = Field(min_length=5, max_length=650)
    citations: list[Citation] = Field(min_length=1, max_length=4)
    uncertainty: str = Field(min_length=4, max_length=300)
    next_step: str = Field(min_length=4, max_length=300)


class Audience(Strict):
    role: Literal['enterprise', 'investor', 'beginner', 'senior']
    summary: str = Field(min_length=5, max_length=500)
    finding_indices: list[int] = Field(max_length=6)
    actions: list[str] = Field(min_length=1, max_length=4)


class ModelReport(Strict):
    findings: list[Finding] = Field(max_length=12)
    audiences: list[Audience] = Field(min_length=4, max_length=4)
    gaps: list[str] = Field(min_length=1, max_length=12)
