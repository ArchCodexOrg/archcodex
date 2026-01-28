"""
Advanced Python patterns for comprehensive parser testing.

This module demonstrates real-world patterns including:
- Complex inheritance and protocols
- Async/await patterns
- Decorators with arguments
- Property decorators
- Context managers
- Generics with TypeVar
- Nested classes
- Multiple inheritance
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import logging
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import (
    Any,
    Callable,
    Dict,
    Generic,
    Iterator,
    List,
    Optional,
    Protocol,
    TypeVar,
    Union,
    runtime_checkable,
)

# Type variables for generics
T = TypeVar("T")
K = TypeVar("K")
V = TypeVar("V")

logger = logging.getLogger(__name__)


# =============================================================================
# Enums
# =============================================================================


class Status(Enum):
    """Status enumeration."""
    PENDING = auto()
    RUNNING = auto()
    COMPLETED = auto()
    FAILED = auto()


class Priority(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


# =============================================================================
# Protocols (Structural Subtyping)
# =============================================================================


@runtime_checkable
class Serializable(Protocol):
    """Protocol for objects that can be serialized."""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        ...

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Serializable:
        """Create from dictionary."""
        ...


class Comparable(Protocol[T]):
    """Protocol for comparable objects."""

    def __lt__(self, other: T) -> bool:
        ...

    def __eq__(self, other: object) -> bool:
        ...


class AsyncRepository(Protocol[T]):
    """Async repository protocol with generics."""

    async def get(self, id: str) -> Optional[T]:
        ...

    async def save(self, entity: T) -> None:
        ...

    async def delete(self, id: str) -> bool:
        ...

    async def find_all(
        self,
        filter_fn: Optional[Callable[[T], bool]] = None,
        limit: int = 100,
    ) -> List[T]:
        ...


# =============================================================================
# Abstract Base Classes
# =============================================================================


class BaseEntity(ABC):
    """Abstract base entity with common fields."""

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier."""

    @property
    @abstractmethod
    def created_at(self) -> float:
        """Creation timestamp."""

    @abstractmethod
    def validate(self) -> bool:
        """Validate entity state."""

    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, BaseEntity):
            return NotImplemented
        return self.id == other.id


class BaseService(ABC, Generic[T]):
    """Generic service base class."""

    def __init__(self, repository: AsyncRepository[T]):
        self._repository = repository
        self._cache: Dict[str, T] = {}

    @abstractmethod
    async def process(self, entity: T) -> T:
        """Process an entity."""

    async def get_or_create(self, id: str, factory: Callable[[], T]) -> T:
        """Get existing or create new entity."""
        existing = await self._repository.get(id)
        if existing:
            return existing
        new_entity = factory()
        await self._repository.save(new_entity)
        return new_entity


# =============================================================================
# Dataclasses with Complex Fields
# =============================================================================


@dataclass(frozen=True)
class Address:
    """Immutable address value object."""
    street: str
    city: str
    country: str
    postal_code: str

    def format(self) -> str:
        return f"{self.street}, {self.city}, {self.postal_code}, {self.country}"


@dataclass
class User(BaseEntity):
    """User entity with complex fields."""
    _id: str
    name: str
    email: str
    addresses: List[Address] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: Status = Status.PENDING
    _created_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())

    @property
    def id(self) -> str:
        return self._id

    @property
    def created_at(self) -> float:
        return self._created_at

    def validate(self) -> bool:
        return bool(self.name and self.email and "@" in self.email)

    @property
    def primary_address(self) -> Optional[Address]:
        """Get primary address if available."""
        return self.addresses[0] if self.addresses else None

    @primary_address.setter
    def primary_address(self, address: Address) -> None:
        """Set primary address."""
        if self.addresses:
            self.addresses[0] = address
        else:
            self.addresses.append(address)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self._id,
            "name": self.name,
            "email": self.email,
            "status": self.status.name,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> User:
        return cls(
            _id=data["id"],
            name=data["name"],
            email=data["email"],
            status=Status[data.get("status", "PENDING")],
        )


# =============================================================================
# Generic Container Classes
# =============================================================================


class Result(Generic[T]):
    """Result monad for error handling."""

    def __init__(self, value: Optional[T] = None, error: Optional[Exception] = None):
        self._value = value
        self._error = error

    @classmethod
    def ok(cls, value: T) -> Result[T]:
        return cls(value=value)

    @classmethod
    def err(cls, error: Exception) -> Result[T]:
        return cls(error=error)

    @property
    def is_ok(self) -> bool:
        return self._error is None

    def unwrap(self) -> T:
        if self._error:
            raise self._error
        return self._value  # type: ignore

    def map(self, fn: Callable[[T], V]) -> Result[V]:
        if self._error:
            return Result.err(self._error)
        try:
            return Result.ok(fn(self._value))  # type: ignore
        except Exception as e:
            return Result.err(e)


