"""Sync Telegram dialogs to local database."""

import uuid
from datetime import datetime
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import select

from .models import Conversation, ConversationMetadata, Participant, ConversationParticipant, Message
from .telegram_client import TelegramClientWrapper
from .util.rate_limiter import get_rate_limiter


@dataclass
class SyncResult:
    """Result of a sync operation."""
    new_count: int = 0
    updated_count: int = 0
    unchanged_count: int = 0
    errors: list[str] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []
    
    @property
    def total(self) -> int:
        return self.new_count + self.updated_count + self.unchanged_count


async def sync_dialogs(
    tg_client: TelegramClientWrapper,
    db_session: Session,
    on_progress: callable = None,
) -> SyncResult:
    """Sync all Telegram dialogs to the local database.
    
    Args:
        tg_client: Connected Telegram client
        db_session: Database session
        on_progress: Optional callback(current, total, message)
    
    Returns:
        SyncResult with counts of new, updated, unchanged conversations
    """
    result = SyncResult()
    rate_limiter = get_rate_limiter()
    
    # Collect all dialogs first
    dialogs = []
    async for dialog in tg_client.iter_dialogs():
        dialogs.append(dialog)
    
    total = len(dialogs)
    
    for i, dialog in enumerate(dialogs):
        try:
            entity = dialog.entity
            if entity is None:
                continue
            
            tg_type = tg_client.get_entity_type(entity)
            tg_id = dialog.id
            display_name = tg_client.get_display_name(entity)
            username = tg_client.get_username(entity)
            
            # Get last message info
            last_message = dialog.message
            last_message_date = last_message.date if last_message else None
            last_message_preview = ""
            if last_message and last_message.text:
                last_message_preview = last_message.text[:200]
            
            # Get read state
            unread_count = dialog.unread_count or 0
            last_read_id = getattr(dialog.dialog, "read_inbox_max_id", None)
            
            # Check if conversation exists
            existing = db_session.execute(
                select(Conversation).where(
                    Conversation.tg_type == tg_type,
                    Conversation.tg_id == tg_id
                )
            ).scalar_one_or_none()
            
            if existing:
                # Update existing
                changed = False
                if existing.unread_count != unread_count:
                    existing.unread_count = unread_count
                    changed = True
                if existing.last_read_id != last_read_id:
                    existing.last_read_id = last_read_id
                    changed = True
                if existing.last_message_date != last_message_date:
                    existing.last_message_date = last_message_date
                    existing.last_message_preview = last_message_preview
                    changed = True
                if existing.display_name != display_name:
                    existing.display_name = display_name
                    changed = True
                if existing.username != username:
                    existing.username = username
                    changed = True
                
                if changed:
                    existing.updated_at = datetime.utcnow()
                    result.updated_count += 1
                else:
                    result.unchanged_count += 1
            else:
                # Create new conversation
                conv_uuid = str(uuid.uuid4())
                conversation = Conversation(
                    conversation_uuid=conv_uuid,
                    tg_type=tg_type,
                    tg_id=tg_id,
                    display_name=display_name,
                    username=username,
                    unread_count=unread_count,
                    last_read_id=last_read_id,
                    last_message_date=last_message_date,
                    last_message_preview=last_message_preview,
                )
                db_session.add(conversation)
                
                # Create default metadata
                metadata = ConversationMetadata(
                    conversation_uuid=conv_uuid,
                    priority="medium",
                )
                db_session.add(metadata)
                
                result.new_count += 1
            
            # Report progress
            if on_progress:
                on_progress(i + 1, total, f"Syncing: {display_name}")
        
        except Exception as e:
            result.errors.append(f"Error syncing dialog {dialog.id}: {str(e)}")
    
    # Commit all changes
    db_session.commit()
    
    return result


async def sync_messages_for_conversation(
    tg_client: TelegramClientWrapper,
    db_session: Session,
    conversation: Conversation,
    limit: int = 50,
) -> int:
    """Sync recent messages for a specific conversation.
    
    Returns the number of new messages synced.
    """
    rate_limiter = get_rate_limiter()
    
    # Get entity
    entity = await tg_client.get_entity(conversation.tg_id)
    
    # Fetch messages
    messages = await rate_limiter.execute(
        tg_client.get_messages(entity, limit=limit)
    )
    
    new_count = 0
    
    for msg in messages:
        if not msg or not msg.id:
            continue
        
        # Check if already cached
        existing = db_session.execute(
            select(Message).where(
                Message.conversation_uuid == conversation.conversation_uuid,
                Message.message_id == msg.id
            )
        ).scalar_one_or_none()
        
        if existing:
            continue
        
        # Get sender info
        sender_id = None
        sender_name = None
        if msg.sender:
            sender_id = msg.sender_id
            sender_name = tg_client.get_display_name(msg.sender)
        
        message = Message(
            conversation_uuid=conversation.conversation_uuid,
            message_id=msg.id,
            date=msg.date,
            sender_id=sender_id,
            sender_name=sender_name,
            text=msg.text or "",
            has_media=msg.media is not None,
        )
        db_session.add(message)
        new_count += 1
    
    db_session.commit()
    return new_count
