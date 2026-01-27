"""
Middleware components for request processing.

This module provides composable middleware for logging,
authentication, and rate limiting.
"""

from abc import ABC, abstractmethod
from typing import Callable, Any, Dict, Optional
import time
import logging
import functools

__all__ = [
    "Middleware",
    "LoggingMiddleware",
    "AuthMiddleware",
    "chain",
    "DEFAULT_TIMEOUT",
]

DEFAULT_TIMEOUT = 30
MAX_RETRIES = 5
_internal_counter = 0

logger = logging.getLogger(__name__)


class TokenValidator(ABC):
    """Interface for token validation."""

    @abstractmethod
    def validate(self, token: str) -> Optional[str]:
        """Validate a token, return user ID or None."""

    @abstractmethod
    def refresh(self, token: str) -> str:
        """Refresh an expired token."""


class RateLimiter(ABC):
    """Interface for rate limiting."""

    @abstractmethod
    def allow(self, key: str) -> bool:
        """Check if a request is allowed."""

    @abstractmethod
    def reset(self, key: str) -> None:
        """Reset the limit for a key."""


class Middleware(ABC):
    """Base middleware class."""

    def __init__(self, name: str):
        self._name = name

    @abstractmethod
    def process(self, request: dict) -> dict:
        """Process a request through this middleware."""

    def _log(self, message: str) -> None:
        """Protected: log a message with middleware name."""
        logger.info("[%s] %s", self._name, message)

    def __repr__(self) -> str:
        return f"Middleware({self._name!r})"


class LoggingMiddleware(Middleware):
    """Logs request timing and details."""

    def __init__(self, verbose: bool = False):
        super().__init__("logging")
        self._verbose = verbose
        self.request_count = 0

    def process(self, request: dict) -> dict:
        """Log and forward the request."""
        start = time.monotonic()
        self.request_count += 1
        self._log(f"Processing request #{self.request_count}")

        if self._verbose:
            logger.debug("Request details: %s", request)

        elapsed = time.monotonic() - start
        self._log(f"Completed in {elapsed:.4f}s")
        return request

    def set_verbose(self, verbose: bool) -> None:
        """Update verbosity setting."""
        self._verbose = verbose


@functools.lru_cache(maxsize=128)
def _cached_lookup(key: str) -> Optional[str]:
    """Internal: cached key lookup."""
    return None


class AuthMiddleware(Middleware):
    """Validates authentication tokens."""

    def __init__(self, validator: TokenValidator):
        super().__init__("auth")
        self._validator = validator
        self._failed_attempts: Dict[str, int] = {}

    def process(self, request: dict) -> dict:
        """Validate auth token in request."""
        token = request.get("token", "")
        if not token:
            self._log("Missing token")
            request["auth_error"] = "unauthorized"
            return request

        user_id = self._validator.validate(token)
        if user_id is None:
            ip = request.get("ip", "unknown")
            self._failed_attempts[ip] = self._failed_attempts.get(ip, 0) + 1
            self._log(f"Auth failed for {ip}")
            request["auth_error"] = "forbidden"
            return request

        request["user_id"] = user_id
        self._log(f"Authenticated user={user_id}")
        return request

    def _check_brute_force(self, ip: str) -> bool:
        """Protected: check for brute force attempts."""
        return self._failed_attempts.get(ip, 0) > MAX_RETRIES


class _InternalTracker:
    """Private: tracks internal metrics."""

    def __init__(self):
        self._data: dict = {}

    def record(self, key: str, value: Any) -> None:
        self._data[key] = value


def chain(*middlewares: Middleware) -> Callable:
    """Compose multiple middleware into a processing pipeline."""
    def process(request: dict) -> dict:
        for mw in middlewares:
            request = mw.process(request)
        return request
    return process


def create_logging_middleware(verbose: bool = False) -> LoggingMiddleware:
    """Factory for creating a logging middleware."""
    return LoggingMiddleware(verbose=verbose)


def _reset_internal_state() -> None:
    """Internal: reset module state for testing."""
    global _internal_counter
    _internal_counter = 0
