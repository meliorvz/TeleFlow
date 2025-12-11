"""Report generation using LLM."""

import json
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import select

from .models import Conversation, ConversationMetadata, Message, Report, UserState
from .telegram_client import TelegramClientWrapper
from .llm import LLMClient, ConversationContext, AnalysisResult
from .sync import sync_messages_for_conversation
from .config import get_config


@dataclass
class ReportSection:
    """A section of the report (reply_now, review, low_priority)."""
    items: list[dict]


@dataclass 
class ReportData:
    """Complete report data structure."""
    generated_at: str
    covers_since: str
    sections: dict[str, list[dict]]
    stats: dict[str, int]


async def generate_report(
    tg_client: TelegramClientWrapper,
    db_session: Session,
    llm_client: LLMClient,
    since: datetime | None = None,
    on_progress: callable = None,
) -> Report:
    """Generate a prioritized report of conversations.
    
    Args:
        tg_client: Connected Telegram client
        db_session: Database session
        llm_client: LLM client for analysis
        since: Only include conversations with activity since this date
               If None, uses caught_up_at from user_state
        on_progress: Optional callback(current, total, message)
    
    Returns:
        Report model instance
    """
    # Get the authenticated user's info for @mention detection
    me = await tg_client.get_me()
    user_info = None
    if me:
        user_info = {
            "user_id": me.id,
            "username": me.username,
            "first_name": getattr(me, "first_name", None),
            "last_name": getattr(me, "last_name", None),
        }
    
    # Get "since" date
    if since is None:
        since = get_caught_up_date(db_session)
    
    if since is None:
        # Default to 7 days ago if never set
        since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        since = since - timedelta(days=7)
    
    # Calculate age cutoff (conversations older than this are excluded)
    from datetime import timedelta
    config = get_config()
    age_cutoff = datetime.utcnow() - timedelta(days=config.llm_conversation_max_age_days)
    
    # Find conversations with unread messages
    # Only include conversations with unread messages - no point summarizing read chats
    # Also exclude conversations older than the age cutoff
    query = (
        select(Conversation, ConversationMetadata)
        .outerjoin(ConversationMetadata)
        .where(Conversation.unread_count > 0)
        .where(
            # Age cutoff - exclude stale conversations
            Conversation.last_message_date >= age_cutoff
        )
        .order_by(Conversation.last_message_date.desc())
    )
    
    results = db_session.execute(query).all()
    
    if not results:
        # No conversations to analyze
        report_data = ReportData(
            generated_at=datetime.utcnow().isoformat(),
            covers_since=since.isoformat(),
            sections={"reply_now": [], "review": [], "low_priority": []},
            stats={"total_conversations": 0, "total_unread": 0},
        )
        
        report = Report(
            covers_since=since,
            report_json=json.dumps(asdict(report_data)),
        )
        db_session.add(report)
        db_session.commit()
        return report
    
    # Build contexts for LLM
    contexts = []
    total = len(results)
    
    for i, (conv, meta) in enumerate(results):
        if on_progress:
            on_progress(i + 1, total, f"Fetching messages: {conv.display_name}")
        
        # Sync recent messages if needed
        config = get_config()
        await sync_messages_for_conversation(
            tg_client, db_session, conv,
            limit=config.message_cache_limit,
            owner_info=user_info
        )
        
        # Get cached messages
        messages = db_session.execute(
            select(Message)
            .where(Message.conversation_uuid == conv.conversation_uuid)
            .order_by(Message.date.desc())
            .limit(20)
        ).scalars().all()
        
        message_data = [
            {
                "sender": msg.sender_name or "Unknown",
                "text": msg.text[:500] if msg.text else "",
                "date": msg.date.isoformat() if msg.date else "",
            }
            for msg in messages
        ]
        
        # Parse custom fields
        custom_fields = {}
        if meta and meta.custom_fields_json:
            try:
                custom_fields = json.loads(meta.custom_fields_json)
            except json.JSONDecodeError:
                pass
        
        contexts.append(ConversationContext(
            conversation_id=conv.conversation_uuid,
            tg_type=conv.tg_type,
            display_name=conv.display_name,
            username=conv.username,
            priority=meta.priority if meta else "medium",
            is_vip=meta.is_vip if meta else False,
            custom_fields=custom_fields,
            messages=message_data,
        ))
    
    # Call LLM in batches
    if on_progress:
        on_progress(total, total, "Analyzing with LLM...")
    
    all_results: list[AnalysisResult] = []
    batch_size = 10
    
    for i in range(0, len(contexts), batch_size):
        batch = contexts[i:i + batch_size]
        batch_results = await llm_client.analyze_batch(batch, user_info=user_info)
        all_results.extend(batch_results)
    
    # Organize into sections
    reply_now = []
    review = []
    low_priority = []
    total_unread = 0
    
    # Build lookup for conversation data
    conv_lookup = {conv.conversation_uuid: (conv, meta) for conv, meta in results}
    
    for result in all_results:
        conv, meta = conv_lookup.get(result.conversation_id, (None, None))
        if not conv:
            continue
        
        total_unread += conv.unread_count
        
        item = {
            "conversation_uuid": result.conversation_id,
            "display_name": conv.display_name,
            "username": conv.username,
            "tg_type": conv.tg_type,
            "unread_count": conv.unread_count,
            "urgency_score": result.urgency_score,
            "summary": result.summary,
            "reasoning": result.reasoning,
            "recommended_action": result.recommended_action,
        }
        
        if result.urgency_score >= 80:
            reply_now.append(item)
        elif result.urgency_score >= 40:
            review.append(item)
        else:
            low_priority.append(item)
    
    # Sort each section by urgency
    reply_now.sort(key=lambda x: x["urgency_score"], reverse=True)
    review.sort(key=lambda x: x["urgency_score"], reverse=True)
    low_priority.sort(key=lambda x: x["urgency_score"], reverse=True)
    
    # Build report
    report_data = ReportData(
        generated_at=datetime.utcnow().isoformat(),
        covers_since=since.isoformat(),
        sections={
            "reply_now": reply_now,
            "review": review,
            "low_priority": low_priority,
        },
        stats={
            "total_conversations": len(results),
            "total_unread": total_unread,
        },
    )
    
    report = Report(
        covers_since=since,
        report_json=json.dumps(asdict(report_data)),
    )
    db_session.add(report)
    
    # Update last_report_at
    set_user_state(db_session, "last_report_at", datetime.utcnow().isoformat())
    
    db_session.commit()
    return report


