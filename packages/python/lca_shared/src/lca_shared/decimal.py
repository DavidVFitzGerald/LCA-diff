"""Exact finite decimal operations, independent of the caller's decimal context."""

import re
from collections.abc import Iterable
from decimal import MAX_EMAX, MIN_EMIN, Decimal, Inexact, Rounded, localcontext

DECIMAL_PATTERN = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$", re.ASCII)


def decimal(value: str | Decimal) -> Decimal:
    if isinstance(value, str):
        if DECIMAL_PATTERN.fullmatch(value) is None:
            raise ValueError("Expected a finite decimal string")
        result = Decimal(value)
    elif isinstance(value, Decimal):
        result = value
    else:
        raise TypeError("Measurements require decimal strings or Decimal, never floats")
    if not result.is_finite():
        raise ValueError("Expected a finite decimal")
    return result


def exact_sum(values: Iterable[Decimal]) -> Decimal:
    items = [decimal(value) for value in values]
    if not items:
        return Decimal(0)
    lowest = min(int(value.as_tuple().exponent) for value in items)
    highest = max(value.adjusted() for value in items)
    with localcontext() as context:
        context.prec = max(1, highest - lowest + 1) + len(str(len(items))) + 1
        context.Emax, context.Emin = MAX_EMAX, MIN_EMIN
        context.traps[Inexact] = context.traps[Rounded] = True
        return sum(items, Decimal(0))


def exact_product(left: Decimal, right: Decimal) -> Decimal:
    left, right = decimal(left), decimal(right)
    with localcontext() as context:
        context.prec = max(1, len(left.as_tuple().digits) + len(right.as_tuple().digits))
        context.Emax, context.Emin = MAX_EMAX, MIN_EMIN
        context.traps[Inexact] = context.traps[Rounded] = True
        return left * right
