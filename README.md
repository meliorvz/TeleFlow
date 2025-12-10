# Teleapps

Local-only Telegram triage and bulk messaging assistant, optimized for 1000+ chats with privacy-first design.

## Features

- **Conversation Sync**: Import all your Telegram dialogs locally
- **LLM-Powered Reports**: Generate urgency-ranked triage reports using OpenRouter
- **Bulk Messaging**: Send templated messages to multiple conversations with safety guards
- **CSV Import/Export**: Manage conversation categories and metadata via spreadsheets
- **Web Interface**: Non-technical friendly browser-based UI

## Privacy

Teleapps is designed for privacy-conscious users:

- **No cloud storage**: All data stored locally in SQLite
- **No analytics**: Zero tracking or telemetry
- **Minimal network**: Only connects to:
  - Telegram (MTProto via Telethon)
  - OpenRouter (optional, for LLM features)
- **Auditable dependencies**: All packages pinned to exact versions

### Files Created

| File | Purpose |
|------|---------|
| `teleapps.db` | SQLite database with conversations and metadata |
| `teleapps.session` | Encrypted Telethon session file |
| `teleapps.log` | Application logs |
| `config.env` | Your configuration (API keys, settings) |

### How to Wipe

To completely remove Teleapps:

```bash
rm -rf ~/Documents/teleapps/
```

Then revoke the session in Telegram: Settings → Devices → Find "Teleapps" → Terminate.

## Installation

### Prerequisites

- Python 3.10+
- Telegram API credentials (get from https://my.telegram.org)

### Setup

```bash
# Clone or download to ~/Documents/teleapps
cd ~/Documents/teleapps

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit config
cp config.env.example config.env
# Edit config.env with your TG_API_ID and TG_API_HASH
```

### Configure

Edit `config.env`:

```env
# Required
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash

# Optional: Enable LLM features
OPENROUTER_API_KEY=your_openrouter_key
```

### Run

```bash
# Activate virtual environment
source .venv/bin/activate

# Start Teleapps
python -m teleapps.main
```

Then open http://localhost:8080 in your browser.

## Usage

### First Time Setup

1. Open the web UI
2. Enter your phone number when prompted
3. Enter the code sent to your Telegram
4. (If enabled) Enter your 2FA password
5. Click "Sync" to import your conversations

### Generating Reports

1. Ensure `OPENROUTER_API_KEY` is set in config.env
2. Click "Generate New Report" on the Dashboard
3. View prioritized conversations organized by urgency

### Managing Categories

1. Go to Import/Export
2. Download the conversations template
3. Edit the CSV to add columns (e.g., `category`, `team`, `project`)
4. Upload the edited CSV

### Bulk Sending

1. Go to Bulk Send
2. Select recipients
3. Write your message template using tokens:
   - `{{display_name}}` - Full name
   - `{{first_name}}` - First name only
   - `{{username}}` - @username
4. Preview and confirm with the safety code

## Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `TG_API_ID` | *required* | Telegram API ID |
| `TG_API_HASH` | *required* | Telegram API Hash |
| `OPENROUTER_API_KEY` | - | OpenRouter API key for LLM |
| `LLM_MODEL` | `anthropic/claude-3.5-sonnet` | Model to use |
| `BULK_SEND_MAX_PER_JOB` | `200` | Max recipients per bulk send |
| `BULK_SEND_DELAY_SECONDS` | `10` | Delay between sends |
| `REPORT_CADENCE` | `manual` | Report schedule (manual/daily/weekly) |
| `WEB_PORT` | `8080` | Web server port |

## Development

```bash
# Install in development mode
pip install -e .

# Run tests
pip install pytest pytest-asyncio
pytest tests/ -v
```

## License

MIT