def get_caught_up_date(db_session: Session) -> datetime | None:
    """Get the user's caught_up_at date."""
    state = db_session.execute(
        select(UserState).where(UserState.key == "caught_up_at")
    ).scalar_one_or_none()
    
    if state and state.value:
        return datetime.fromisoformat(state.value)
    return None


def set_caught_up_date(db_session: Session, date: datetime | None = None) -> None:
    """Set the caught_up_at date (defaults to now)."""
    if date is None:
        date = datetime.utcnow()
    
    set_user_state(db_session, "caught_up_at", date.isoformat())
    db_session.commit()


def set_user_state(db_session: Session, key: str, value: str) -> None:
    """Set a user state value."""
    state = db_session.execute(
        select(UserState).where(UserState.key == key)
    ).scalar_one_or_none()
    
    if state:
        state.value = value
    else:
        state = UserState(key=key, value=value)
        db_session.add(state)


def get_user_state(db_session: Session, key: str) -> str | None:
    """Get a user state value."""
    state = db_session.execute(
        select(UserState).where(UserState.key == key)
    ).scalar_one_or_none()
    
    return state.value if state else None


def get_last_report(db_session: Session) -> Report | None:
    """Get the most recent report."""
    return db_session.execute(
        select(Report).order_by(Report.created_at.desc()).limit(1)
    ).scalar_one_or_none()


def get_report_by_id(db_session: Session, report_id: int) -> Report | None:
    """Get a report by ID."""
    return db_session.execute(
        select(Report).where(Report.report_id == report_id)
    ).scalar_one_or_none()


def list_reports(db_session: Session, limit: int = 20) -> list[Report]:
    """List recent reports."""
    return list(db_session.execute(
        select(Report).order_by(Report.created_at.desc()).limit(limit)
    ).scalars().all())