class Cache(Generic[K, V]):
    """Generic LRU cache implementation."""

    def __init__(self, max_size: int = 100):
        self._max_size = max_size
        self._data: Dict[K, V] = {}
        self._access_order: List[K] = []

    def get(self, key: K) -> Optional[V]:
        if key in self._data:
            self._access_order.remove(key)
            self._access_order.append(key)
            return self._data[key]
        return None

    def set(self, key: K, value: V) -> None:
        if key in self._data:
            self._access_order.remove(key)
        elif len(self._data) >= self._max_size:
            oldest = self._access_order.pop(0)
            del self._data[oldest]
        self._data[key] = value
        self._access_order.append(key)

    def __contains__(self, key: K) -> bool:
        return key in self._data


# =============================================================================
# Decorators
# =============================================================================


def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    exceptions: tuple = (Exception,),
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Retry decorator with configurable attempts and delay."""

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            last_exception: Optional[Exception] = None
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(delay * (attempt + 1))
                    logger.warning(f"Attempt {attempt + 1} failed: {e}")
            raise last_exception  # type: ignore

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> T:
            last_exception: Optional[Exception] = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    logger.warning(f"Attempt {attempt + 1} failed: {e}")
            raise last_exception  # type: ignore

        if asyncio.iscoroutinefunction(func):
            return async_wrapper  # type: ignore
        return sync_wrapper

    return decorator


def validate_input(*validators: Callable[[Any], bool]) -> Callable:
    """Decorator to validate function inputs."""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            for i, (arg, validator) in enumerate(zip(args, validators)):
                if not validator(arg):
                    raise ValueError(f"Argument {i} failed validation")
            return func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# Context Managers
# =============================================================================


class DatabaseConnection:
    """Database connection with context manager support."""

    def __init__(self, connection_string: str):
        self._connection_string = connection_string
        self._connected = False

    def connect(self) -> None:
        logger.info(f"Connecting to {self._connection_string}")
        self._connected = True

    def disconnect(self) -> None:
        logger.info("Disconnecting")
        self._connected = False

    def __enter__(self) -> DatabaseConnection:
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        self.disconnect()
        return False

    async def __aenter__(self) -> DatabaseConnection:
        self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        self.disconnect()
        return False


@contextlib.contextmanager
def timer(name: str) -> Iterator[None]:
    """Context manager to time a block of code."""
    import time
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        logger.info(f"{name} took {elapsed:.3f}s")


@asynccontextmanager
async def async_timer(name: str):
    """Async context manager to time a block of code."""
    import time
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        logger.info(f"{name} took {elapsed:.3f}s")


# =============================================================================
# Async Service Implementation
# =============================================================================


class UserService(BaseService[User]):
    """Concrete user service implementation."""

    def __init__(
        self,
        repository: AsyncRepository[User],
        cache: Optional[Cache[str, User]] = None,
    ):
        super().__init__(repository)
        self._user_cache = cache or Cache(max_size=1000)

    async def process(self, entity: User) -> User:
        """Process user entity."""
        if not entity.validate():
            raise ValueError("Invalid user entity")
        entity.status = Status.RUNNING
        await self._repository.save(entity)
        return entity

    @retry(max_attempts=3, delay=0.5, exceptions=(ConnectionError, TimeoutError))
    async def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID with caching and retry."""
        cached = self._user_cache.get(user_id)
        if cached:
            return cached

        user = await self._repository.get(user_id)
        if user:
            self._user_cache.set(user_id, user)
        return user

    async def bulk_create(self, users: List[User]) -> List[Result[User]]:
        """Create multiple users, returning results for each."""
        results: List[Result[User]] = []
        for user in users:
            try:
                processed = await self.process(user)
                results.append(Result.ok(processed))
            except Exception as e:
                results.append(Result.err(e))
        return results

    async def find_by_email(self, email: str) -> Optional[User]:
        """Find user by email address."""
        users = await self._repository.find_all(
            filter_fn=lambda u: u.email.lower() == email.lower(),
            limit=1,
        )
        return users[0] if users else None


# =============================================================================
# Nested Classes and Inner Types
# =============================================================================


