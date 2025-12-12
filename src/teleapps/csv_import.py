"""CSV import/export for conversation and participant metadata."""

import csv
import json
import io
from dataclasses import dataclass

from sqlalchemy.orm import Session
from sqlalchemy import select

from .models import Conversation, ConversationMetadata, Participant


@dataclass
class ImportResult:
    """Result of a CSV import operation."""
    imported_count: int = 0
    skipped_count: int = 0
    errors: list[str] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []


# Reserved columns that map to specific fields
CONVERSATION_RESERVED_COLUMNS = {"chatid", "chatname", "priority", "tags", "notes", "muted"}
PARTICIPANT_RESERVED_COLUMNS = {"userid", "username", "displayname", "priority", "tags", "notes"}


def export_conversations_template(db_session: Session) -> str:
    """Export a CSV template with all conversations.
    
    Format: chatid,chatname,priority,tags,notes,[add your columns here]
    
    Returns CSV string.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header with example custom columns
    writer.writerow(["chatid", "chatname", "priority", "tags", "notes", "[add_your_columns]"])
    
    # Get all conversations, ordered by most recent message first
    conversations = db_session.execute(
        select(Conversation, ConversationMetadata)
        .outerjoin(ConversationMetadata)
        .order_by(Conversation.last_message_date.desc().nulls_last())
    ).all()
    
    for conv, meta in conversations:
        # Parse tags JSON to comma-separated string
        tags_str = ""
        if meta and meta.tags:
            try:
                tags_list = json.loads(meta.tags)
                if isinstance(tags_list, list):
                    tags_str = ",".join(tags_list)
            except json.JSONDecodeError:
                pass
        
        writer.writerow([
            conv.tg_id,
            conv.display_name,
            meta.priority if meta else "medium",
            tags_str,
            meta.notes if meta else "",
            "",  # Placeholder for custom columns
        ])
    
    return output.getvalue()


def import_conversations_metadata(db_session: Session, csv_content: str) -> ImportResult:
    """Import conversation metadata from CSV.
    
    The CSV must have at least 'chatid' column.
    Other columns:
    - chatname (ignored, just for reference)
    - priority (high/medium/low)
    - tags (comma-separated list, e.g. "Work,BD,Legal")
    - notes (text)
    - Any other columns stored in custom_fields_json
    
    Returns ImportResult.
    """
    result = ImportResult()
    
    try:
        reader = csv.DictReader(io.StringIO(csv_content))
    except Exception as e:
        result.errors.append(f"Failed to parse CSV: {e}")
        return result
    
    if "chatid" not in (reader.fieldnames or []):
        result.errors.append("CSV must have 'chatid' column")
        return result
    
    for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is 1)
        try:
            chat_id_str = row.get("chatid", "").strip()
            if not chat_id_str:
                result.skipped_count += 1
                continue
            
            try:
                chat_id = int(chat_id_str)
            except ValueError:
                result.errors.append(f"Row {row_num}: Invalid chatid '{chat_id_str}'")
                continue
            
            # Find conversation by tg_id
            conversation = db_session.execute(
                select(Conversation).where(Conversation.tg_id == chat_id)
            ).scalar_one_or_none()
            
            if not conversation:
                result.errors.append(f"Row {row_num}: No conversation found with chatid {chat_id}")
                continue
            
            # Get or create metadata
            meta = db_session.execute(
                select(ConversationMetadata).where(
                    ConversationMetadata.conversation_uuid == conversation.conversation_uuid
                )
            ).scalar_one_or_none()
            
            if not meta:
                meta = ConversationMetadata(
                    conversation_uuid=conversation.conversation_uuid
                )
                db_session.add(meta)
            
            # Update reserved fields
            if "priority" in row and row["priority"].strip():
                priority = row["priority"].strip().lower()
                if priority in ("high", "medium", "low"):
                    meta.priority = priority
            
            # Handle tags - parse comma-separated to JSON array
            if "tags" in row:
                tags_str = row["tags"].strip()
                if tags_str:
                    # Split by comma and clean up each tag
                    tags_list = [t.strip() for t in tags_str.split(",") if t.strip()]
                    meta.tags = json.dumps(tags_list) if tags_list else None
                else:
                    meta.tags = None
            
            if "notes" in row:
                meta.notes = row["notes"].strip() or None
            
            if "muted" in row and row["muted"].strip():
                meta.muted_in_teleapps = row["muted"].strip().lower() in ("true", "1", "yes")
            
            # Collect custom fields (non-reserved columns)
            custom_fields = {}
            for key, value in row.items():
                key_lower = key.lower().strip()
                if key_lower not in CONVERSATION_RESERVED_COLUMNS and value and value.strip():
                    custom_fields[key] = value.strip()
            
            if custom_fields:
                # Merge with existing custom fields
                existing = {}
                if meta.custom_fields_json:
                    try:
                        existing = json.loads(meta.custom_fields_json)
                    except json.JSONDecodeError:
                        pass
                existing.update(custom_fields)
                meta.custom_fields_json = json.dumps(existing)
            
            result.imported_count += 1
        
        except Exception as e:
            result.errors.append(f"Row {row_num}: {str(e)}")
    
    db_session.commit()
    return result


def export_participants_template(db_session: Session) -> str:
    """Export a CSV template with all participants.
    
    Format: userid,username,displayname,priority,tags,[add your columns here]
    
    Returns CSV string.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["userid", "username", "displayname", "priority", "tags", "[add_your_columns]"])
    
    # Get all participants
    participants = db_session.execute(
        select(Participant).order_by(Participant.display_name)
    ).scalars().all()
    
    for p in participants:
        # Parse tags JSON to comma-separated string
        tags_str = ""
        if p.tags:
            try:
                tags_list = json.loads(p.tags)
                if isinstance(tags_list, list):
                    tags_str = ",".join(tags_list)
            except json.JSONDecodeError:
                pass
        
        writer.writerow([
            p.tg_user_id or "",
            p.username or "",
            p.display_name,
            p.priority or "medium",
            tags_str,
            "",  # custom columns placeholder
        ])
    
    return output.getvalue()


