"""SQLAlchemy models for Teleapps."""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Text, ForeignKey, Index,
    create_engine
)
from sqlalchemy.orm import declarative_base, relationship, Session

Base = declarative_base()


class Conversation(Base):
    """A Telegram dialog (user, group, or channel)."""
    
    __tablename__ = "conversations"
    
    conversation_uuid = Column(String(36), primary_key=True)
    tg_type = Column(String(20), nullable=False)  # user | group | channel
    tg_id = Column(Integer, nullable=False)
    display_name = Column(Text, nullable=False)
    username = Column(String(100), nullable=True)
    unread_count = Column(Integer, default=0)
    last_read_id = Column(Integer, nullable=True)
    last_message_date = Column(DateTime, nullable=True)
    last_message_preview = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    metadata_ = relationship("ConversationMetadata", back_populates="conversation", uselist=False)
    messages = relationship("Message", back_populates="conversation")
    
    __table_args__ = (
        Index("ix_conversations_tg_type_id", "tg_type", "tg_id", unique=True),
        Index("ix_conversations_unread", "unread_count"),
        Index("ix_conversations_last_message", "last_message_date"),
    )


class ConversationMetadata(Base):
    """User-defined metadata for a conversation."""
    
    __tablename__ = "conversation_metadata"
    
    conversation_uuid = Column(
        String(36), 
        ForeignKey("conversations.conversation_uuid", ondelete="CASCADE"),
        primary_key=True
    )
    priority = Column(String(20), default="medium")  # high | medium | low
    notes = Column(Text, nullable=True)
    is_vip = Column(Boolean, default=False)
    muted_in_teleapps = Column(Boolean, default=False)
    custom_fields_json = Column(Text, nullable=True)  # JSON for CSV-imported columns
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    conversation = relationship("Conversation", back_populates="metadata_")
    
    __table_args__ = (
        Index("ix_metadata_priority", "priority"),
        Index("ix_metadata_vip", "is_vip"),
    )


class Participant(Base):
    """A Telegram user who appears in conversations."""
    
    __tablename__ = "participants"
    
    participant_id = Column(Integer, primary_key=True, autoincrement=True)
    tg_user_id = Column(Integer, nullable=True, unique=True)
    display_name = Column(Text, nullable=False)
    username = Column(String(100), nullable=True)
    custom_fields_json = Column(Text, nullable=True)  # JSON for CSV-imported columns
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        Index("ix_participants_tg_user", "tg_user_id"),
    )


class ConversationParticipant(Base):
    """Many-to-many link between conversations and participants."""
    
    __tablename__ = "conversation_participants"
    
    conversation_uuid = Column(
        String(36),
        ForeignKey("conversations.conversation_uuid", ondelete="CASCADE"),
        primary_key=True
    )
    participant_id = Column(
        Integer,
        ForeignKey("participants.participant_id", ondelete="CASCADE"),
        primary_key=True
    )
    role = Column(String(50), nullable=True)  # admin, member, etc.


class Message(Base):
    """Cached message from a conversation."""
    
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_uuid = Column(
        String(36),
        ForeignKey("conversations.conversation_uuid", ondelete="CASCADE"),
        nullable=False
    )
    message_id = Column(Integer, nullable=False)  # Telegram message ID
    date = Column(DateTime, nullable=False)
    sender_id = Column(Integer, nullable=True)  # Telegram user ID
    sender_name = Column(Text, nullable=True)
    text = Column(Text, nullable=True)
    has_media = Column(Boolean, default=False)
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    
    __table_args__ = (
        Index("ix_messages_conversation", "conversation_uuid", "message_id", unique=True),
        Index("ix_messages_date", "date"),
    )


class UserState(Base):
    """Key-value store for user state (caught_up_at, last_report_at, etc.)."""
    
    __tablename__ = "user_state"
    
    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)


class Report(Base):
    """Generated LLM report."""
    
    __tablename__ = "reports"
    
    report_id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    covers_since = Column(DateTime, nullable=False)
    report_json = Column(Text, nullable=False)  # Full report as JSON
    
    __table_args__ = (
        Index("ix_reports_created", "created_at"),
    )


class BulkSendJob(Base):
    """A bulk send job."""
    
    __tablename__ = "bulk_send_jobs"
    
    job_id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    template = Column(Text, nullable=False)
    total_count = Column(Integer, nullable=False)
    sent_count = Column(Integer, default=0)
    status = Column(String(20), default="pending")  # pending | running | completed | failed
    
    # Relationships
    items = relationship("BulkSendItem", back_populates="job")


class BulkSendItem(Base):
    """Individual item in a bulk send job."""
    
    __tablename__ = "bulk_send_items"
    
    item_id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("bulk_send_jobs.job_id", ondelete="CASCADE"), nullable=False)
    conversation_uuid = Column(String(36), nullable=False)
    rendered_message = Column(Text, nullable=False)
    status = Column(String(20), default="pending")  # pending | sent | failed
    sent_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    
    # Relationships
    job = relationship("BulkSendJob", back_populates="items")
