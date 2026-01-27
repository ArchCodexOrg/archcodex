/*
Package middleware provides HTTP middleware components.

This package implements common middleware patterns including
logging, authentication, and rate limiting.
*/
package middleware

import (
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"
)

// Defaults for middleware configuration.
const (
	DefaultTimeout  = 30 * time.Second
	DefaultMaxConns = 100
	headerRequestID = "X-Request-ID"
)

var (
	// RequestCount tracks total requests processed.
	RequestCount int64

	// activeConns tracks current connections (unexported).
	activeConns int64
)

// Middleware is the function type for HTTP middleware.
type Middleware func(http.Handler) http.Handler

// Base provides shared middleware functionality.
type Base struct {
	logger *log.Logger
}

// LoggingMiddleware adds request/response logging.
type LoggingMiddleware struct {
	Base
	verbose bool
}

// AuthMiddleware adds authentication.
type AuthMiddleware struct {
	Base
	tokenValidator TokenValidator
}

// TokenValidator checks authentication tokens.
type TokenValidator interface {
	Validate(token string) (userID string, err error)
	Refresh(token string) (string, error)
}

// RateLimiter controls request rates.
type RateLimiter interface {
	Allow(key string) bool
	Reset(key string)
}

// NewLoggingMiddleware creates a LoggingMiddleware.
func NewLoggingMiddleware(logger *log.Logger, verbose bool) *LoggingMiddleware {
	return &LoggingMiddleware{
		Base:    Base{logger: logger},
		verbose: verbose,
	}
}

// Wrap wraps an http.Handler with logging.
func (m *LoggingMiddleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		atomic.AddInt64(&RequestCount, 1)

		next.ServeHTTP(w, r)

		duration := time.Since(start)
		if m.verbose {
			m.logger.Printf(
				"method=%s path=%s duration=%v",
				r.Method,
				r.URL.Path,
				duration,
			)
		}
	})
}

// SetVerbose updates the verbosity flag.
func (m *LoggingMiddleware) SetVerbose(v bool) {
	m.verbose = v
}

// NewAuthMiddleware creates an AuthMiddleware.
func NewAuthMiddleware(logger *log.Logger, tv TokenValidator) *AuthMiddleware {
	return &AuthMiddleware{
		Base:           Base{logger: logger},
		tokenValidator: tv,
	}
}

// Wrap wraps an http.Handler with auth checking.
func (a *AuthMiddleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := a.tokenValidator.Validate(token)
		if err != nil {
			a.logger.Printf("auth failed: %v", err)
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		// Log successful auth
		if a.logger != nil {
			a.logger.Printf("authenticated user=%s", userID)
		}

		next.ServeHTTP(w, r)
	})
}

// Chain composes multiple middleware into one.
func Chain(middlewares ...Middleware) Middleware {
	return func(final http.Handler) http.Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			final = middlewares[i](final)
		}
		return final
	}
}

// recoverPanic is an unexported helper for panic recovery.
func recoverPanic(w http.ResponseWriter) {
	if r := recover(); r != nil {
		http.Error(w, fmt.Sprintf("panic: %v", r), http.StatusInternalServerError)
	}
}
