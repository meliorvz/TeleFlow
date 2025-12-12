"""WebSocket support for real-time job progress updates."""

import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..jobs import get_job_manager, Job


router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: list[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


manager = ConnectionManager()


def on_job_update(job: Job):
    """Called when a job is updated."""
    message = {
        "type": "job_update",
        "job": {
            "id": job.id,
            "type": job.type.value,
            "status": job.status.value,
            "progress_current": job.progress_current,
            "progress_total": job.progress_total,
            "progress_message": job.progress_message,
            "result": job.result,
            "error": job.error,
        }
    }
    
    # Schedule broadcast in event loop
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(manager.broadcast(message))
    except Exception:
        pass


# Subscribe to job updates
get_job_manager().subscribe(on_job_update)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await manager.connect(websocket)
    
    try:
        # Send initial state
        job_manager = get_job_manager()
        active_jobs = job_manager.get_active_jobs()
        
        await websocket.send_json({
            "type": "initial",
            "active_jobs": [
                {
                    "id": j.id,
                    "type": j.type.value,
                    "status": j.status.value,
                    "progress_current": j.progress_current,
                    "progress_total": j.progress_total,
                    "progress_message": j.progress_message,
                }
                for j in active_jobs
            ]
        })
        
        # Keep connection alive
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0
                )
                
                # Handle ping/pong
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_json({"type": "ping"})
    
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
