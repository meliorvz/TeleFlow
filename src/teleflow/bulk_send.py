"""Bulk send functionality."""

import asyncio
from datetime import datetime
from dataclasses import dataclass

from sqlalchemy.orm import Session
from sqlalchemy import select

from .models import Conversation, ConversationMetadata, BulkSendJob, BulkSendItem
from .telegram_client import TelegramClientWrapper
from .util.templates import render_template, build_context_from_conversation
from .util.rate_limiter import get_rate_limiter
from .config import Config, get_config


@dataclass
class BulkSendPreview:
    """Preview of a bulk send job before execution."""
    template: str
    recipients: list[dict]  # [{uuid, display_name, rendered_message}]
    total_count: int
    delay_seconds: int
    

@dataclass
class BulkSendResult:
    """Result of a bulk send job."""
    job_id: int
    total_count: int
    sent_count: int
    failed_count: int
    errors: list[str]


def prepare_bulk_send(
    db_session: Session,
    conversation_uuids: list[str],
    template: str,
    config: Config | None = None,
) -> BulkSendPreview:
    """Prepare a bulk send job for preview.
    
    Args:
        db_session: Database session
        conversation_uuids: List of conversation UUIDs to send to
        template: Message template with {{tokens}}
        config: Optional config override
    
    Returns:
        BulkSendPreview with rendered messages for confirmation
    """
    if config is None:
        config = get_config()
    
    recipients = []
    
    for uuid in conversation_uuids:
        conv = db_session.execute(
            select(Conversation).where(Conversation.conversation_uuid == uuid)
        ).scalar_one_or_none()
        
        if not conv:
            continue
        
        # Get metadata for custom fields
        meta = db_session.execute(
            select(ConversationMetadata).where(
                ConversationMetadata.conversation_uuid == uuid
            )
        ).scalar_one_or_none()
        
        # Build context
        context_data = {
            "display_name": conv.display_name,
            "username": conv.username or "",
        }
        if meta and meta.custom_fields_json:
            import json
            try:
                custom = json.loads(meta.custom_fields_json)
                context_data["custom_fields"] = custom
            except:
                pass
        
        context = build_context_from_conversation(context_data)
        rendered = render_template(template, context)
        
        recipients.append({
            "uuid": uuid,
            "display_name": conv.display_name,
            "username": conv.username,
            "rendered_message": rendered,
        })
    
    return BulkSendPreview(
        template=template,
        recipients=recipients,
        total_count=len(recipients),
        delay_seconds=config.bulk_send_delay_seconds,
    )


def create_bulk_send_job(
    db_session: Session,
    preview: BulkSendPreview,
) -> BulkSendJob:
    """Create a bulk send job from a preview.
    
    Returns the created job.
    """
    job = BulkSendJob(
        template=preview.template,
        total_count=preview.total_count,
        sent_count=0,
        status="pending",
    )
    db_session.add(job)
    db_session.flush()  # Get job_id
    
    for recipient in preview.recipients:
        item = BulkSendItem(
            job_id=job.job_id,
            conversation_uuid=recipient["uuid"],
            rendered_message=recipient["rendered_message"],
            status="pending",
        )
        db_session.add(item)
    
    db_session.commit()
    return job


async def execute_bulk_send(
    tg_client: TelegramClientWrapper,
    db_session: Session,
    job_id: int,
    on_progress: callable = None,
) -> BulkSendResult:
    """Execute a bulk send job.
    
    Args:
        tg_client: Connected Telegram client
        db_session: Database session
        job_id: ID of the job to execute
        on_progress: Optional callback(sent, total, message)
    
    Returns:
        BulkSendResult with counts and errors
    """
    config = get_config()
    rate_limiter = get_rate_limiter()
    
    # Get job
    job = db_session.execute(
        select(BulkSendJob).where(BulkSendJob.job_id == job_id)
    ).scalar_one_or_none()
    
    if not job:
        return BulkSendResult(
            job_id=job_id,
            total_count=0,
            sent_count=0,
            failed_count=0,
            errors=["Job not found"],
        )
    
    # Update status
    job.status = "running"
    db_session.commit()
    
    # Get pending items
    items = db_session.execute(
        select(BulkSendItem).where(
            BulkSendItem.job_id == job_id,
            BulkSendItem.status == "pending"
        )
    ).scalars().all()
    
    sent_count = 0
    failed_count = 0
    errors = []
    
    for i, item in enumerate(items):
        try:
            # Get conversation
            conv = db_session.execute(
                select(Conversation).where(
                    Conversation.conversation_uuid == item.conversation_uuid
                )
            ).scalar_one_or_none()
            
            if not conv:
                item.status = "failed"
                item.error = "Conversation not found"
                failed_count += 1
                continue
            
            # Get entity
            entity = await tg_client.get_entity(conv.tg_id)
            
            # Send message
            await rate_limiter.execute(
                tg_client.send_message(entity, item.rendered_message)
            )
            
            item.status = "sent"
            item.sent_at = datetime.utcnow()
            sent_count += 1
            job.sent_count = sent_count
            
            if on_progress:
                on_progress(sent_count, len(items), f"Sent to {conv.display_name}")
            
            # Delay between sends
            if i < len(items) - 1:
                await asyncio.sleep(config.bulk_send_delay_seconds)
        
        except Exception as e:
            item.status = "failed"
            item.error = str(e)
            failed_count += 1
            errors.append(f"{item.conversation_uuid}: {str(e)}")
        
        db_session.commit()
    
    # Update job status
    job.status = "completed" if failed_count == 0 else "completed_with_errors"
    db_session.commit()
    
    return BulkSendResult(
        job_id=job_id,
        total_count=len(items),
        sent_count=sent_count,
        failed_count=failed_count,
        errors=errors,
    )


def get_bulk_send_job(db_session: Session, job_id: int) -> BulkSendJob | None:
    """Get a bulk send job by ID."""
    return db_session.execute(
        select(BulkSendJob).where(BulkSendJob.job_id == job_id)
    ).scalar_one_or_none()


def list_bulk_send_jobs(db_session: Session, limit: int = 20) -> list[BulkSendJob]:
    """List recent bulk send jobs."""
    return list(db_session.execute(
        select(BulkSendJob).order_by(BulkSendJob.created_at.desc()).limit(limit)
    ).scalars().all())
