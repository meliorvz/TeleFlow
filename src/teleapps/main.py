"""Main entry point for Teleapps."""

import asyncio
import uvicorn
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import get_config, ensure_data_dir, validate_config
from .db import init_db
from .api.routes import router as api_router
from .api.websocket import router as ws_router


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Teleapps",
        description="Local Telegram triage and bulk messaging assistant",
        version="0.1.0",
    )
    
    # Include API routes
    app.include_router(api_router)
    app.include_router(ws_router)
    
    # Determine which static files to serve (React build preferred)
    react_dir = Path(__file__).parent / "static_react"
    legacy_dir = Path(__file__).parent / "static"
    
    if react_dir.exists():
        # Serve React app
        static_dir = react_dir
        
        # Mount assets directory
        assets_dir = react_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        
        @app.get("/")
        async def index():
            """Serve the React app."""
            return FileResponse(static_dir / "index.html")
        
        # Catch-all for React router (SPA support)
        @app.get("/{full_path:path}")
        async def catch_all(full_path: str):
            """Serve React app for all non-API routes."""
            # Check if file exists in static dir
            file_path = static_dir / full_path
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)
            # Otherwise return index.html for SPA routing
            return FileResponse(static_dir / "index.html")
    
    elif legacy_dir.exists():
        # Fallback to legacy static files
        app.mount("/static", StaticFiles(directory=str(legacy_dir)), name="static")
        
        @app.get("/")
        async def index():
            """Serve the main HTML page."""
            index_path = legacy_dir / "index.html"
            if index_path.exists():
                return FileResponse(index_path)
            return {"message": "Teleapps API", "docs": "/docs"}
    
    @app.on_event("startup")
    async def startup():
        """Initialize on startup."""
        config = get_config()
        ensure_data_dir(config)
        init_db(config)
    
    return app


def run():
    """Run the Teleapps server."""
    config = get_config()
    
    # Don't block on config validation - setup wizard handles this
    errors = validate_config(config)
    if errors:
        print(f"⚠️  Configuration incomplete: {', '.join(errors)}")
        print("   The setup wizard will guide you through configuration.\n")
    
    # Ensure data directory exists
    ensure_data_dir(config)
    
    # Initialize database
    init_db(config)
    
    print(f"\n🚀 Teleapps starting...")
    print(f"   Web UI: http://{config.web_host}:{config.web_port}")
    print(f"   Data:   {config.data_dir}")
    print(f"   LLM:    {'Enabled' if config.llm_enabled else 'Disabled'}")
    print()
    
    # Run server
    uvicorn.run(
        create_app(),
        host=config.web_host,
        port=config.web_port,
        log_level="info",
    )


if __name__ == "__main__":
    run()
