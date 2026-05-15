# Shelfmark

> A self-hosted reader for everything you save — articles, PDFs, EPUBs, YouTube, and audio — with highlights, annotations, transcription, and Obsidian export. An open-source alternative to Readwise Reader.

![Library screenshot](docs/screenshots/library.png)

## Features

- 📚 Save articles, PDFs, EPUBs, YouTube videos, and emails to one library
- ✍️ Highlight + annotate documents; sync to an Obsidian vault
- 🎙️ Local audio transcription via OpenAI Whisper
- 🔍 In-browser OCR (tesseract.js) for scanned PDFs
- 📧 Email-to-library ingestion (built-in SMTP server)
- 🔗 Public share links for transcriptions
- 🌙 Dark mode

## Tech stack

**Backend** — FastAPI · SQLAlchemy · SQLite · openai-whisper · pdfminer.six · newspaper3k · yt-dlp
**Frontend** — React 19 · Vite · React Router · pdfjs-dist · tesseract.js

## Quick start

### Prerequisites
- Python 3.10+
- Node.js 18+
- [ffmpeg](https://ffmpeg.org/) (required by Whisper)

### Install and run

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

Then from the repo root:

```bash
./start.sh                        # macOS / Linux
start.bat                         # Windows
```

- Backend → http://localhost:8000
- Frontend → http://localhost:3000

### Configuration

Copy the example settings file and set your Obsidian vault path if you want highlight export:

```bash
cp backend/settings.example.json backend/settings.json
```

## Screenshots

| Library | Reader | Transcriptions |
|---|---|---|
| ![Library](docs/screenshots/library.png) | ![Reader](docs/screenshots/reader.png) | ![Transcriptions](docs/screenshots/transcriptions.png) |

## Roadmap

- Mobile-friendly reader layout
- Full-text search across the library
- More export targets (Notion, Logseq)
- Multi-user accounts

## Contributing

Pull requests welcome. For anything non-trivial, please open an issue first to discuss the change.

## License

MIT © 2026 JacksonPeralta — see [LICENSE](LICENSE).
