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
    owner_info: dict | None = None,
) -> int:
    """Sync recent messages for a specific conversation.
    
    Args:
        tg_client: Connected Telegram client
        db_session: Database session
        conversation: Conversation to sync messages for
        limit: Max number of messages to fetch
        owner_info: Dict with inbox owner info {username, first_name, user_id}
                    Used to detect @mentions of the owner
    
    Returns the number of new messages synced.
    """
    rate_limiter = get_rate_limiter()
    
    # Get entity
    entity = await tg_client.get_entity(conversation.tg_id)
    
    # Fetch messages
    messages = await rate_limiter.execute(
        tg_client.get_messages(entity, limit=limit)
    )
    
    # Build list of patterns to detect @mentions of owner
    mention_patterns = []
    if owner_info:
        if owner_info.get("username"):
            mention_patterns.append(f"@{owner_info['username'].lower()}")
        if owner_info.get("first_name"):
            mention_patterns.append(owner_info["first_name"].lower())
    
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
        
        # Get reply_to info
        reply_to_msg_id = None
        if msg.reply_to and hasattr(msg.reply_to, 'reply_to_msg_id'):
            reply_to_msg_id = msg.reply_to.reply_to_msg_id
        
        # Detect @mentions of owner in message text
        mentions_owner = False
        if mention_patterns and msg.text:
            text_lower = msg.text.lower()
            for pattern in mention_patterns:
                if pattern in text_lower:
                    mentions_owner = True
                    break
        
        message = Message(
            conversation_uuid=conversation.conversation_uuid,
            message_id=msg.id,
            date=msg.date,
            sender_id=sender_id,
            sender_name=sender_name,
            text=msg.text or "",
            has_media=msg.media is not None,
            reply_to_msg_id=reply_to_msg_id,
            mentions_owner=mentions_owner,
        )
        db_session.add(message)
        new_count += 1
        
        # Also create/update participant from message sender
        if sender_id and sender_name and conversation.tg_type in ("group", "channel"):
            existing_participant = db_session.execute(
                select(Participant).where(Participant.tg_user_id == sender_id)
            ).scalar_one_or_none()
            
            if not existing_participant:
                # Create new participant
                participant = Participant(
                    tg_user_id=sender_id,
                    display_name=sender_name,
                    username=getattr(msg.sender, "username", None),
                )
                db_session.add(participant)
                db_session.flush()  # Get the participant_id
                existing_participant = participant
            
            # Link participant to conversation if not already linked
            link_exists = db_session.execute(
                select(ConversationParticipant).where(
                    ConversationParticipant.conversation_uuid == conversation.conversation_uuid,
                    ConversationParticipant.participant_id == existing_participant.participant_id
                )
            ).scalar_one_or_none()
            
            if not link_exists:
                link = ConversationParticipant(
                    conversation_uuid=conversation.conversation_uuid,
                    participant_id=existing_participant.participant_id,
                )
                db_session.add(link)
    
    db_session.commit()
    return new_count


async def sync_participants_for_group(
    tg_client: TelegramClientWrapper,
    db_session: Session,
    conversation: Conversation,
    limit: int = 200,
    on_progress: callable = None,
) -> int:
    """Sync participants for a group/channel conversation.
    
    Args:
        tg_client: Connected Telegram client
        db_session: Database session
        conversation: Group/channel conversation to sync participants for
        limit: Max number of participants to fetch
        on_progress: Optional callback(current, total, message)
    
    Returns the number of participants synced.
    """
    if conversation.tg_type not in ("group", "channel"):
        return 0
    
    rate_limiter = get_rate_limiter()
    
    # Get entity
    entity = await tg_client.get_entity(conversation.tg_id)
    
    # Fetch participants
    try:
        participants = await rate_limiter.execute(
            tg_client.get_participants(entity, limit=limit)
        )
    except Exception as e:
        # May fail for channels we don't have admin rights for
        print(f"Could not fetch participants for {conversation.display_name}: {e}")
        return 0
    
    count = 0
    total = len(participants)
    
    for i, p in enumerate(participants):
        if not p or not p.id:
            continue
        
        # Find or create participant
        existing = db_session.execute(
            select(Participant).where(Participant.tg_user_id == p.id)
        ).scalar_one_or_none()
        
        if existing:
            # Update display name if changed
            new_name = f"{p.first_name or ''} {p.last_name or ''}".strip() or "Unknown"
            if existing.display_name != new_name:
                existing.display_name = new_name
            if p.username and existing.username != p.username:
                existing.username = p.username
            participant = existing
        else:
            participant = Participant(
                tg_user_id=p.id,
                display_name=f"{p.first_name or ''} {p.last_name or ''}".strip() or "Unknown",
                username=p.username,
            )
            db_session.add(participant)
            db_session.flush()
        
        # Create link if doesn't exist
        link_exists = db_session.execute(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_uuid == conversation.conversation_uuid,
                ConversationParticipant.participant_id == participant.participant_id
            )
        ).scalar_one_or_none()
        
        if not link_exists:
            link = ConversationParticipant(
                conversation_uuid=conversation.conversation_uuid,
                participant_id=participant.participant_id,
            )
            db_session.add(link)
            count += 1
        
        if on_progress:
            on_progress(i + 1, total, f"Syncing participant: {participant.display_name}")
    
    db_session.commit()
    return count

