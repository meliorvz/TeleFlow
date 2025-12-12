"""Message template rendering."""

import re
from typing import Any


def render_template(template: str, context: dict[str, Any]) -> str:
    """Render a message template with context variables.
    
    Supported tokens:
    - {{display_name}}
    - {{first_name}}
    - {{username}}
    - Any key from context dict
    
    Example:
        template = "Hey {{first_name}}, just checking in!"
        context = {"first_name": "John", "display_name": "John Doe"}
        result = render_template(template, context)
        # "Hey John, just checking in!"
    """
    result = template
    
    # Find all {{token}} patterns
    pattern = r"\{\{(\w+)\}\}"
    
    def replace_token(match: re.Match) -> str:
        key = match.group(1)
        value = context.get(key, "")
        return str(value) if value else match.group(0)  # Keep original if not found
    
    return re.sub(pattern, replace_token, result)


def extract_first_name(display_name: str) -> str:
    """Extract first name from display name."""
    if not display_name:
        return ""
    return display_name.split()[0]


def build_context_from_conversation(conversation: dict, entity: Any = None) -> dict:
    """Build template context from conversation data.
    
    Args:
        conversation: Dict with display_name, username, etc.
        entity: Optional Telethon entity for additional data
    """
    display_name = conversation.get("display_name", "")
    
    context = {
        "display_name": display_name,
        "first_name": extract_first_name(display_name),
        "username": conversation.get("username") or "",
    }
    
    # Add custom fields if present
    if "custom_fields" in conversation:
        context.update(conversation["custom_fields"])
    
    return context
