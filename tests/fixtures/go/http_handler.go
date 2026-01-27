// Package api provides HTTP handlers for the user service.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// contextKey is an unexported type for context keys.
type contextKey string

// RequestIDKey is the context key for request IDs.
const RequestIDKey contextKey = "request_id"

// MaxPageSize limits pagination.
var MaxPageSize = 100

// UserService defines the interface for user operations.
type UserService interface {
	GetUser(ctx context.Context, id string) (*User, error)
	ListUsers(ctx context.Context, page int) ([]*User, error)
	CreateUser(ctx context.Context, u *User) error
	DeleteUser(ctx context.Context, id string) error
}

// User represents a user entity.
type User struct {
	ID        string
	Name      string
	Email     string
	CreatedAt time.Time
}

// Handler serves HTTP requests for the user API.
type Handler struct {
	svc    UserService
	logger *Logger
}

// Logger provides structured logging.
type Logger struct {
	prefix string
}

// NewHandler creates a Handler with the given service and logger.
func NewHandler(svc UserService, logger *Logger) *Handler {
	return &Handler{svc: svc, logger: logger}
}

// GetUser handles GET /users/:id.
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	user, err := h.svc.GetUser(r.Context(), id)
	if err != nil {
		h.logger.logError("GetUser failed", err)
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// ListUsers handles GET /users.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.svc.ListUsers(r.Context(), 0)
	if err != nil {
		h.logger.logError("ListUsers failed", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// CreateUser handles POST /users.
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var user User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.svc.CreateUser(r.Context(), &user); err != nil {
		h.logger.logError("CreateUser failed", err)
		http.Error(w, "create failed", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

// healthCheck is an unexported handler for internal use.
func (h *Handler) healthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "ok")
}

// logError logs an error with context.
func (l *Logger) logError(msg string, err error) {
	fmt.Printf("[%s] ERROR: %s: %v\n", l.prefix, msg, err)
}

// logInfo logs an informational message.
func (l *Logger) logInfo(msg string) {
	fmt.Printf("[%s] INFO: %s\n", l.prefix, msg)
}
