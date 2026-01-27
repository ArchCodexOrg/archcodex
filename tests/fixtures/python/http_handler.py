"""HTTP handlers for the user API."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Dict
import json
import logging

logger = logging.getLogger(__name__)


class UserService(ABC):
    """Interface for user operations."""

    @abstractmethod
    def get_user(self, user_id: str) -> Optional[dict]:
        """Retrieve a user by ID."""

    @abstractmethod
    def list_users(self, page: int = 0) -> List[dict]:
        """List users with pagination."""

    @abstractmethod
    def create_user(self, data: dict) -> dict:
        """Create a new user."""

    @abstractmethod
    def delete_user(self, user_id: str) -> bool:
        """Delete a user by ID."""


@dataclass
class User:
    """User entity."""
    id: str
    name: str
    email: str
    active: bool = True
    metadata: Dict[str, str] = field(default_factory=dict)


class Handler:
    """Serves HTTP requests for the user API."""

    MAX_PAGE_SIZE = 100

    def __init__(self, svc: UserService, debug: bool = False):
        self._svc = svc
        self._debug = debug
        self._request_count = 0

    def get_user(self, request: dict) -> dict:
        """Handle GET /users/:id."""
        user_id = request.get("id")
        if not user_id:
            return {"error": "missing id", "status": 400}

        user = self._svc.get_user(user_id)
        if user is None:
            logger.warning("User not found: %s", user_id)
            return {"error": "not found", "status": 404}

        self._request_count += 1
        return {"data": user, "status": 200}

    def list_users(self, request: dict) -> dict:
        """Handle GET /users."""
        page = request.get("page", 0)
        users = self._svc.list_users(page)
        self._request_count += 1
        return {"data": users, "status": 200}

    def create_user(self, request: dict) -> dict:
        """Handle POST /users."""
        body = request.get("body", {})
        try:
            user = self._svc.create_user(body)
            self._request_count += 1
            return {"data": user, "status": 201}
        except ValueError as e:
            logger.error("Create failed: %s", e)
            return {"error": str(e), "status": 400}

    def _validate_request(self, request: dict) -> bool:
        """Protected: validate incoming request."""
        return "id" in request or "body" in request

    def __reset_counters(self):
        """Private: reset internal counters."""
        self._request_count = 0


class HealthCheck:
    """Simple health check handler."""

    def check(self) -> dict:
        return {"status": "ok"}


def create_app(svc: UserService, debug: bool = False) -> Handler:
    """Factory function to create the application handler."""
    handler = Handler(svc, debug=debug)
    logger.info("Application created, debug=%s", debug)
    return handler


def _setup_logging(level: str = "INFO") -> None:
    """Internal helper for logging setup."""
    logging.basicConfig(level=getattr(logging, level))
