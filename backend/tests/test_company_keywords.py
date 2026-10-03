import pytest
from app.services.company_keywords import matches


@pytest.mark.parametrize('query,fields',[
    ('美的',('000333','美的集团','mdjt')),
    ('MDJT',('000333','美的集团','mdjt')),
    ('紫晶 信息',('广东紫晶信息存储技术股份有限公司','688086','信息存储')),
    ('信息存储',('广东紫晶信息存储技术股份有限公司','688086','信息存储')),
    ('美的集团股份有限公司',('美的集团','mdjt')),
    ('０００３３３',('000333','美的集团')),
])
def test_partial_names_pinyin_industry_and_multiple_keywords(query,fields):
    assert matches(query,*fields)


def test_does_not_select_a_different_or_fabricated_entity():
    assert not matches('美的 新能源','000333','美的集团','mdjt')
    assert not matches('未知企业','000333','美的集团','mdjt')
