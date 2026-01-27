// Package repository provides data access abstractions.
package repository

import (
	"context"
	"database/sql"
	"errors"
	"sync"
)

// Sentinel errors for repository operations.
var (
	ErrNotFound    = errors.New("entity not found")
	ErrDuplicate   = errors.New("duplicate entity")
	ErrConnection  = errors.New("connection failed")
	errPoolClosed  = errors.New("pool is closed")
)

// Entity is the base type for all persisted objects.
type Entity struct {
	ID        string
	Version   int
	CreatedAt int64
	UpdatedAt int64
}

// Repository defines CRUD operations.
type Repository interface {
	FindByID(ctx context.Context, id string) (*Entity, error)
	FindAll(ctx context.Context) ([]*Entity, error)
	Save(ctx context.Context, entity *Entity) error
	Delete(ctx context.Context, id string) error
}

// Cacheable adds caching contract.
type Cacheable interface {
	Invalidate(key string)
	Warm(ctx context.Context) error
}

// SQLRepository implements Repository with a SQL backend.
type SQLRepository struct {
	sync.RWMutex
	db     *sql.DB
	cache  map[string]*Entity
}

// NewSQLRepository creates a SQLRepository.
func NewSQLRepository(db *sql.DB) *SQLRepository {
	return &SQLRepository{
		db:    db,
		cache: make(map[string]*Entity),
	}
}

// FindByID looks up an entity by ID, checking cache first.
func (r *SQLRepository) FindByID(ctx context.Context, id string) (*Entity, error) {
	r.RLock()
	if cached, ok := r.cache[id]; ok {
		r.RUnlock()
		return cached, nil
	}
	r.RUnlock()

	row := r.db.QueryRowContext(ctx, "SELECT id, version FROM entities WHERE id = ?", id)
	entity := &Entity{}
	if err := row.Scan(&entity.ID, &entity.Version); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	r.Lock()
	r.cache[id] = entity
	r.Unlock()

	return entity, nil
}

// FindAll returns all entities.
func (r *SQLRepository) FindAll(ctx context.Context) ([]*Entity, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT id, version FROM entities")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entities []*Entity
	for rows.Next() {
		e := &Entity{}
		if err := rows.Scan(&e.ID, &e.Version); err != nil {
			return nil, err
		}
		entities = append(entities, e)
	}
	return entities, rows.Err()
}

// Save persists an entity and updates the cache.
func (r *SQLRepository) Save(ctx context.Context, entity *Entity) error {
	_, err := r.db.ExecContext(ctx, "INSERT INTO entities (id, version) VALUES (?, ?)", entity.ID, entity.Version)
	if err != nil {
		return err
	}

	r.Lock()
	r.cache[entity.ID] = entity
	r.Unlock()
	return nil
}

// Delete removes an entity and invalidates the cache.
func (r *SQLRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM entities WHERE id = ?", id)
	if err != nil {
		return err
	}

	r.Lock()
	delete(r.cache, id)
	r.Unlock()
	return nil
}

// Invalidate removes a cache entry.
func (r *SQLRepository) Invalidate(key string) {
	r.Lock()
	delete(r.cache, key)
	r.Unlock()
}

// Warm pre-loads all entities into cache.
func (r *SQLRepository) Warm(ctx context.Context) error {
	entities, err := r.FindAll(ctx)
	if err != nil {
		return err
	}

	r.Lock()
	for _, e := range entities {
		r.cache[e.ID] = e
	}
	r.Unlock()
	return nil
}

// newInternalHelper is unexported.
func newInternalHelper() string {
	return "helper"
}
