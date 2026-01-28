// Package edgecases demonstrates edge case patterns for Go validator testing.
//
// Tests uncommon but valid Go constructs:
//   - go:generate and go:embed directives
//   - init() functions
//   - Grouped type declarations
//   - Anonymous structs
//   - Blank identifier usage
//   - Named return values
//   - CGO-like patterns
//   - Build constraints
package edgecases

//go:generate go run gen.go -output generated.go

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"
)

//go:embed version.txt
var version string

//go:embed assets/*
var assets []byte

// =============================================================================
// Init Functions
// =============================================================================

var (
	initialized  bool
	startupTime  time.Time
	globalConfig *Config
)

func init() {
	initialized = true
	startupTime = time.Now()
}

func init() {
	// Multiple init functions are allowed
	globalConfig = &Config{Debug: false}
}

// =============================================================================
// Grouped Type Declarations
// =============================================================================

type (
	// UserID is a user identifier.
	UserID int64

	// GroupID is a group identifier.
	GroupID int64

	// Permissions represents permission flags.
	Permissions uint32
)

type (
	// Handler handles requests.
	Handler func(ctx context.Context, data any) error

	// Middleware wraps a handler.
	Middleware func(Handler) Handler

	// ErrorHandler handles errors.
	ErrorHandler func(error) Handler
)

type (
	// Reader is a context-aware reader.
	Reader interface {
		Read(ctx context.Context, p []byte) (n int, err error)
	}

	// Writer is a context-aware writer.
	Writer interface {
		Write(ctx context.Context, p []byte) (n int, err error)
	}

	// ReadWriter combines Reader and Writer.
	ReadWriter interface {
		Reader
		Writer
	}
)

// =============================================================================
// Anonymous Structs
// =============================================================================

// Config with anonymous struct field.
type Config struct {
	Debug   bool
	Logging struct {
		Level  string
		Format string
		Output io.Writer
	}
	Database struct {
		Host     string
		Port     int
		Username string
		Password string
	}
}

// Response with inline anonymous struct.
type Response struct {
	Success bool
	Data    any
	Meta    struct {
		RequestID string
		Took      time.Duration
	}
}

// createConfig returns an anonymous struct.
func createConfig() struct {
	Name    string
	Version string
	Debug   bool
} {
	return struct {
		Name    string
		Version string
		Debug   bool
	}{
		Name:    "app",
		Version: "1.0.0",
		Debug:   false,
	}
}

// Anonymous struct in function parameters.
func processOptions(opts struct {
	Timeout    time.Duration
	MaxRetries int
	OnError    func(error)
}) error {
	if opts.Timeout == 0 {
		opts.Timeout = 30 * time.Second
	}
	return nil
}

// =============================================================================
// Blank Identifier Usage
// =============================================================================

var _ Reader = (*fileReader)(nil)  // Interface compliance check
var _ Writer = (*fileWriter)(nil)  // Interface compliance check
var _ io.Closer = (*fileReader)(nil)

type fileReader struct {
	path string
	file io.ReadCloser
}

func (r *fileReader) Read(ctx context.Context, p []byte) (n int, err error) {
	return r.file.Read(p)
}

func (r *fileReader) Close() error {
	return r.file.Close()
}

type fileWriter struct {
	path string
	file io.WriteCloser
}

func (w *fileWriter) Write(ctx context.Context, p []byte) (n int, err error) {
	return w.file.Write(p)
}

// Function with blank parameters.
func processItem(ctx context.Context, _ string, data []byte) error {
	// Second parameter intentionally unused
	if len(data) == 0 {
		return errors.New("empty data")
	}
	return nil
}

// Range with blank identifier.
func sumValues(items map[string]int) int {
	sum := 0
	for _, v := range items {
		sum += v
	}
	return sum
}

// =============================================================================
// Named Return Values
// =============================================================================

// divide demonstrates named return values.
func divide(a, b float64) (result float64, err error) {
	if b == 0 {
		err = errors.New("division by zero")
		return // naked return
	}
	result = a / b
	return // naked return
}

// parseConfig demonstrates multiple named returns.
func parseConfig(data []byte) (config *Config, warnings []string, err error) {
	config = &Config{}
	warnings = make([]string, 0)

	if len(data) == 0 {
		err = errors.New("empty config")
		return
	}

	// Parse logic...
	return
}

