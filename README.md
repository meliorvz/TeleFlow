# TeleFlow

**A local-first Telegram assistant for managing 1,000+ conversations with AI-powered prioritization.**

TeleFlow helps busy professionals triage their Telegram inbox by syncing conversations locally, generating AI-powered priority reports, and enabling bulk messaging—all while keeping your data private and under your control.

## ✨ Features

### 📊 Dashboard & Reports
- AI-generated triage reports that rank conversations by urgency
- Click into any conversation to view recent messages and draft responses
- Configurable report generation parameters

### 💬 Conversation Management
- Full-text search across all conversations
- Priority tagging (High / Medium / Low)
- Custom tags for organization
- Inline message preview and quick reply

### 👥 Participant Tracking
- View and manage contacts across all conversations
- Tag participants for easy filtering
- Sync participant details from group chats

### 📤 Bulk Messaging
- Send templated messages to multiple conversations
- Personalization tokens: `{{display_name}}`, `{{first_name}}`, `{{username}}`
- Built-in rate limiting and safety confirmations

### 📁 Import & Export
- CSV export/import for conversations and participants
- Manage metadata in spreadsheets

### ⚙️ Flexible Configuration
- **Dual LLM support**: [OpenRouter](https://openrouter.ai) or [Venice AI](https://venice.ai) (privacy-focused)
- Configurable auto-sync intervals
- Advanced report tuning options

---

## 🔒 Privacy First

TeleFlow is designed for privacy-conscious users:

| Principle | Implementation |
|-----------|---------------|
| **No cloud** | All data stored locally in SQLite |
| **No analytics** | Zero tracking or telemetry |
| **Minimal network** | Only connects to Telegram + your chosen LLM provider |
| **Auditable** | Open source, pinned dependencies |

### Local Files

All user data is stored in the `localdata/` folder:

| File | Purpose |
|------|---------|
| `teleflow.db` | SQLite database with conversations and metadata |
| `teleflow.session` | Encrypted Telegram session |
| `config.env` | Your configuration (API keys, settings) |

### Complete Removal

To fully remove TeleFlow and revoke access:

1. Delete the app folder: `rm -rf ~/Documents/teleflow/`
2. In Telegram: **Settings → Devices → Find "TeleFlow" → Terminate**

---

## 🚀 Quick Start

### Prerequisites
- **macOS** (Windows/Linux: use manual setup)
- **Python 3.10+**
- **Telegram API credentials** from [my.telegram.org](https://my.telegram.org)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/teleflow.git ~/Documents/teleflow
cd ~/Documents/teleflow

# Copy the example config
cp config.env.example localdata/config.env

# Edit with your Telegram credentials
nano localdata/config.env
```

### Running

**Option 1: Double-click launcher (macOS)**
- Double-click `TeleFlow.command`
- The launcher handles virtual environment setup, dependencies, and browser opening automatically

**Option 2: Manual**
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run
cd src
python -m teleflow.main
```

Then open [http://localhost:8080](http://localhost:8080)

### First-Time Setup

1. Enter your phone number when prompted
2. Enter the verification code sent to Telegram
3. (If enabled) Enter your 2FA password
4. Click **Sync** to import your conversations

---

## ⚙️ Configuration

Copy `config.env.example` to `localdata/config.env` and customize:

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `TG_API_ID` | *required* | Telegram API ID |
| `TG_API_HASH` | *required* | Telegram API Hash |
| `WEB_PORT` | `8080` | Local server port |

### LLM Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `openrouter` | `openrouter` or `venice` |
| `OPENROUTER_API_KEY` | — | [OpenRouter](https://openrouter.ai) API key |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v3.2` | Model to use |
| `VENICE_API_KEY` | — | [Venice AI](https://venice.ai) API key |
| `VENICE_MODEL` | `deepseek-v3.2` | Venice model |

### Sync & Reports

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_INTERVAL_MINUTES` | `10` | Auto-sync interval (0 = disabled) |
| `REPORT_MESSAGE_LIMIT` | `20` | Messages per conversation in reports |
| `REPORT_TEXT_TRUNCATION` | `500` | Max chars per message (0 = none) |
| `LLM_CONVERSATION_MAX_AGE_DAYS` | `90` | Exclude older conversations from reports |

### Bulk Send

| Variable | Default | Description |
|----------|---------|-------------|
| `BULK_SEND_MAX_PER_JOB` | `200` | Max recipients per job |
| `BULK_SEND_DELAY_SECONDS` | `10` | Delay between messages |

See `config.env.example` for the complete reference.

---

## 🛠️ Development

```bash
# Clone and setup
git clone https://github.com/yourusername/teleflow.git
cd teleflow
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# Run tests
pip install pytest pytest-asyncio
pytest tests/ -v

# Frontend development
cd frontend
npm install
npm run dev
```

### Project Structure

```
teleflow/
├── src/teleflow/          # Python backend (FastAPI)
│   ├── api/               # REST API routes
│   ├── sync.py            # Telegram sync logic
│   ├── reports.py         # LLM report generation
│   └── bulk_send.py       # Bulk messaging
├── frontend/              # React frontend (Vite + TypeScript)
│   └── src/pages/         # Dashboard, Conversations, etc.
├── localdata/             # User data (gitignored contents)
├── TeleFlow.command       # macOS launcher
└── config.env.example     # Configuration template
```

---

## 📄 License

MIT
