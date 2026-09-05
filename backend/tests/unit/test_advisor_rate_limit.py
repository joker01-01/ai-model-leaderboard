from __future__ import annotations

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services.advisor_rate_limit import NonBlockingConcurrencyGate, SlidingWindowRateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_sliding_window_allows_five_and_rejects_sixth_with_retry_after() -> None:
    clock = FakeClock()
    limiter = SlidingWindowRateLimiter(clock=clock)

    decisions = [limiter.check("203.0.113.10") for _index in range(5)]
    rejected = limiter.check("203.0.113.10")

    assert all(decision.allowed for decision in decisions)
    assert [decision.remaining for decision in decisions] == [4, 3, 2, 1, 0]
    assert not rejected.allowed
    assert rejected.retry_after_seconds == 600

    clock.now = 599.1
    assert limiter.check("203.0.113.10").retry_after_seconds == 1
    clock.now = 600.0
    assert limiter.check("203.0.113.10").allowed


def test_sliding_window_isolated_keys_do_not_share_quota() -> None:
    limiter = SlidingWindowRateLimiter(clock=lambda: 10.0)

    for _index in range(5):
        assert limiter.check("203.0.113.10").allowed

    assert limiter.check("203.0.113.11").allowed


@pytest.mark.parametrize(
    "kwargs",
    [
        {"limit": 0},
        {"window_seconds": 0},
        {"window_seconds": float("inf")},
        {"max_keys": 0},
    ],
)
def test_rejects_invalid_limiter_configuration(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        SlidingWindowRateLimiter(**kwargs)  # type: ignore[arg-type]


def test_distinct_key_capacity_is_bounded_and_fails_closed_until_expiry() -> None:
    clock = FakeClock()
    limiter = SlidingWindowRateLimiter(limit=2, max_keys=3, clock=clock)

    assert all(limiter.check(f"203.0.113.{index}").allowed for index in range(1, 4))
    overflow = limiter.check("203.0.113.4")

    assert not overflow.allowed
    assert overflow.retry_after_seconds == 600
    assert limiter.tracked_key_count == 3
    assert limiter.check("203.0.113.1").allowed
    assert not limiter.check("203.0.113.1").allowed
    assert limiter.tracked_key_count == 3

    clock.now = 600.0
    assert limiter.check("203.0.113.4").allowed
    assert limiter.tracked_key_count <= 3


def test_concurrent_callers_serialize_and_clamp_backward_clock_observations() -> None:
    class DescendingClock:
        def __init__(self) -> None:
            self._next = 100.0
            self._lock = threading.Lock()

        def __call__(self) -> float:
            with self._lock:
                value = self._next
                self._next -= 1.0
                return value

        def advance(self, value: float) -> None:
            with self._lock:
                self._next = value

    clock = DescendingClock()
    limiter = SlidingWindowRateLimiter(limit=32, window_seconds=10, clock=clock)

    with ThreadPoolExecutor(max_workers=8) as executor:
        decisions = tuple(executor.map(lambda _index: limiter.check("203.0.113.10"), range(32)))

    assert all(decision.allowed for decision in decisions)
    assert not limiter.check("203.0.113.10").allowed
    clock.advance(111.0)
    assert limiter.check("203.0.113.11").allowed
    assert limiter.tracked_key_count == 1


def test_nonblocking_gate_grants_two_slots_and_does_not_queue_a_third() -> None:
    async def run() -> None:
        gate = NonBlockingConcurrencyGate()
        first, second, third = await asyncio.gather(
            gate.try_acquire(),
            gate.try_acquire(),
            gate.try_acquire(),
        )

        assert first is not None
        assert second is not None
        assert third is None
        assert gate.active_count == 2

        await first.release()
        replacement = await gate.try_acquire()
        assert replacement is not None
        assert gate.active_count == 2

        await second.release()
        await replacement.release()
        assert gate.active_count == 0

    asyncio.run(run())


def test_concurrency_lease_releases_after_failure_and_is_idempotent() -> None:
    async def run() -> None:
        gate = NonBlockingConcurrencyGate(capacity=1)
        lease = await gate.try_acquire()
        assert lease is not None

        with pytest.raises(RuntimeError, match="boom"):
            async with lease:
                raise RuntimeError("boom")

        assert gate.active_count == 0
        await lease.release()
        assert gate.active_count == 0
        assert await gate.try_acquire() is not None

    asyncio.run(run())
