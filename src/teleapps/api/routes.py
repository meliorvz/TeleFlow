"""FastAPI routes for Teleapps."""

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from ..config import get_config, Config
from ..db import get_session, init_db
from ..models import Conversation, ConversationMetadata, Message, Report, UserState
from ..telegram_client import TelegramClientWrapper
from ..llm import get_llm_client
from ..sync import sync_dialogs
from ..reports import (
    generate_report, get_caught_up_date, set_caught_up_date,
    get_last_report, get_report_by_id, list_reports
)
from ..csv_import import (
    export_conversations_template, import_conversations_metadata,
    export_participants_template, import_participants_metadata
)
from ..bulk_send import (
    prepare_bulk_send, create_bulk_send_job, execute_bulk_send,
    get_bulk_send_job, list_bulk_send_jobs
)
from ..jobs import get_job_manager, JobType, JobStatus


router = APIRouter(prefix="/api")

# Global state for auth flow
_auth_state = {
    "phone": None,
    "phone_code_hash": None,
}

# Global Telegram client (lazy initialized)
_tg_client: TelegramClientWrapper | None = None


async def get_tg_client() -> TelegramClientWrapper:
    """Get or create the Telegram client."""
    global _tg_client
    if _tg_client is None:
        _tg_client = TelegramClientWrapper()
        await _tg_client.connect()
    return _tg_client


# --- Status ---

@router.get("/status")
async def get_status():
    """Get application status."""
    config = get_config()
    
    try:
        client = await get_tg_client()
        is_authorized = await client.is_authorized()
        
        user_info = None
        if is_authorized:
            me = await client.get_me()
            if me:
                user_info = {
                    "id": me.id,
                    "first_name": me.first_name,
                    "last_name": me.last_name,
                    "username": me.username,
                }
    except Exception as e:
        is_authorized = False
        user_info = None
    
    # Get stats from DB
    with get_session() as session:
        conv_count = session.execute(
            select(Conversation)
        ).scalars().all()
        
        unread_total = sum(c.unread_count for c in conv_count)
        
        caught_up = get_caught_up_date(session)
    
    return {
        "telegram_connected": is_authorized,
        "user": user_info,
        "llm_enabled": config.llm_enabled,
        "conversations_count": len(conv_count),
        "unread_count": unread_total,
        "caught_up_at": caught_up.isoformat() if caught_up else None,
    }


@router.get("/config")
async def get_app_config():
    """Get application configuration."""
    config = get_config()
    return {
        "llm_enabled": config.llm_enabled,
        "llm_model": config.llm_model if config.llm_enabled else None,
        "report_cadence": config.report_cadence,
        "bulk_send_delay_seconds": config.bulk_send_delay_seconds,
        "bulk_send_max_per_job": config.bulk_send_max_per_job,
    }


@router.get("/config/check")
async def check_config():
    """Check if required config is present."""
    config = get_config()
    missing = []
    
    if not config.tg_api_id:
        missing.append("TG_API_ID")
    if not config.tg_api_hash:
        missing.append("TG_API_HASH")
    
    return {
        "configured": len(missing) == 0,
        "missing": missing,
    }


class SaveConfigRequest(BaseModel):
    tg_api_id: str | None = None
    tg_api_hash: str | None = None
    llm_provider: str | None = None
    openrouter_api_key: str | None = None
    venice_api_key: str | None = None


