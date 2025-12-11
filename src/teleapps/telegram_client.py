"""Telegram client wrapper using Telethon."""

import asyncio
from datetime import datetime
from typing import AsyncIterator, Any

from telethon import TelegramClient
from telethon.tl.types import User, Chat, Channel, Dialog
from telethon.errors import SessionPasswordNeededError, FloodWaitError

from .config import Config, get_config


class TelegramClientWrapper:
    """Wrapper around Telethon for Teleapps operations."""
    
    def __init__(self, config: Config | None = None):
        self.config = config or get_config()
        self._client: TelegramClient | None = None
        self._connected = False
    
    @property
    def client(self) -> TelegramClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Call connect() first.")
        return self._client
    
    async def connect(self) -> None:
        """Initialize and connect the Telegram client."""
        if self._client is not None:
            return
        
        session_path = str(self.config.session_path.with_suffix(""))
        
        self._client = TelegramClient(
            session_path,
            self.config.tg_api_id,
            self.config.tg_api_hash,
        )
        
        await self._client.connect()
        self._connected = True
    
    async def disconnect(self) -> None:
        """Disconnect the client."""
        if self._client:
            await self._client.disconnect()
            self._connected = False
    
    async def log_out(self) -> bool:
        """Log out and terminate the session on Telegram's side.
        
        This removes the session from the user's active devices list
        in Telegram settings. Returns True if successful.
        """
        if not self._client:
            return False
        try:
            await self._client.log_out()
            self._connected = False
            return True
        except Exception:
            return False
    
    async def is_authorized(self) -> bool:
        """Check if already logged in."""
        if not self._client:
            return False
        return await self._client.is_user_authorized()
    
    async def start_phone_login(self, phone: str) -> str:
        """Start phone-based login, returns phone_code_hash."""
        result = await self.client.send_code_request(phone)
        return result.phone_code_hash
    
    async def complete_phone_login(self, phone: str, code: str, phone_code_hash: str) -> bool:
        """Complete phone login with code. Returns True if 2FA needed."""
        try:
            await self.client.sign_in(phone, code, phone_code_hash=phone_code_hash)
            return False
        except SessionPasswordNeededError:
            return True
    
    async def complete_2fa_login(self, password: str) -> None:
        """Complete 2FA login."""
        await self.client.sign_in(password=password)
    
    async def get_me(self) -> User | None:
        """Get the current user."""
        return await self.client.get_me()
    
    async def iter_dialogs(self) -> AsyncIterator[Dialog]:
        """Iterate through all dialogs."""
        async for dialog in self.client.iter_dialogs():
            yield dialog
    
    async def get_messages(
        self,
        entity: Any,
        limit: int = 50,
        min_id: int | None = None,
    ) -> list:
        """Get messages from a conversation.
        
        Does NOT mark messages as read.
        """
        kwargs = {"limit": limit}
        if min_id is not None:
            kwargs["min_id"] = min_id
        
        messages = await self.client.get_messages(entity, **kwargs)
        return list(messages)
    
    async def get_participants(self, entity: Any, limit: int = 50) -> list:
        """Get participants from a group/channel."""
        try:
            participants = await self.client.get_participants(entity, limit=limit)
            return list(participants)
        except Exception:
            # Not all chats allow fetching participants
            return []
    
    async def send_message(self, entity: Any, text: str) -> Any:
        """Send a message to an entity."""
        return await self.client.send_message(entity, text)
    
    async def get_entity(self, entity_id: int) -> Any:
        """Get an entity by ID."""
        return await self.client.get_entity(entity_id)
    
    def get_entity_type(self, entity: Any) -> str:
        """Determine the type of entity."""
        if isinstance(entity, User):
            return "user"
        elif isinstance(entity, Chat):
            return "group"
        elif isinstance(entity, Channel):
            if entity.megagroup:
                return "group"
            return "channel"
        return "other"
    
    def get_display_name(self, entity: Any) -> str:
        """Get display name for an entity."""
        if isinstance(entity, User):
            parts = [entity.first_name or ""]
            if entity.last_name:
                parts.append(entity.last_name)
            return " ".join(parts) or "Unknown User"
        elif hasattr(entity, "title"):
            return entity.title or "Unknown"
        return "Unknown"
    
    def get_username(self, entity: Any) -> str | None:
        """Get username for an entity."""
        return getattr(entity, "username", None)


# Sync wrapper for use in non-async contexts
def run_sync(coro):
    """Run a coroutine synchronously."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context, create new loop
            import nest_asyncio
            nest_asyncio.apply()
            return loop.run_until_complete(coro)
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)
