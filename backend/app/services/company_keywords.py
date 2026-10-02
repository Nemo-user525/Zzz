"""Name fragments and catalogue keywords only; never infer a legal identity."""
import re
import unicodedata


def normalize(value):
    return unicodedata.normalize('NFKC', str(value or '')).lower().strip()


def matches(query, *fields):
    terms = normalize(query).split()
    haystack = ' '.join(normalize(v) for v in fields)
    def present(term):
        shortened = re.sub(r'(股份有限公司|有限责任公司|有限公司)$', '', term)
        return term in haystack or (len(shortened) >= 2 and shortened in haystack)
    return all(present(term) for term in terms)