class EventSystem:
    """Event system with nested handler classes."""

    class Event:
        """Base event class."""
        def __init__(self, name: str, data: Any = None):
            self.name = name
            self.data = data
            self.timestamp = asyncio.get_event_loop().time()

    class Handler(ABC):
        """Abstract event handler."""

        @abstractmethod
        async def handle(self, event: EventSystem.Event) -> None:
            """Handle an event."""

        class Config:
            """Handler configuration."""
            def __init__(self, priority: Priority = Priority.MEDIUM):
                self.priority = priority

    def __init__(self):
        self._handlers: Dict[str, List[EventSystem.Handler]] = {}

    def register(self, event_name: str, handler: Handler) -> None:
        """Register a handler for an event."""
        if event_name not in self._handlers:
            self._handlers[event_name] = []
        self._handlers[event_name].append(handler)

    async def emit(self, event: Event) -> None:
        """Emit an event to all registered handlers."""
        handlers = self._handlers.get(event.name, [])
        await asyncio.gather(*[h.handle(event) for h in handlers])


# =============================================================================
# Multiple Inheritance
# =============================================================================


class Auditable:
    """Mixin for auditable entities."""

    _audit_log: List[str]

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        cls._audit_log = []

    def log_change(self, message: str) -> None:
        self._audit_log.append(f"{asyncio.get_event_loop().time()}: {message}")

    def get_audit_log(self) -> List[str]:
        return self._audit_log.copy()


class Versioned:
    """Mixin for versioned entities."""

    _version: int = 0

    def increment_version(self) -> int:
        self._version += 1
        return self._version

    @property
    def version(self) -> int:
        return self._version


@dataclass
class AuditedUser(User, Auditable, Versioned):
    """User with audit trail and versioning."""

    def save(self) -> None:
        self.increment_version()
        self.log_change(f"Saved version {self.version}")


# =============================================================================
# Factory and Builder Patterns
# =============================================================================


class UserBuilder:
    """Builder pattern for User objects."""

    def __init__(self):
        self._id: Optional[str] = None
        self._name: Optional[str] = None
        self._email: Optional[str] = None
        self._addresses: List[Address] = []
        self._metadata: Dict[str, Any] = {}

    def with_id(self, id: str) -> UserBuilder:
        self._id = id
        return self

    def with_name(self, name: str) -> UserBuilder:
        self._name = name
        return self

    def with_email(self, email: str) -> UserBuilder:
        self._email = email
        return self

    def with_address(self, address: Address) -> UserBuilder:
        self._addresses.append(address)
        return self

    def with_metadata(self, key: str, value: Any) -> UserBuilder:
        self._metadata[key] = value
        return self

    def build(self) -> User:
        if not all([self._id, self._name, self._email]):
            raise ValueError("id, name, and email are required")
        return User(
            _id=self._id,  # type: ignore
            name=self._name,  # type: ignore
            email=self._email,  # type: ignore
            addresses=self._addresses,
            metadata=self._metadata,
        )


def create_user_factory(
    default_status: Status = Status.PENDING,
) -> Callable[[str, str, str], User]:
    """Factory function that creates user factory functions."""

    def factory(id: str, name: str, email: str) -> User:
        user = User(_id=id, name=name, email=email, status=default_status)
        return user

    return factory


# =============================================================================
# Module-level functions
# =============================================================================


async def process_users_batch(
    users: List[User],
    processor: Callable[[User], User],
    concurrency: int = 10,
) -> List[Result[User]]:
    """Process users in batches with limited concurrency."""
    semaphore = asyncio.Semaphore(concurrency)

    async def process_one(user: User) -> Result[User]:
        async with semaphore:
            try:
                result = processor(user)
                return Result.ok(result)
            except Exception as e:
                return Result.err(e)

    return await asyncio.gather(*[process_one(u) for u in users])


def _internal_helper(data: Any) -> str:
    """Internal helper function (protected by convention)."""
    return str(data)


def __private_function() -> None:
    """Private function (name-mangled in classes)."""
    pass


# Exports
__all__ = [
    "Status",
    "Priority",
    "Serializable",
    "Comparable",
    "AsyncRepository",
    "BaseEntity",
    "BaseService",
    "Address",
    "User",
    "Result",
    "Cache",
    "retry",
    "validate_input",
    "DatabaseConnection",
    "timer",
    "async_timer",
    "UserService",
    "EventSystem",
    "AuditedUser",
    "UserBuilder",
    "create_user_factory",
    "process_users_batch",
]