def import_participants_metadata(db_session: Session, csv_content: str) -> ImportResult:
    """Import participant metadata from CSV.
    
    The CSV must have 'userid' or 'username' column.
    Other columns:
    - priority (high/medium/low)
    - tags (comma-separated list)
    - Other columns stored in custom_fields_json
    
    Returns ImportResult.
    """
    result = ImportResult()
    
    try:
        reader = csv.DictReader(io.StringIO(csv_content))
    except Exception as e:
        result.errors.append(f"Failed to parse CSV: {e}")
        return result
    
    fieldnames = reader.fieldnames or []
    has_userid = "userid" in fieldnames
    has_username = "username" in fieldnames
    
    if not has_userid and not has_username:
        result.errors.append("CSV must have 'userid' or 'username' column")
        return result
    
    for row_num, row in enumerate(reader, start=2):
        try:
            # Find participant by user_id or username
            participant = None
            
            if has_userid and row.get("userid", "").strip():
                try:
                    user_id = int(row["userid"].strip())
                    participant = db_session.execute(
                        select(Participant).where(Participant.tg_user_id == user_id)
                    ).scalar_one_or_none()
                except ValueError:
                    pass
            
            if not participant and has_username and row.get("username", "").strip():
                username = row["username"].strip().lstrip("@")
                participant = db_session.execute(
                    select(Participant).where(Participant.username == username)
                ).scalar_one_or_none()
            
            if not participant:
                result.skipped_count += 1
                continue
            
            # Update priority
            if "priority" in row and row["priority"].strip():
                priority = row["priority"].strip().lower()
                if priority in ("high", "medium", "low"):
                    participant.priority = priority
            
            # Update relationship type (legacy support -> tags)
            legacy_relationship = None
            if "relationship" in row and row["relationship"].strip():
                legacy_relationship = row["relationship"].strip()
            
            # Handle tags - parse comma-separated to JSON array
            if "tags" in row:
                tags_str = row["tags"].strip()
                if tags_str:
                    tags_list = [t.strip() for t in tags_str.split(",") if t.strip()]
                    if legacy_relationship:
                        tags_list.append(legacy_relationship)
                    participant.tags = json.dumps(list(set(tags_list))) if tags_list else None
                else:
                    participant.tags = json.dumps([legacy_relationship]) if legacy_relationship else None
            
            # Collect custom fields (non-reserved columns)
            custom_fields = {}
            for key, value in row.items():
                key_lower = key.lower().strip()
                if key_lower not in PARTICIPANT_RESERVED_COLUMNS and value and value.strip():
                    custom_fields[key] = value.strip()
            
            if custom_fields:
                existing = {}
                if participant.custom_fields_json:
                    try:
                        existing = json.loads(participant.custom_fields_json)
                    except json.JSONDecodeError:
                        pass
                existing.update(custom_fields)
                participant.custom_fields_json = json.dumps(existing)
            
            result.imported_count += 1
        
        except Exception as e:
            result.errors.append(f"Row {row_num}: {str(e)}")
    
    db_session.commit()
    return result
