from decimal import ROUND_DOWN, Decimal

from .models import Quote, QuoteRequest


def amount(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.000001"), rounding=ROUND_DOWN))


def preview(request: QuoteRequest, price: float | None, fee_bps: int) -> Quote:
    premium = request.premium.quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    fee = (premium * fee_bps / 10000).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    cost = premium + fee
    units = premium / 2
    direction = 1 if request.side == "call" else -1
    move = request.move_pct * direction
    payout = max(Decimal(0), min(Decimal(10), move)) * units
    breakeven_pct = cost / units * direction
    underlying = Decimal(str(price)) if price is not None else None
    return Quote(
        premium=amount(premium),
        fee=amount(fee),
        cost=amount(cost),
        max_loss=amount(cost),
        max_payout=amount(units * 10),
        payout=amount(payout),
        profit=amount(payout - cost),
        breakeven=amount(underlying * (1 + breakeven_pct / 100))
        if underlying is not None
        else None,
        breakeven_pct=amount(breakeven_pct),
        reference_price=amount(underlying) if underlying else None,
        collateral_required=amount(units * 10),
        fee_bps=fee_bps,
        reason="Illustrative payout calculator. Live premiums and expiry are fixed by each funded series.",
    )
