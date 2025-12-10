"""Background job management."""

import asyncio
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    SYNC = "sync"
    REPORT = "report"
    BULK_SEND = "bulk_send"


@dataclass
class Job:
    """A background job."""
    id: str
    type: JobType
    status: JobStatus = JobStatus.PENDING
    progress_current: int = 0
    progress_total: int = 0
    progress_message: str = ""
    result: Any = None
    error: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None


class JobManager:
    """Manages background jobs with progress tracking."""
    
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._subscribers: list[Callable[[Job], None]] = []
        self._counter = 0
    
    def subscribe(self, callback: Callable[[Job], None]) -> None:
        """Subscribe to job updates."""
        self._subscribers.append(callback)
    
    def unsubscribe(self, callback: Callable[[Job], None]) -> None:
        """Unsubscribe from job updates."""
        if callback in self._subscribers:
            self._subscribers.remove(callback)
    
    def _notify(self, job: Job) -> None:
        """Notify subscribers of job update."""
        for callback in self._subscribers:
            try:
                callback(job)
            except Exception:
                pass
    
    def create_job(self, job_type: JobType) -> Job:
        """Create a new job."""
        self._counter += 1
        job = Job(
            id=f"{job_type.value}_{self._counter}_{int(datetime.utcnow().timestamp())}",
            type=job_type,
        )
        self._jobs[job.id] = job
        self._notify(job)
        return job
    
    def update_progress(
        self,
        job_id: str,
        current: int,
        total: int,
        message: str = "",
    ) -> None:
        """Update job progress."""
        job = self._jobs.get(job_id)
        if job:
            job.progress_current = current
            job.progress_total = total
            job.progress_message = message
            self._notify(job)
    
    def complete_job(self, job_id: str, result: Any = None) -> None:
        """Mark a job as completed."""
        job = self._jobs.get(job_id)
        if job:
            job.status = JobStatus.COMPLETED
            job.result = result
            job.completed_at = datetime.utcnow()
            self._notify(job)
    
    def fail_job(self, job_id: str, error: str) -> None:
        """Mark a job as failed."""
        job = self._jobs.get(job_id)
        if job:
            job.status = JobStatus.FAILED
            job.error = error
            job.completed_at = datetime.utcnow()
            self._notify(job)
    
    def get_job(self, job_id: str) -> Job | None:
        """Get a job by ID."""
        return self._jobs.get(job_id)
    
    def get_active_jobs(self) -> list[Job]:
        """Get all active (pending or running) jobs."""
        return [
            job for job in self._jobs.values()
            if job.status in (JobStatus.PENDING, JobStatus.RUNNING)
        ]
    
    def get_recent_jobs(self, limit: int = 10) -> list[Job]:
        """Get recent jobs."""
        jobs = list(self._jobs.values())
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]


# Global job manager instance
_job_manager: JobManager | None = None


def get_job_manager() -> JobManager:
    """Get the global job manager instance."""
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
    return _job_manager