// fetchWithRetry demonstrates complex named returns.
func fetchWithRetry(
	ctx context.Context,
	url string,
	maxRetries int,
) (
	body []byte,
	statusCode int,
	retries int,
	err error,
) {
	for retries = 0; retries < maxRetries; retries++ {
		// Fetch logic...
		select {
		case <-ctx.Done():
			err = ctx.Err()
			return
		default:
		}
	}
	err = errors.New("max retries exceeded")
	return
}

// =============================================================================
// Complex Type Constraints (Go 1.18+)
// =============================================================================

// Numeric constraint for numeric types.
type Numeric interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 |
		~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 |
		~float32 | ~float64
}

// Ordered constraint for ordered types.
type Ordered interface {
	Numeric | ~string
}

// Comparable2 is like the built-in comparable but explicit.
type Comparable2 interface {
	comparable
}

// Container with multiple type parameters.
type Container[K comparable, V any] struct {
	mu    sync.RWMutex
	items map[K]V
}

// NewContainer creates a new container.
func NewContainer[K comparable, V any]() *Container[K, V] {
	return &Container[K, V]{
		items: make(map[K]V),
	}
}

// Get retrieves a value.
func (c *Container[K, V]) Get(key K) (V, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.items[key]
	return v, ok
}

// Set stores a value.
func (c *Container[K, V]) Set(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = value
}

// Map applies a function to all values.
func Map[T, U any](items []T, fn func(T) U) []U {
	result := make([]U, len(items))
	for i, item := range items {
		result[i] = fn(item)
	}
	return result
}

// Filter returns items matching predicate.
func Filter[T any](items []T, predicate func(T) bool) []T {
	result := make([]T, 0)
	for _, item := range items {
		if predicate(item) {
			result = append(result, item)
		}
	}
	return result
}

// Reduce reduces items to a single value.
func Reduce[T, U any](items []T, initial U, fn func(U, T) U) U {
	result := initial
	for _, item := range items {
		result = fn(result, item)
	}
	return result
}

// =============================================================================
// Method Expressions and Values
// =============================================================================

type Calculator struct {
	precision int
}

func (c *Calculator) Add(a, b float64) float64 {
	return a + b
}

func (c *Calculator) Multiply(a, b float64) float64 {
	return a * b
}

// Using method expressions
var addMethod = (*Calculator).Add
var mulMethod = (*Calculator).Multiply

// Higher-order function using method values
func applyOperations(calc *Calculator, a, b float64) []float64 {
	ops := []func(float64, float64) float64{
		calc.Add,
		calc.Multiply,
	}

	results := make([]float64, len(ops))
	for i, op := range ops {
		results[i] = op(a, b)
	}
	return results
}

// =============================================================================
// Defer Patterns
// =============================================================================

func withLock(mu *sync.Mutex) func() {
	mu.Lock()
	return mu.Unlock
}

func processWithCleanup(ctx context.Context) error {
	var mu sync.Mutex
	defer withLock(&mu)()

	// Process with lock held
	return nil
}

func measureTime(name string) func() {
	start := time.Now()
	return func() {
		fmt.Printf("%s took %v\n", name, time.Since(start))
	}
}

func expensiveOperation() {
	defer measureTime("expensiveOperation")()

	// Do expensive work
	time.Sleep(100 * time.Millisecond)
}

// =============================================================================
// Variadic Functions
// =============================================================================

// printf-style variadic
func logf(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
}

// Typed variadic
func maxInt(first int, rest ...int) int {
	max := first
	for _, v := range rest {
		if v > max {
			max = v
		}
	}
	return max
}

// Generic variadic
func Merge[T any](slices ...[]T) []T {
	total := 0
	for _, s := range slices {
		total += len(s)
	}

	result := make([]T, 0, total)
	for _, s := range slices {
		result = append(result, s...)
	}
	return result
}

// =============================================================================
// Unexported helpers
// =============================================================================

func validateInput(input string) error {
	if input == "" {
		return errors.New("input cannot be empty")
	}
	return nil
}

type internalState struct {
	counter int
	buffer  []byte
}

func (s *internalState) reset() {
	s.counter = 0
	s.buffer = nil
}
