"""LLM client for conversation analysis via OpenRouter or Venice AI."""

import json
from dataclasses import dataclass
from typing import Any

import httpx

from .config import Config, get_config


DEFAULT_SYSTEM_PROMPT = """You analyze Telegram conversations for urgency and priority.

INPUT: You receive:
- The inbox owner's identity (username, first_name) - this is whose inbox you're analyzing
- A batch of conversations, each with metadata and recent unread messages

OUTPUT: Return a JSON array with one object per conversation:
[{
  "conversation_id": "<uuid from input>",
  "urgency_score": <0-100>,
  "summary": "<1-2 sentence summary of unread messages>",
  "recommended_action": "reply_now|review|ignore_for_now",
  "reasoning": "<brief explanation for the score>"
}]

SCORING GUIDELINES:
- 80-100: Requires immediate response (explicit deadlines, VIP sender, urgent keywords, DIRECT MENTIONS of inbox owner)
- 50-79: Should review soon (work matters, direct questions, action items)
- 20-49: Can wait (casual conversation, informational, FYI messages)
- 0-19: Low priority (spam, marketing, broadcasts, old discussions)

Critical factors (in order of importance):
1. **Direct mentions of inbox owner** - In group chats, if someone @mentions or directly addresses the inbox owner by username or name, boost urgency by 25-40 points. This is HIGH PRIORITY.
2. **Replies to inbox owner's messages** - If the message is a reply to something the inbox owner said, boost urgency by 15-25 points.
3. Sender importance (VIP flag, team members)
4. Time sensitivity (deadlines, "ASAP", "urgent")
5. Business/personal impact
6. Whether a response is expected
"""


@dataclass
class AnalysisResult:
    """Result of LLM analysis for one conversation."""
    conversation_id: str
    urgency_score: int
    summary: str
    recommended_action: str
    reasoning: str


@dataclass
class ConversationContext:
    """Context for a conversation to send to LLM."""
    conversation_id: str
    tg_type: str
    display_name: str
    username: str | None
    priority: str
    is_vip: bool
    custom_fields: dict
    messages: list[dict]  # [{sender, text, date}]


class LLMClient:
    """Client for LLM API calls via OpenRouter or Venice AI."""
    
    def __init__(self, config: Config | None = None):
        self.config = config or get_config()
        self.api_key = self.config.llm_api_key
        self.base_url = self.config.llm_base_url
        self.model = self.config.llm_model
        self.system_prompt = self.config.llm_system_prompt or DEFAULT_SYSTEM_PROMPT
    
    @property
    def enabled(self) -> bool:
        return bool(self.api_key)
    
    def _build_user_message(
        self,
        conversations: list[ConversationContext],
        user_info: dict | None = None,
    ) -> str:
        """Build the user message content from conversation contexts."""
        # Include inbox owner info so LLM can detect @mentions
        payload = {}
        if user_info:
            payload["inbox_owner"] = user_info
        
        conv_data = []
        for conv in conversations:
            item = {
                "conversation_id": conv.conversation_id,
                "type": conv.tg_type,
                "display_name": conv.display_name,
                "username": conv.username,
                "priority": conv.priority,
                "is_vip": conv.is_vip,
            }
            
            if conv.custom_fields:
                item["custom_fields"] = conv.custom_fields
            
            item["messages"] = conv.messages
            conv_data.append(item)
        
        payload["conversations"] = conv_data
        return json.dumps(payload, indent=2, default=str)
    
    async def analyze_batch(
        self,
        conversations: list[ConversationContext],
        user_info: dict | None = None,
    ) -> list[AnalysisResult]:
        """Analyze a batch of conversations.
        
        Args:
            conversations: List of conversation contexts
            user_info: Dict with inbox owner info {username, first_name, user_id}
                       Used by LLM to detect @mentions of the user
        
        Returns:
            List of analysis results
        """
        if not self.enabled:
            raise RuntimeError("LLM not configured. Set OPENROUTER_API_KEY or VENICE_API_KEY.")
        
        if not conversations:
            return []
        
        user_message = self._build_user_message(conversations, user_info)
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                },
            )
            
            response.raise_for_status()
            data = response.json()
        
        # Parse response
        content = data["choices"][0]["message"]["content"]
        
        # Strip markdown code block wrappers if present
        content = content.strip()
        if content.startswith("```"):
            # Remove opening ```json or ``` 
            first_newline = content.find("\n")
            if first_newline != -1:
                content = content[first_newline + 1:]
            # Remove closing ```
            if content.endswith("```"):
                content = content[:-3].strip()
        
        try:
            parsed = json.loads(content)
            
            # Handle both array and object with array
            if isinstance(parsed, dict):
                parsed = parsed.get("results", parsed.get("conversations", []))
            
            results = []
            for item in parsed:
                results.append(AnalysisResult(
                    conversation_id=item.get("conversation_id", ""),
                    urgency_score=int(item.get("urgency_score", 50)),
                    summary=item.get("summary", ""),
                    recommended_action=item.get("recommended_action", "review"),
                    reasoning=item.get("reasoning", ""),
                ))
            
            return results
        
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Failed to parse LLM response: {e}")


def get_llm_client(config: Config | None = None) -> LLMClient:
    """Get an LLM client instance."""
    return LLMClient(config)
