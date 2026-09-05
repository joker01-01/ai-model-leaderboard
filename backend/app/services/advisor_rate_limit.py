"""In-process request and web-capacity gates for the single-worker advisor."""

from __future__ import annotations

import math
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from heapq import heappop, heappush
from time import monotonic


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int | None
    remaining: int


class SlidingWindowRateLimiter:
    """Atomic accepted-request counter using an injectable monotonic clock."""

    def __init__(
        self,
        *,
        limit: int = 5,
        window_seconds: float = 600.0,
        max_keys: int = 10_000,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        if not math.isfinite(window_seconds) or window_seconds <= 0:
            raise ValueError("window_seconds must be a positive finite number")
        if max_keys <= 0:
            raise ValueError("max_keys must be positive")
        self._limit = limit
        self._window_seconds = window_seconds
        self._max_keys = max_keys
        self._clock = clock
        self._events: dict[str, deque[tuple[float, int]]] = {}
        self._expirations: list[tuple[float, int, str]] = []
        self._sequence = 0
        self._last_timestamp = -math.inf
        self._lock = threading.Lock()

    @property
    def tracked_key_count(self) -> int:
        with self._lock:
            return len(self._events)

    def _expire(self, now: float) -> None:
        while self._expirations and self._expirations[0][0] <= now:
            _expires_at, token, key = heappop(self._expirations)
            events = self._events.get(key)
            if events is None or not events or events[0][1] != token:
                continue
            events.popleft()
            if not events:
                del self._events[key]

    def check(self, key: str) -> RateLimitDecision:
        if not key or key.strip() != key:
            raise ValueError("rate-limit key must be non-empty without surrounding whitespace")
        with self._lock:
            observed_now = self._clock()
            if not math.isfinite(observed_now):
                raise ValueError("clock must return a finite number")
            now = max(observed_now, self._last_timestamp)
            self._last_timestamp = now
            self._expire(now)
            events = self._events.get(key)
            if events is None:
                if len(self._events) >= self._max_keys:
                    # Unknown keys fail closed without an O(number-of-keys) scan. A full
                    # window is conservative even when one occupied bucket expires sooner.
                    return RateLimitDecision(
                        allowed=False,
                        retry_after_seconds=math.ceil(self._window_seconds),
                        remaining=0,
                    )
                events = deque()
                self._events[key] = events
            if len(events) >= self._limit:
                retry_after = max(1, math.ceil(events[0][0] + self._window_seconds - now))
                return RateLimitDecision(allowed=False, retry_after_seconds=retry_after, remaining=0)

            self._sequence += 1
            token = self._sequence
            events.append((now, token))
            heappush(self._expirations, (now + self._window_seconds, token, key))
            return RateLimitDecision(
                allowed=True,
                retry_after_seconds=None,
                remaining=self._limit - len(events),
            )


class ConcurrencyLease:
    """Idempotently releases one acquired non-queueing capacity slot."""

    def __init__(self, gate: NonBlockingConcurrencyGate) -> None:
        self._gate = gate
        self._released = False

    async def __aenter__(self) -> ConcurrencyLease:
        if self._released:
            raise RuntimeError("a released concurrency lease cannot be reused")
        return self

    async def __aexit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        await self.release()

    async def release(self) -> None:
        if self._released:
            return
        self._released = True
        await self._gate._release()  # noqa: SLF001 - the lease is the gate's release token


class NonBlockingConcurrencyGate:
    """Atomically grants capacity or returns immediately without a work queue."""

    def __init__(self, *, capacity: int = 2) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self._capacity = capacity
        self._active = 0
        self._lock = threading.Lock()

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def active_count(self) -> int:
        with self._lock:
            return self._active

    async def try_acquire(self) -> ConcurrencyLease | None:
        with self._lock:
            if self._active >= self._capacity:
                return None
            self._active += 1
        return ConcurrencyLease(self)

    async def _release(self) -> None:
        with self._lock:
            if self._active <= 0:
                raise RuntimeError("concurrency gate released without an active lease")
            self._active -= 1
