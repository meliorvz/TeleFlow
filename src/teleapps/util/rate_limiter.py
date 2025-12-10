"""Rate limiter for Telegram API calls."""

import asyncio
from typing import Any, Coroutine, TypeVar
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from telethon.errors import FloodWaitError

T = TypeVar("T")


class TelegramRateLimiter:
    """Handles Telegram API rate limits with exponential backoff."""
    
    def __init__(self, min_delay: float = 0.5, max_delay: float = 60.0):
        self.min_delay = min_delay
        self.max_delay = max_delay
        self._last_call = 0.0
    
    async def execute(self, coro: Coroutine[Any, Any, T]) -> T:
        """Execute a coroutine with automatic retry on rate limit.
        
        Handles FloodWaitError by waiting the required time.
        """
        while True:
            try:
                # Small delay between calls
                await asyncio.sleep(self.min_delay)
                return await coro
            except FloodWaitError as e:
                wait_time = min(e.seconds + 1, self.max_delay)
                await asyncio.sleep(wait_time)


# Default rate limiter instance
_default_limiter: TelegramRateLimiter | None = None


def get_rate_limiter() -> TelegramRateLimiter:
    """Get the default rate limiter instance."""
    global _default_limiter
    if _default_limiter is None:
        _default_limiter = TelegramRateLimiter()
    return _default_limiter
