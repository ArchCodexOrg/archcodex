// Package patterns demonstrates advanced Go patterns for parser testing.
//
// This package includes:
//   - Generics (Go 1.18+)
//   - Interface composition and embedding
//   - Struct embedding (multiple levels)
//   - Functional options pattern
//   - Builder pattern with method chaining
//   - Context usage patterns
//   - Error wrapping
//   - Goroutines and channels
//   - Closures
//   - Multi-line signatures
package patterns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"
)

// =============================================================================
// Custom Errors
// =============================================================================

var (
	// ErrNotFound indicates a resource was not found.
	ErrNotFound = errors.New("not found")

	// ErrInvalidInput indicates invalid input was provided.
	ErrInvalidInput = errors.New("invalid input")

	// ErrTimeout indicates an operation timed out.
	ErrTimeout = errors.New("timeout")

	// errInternal is an unexported error for internal use.
	errInternal = errors.New("internal error")
)

// ValidationError wraps validation failures with field information.
type ValidationError struct {
	Field   string
	Message string
	Cause   error
}

func (e *ValidationError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (%v)", e.Field, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

func (e *ValidationError) Unwrap() error {
	return e.Cause
}

// =============================================================================
// Generics - Constraints and Type Parameters
// =============================================================================

// Ordered is a constraint for ordered types.
type Ordered interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 |
		~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 |
		~float32 | ~float64 | ~string
}

// Comparable is a constraint for comparable types.
type Comparable[T any] interface {
	Compare(other T) int
}

// Result represents a result that can be either a value or an error.
type Result[T any] struct {
	value T
	err   error
	isOk  bool
}

// Ok creates a successful result.
func Ok[T any](value T) Result[T] {
	return Result[T]{value: value, isOk: true}
}

// Err creates an error result.
func Err[T any](err error) Result[T] {
	return Result[T]{err: err, isOk: false}
}

// IsOk returns true if the result is successful.
func (r Result[T]) IsOk() bool {
	return r.isOk
}

// Unwrap returns the value or panics if error.
func (r Result[T]) Unwrap() T {
	if !r.isOk {
		panic(r.err)
	}
	return r.value
}

// UnwrapOr returns the value or a default.
func (r Result[T]) UnwrapOr(defaultVal T) T {
	if !r.isOk {
		return defaultVal
	}
	return r.value
}

// Map transforms the value if successful.
func Map[T, U any](r Result[T], fn func(T) U) Result[U] {
	if !r.isOk {
		return Err[U](r.err)
	}
	return Ok(fn(r.value))
}

// Cache is a generic thread-safe cache.
type Cache[K comparable, V any] struct {
	mu    sync.RWMutex
	items map[K]cacheEntry[V]
	ttl   time.Duration
}

type cacheEntry[V any] struct {
	value     V
	expiresAt time.Time
}

// NewCache creates a new cache with the given TTL.
func NewCache[K comparable, V any](ttl time.Duration) *Cache[K, V] {
	return &Cache[K, V]{
		items: make(map[K]cacheEntry[V]),
		ttl:   ttl,
	}
}

// Get retrieves a value from the cache.
func (c *Cache[K, V]) Get(key K) (V, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.items[key]
	if !ok || time.Now().After(entry.expiresAt) {
		var zero V
		return zero, false
	}
	return entry.value, true
}

