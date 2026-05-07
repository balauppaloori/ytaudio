#!/usr/bin/env bash
set -euo pipefail

VENV="/home/bala/ytaudio-env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$VENV/bin/activate"
source /workspace/secrets/env.sh

export YTAUDIO_WORKER_URL="https://ytaudio-api.balapavan.workers.dev"
export YTAUDIO_WORKER_SECRET="ytaudio-internal-2026"
export YTAUDIO_AUDIO_DIR="/workspace/projects/ytaudio/audio"
export YTAUDIO_WHISPER_MODEL="medium"
export YTAUDIO_POLL_INTERVAL="5"

exec python3 "$SCRIPT_DIR/daemon.py"
