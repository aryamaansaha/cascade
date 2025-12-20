"""
Logging configuration for Cascade.

Provides structured logging with:
- Console output with color coding
- Optional JSON format for production
- Log levels configurable via environment
"""

import logging
import sys
from typing import Optional

from app.config import get_settings


# ANSI color codes for terminal output
class Colors:
    GREY = "\x1b[38;20m"
    BLUE = "\x1b[34;20m"
    YELLOW = "\x1b[33;20m"
    RED = "\x1b[31;20m"
    BOLD_RED = "\x1b[31;1m"
    RESET = "\x1b[0m"
    GREEN = "\x1b[32;20m"
    CYAN = "\x1b[36;20m"


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for different log levels."""
    
    FORMATS = {
        logging.DEBUG: Colors.GREY + "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s" + Colors.RESET,
        logging.INFO: Colors.GREEN + "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s" + Colors.RESET,
        logging.WARNING: Colors.YELLOW + "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s" + Colors.RESET,
        logging.ERROR: Colors.RED + "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s" + Colors.RESET,
        logging.CRITICAL: Colors.BOLD_RED + "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s" + Colors.RESET,
    }
    
    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt, datefmt="%Y-%m-%d %H:%M:%S")
        return formatter.format(record)


def setup_logging(
    level: Optional[str] = None,
    json_format: bool = False,
) -> None:
    """
    Configure logging for the application.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: If True, use JSON format (for production)
    """
    settings = get_settings()
    
    # Determine log level
    log_level = level or ("DEBUG" if settings.debug else "INFO")
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    
    # Get the root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    
    if json_format:
        # JSON format for production/log aggregation
        import json
        
        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_record = {
                    "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                }
                if record.exc_info:
                    log_record["exception"] = self.formatException(record.exc_info)
                return json.dumps(log_record)
        
        console_handler.setFormatter(JsonFormatter())
    else:
        # Colored format for development
        console_handler.setFormatter(ColoredFormatter())
    
    root_logger.addHandler(console_handler)
    
    # Configure specific loggers
    
    # Silence noisy loggers
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("arq").setLevel(logging.INFO)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    
    # Set our app loggers to the desired level
    logging.getLogger("cascade").setLevel(numeric_level)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger for a specific module.
    
    Usage:
        from app.logging_config import get_logger
        logger = get_logger(__name__)
        logger.info("Something happened")
    
    Args:
        name: Logger name (typically __name__)
    
    Returns:
        Configured logger instance
    """
    # Prefix with 'cascade' for consistent naming
    if not name.startswith("cascade"):
        name = f"cascade.{name}"
    return logging.getLogger(name)