@router.post("/config/save")
async def save_app_config(request: SaveConfigRequest):
    """Save configuration to config.env file."""
    config = get_config()
    config_path = config.data_dir / "config.env"
    
    # Ensure data dir exists
    config.data_dir.mkdir(parents=True, exist_ok=True)
    
    # Read existing config if it exists
    existing_lines = []
    existing_keys = set()
    if config_path.exists():
        with open(config_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and "=" in line and not line.startswith("#"):
                    key = line.split("=")[0]
                    existing_keys.add(key)
                existing_lines.append(line)
    
    # Build new config
    new_lines = []
    updates = {}
    if request.tg_api_id:
        updates["TG_API_ID"] = request.tg_api_id
    if request.tg_api_hash:
        updates["TG_API_HASH"] = request.tg_api_hash
    if request.llm_provider:
        updates["LLM_PROVIDER"] = request.llm_provider
    if request.openrouter_api_key:
        updates["OPENROUTER_API_KEY"] = request.openrouter_api_key
    if request.venice_api_key:
        updates["VENICE_API_KEY"] = request.venice_api_key
    
    # Update existing lines or add new
    for line in existing_lines:
        if line and "=" in line and not line.startswith("#"):
            key = line.split("=")[0]
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                del updates[key]
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    
    # Add any remaining new config
    for key, value in updates.items():
        new_lines.append(f"{key}={value}")
    
    # Write config
    with open(config_path, "w") as f:
        f.write("\n".join(new_lines) + "\n")
    
    # Reload config (reset global)
    from ..config import _config
    import importlib
    from .. import config as config_module
    importlib.reload(config_module)
    
    return {"status": "saved"}


# --- Auth ---

class PhoneRequest(BaseModel):
    phone: str

class CodeRequest(BaseModel):
    code: str

class PasswordRequest(BaseModel):
    password: str


@router.post("/auth/start")
async def auth_start(request: PhoneRequest):
    """Start phone-based authentication."""
    client = await get_tg_client()
    
    if await client.is_authorized():
        return {"status": "already_authorized"}
    
    try:
        phone_code_hash = await client.start_phone_login(request.phone)
        _auth_state["phone"] = request.phone
        _auth_state["phone_code_hash"] = phone_code_hash
        return {"status": "code_sent"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/code")
async def auth_code(request: CodeRequest):
    """Submit authentication code."""
    client = await get_tg_client()
    
    if not _auth_state.get("phone"):
        raise HTTPException(status_code=400, detail="Start auth first")
    
    try:
        needs_2fa = await client.complete_phone_login(
            _auth_state["phone"],
            request.code,
            _auth_state["phone_code_hash"]
        )
        
        if needs_2fa:
            return {"status": "2fa_required"}
        
        return {"status": "authorized"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/2fa")
async def auth_2fa(request: PasswordRequest):
    """Submit 2FA password."""
    client = await get_tg_client()
    
    try:
        await client.complete_2fa_login(request.password)
        return {"status": "authorized"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Sync ---

@router.post("/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    """Trigger a dialog sync."""
    job_manager = get_job_manager()
    job = job_manager.create_job(JobType.SYNC)
    
    async def run_sync():
        try:
            job.status = JobStatus.RUNNING
            client = await get_tg_client()
            
            with get_session() as session:
                result = await sync_dialogs(
                    client, session,
                    on_progress=lambda c, t, m: job_manager.update_progress(job.id, c, t, m)
                )
            
            job_manager.complete_job(job.id, {
                "new": result.new_count,
                "updated": result.updated_count,
                "unchanged": result.unchanged_count,
            })
        except Exception as e:
            job_manager.fail_job(job.id, str(e))
    
    background_tasks.add_task(run_sync)
    return {"job_id": job.id}


# --- Conversations ---

class ConversationFilter(BaseModel):
    priority: str | None = None
    is_vip: bool | None = None
    unread_only: bool = False
    search: str | None = None
    limit: int = 50
    offset: int = 0


@router.get("/conversations")
async def list_conversations(
    priority: str | None = None,
    is_vip: bool | None = None,
    unread_only: bool = False,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """List conversations with filters."""
    with get_session() as session:
        query = (
            select(Conversation, ConversationMetadata)
            .outerjoin(ConversationMetadata)
        )
        
        if unread_only:
            query = query.where(Conversation.unread_count > 0)
        
        if priority:
            query = query.where(ConversationMetadata.priority == priority)
        
        if is_vip is not None:
            query = query.where(ConversationMetadata.is_vip == is_vip)
        
        if search:
            query = query.where(
                Conversation.display_name.ilike(f"%{search}%") |
                Conversation.username.ilike(f"%{search}%")
            )
        
        query = query.order_by(Conversation.last_message_date.desc())
        query = query.limit(limit).offset(offset)
        
        results = session.execute(query).all()
        
        conversations = []
        for conv, meta in results:
            custom_fields = {}
            if meta and meta.custom_fields_json:
                try:
                    custom_fields = json.loads(meta.custom_fields_json)
                except:
                    pass
            
            conversations.append({
                "uuid": conv.conversation_uuid,
                "tg_id": conv.tg_id,
                "tg_type": conv.tg_type,
                "display_name": conv.display_name,
                "username": conv.username,
                "unread_count": conv.unread_count,
                "last_message_date": conv.last_message_date.isoformat() if conv.last_message_date else None,
                "last_message_preview": conv.last_message_preview,
                "priority": meta.priority if meta else "medium",
                "is_vip": meta.is_vip if meta else False,
                "muted": meta.muted_in_teleapps if meta else False,
                "notes": meta.notes if meta else None,
                "custom_fields": custom_fields,
            })
        
        return {"conversations": conversations}


class MetadataUpdate(BaseModel):
    priority: str | None = None
    is_vip: bool | None = None
    muted: bool | None = None
    notes: str | None = None


@router.patch("/conversations/{uuid}")
async def update_conversation_metadata(uuid: str, update: MetadataUpdate):
    """Update conversation metadata."""
    with get_session() as session:
        meta = session.execute(
            select(ConversationMetadata).where(
                ConversationMetadata.conversation_uuid == uuid
            )
        ).scalar_one_or_none()
        
        if not meta:
            # Create if doesn't exist
            conv = session.execute(
                select(Conversation).where(Conversation.conversation_uuid == uuid)
            ).scalar_one_or_none()
            
            if not conv:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            meta = ConversationMetadata(conversation_uuid=uuid)
            session.add(meta)
        
        if update.priority is not None:
            meta.priority = update.priority
        if update.is_vip is not None:
            meta.is_vip = update.is_vip
        if update.muted is not None:
            meta.muted_in_teleapps = update.muted
        if update.notes is not None:
            meta.notes = update.notes
        
        session.commit()
        
        return {"status": "updated"}


@router.get("/conversations/{uuid}/messages")
async def get_conversation_messages(uuid: str, limit: int = 30):
    """Get cached messages for a conversation."""
    with get_session() as session:
        messages = session.execute(
            select(Message)
            .where(Message.conversation_uuid == uuid)
            .order_by(Message.date.desc())
            .limit(limit)
        ).scalars().all()
        
        return {
            "messages": [
                {
                    "id": m.message_id,
                    "date": m.date.isoformat() if m.date else None,
                    "sender_id": m.sender_id,
                    "sender_name": m.sender_name,
                    "text": m.text,
                    "has_media": m.has_media,
                }
                for m in messages
            ]
        }


class ReplyRequest(BaseModel):
    text: str


@router.post("/conversations/{uuid}/reply")
async def send_reply(uuid: str, request: ReplyRequest):
    """Send a reply to a conversation."""
    with get_session() as session:
        conv = session.execute(
            select(Conversation).where(Conversation.conversation_uuid == uuid)
        ).scalar_one_or_none()
        
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        try:
            client = await get_tg_client()
            entity = await client.get_entity(conv.tg_id)
            await client.send_message(entity, request.text)
            return {"status": "sent"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# --- CSV Import/Export ---

@router.get("/csv/conversations/template")
async def download_conversations_template():
    """Download conversations CSV template."""
    with get_session() as session:
        csv_content = export_conversations_template(session)
    
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=conversations_template.csv"}
    )


@router.post("/csv/conversations/import")
async def upload_conversations_csv(file: UploadFile = File(...)):
    """Import conversations metadata from CSV."""
    content = await file.read()
    csv_content = content.decode("utf-8")
    
    with get_session() as session:
        result = import_conversations_metadata(session, csv_content)
    
    return {
        "imported": result.imported_count,
        "skipped": result.skipped_count,
        "errors": result.errors,
    }


@router.get("/csv/participants/template")
async def download_participants_template():
    """Download participants CSV template."""
    with get_session() as session:
        csv_content = export_participants_template(session)
    
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=participants_template.csv"}
    )


@router.post("/csv/participants/import")
async def upload_participants_csv(file: UploadFile = File(...)):
    """Import participants metadata from CSV."""
    content = await file.read()
    csv_content = content.decode("utf-8")
    
    with get_session() as session:
        result = import_participants_metadata(session, csv_content)
    
    return {
        "imported": result.imported_count,
        "skipped": result.skipped_count,
        "errors": result.errors,
    }


@router.get("/csv/participants/by-chats")
async def export_participants_by_chats(chat_uuids: str):
    """Export participants from specific chats.
    
    Args:
        chat_uuids: Comma-separated list of conversation UUIDs
    """
    import csv
    import io
    
    uuid_list = [u.strip() for u in chat_uuids.split(",") if u.strip()]
    
    if not uuid_list:
        raise HTTPException(status_code=400, detail="No chat UUIDs provided")
    
    with get_session() as session:
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow(["userid", "username", "displayname", "chat_uuid", "chat_name", "role"])
        
        for chat_uuid in uuid_list:
            # Get the conversation
            conv = session.execute(
                select(Conversation).where(Conversation.conversation_uuid == chat_uuid)
            ).scalar_one_or_none()
            
            if not conv:
                continue
            
            # Try to fetch participants from Telegram
            try:
                client = await get_tg_client()
                entity = await client.get_entity(conv.tg_id)
                participants = await client.get_participants(entity, limit=200)
                
                for p in participants:
                    writer.writerow([
                        p.id,
                        p.username or "",
                        f"{p.first_name or ''} {p.last_name or ''}".strip() or "Unknown",
                        chat_uuid,
                        conv.display_name,
                        getattr(p.participant, 'rank', '') if hasattr(p, 'participant') else "",
                    ])
            except Exception as e:
                # If can't fetch, just note the error
                writer.writerow(["", "", f"Error: {str(e)}", chat_uuid, conv.display_name, ""])
    
    csv_content = output.getvalue()
    
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=participants_by_chat.csv"}
    )


# --- Reports ---

@router.post("/reports/generate")
async def trigger_report_generation(background_tasks: BackgroundTasks):
    """Generate a new report."""
    config = get_config()
    
    if not config.llm_enabled:
        raise HTTPException(status_code=400, detail="LLM not configured")
    
    job_manager = get_job_manager()
    job = job_manager.create_job(JobType.REPORT)
    
    async def run_report():
        try:
            job.status = JobStatus.RUNNING
            client = await get_tg_client()
            llm = get_llm_client()
            
            with get_session() as session:
                report = await generate_report(
                    client, session, llm,
                    on_progress=lambda c, t, m: job_manager.update_progress(job.id, c, t, m)
                )
            
            job_manager.complete_job(job.id, {"report_id": report.report_id})
        except Exception as e:
            job_manager.fail_job(job.id, str(e))
    
    background_tasks.add_task(run_report)
    return {"job_id": job.id}


@router.get("/reports")
async def get_reports(limit: int = 20):
    """List recent reports."""
    with get_session() as session:
        reports = list_reports(session, limit)
        
        return {
            "reports": [
                {
                    "id": r.report_id,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "covers_since": r.covers_since.isoformat() if r.covers_since else None,
                }
                for r in reports
            ]
        }


@router.get("/reports/latest")
async def get_latest_report():
    """Get the latest report."""
    with get_session() as session:
        report = get_last_report(session)
        
        if not report:
            return {"report": None}
        
        return {
            "report": {
                "id": report.report_id,
                "created_at": report.created_at.isoformat() if report.created_at else None,
                "covers_since": report.covers_since.isoformat() if report.covers_since else None,
                "data": json.loads(report.report_json) if report.report_json else None,
            }
        }


@router.get("/reports/{report_id}")
async def get_report(report_id: int):
    """Get a specific report."""
    with get_session() as session:
        report = get_report_by_id(session, report_id)
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            "report": {
                "id": report.report_id,
                "created_at": report.created_at.isoformat() if report.created_at else None,
                "covers_since": report.covers_since.isoformat() if report.covers_since else None,
                "data": json.loads(report.report_json) if report.report_json else None,
            }
        }


# --- Caught Up ---

@router.get("/caught-up")
async def get_caught_up():
    """Get the caught up date."""
    with get_session() as session:
        date = get_caught_up_date(session)
        return {"caught_up_at": date.isoformat() if date else None}


@router.post("/caught-up")
async def mark_caught_up():
    """Mark as caught up (current time)."""
    with get_session() as session:
        set_caught_up_date(session)
        return {"status": "updated", "caught_up_at": datetime.utcnow().isoformat()}


# --- Bulk Send ---

class BulkSendPreviewRequest(BaseModel):
    conversation_uuids: list[str]
    template: str


@router.post("/bulk-send/preview")
async def preview_bulk_send(request: BulkSendPreviewRequest):
    """Preview a bulk send operation."""
    config = get_config()
    
    if len(request.conversation_uuids) > config.bulk_send_max_per_job:
        raise HTTPException(
            status_code=400,
            detail=f"Too many recipients. Max: {config.bulk_send_max_per_job}"
        )
    
    with get_session() as session:
        preview = prepare_bulk_send(
            session,
            request.conversation_uuids,
            request.template
        )
        
        return {
            "template": preview.template,
            "recipients": preview.recipients,
            "total_count": preview.total_count,
            "delay_seconds": preview.delay_seconds,
            "confirmation_code": f"SEND-{preview.total_count}",
        }


class BulkSendExecuteRequest(BaseModel):
    conversation_uuids: list[str]
    template: str
    confirmation_code: str


@router.post("/bulk-send/execute")
async def execute_bulk_send_endpoint(
    request: BulkSendExecuteRequest,
    background_tasks: BackgroundTasks
):
    """Execute a bulk send operation."""
    expected_code = f"SEND-{len(request.conversation_uuids)}"
    
    if request.confirmation_code != expected_code:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid confirmation code. Expected: {expected_code}"
        )
    
    with get_session() as session:
        preview = prepare_bulk_send(
            session,
            request.conversation_uuids,
            request.template
        )
        job = create_bulk_send_job(session, preview)
        job_id = job.job_id
    
    job_manager = get_job_manager()
    mgr_job = job_manager.create_job(JobType.BULK_SEND)
    
    async def run_bulk_send():
        try:
            mgr_job.status = JobStatus.RUNNING
            client = await get_tg_client()
            
            with get_session() as session:
                result = await execute_bulk_send(
                    client, session, job_id,
                    on_progress=lambda c, t, m: job_manager.update_progress(mgr_job.id, c, t, m)
                )
            
            job_manager.complete_job(mgr_job.id, {
                "sent": result.sent_count,
                "failed": result.failed_count,
            })
        except Exception as e:
            job_manager.fail_job(mgr_job.id, str(e))
    
    background_tasks.add_task(run_bulk_send)
    
    return {"job_id": mgr_job.id, "db_job_id": job_id}


# --- Jobs ---

@router.get("/jobs")
async def get_jobs():
    """Get recent jobs."""
    job_manager = get_job_manager()
    jobs = job_manager.get_recent_jobs()
    
    return {
        "jobs": [
            {
                "id": j.id,
                "type": j.type.value,
                "status": j.status.value,
                "progress_current": j.progress_current,
                "progress_total": j.progress_total,
                "progress_message": j.progress_message,
                "result": j.result,
                "error": j.error,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ]
    }


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get a specific job."""
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {
        "job": {
            "id": job.id,
            "type": job.type.value,
            "status": job.status.value,
            "progress_current": job.progress_current,
            "progress_total": job.progress_total,
            "progress_message": job.progress_message,
            "result": job.result,
            "error": job.error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
        }
    }


# --- Cache ---

@router.delete("/cache/messages")
async def clear_message_cache():
    """Clear the message cache."""
    with get_session() as session:
        session.execute(Message.__table__.delete())
        session.commit()
    
    return {"status": "cleared"}


# --- Config ---

@router.get("/config")
async def get_public_config():
    """Get public (non-sensitive) config values."""
    config = get_config()
    
    return {
        "llm_enabled": config.llm_enabled,
        "llm_model": config.llm_model if config.llm_enabled else None,
        "report_cadence": config.report_cadence,
        "bulk_send_delay_seconds": config.bulk_send_delay_seconds,
        "bulk_send_max_per_job": config.bulk_send_max_per_job,
    }
