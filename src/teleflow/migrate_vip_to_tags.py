"""Database migration script for VIP to tags conversion and new columns.

This script:
1. Adds 'tags' column to conversation_metadata if missing
2. Migrates is_vip=True to tags='["High"]'
3. Adds new columns to participants table
4. Removes is_vip column if it exists

Run automatically on app startup.
"""

import json
import sqlite3
from pathlib import Path


def run_migration(db_path: str) -> dict:
    """Run the VIP to tags migration.
    
    Args:
        db_path: Path to the SQLite database
        
    Returns:
        Dict with migration results
    """
    if not Path(db_path).exists():
        return {"status": "skipped", "reason": "Database does not exist yet"}
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    results = {
        "conversation_metadata_tags_added": False,
        "vip_migrated_count": 0,
        "is_vip_column_removed": False,
        "participant_columns_added": [],
    }
    
    try:
        # Check if conversation_metadata table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_metadata'"
        )
        if not cursor.fetchone():
            conn.close()
            return {"status": "skipped", "reason": "conversation_metadata table does not exist"}
        
        # Get existing columns in conversation_metadata
        cursor.execute("PRAGMA table_info(conversation_metadata)")
        conv_meta_columns = {row[1] for row in cursor.fetchall()}
        
        # Add 'tags' column if it doesn't exist
        if "tags" not in conv_meta_columns:
            cursor.execute("ALTER TABLE conversation_metadata ADD COLUMN tags TEXT")
            results["conversation_metadata_tags_added"] = True
        
        # Migrate is_vip to tags if is_vip column exists
        if "is_vip" in conv_meta_columns:
            # Get all VIP conversations
            cursor.execute(
                "SELECT conversation_uuid, tags FROM conversation_metadata WHERE is_vip = 1"
            )
            vip_rows = cursor.fetchall()
            
            for uuid, existing_tags in vip_rows:
                # Parse existing tags or start with empty list
                tags = []
                if existing_tags:
                    try:
                        tags = json.loads(existing_tags)
                    except json.JSONDecodeError:
                        tags = []
                
                # Add "High" if not already present
                if "High" not in tags:
                    tags.append("High")
                
                # Update the tags
                cursor.execute(
                    "UPDATE conversation_metadata SET tags = ? WHERE conversation_uuid = ?",
                    (json.dumps(tags), uuid)
                )
                results["vip_migrated_count"] += 1
            
            # Note: SQLite doesn't support DROP COLUMN in older versions
            # We'll leave the is_vip column but it won't be used
            # Modern SQLite (3.35+) supports ALTER TABLE DROP COLUMN
            try:
                cursor.execute("ALTER TABLE conversation_metadata DROP COLUMN is_vip")
                results["is_vip_column_removed"] = True
            except sqlite3.OperationalError:
                # Older SQLite version, column stays but unused
                pass
        
        # Check participants table
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='participants'"
        )
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(participants)")
            participant_columns = {row[1] for row in cursor.fetchall()}
            
            # Add new columns to participants
            if "priority" not in participant_columns:
                cursor.execute(
                    "ALTER TABLE participants ADD COLUMN priority TEXT DEFAULT 'medium'"
                )
                results["participant_columns_added"].append("priority")
            
            if "tags" not in participant_columns:
                cursor.execute("ALTER TABLE participants ADD COLUMN tags TEXT")
                results["participant_columns_added"].append("tags")
        
        conn.commit()
        results["status"] = "completed"
        
    except Exception as e:
        conn.rollback()
        results["status"] = "error"
        results["error"] = str(e)
    finally:
        conn.close()
    
    return results


def check_migration_needed(db_path: str) -> bool:
    """Check if migration needs to run.
    
    Returns True if:
    - is_vip column exists in conversation_metadata
    - tags column is missing from conversation_metadata
    - priority/tags columns missing from participants
    """
    if not Path(db_path).exists():
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check conversation_metadata
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_metadata'"
        )
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(conversation_metadata)")
            columns = {row[1] for row in cursor.fetchall()}
            
            if "is_vip" in columns or "tags" not in columns:
                return True
        
        # Check participants
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='participants'"
        )
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(participants)")
            columns = {row[1] for row in cursor.fetchall()}
            
            needed_columns = {"priority", "tags"}
            if not needed_columns.issubset(columns):
                return True
        
        return False
        
    finally:
        conn.close()


if __name__ == "__main__":
    # Run migration on default database
    import os
    
    # Default to localdata directory
    script_dir = Path(__file__).parent
    db_path = script_dir.parent.parent / "localdata" / "teleflow.db"
    
    if db_path.exists():
        print(f"Running migration on {db_path}")
        result = run_migration(str(db_path))
        print(f"Migration result: {result}")
    else:
        print(f"Database not found at {db_path}")
