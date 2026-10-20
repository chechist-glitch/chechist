"""Fechas siempre en UTC y en el mismo formato, para poder compararlas como texto."""

from datetime import datetime, timedelta, timezone


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def iso(momento: datetime) -> str:
    return momento.astimezone(timezone.utc).isoformat(timespec="seconds")


def hace(momento: datetime, horas: float) -> str:
    return iso(momento - timedelta(hours=horas))
