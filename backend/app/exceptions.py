"""
Structured exceptions and error responses for Cascade.

Provides consistent error handling across the API with:
- Custom exception classes
- Structured error response format
- FastAPI exception handlers
"""

from typing import Any, Dict, Optional, List
from fastapi import Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


# =============================================================================
# Error Response Schema
# =============================================================================

class ErrorDetail(BaseModel):
    """Detail of a single error."""
    loc: Optional[List[str]] = None  # Location of error (e.g., ["body", "title"])
    msg: str
    type: str


class ErrorResponse(BaseModel):
    """Structured error response format."""
    error: str  # Error code (e.g., "not_found", "cycle_detected")
    message: str  # Human-readable message
    details: Optional[List[ErrorDetail]] = None
    request_id: Optional[str] = None


# =============================================================================
# Custom Exceptions
# =============================================================================

class CascadeException(Exception):
    """Base exception for all Cascade errors."""
    
    def __init__(
        self,
        message: str,
        error_code: str = "internal_error",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[List[Dict[str, Any]]] = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class NotFoundError(CascadeException):
    """Resource not found."""
    
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} with ID {resource_id} not found",
            error_code="not_found",
            status_code=status.HTTP_404_NOT_FOUND,
        )
        self.resource = resource
        self.resource_id = resource_id


class CycleDetectedError(CascadeException):
    """Adding a dependency would create a cycle."""
    
    def __init__(self, predecessor_id: str, successor_id: str):
        super().__init__(
            message="Adding this dependency would create a cycle in the task graph",
            error_code="cycle_detected",
            status_code=status.HTTP_400_BAD_REQUEST,
            details=[{
                "loc": ["body"],
                "msg": f"Dependency {predecessor_id} -> {successor_id} would create a cycle",
                "type": "cycle_error",
            }],
        )
        self.predecessor_id = predecessor_id
        self.successor_id = successor_id


class DuplicateDependencyError(CascadeException):
    """Dependency already exists."""
    
    def __init__(self, predecessor_id: str, successor_id: str):
        super().__init__(
            message="This dependency already exists",
            error_code="duplicate_dependency",
            status_code=status.HTTP_409_CONFLICT,
        )


class SelfDependencyError(CascadeException):
    """Task cannot depend on itself."""
    
    def __init__(self, task_id: str):
        super().__init__(
            message="A task cannot depend on itself",
            error_code="self_dependency",
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class CrossProjectDependencyError(CascadeException):
    """Cannot create dependency between tasks in different projects."""
    
    def __init__(self, predecessor_project: str, successor_project: str):
        super().__init__(
            message="Cannot create dependency between tasks in different projects",
            error_code="cross_project_dependency",
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class ValidationError(CascadeException):
    """Request validation error."""
    
    def __init__(self, message: str, details: Optional[List[Dict[str, Any]]] = None):
        super().__init__(
            message=message,
            error_code="validation_error",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class RecalcError(CascadeException):
    """Error during task recalculation."""
    
    def __init__(self, message: str, task_id: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="recalc_error",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        self.task_id = task_id


# =============================================================================
# Exception Handlers
# =============================================================================

async def cascade_exception_handler(request: Request, exc: CascadeException) -> JSONResponse:
    """Handle CascadeException and return structured response."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    import logging
    logger = logging.getLogger("cascade.error")
    logger.exception(f"Unhandled exception: {exc}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_error",
            "message": "An unexpected error occurred",
            "details": None,
        },
    )


def register_exception_handlers(app):
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(CascadeException, cascade_exception_handler)
    # Optionally catch all unhandled exceptions
    # app.add_exception_handler(Exception, generic_exception_handler)