// Set stores a value in the cache.
func (c *Cache[K, V]) Set(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[key] = cacheEntry[V]{
		value:     value,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Container is a generic container with constraints.
type Container[T Ordered] struct {
	items []T
}

// Add adds an item to the container.
func (c *Container[T]) Add(item T) {
	c.items = append(c.items, item)
}

// Min returns the minimum item.
func (c *Container[T]) Min() (T, bool) {
	if len(c.items) == 0 {
		var zero T
		return zero, false
	}
	min := c.items[0]
	for _, item := range c.items[1:] {
		if item < min {
			min = item
		}
	}
	return min, true
}

// =============================================================================
// Interface Composition
// =============================================================================

// Reader is like io.Reader but with context.
type Reader interface {
	Read(ctx context.Context, p []byte) (n int, err error)
}

// Writer is like io.Writer but with context.
type Writer interface {
	Write(ctx context.Context, p []byte) (n int, err error)
}

// Closer is like io.Closer but with context.
type Closer interface {
	Close(ctx context.Context) error
}

// ReadWriter combines Reader and Writer.
type ReadWriter interface {
	Reader
	Writer
}

// ReadWriteCloser combines Reader, Writer, and Closer.
type ReadWriteCloser interface {
	Reader
	Writer
	Closer
}

// Repository defines generic repository operations.
type Repository[T Entity] interface {
	Get(ctx context.Context, id string) (T, error)
	List(ctx context.Context, opts ListOptions) ([]T, error)
	Create(ctx context.Context, entity T) error
	Update(ctx context.Context, entity T) error
	Delete(ctx context.Context, id string) error
}

// Entity is the base interface for all entities.
type Entity interface {
	GetID() string
	Validate() error
}

// ListOptions configures list queries.
type ListOptions struct {
	Offset  int
	Limit   int
	OrderBy string
	Desc    bool
	Filters map[string]any
}

// =============================================================================
// Struct Embedding (Multiple Levels)
// =============================================================================

// BaseEntity provides common entity fields.
type BaseEntity struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetID returns the entity ID.
func (e *BaseEntity) GetID() string {
	return e.ID
}

// Touch updates the UpdatedAt timestamp.
func (e *BaseEntity) Touch() {
	e.UpdatedAt = time.Now()
}

// Auditable adds audit fields.
type Auditable struct {
	CreatedBy string `json:"created_by"`
	UpdatedBy string `json:"updated_by"`
}

// SoftDeletable adds soft delete support.
type SoftDeletable struct {
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
	DeletedBy string     `json:"deleted_by,omitempty"`
}

// IsDeleted checks if the entity is soft-deleted.
func (s *SoftDeletable) IsDeleted() bool {
	return s.DeletedAt != nil
}

// User represents a user with all embedded types.
type User struct {
	BaseEntity
	Auditable
	SoftDeletable

	Name     string            `json:"name"`
	Email    string            `json:"email"`
	Role     string            `json:"role"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Validate validates the user.
func (u *User) Validate() error {
	if u.Name == "" {
		return &ValidationError{Field: "name", Message: "required"}
	}
	if u.Email == "" {
		return &ValidationError{Field: "email", Message: "required"}
	}
	return nil
}

// =============================================================================
// Functional Options Pattern
// =============================================================================

// ServerOption configures a Server.
type ServerOption func(*Server)

// Server is a configurable server.
type Server struct {
	host         string
	port         int
	timeout      time.Duration
	maxConns     int
	logger       io.Writer
	middleware   []func(Handler) Handler
	shuttingDown atomic.Bool
}

// Handler is an HTTP handler type.
type Handler func(ctx context.Context, req any) (any, error)

// WithHost sets the server host.
func WithHost(host string) ServerOption {
	return func(s *Server) {
		s.host = host
	}
}

// WithPort sets the server port.
func WithPort(port int) ServerOption {
	return func(s *Server) {
		s.port = port
	}
}

// WithTimeout sets the request timeout.
func WithTimeout(timeout time.Duration) ServerOption {
	return func(s *Server) {
		s.timeout = timeout
	}
}

// WithMaxConnections sets the maximum connections.
func WithMaxConnections(max int) ServerOption {
	return func(s *Server) {
		s.maxConns = max
	}
}

// WithLogger sets the logger.
func WithLogger(w io.Writer) ServerOption {
	return func(s *Server) {
		s.logger = w
	}
}

// WithMiddleware adds middleware.
func WithMiddleware(mw ...func(Handler) Handler) ServerOption {
	return func(s *Server) {
		s.middleware = append(s.middleware, mw...)
	}
}

// NewServer creates a new server with options.
func NewServer(opts ...ServerOption) *Server {
	s := &Server{
		host:     "localhost",
		port:     8080,
		timeout:  30 * time.Second,
		maxConns: 100,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// Address returns the server address.
func (s *Server) Address() string {
	return fmt.Sprintf("%s:%d", s.host, s.port)
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) error {
	if !s.shuttingDown.CompareAndSwap(false, true) {
		return errors.New("already shutting down")
	}
	// Graceful shutdown logic would go here
	return nil
}

// =============================================================================
// Builder Pattern with Method Chaining
// =============================================================================

// QueryBuilder builds SQL-like queries.
type QueryBuilder struct {
	table      string
	columns    []string
	conditions []string
	orderBy    string
	limit      int
	offset     int
	err        error
}

// NewQueryBuilder creates a new query builder.
func NewQueryBuilder(table string) *QueryBuilder {
	return &QueryBuilder{table: table}
}

// Select specifies columns to select.
func (qb *QueryBuilder) Select(columns ...string) *QueryBuilder {
	qb.columns = columns
	return qb
}

// Where adds a condition.
func (qb *QueryBuilder) Where(condition string) *QueryBuilder {
	qb.conditions = append(qb.conditions, condition)
	return qb
}

// OrderBy sets the order.
func (qb *QueryBuilder) OrderBy(column string) *QueryBuilder {
	qb.orderBy = column
	return qb
}

// Limit sets the limit.
func (qb *QueryBuilder) Limit(n int) *QueryBuilder {
	qb.limit = n
	return qb
}

// Offset sets the offset.
func (qb *QueryBuilder) Offset(n int) *QueryBuilder {
	qb.offset = n
	return qb
}

// Build creates the final query string.
func (qb *QueryBuilder) Build() (string, error) {
	if qb.err != nil {
		return "", qb.err
	}
	if qb.table == "" {
		return "", errors.New("table is required")
	}
	// Build query string (simplified)
	return fmt.Sprintf("SELECT %v FROM %s", qb.columns, qb.table), nil
}

// =============================================================================
// Multi-line Function Signatures
// =============================================================================

// ProcessBatch processes a batch of items with complex configuration.
func ProcessBatch[T Entity](
	ctx context.Context,
	items []T,
	processor func(context.Context, T) (T, error),
	onSuccess func(T),
	onError func(T, error),
	concurrency int,
) ([]Result[T], error) {
	if len(items) == 0 {
		return nil, nil
	}

	results := make([]Result[T], len(items))
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for i, item := range items {
		wg.Add(1)
		go func(idx int, it T) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			result, err := processor(ctx, it)
			if err != nil {
				results[idx] = Err[T](err)
				if onError != nil {
					onError(it, err)
				}
			} else {
				results[idx] = Ok(result)
				if onSuccess != nil {
					onSuccess(result)
				}
			}
		}(i, item)
	}

	wg.Wait()
	return results, nil
}

// CreateUserWithOptions creates a user with validation and hooks.
func CreateUserWithOptions(
	ctx context.Context,
	repo Repository[*User],
	user *User,
	beforeCreate func(*User) error,
	afterCreate func(*User),
) (*User, error) {
	if err := user.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	if beforeCreate != nil {
		if err := beforeCreate(user); err != nil {
			return nil, fmt.Errorf("before create hook failed: %w", err)
		}
	}

	if err := repo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("create failed: %w", err)
	}

	if afterCreate != nil {
		afterCreate(user)
	}

	return user, nil
}

// =============================================================================
// Channels and Goroutines
// =============================================================================

// WorkerPool manages a pool of workers.
type WorkerPool[T any, R any] struct {
	workers    int
	jobQueue   chan T
	resultChan chan Result[R]
	processor  func(T) (R, error)
	done       chan struct{}
}

// NewWorkerPool creates a new worker pool.
func NewWorkerPool[T any, R any](
	workers int,
	queueSize int,
	processor func(T) (R, error),
) *WorkerPool[T, R] {
	return &WorkerPool[T, R]{
		workers:    workers,
		jobQueue:   make(chan T, queueSize),
		resultChan: make(chan Result[R], queueSize),
		processor:  processor,
		done:       make(chan struct{}),
	}
}

// Start starts the worker pool.
func (wp *WorkerPool[T, R]) Start(ctx context.Context) {
	for i := 0; i < wp.workers; i++ {
		go wp.worker(ctx, i)
	}
}

func (wp *WorkerPool[T, R]) worker(ctx context.Context, id int) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-wp.done:
			return
		case job, ok := <-wp.jobQueue:
			if !ok {
				return
			}
			result, err := wp.processor(job)
			if err != nil {
				wp.resultChan <- Err[R](err)
			} else {
				wp.resultChan <- Ok(result)
			}
		}
	}
}

// Submit submits a job to the pool.
func (wp *WorkerPool[T, R]) Submit(job T) {
	wp.jobQueue <- job
}

// Results returns the results channel.
func (wp *WorkerPool[T, R]) Results() <-chan Result[R] {
	return wp.resultChan
}

// Stop stops the worker pool.
func (wp *WorkerPool[T, R]) Stop() {
	close(wp.done)
	close(wp.jobQueue)
}

// =============================================================================
// Closures and Function Types
// =============================================================================

// Middleware is a function that wraps a handler.
type Middleware func(Handler) Handler

// Chain chains multiple middleware.
func Chain(middlewares ...Middleware) Middleware {
	return func(next Handler) Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			next = middlewares[i](next)
		}
		return next
	}
}

// LoggingMiddleware logs requests.
func LoggingMiddleware(logger io.Writer) Middleware {
	return func(next Handler) Handler {
		return func(ctx context.Context, req any) (any, error) {
			start := time.Now()
			resp, err := next(ctx, req)
			duration := time.Since(start)
			fmt.Fprintf(logger, "request took %v, error: %v\n", duration, err)
			return resp, err
		}
	}
}

// TimeoutMiddleware adds a timeout to requests.
func TimeoutMiddleware(timeout time.Duration) Middleware {
	return func(next Handler) Handler {
		return func(ctx context.Context, req any) (any, error) {
			ctx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()

			done := make(chan struct{})
			var resp any
			var err error

			go func() {
				resp, err = next(ctx, req)
				close(done)
			}()

			select {
			case <-done:
				return resp, err
			case <-ctx.Done():
				return nil, ErrTimeout
			}
		}
	}
}

// =============================================================================
// JSON Marshaling with Nested Types
// =============================================================================

// APIResponse is a generic API response.
type APIResponse[T any] struct {
	Success bool   `json:"success"`
	Data    T      `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
	Meta    *Meta  `json:"meta,omitempty"`
}

// Meta contains response metadata.
type Meta struct {
	RequestID  string        `json:"request_id"`
	Took       time.Duration `json:"took"`
	Pagination *Pagination   `json:"pagination,omitempty"`
}

// Pagination contains pagination info.
type Pagination struct {
	Page       int  `json:"page"`
	PerPage    int  `json:"per_page"`
	Total      int  `json:"total"`
	TotalPages int  `json:"total_pages"`
	HasMore    bool `json:"has_more"`
}

// MarshalJSON implements custom JSON marshaling.
func (r APIResponse[T]) MarshalJSON() ([]byte, error) {
	type Alias APIResponse[T]
	return json.Marshal(struct {
		Alias
		Timestamp time.Time `json:"timestamp"`
	}{
		Alias:     Alias(r),
		Timestamp: time.Now(),
	})
}

// =============================================================================
// Unexported helpers
// =============================================================================

func validateID(id string) error {
	if id == "" {
		return &ValidationError{Field: "id", Message: "cannot be empty"}
	}
	return nil
}

func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