async def generate_simple_report(
    tg_client: TelegramClientWrapper,
    db_session: Session,
    since: datetime | None = None,
    on_progress: callable = None,
) -> Report:
    """Generate a prioritized report WITHOUT LLM, using simple rules.
    
    Prioritization is based on:
    - Messages that @mention the inbox owner (highest priority)
    - Messages that are replies (medium-high priority)
    - Other unread messages (lower priority)
    
    This is the privacy-focused option - no data is sent externally.
    
    Args:
        tg_client: Connected Telegram client
        db_session: Database session
        since: Only include conversations with activity since this date
               If None, uses caught_up_at from user_state
        on_progress: Optional callback(current, total, message)
    
    Returns:
        Report model instance
    """
    # Get the authenticated user's info for @mention detection
    me = await tg_client.get_me()
    user_info = None
    if me:
        user_info = {
            "user_id": me.id,
            "username": me.username,
            "first_name": getattr(me, "first_name", None),
            "last_name": getattr(me, "last_name", None),
        }
    
    # Get "since" date
    if since is None:
        since = get_caught_up_date(db_session)
    
    if since is None:
        # Default to 7 days ago if never set
        since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        since = since - timedelta(days=7)
    
    # Calculate age cutoff
    from datetime import timedelta
    config = get_config()
    age_cutoff = datetime.utcnow() - timedelta(days=config.llm_conversation_max_age_days)
    
    # Find conversations with unread messages
    query = (
        select(Conversation, ConversationMetadata)
        .outerjoin(ConversationMetadata)
        .where(Conversation.unread_count > 0)
        .where(Conversation.last_message_date >= age_cutoff)
        .order_by(Conversation.last_message_date.desc())
    )
    
    results = db_session.execute(query).all()
    
    if not results:
        # No conversations to analyze
        report_data = ReportData(
            generated_at=datetime.utcnow().isoformat(),
            covers_since=since.isoformat(),
            sections={"reply_now": [], "review": [], "low_priority": []},
            stats={"total_conversations": 0, "total_unread": 0},
        )
        
        report = Report(
            covers_since=since,
            report_json=json.dumps(asdict(report_data)),
        )
        db_session.add(report)
        db_session.commit()
        return report
    
    # Analyze each conversation using simple rules
    reply_now = []
    review = []
    low_priority = []
    total_unread = 0
    total = len(results)
    
    for i, (conv, meta) in enumerate(results):
        if on_progress:
            on_progress(i + 1, total, f"Analyzing: {conv.display_name}")
        
        # Sync recent messages (with mention detection)
        await sync_messages_for_conversation(
            tg_client, db_session, conv,
            limit=config.message_cache_limit,
            owner_info=user_info
        )
        
        total_unread += conv.unread_count
        
        # Get recent messages to check for mentions/replies
        messages = db_session.execute(
            select(Message)
            .where(Message.conversation_uuid == conv.conversation_uuid)
            .order_by(Message.date.desc())
            .limit(20)
        ).scalars().all()
        
        # Calculate urgency based on simple rules
        has_mention = any(m.mentions_owner for m in messages)
        has_reply = any(m.reply_to_msg_id is not None for m in messages)
        is_vip = meta.is_vip if meta else False
        is_dm = conv.tg_type == "user"
        
        # Scoring logic:
        # - VIP bonus: +20
        # - DM (direct message): +15
        # - Has @mention of owner: +50 (this is the key signal for groups)
        # - Has reply: +25
        # - Base score: 20
        
        urgency_score = 20  # Base
        reasoning_parts = []
        
        if is_vip:
            urgency_score += 20
            reasoning_parts.append("VIP contact")
        
        if is_dm:
            urgency_score += 15
            reasoning_parts.append("Direct message")
        
        if has_mention:
            urgency_score += 50
            reasoning_parts.append("You were @mentioned")
        
        if has_reply:
            urgency_score += 25
            reasoning_parts.append("Contains replies")
        
        # Cap at 100
        urgency_score = min(urgency_score, 100)
        
        # Generate summary from recent messages
        summary_messages = [m.text[:100] for m in messages[:3] if m.text]
        summary = "; ".join(summary_messages)[:200] if summary_messages else "No text messages"
        
        # Determine recommended action
        if urgency_score >= 80:
            recommended_action = "reply_now"
        elif urgency_score >= 40:
            recommended_action = "review"
        else:
            recommended_action = "ignore_for_now"
        
        reasoning = ", ".join(reasoning_parts) if reasoning_parts else "Regular conversation"
        
        item = {
            "conversation_uuid": conv.conversation_uuid,
            "display_name": conv.display_name,
            "username": conv.username,
            "tg_type": conv.tg_type,
            "unread_count": conv.unread_count,
            "urgency_score": urgency_score,
            "summary": summary,
            "reasoning": reasoning,
            "recommended_action": recommended_action,
        }
        
        if urgency_score >= 80:
            reply_now.append(item)
        elif urgency_score >= 40:
            review.append(item)
        else:
            low_priority.append(item)
    
    # Sort each section by urgency
    reply_now.sort(key=lambda x: x["urgency_score"], reverse=True)
    review.sort(key=lambda x: x["urgency_score"], reverse=True)
    low_priority.sort(key=lambda x: x["urgency_score"], reverse=True)
    
    # Build report
    report_data = ReportData(
        generated_at=datetime.utcnow().isoformat(),
        covers_since=since.isoformat(),
        sections={
            "reply_now": reply_now,
            "review": review,
            "low_priority": low_priority,
        },
        stats={
            "total_conversations": len(results),
            "total_unread": total_unread,
        },
    )
    
    report = Report(
        covers_since=since,
        report_json=json.dumps(asdict(report_data)),
    )
    db_session.add(report)
    
    # Update last_report_at
    set_user_state(db_session, "last_report_at", datetime.utcnow().isoformat())
    
    db_session.commit()
    return report

