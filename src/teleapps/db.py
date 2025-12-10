"""Database connection and session management."""

from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .config import Config, get_config
from .models import Base


_engine = None
_SessionLocal = None


def get_engine(config: Config | None = None):
    """Get or create the database engine."""
    global _engine
    
    if _engine is None:
        if config is None:
            config = get_config()
        
        db_path = config.db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        _engine = create_engine(
            f"sqlite:///{db_path}",
            echo=False,
            future=True,
        )
        
        # Enable WAL mode for better concurrency
        @event.listens_for(_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    
    return _engine


def get_session_factory(config: Config | None = None):
    """Get or create the session factory."""
    global _SessionLocal
    
    if _SessionLocal is None:
        engine = get_engine(config)
        _SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    
    return _SessionLocal


def init_db(config: Config | None = None) -> bool:
    """Initialize the database, creating tables if they don't exist.
    
    Returns True if database already existed, False if newly created.
    """
    if config is None:
        config = get_config()
    
    db_existed = config.db_path.exists()
    
    engine = get_engine(config)
    Base.metadata.create_all(engine)
    
    return db_existed


@contextmanager
def get_session(config: Config | None = None) -> Generator[Session, None, None]:
    """Context manager for database sessions."""
    SessionLocal = get_session_factory(config)
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_engine():
    """Reset the engine (useful for testing)."""
    global _engine, _SessionLocal
    if _engine:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
