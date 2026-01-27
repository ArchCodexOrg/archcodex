"""Data access layer with repository pattern."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional, Protocol
import threading
import sqlite3


class NotFoundError(Exception):
    """Raised when an entity is not found."""


class DuplicateError(Exception):
    """Raised when a duplicate entity is detected."""


class _ConnectionError(Exception):
    """Internal connection error."""


@dataclass
class Entity:
    """Base entity for all persisted objects."""
    id: str
    version: int = 0
    created_at: int = 0
    updated_at: int = 0


class Repository(ABC):
    """Abstract base for data access."""

    @abstractmethod
    def find_by_id(self, entity_id: str) -> Optional[Entity]:
        """Find an entity by ID."""

    @abstractmethod
    def find_all(self) -> List[Entity]:
        """Return all entities."""

    @abstractmethod
    def save(self, entity: Entity) -> None:
        """Persist an entity."""

    @abstractmethod
    def delete(self, entity_id: str) -> bool:
        """Delete an entity by ID."""


class Cacheable(Protocol):
    """Protocol for cacheable repositories."""

    def invalidate(self, key: str) -> None: ...
    def warm(self) -> None: ...


class SQLRepository(Repository):
    """SQL-backed repository with in-memory cache."""

    def __init__(self, db: sqlite3.Connection):
        self._db = db
        self._cache: dict = {}
        self._lock = threading.RLock()

    def find_by_id(self, entity_id: str) -> Optional[Entity]:
        """Find entity, checking cache first."""
        with self._lock:
            if entity_id in self._cache:
                return self._cache[entity_id]

        cursor = self._db.execute(
            "SELECT id, version FROM entities WHERE id = ?",
            (entity_id,)
        )
        row = cursor.fetchone()
        if row is None:
            return None

        entity = Entity(id=row[0], version=row[1])
        with self._lock:
            self._cache[entity_id] = entity
        return entity

    def find_all(self) -> List[Entity]:
        """Return all entities from database."""
        cursor = self._db.execute("SELECT id, version FROM entities")
        entities = []
        for row in cursor.fetchall():
            entities.append(Entity(id=row[0], version=row[1]))
        return entities

    def save(self, entity: Entity) -> None:
        """Save entity and update cache."""
        self._db.execute(
            "INSERT OR REPLACE INTO entities (id, version) VALUES (?, ?)",
            (entity.id, entity.version)
        )
        self._db.commit()
        with self._lock:
            self._cache[entity.id] = entity

    def delete(self, entity_id: str) -> bool:
        """Delete entity and invalidate cache."""
        cursor = self._db.execute(
            "DELETE FROM entities WHERE id = ?",
            (entity_id,)
        )
        self._db.commit()
        with self._lock:
            self._cache.pop(entity_id, None)
        return cursor.rowcount > 0

    def invalidate(self, key: str) -> None:
        """Remove a cache entry."""
        with self._lock:
            self._cache.pop(key, None)

    def warm(self) -> None:
        """Pre-load all entities into cache."""
        entities = self.find_all()
        with self._lock:
            for e in entities:
                self._cache[e.id] = e

    def __clear_cache(self):
        """Private: clear the entire cache."""
        self._cache.clear()


def create_repository(db_path: str) -> SQLRepository:
    """Factory to create a connected repository."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, version INTEGER)"
    )
    return SQLRepository(conn)


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Internal: run schema migrations."""
    conn.execute("PRAGMA journal_mode=WAL")
