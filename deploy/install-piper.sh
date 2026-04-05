#!/usr/bin/env bash
set -euo pipefail

# Installs Piper TTS for Voxis on Ubuntu/DigitalOcean and downloads curated voices.
# Safe to re-run: skips voices that already exist.

APP_DIR="${APP_DIR:-/opt/voxis}"
PIPER_VENV_DIR="${PIPER_VENV_DIR:-/opt/piper-venv}"
PIPER_MODELS_DIR="${PIPER_MODELS_DIR:-/opt/piper/models}"
DEFAULT_MODEL="${DEFAULT_MODEL:-en_US-lessac-medium}"
SET_ENGINE="${SET_ENGINE:-piper}" # piper | auto
BACKEND_ENV="$APP_DIR/backend/.env"
PIPER_BIN="/usr/local/bin/piper"

# Curated Piper voices for Voxis archetypes.
# Organized by personality type + voice quality/gender for diversity.
#
# CHAOTIC TWEEN / BUBBLY (high energy, playful, mischievous):
#   en_US-amy-medium, en_US-lessac-medium, en_US-kristin-medium
# VILLAIN / DARK (sly, deep, commanding, sinister):
#   en_US-hfc_male-medium, en_US-ryan-low, en_US-danny-low
# NEUTRAL / GROUNDED (calm, approachable, everyday):
#   en_US-arctic-medium, en_US-bryce-medium, en_US-norman-medium
# PROFESSIONAL / AUTHORITY (clear, confident, formal):
#   en_US-john-medium, en_US-sara-medium, en_US-albert-medium
# WARM / FRIENDLY (smooth, approachable, personable):
#   en_US-joe-medium, en_US-mary-medium, en_US-glow-medium
#
VOICES=(
  en_US-amy-medium
  en_US-lessac-medium
  en_US-kristin-medium
  en_US-hfc_male-medium
  en_US-ryan-low
  en_US-danny-low
  en_US-arctic-medium
  en_US-bryce-medium
  en_US-norman-medium
  en_US-john-medium
  en_US-sara-medium
  en_US-albert-medium
  en_US-joe-medium
  en_US-mary-medium
  en_US-glow-medium
)

if [[ "$EUID" -ne 0 ]]; then
  echo "Run as root (or with sudo): sudo bash deploy/install-piper.sh"
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

set_kv() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

voice_url_base() {
  printf '%s' "https://huggingface.co/rhasspy/piper-voices/resolve/main"
}

voice_path_parts() {
  # en_US-lessac-medium -> en/en_US/lessac/medium
  local voice_id="$1"
  local locale="${voice_id%%-*}"          # en_US
  local rest="${voice_id#*-}"             # lessac-medium
  local name="${rest%-*}"                 # lessac
  local quality="${voice_id##*-}"         # medium
  local lang="${locale%%_*}"              # en

  printf '%s/%s/%s/%s' "$lang" "$locale" "$name" "$quality"
}

download_voice() {
  local voice_id="$1"
  local rel
  local base
  local onnx_target
  local json_target

  rel="$(voice_path_parts "$voice_id")"
  base="$(voice_url_base)"
  onnx_target="$PIPER_MODELS_DIR/${voice_id}.onnx"
  json_target="$PIPER_MODELS_DIR/${voice_id}.onnx.json"

  if [[ ! -f "$onnx_target" ]]; then
    curl -fL "${base}/${rel}/${voice_id}.onnx" -o "$onnx_target"
  else
    echo "Voice model exists: $onnx_target"
  fi

  if [[ ! -f "$json_target" ]]; then
    curl -fL "${base}/${rel}/${voice_id}.onnx.json" -o "$json_target"
  else
    echo "Voice config exists: $json_target"
  fi
}

echo "[1/6] Installing OS packages"
apt-get update -y
apt-get install -y \
  python3 \
  python3-venv \
  python3-pip \
  curl \
  sox \
  libsox-fmt-all

echo "[2/6] Installing Piper CLI in isolated venv"
mkdir -p "$PIPER_VENV_DIR"
python3 -m venv "$PIPER_VENV_DIR"
"$PIPER_VENV_DIR/bin/pip" install --upgrade pip setuptools wheel
"$PIPER_VENV_DIR/bin/pip" install --upgrade piper-tts

cat > "$PIPER_BIN" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/piper-venv/bin/piper "$@"
EOF
chmod +x "$PIPER_BIN"

echo "[3/6] Downloading curated Piper voices"
mkdir -p "$PIPER_MODELS_DIR"
for voice in "${VOICES[@]}"; do
  echo "Downloading: $voice"
  download_voice "$voice"
done

echo "[4/6] Verifying Piper install"
"$PIPER_BIN" --help >/dev/null
if [[ ! -f "$PIPER_MODELS_DIR/${DEFAULT_MODEL}.onnx" ]]; then
  echo "Missing default model: $DEFAULT_MODEL"
  exit 1
fi

echo "[5/6] Updating Voxis backend env defaults"
if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "Missing backend env file: $BACKEND_ENV"
  echo "Create it first (example): cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env"
  exit 1
fi

set_kv "$BACKEND_ENV" "PIPER_COMMAND" "$PIPER_BIN"
set_kv "$BACKEND_ENV" "PIPER_MODEL_PATH" "$PIPER_MODELS_DIR/${DEFAULT_MODEL}.onnx"
set_kv "$BACKEND_ENV" "PIPER_SPEAKER" ""
set_kv "$BACKEND_ENV" "TTS_ENGINE" "$SET_ENGINE"

echo "[6/6] Smoke test synthesis"
TEST_WAV="/tmp/voxis-piper-test.wav"
printf '%s\n' "Heyyyy! I'm Zoe, wanna blow up the moon?" | "$PIPER_BIN" --model "$PIPER_MODELS_DIR/${DEFAULT_MODEL}.onnx" --output_file "$TEST_WAV"

if [[ ! -s "$TEST_WAV" ]]; then
  echo "Smoke test failed: no output file"
  exit 1
fi

echo
echo "Piper installation complete."
echo "Piper binary: $PIPER_BIN"
echo "Voices dir: $PIPER_MODELS_DIR"
echo "Default model: $PIPER_MODELS_DIR/${DEFAULT_MODEL}.onnx"
echo "Test audio: $TEST_WAV"
echo "Backend env updated: $BACKEND_ENV"
echo
echo "If backend is running under PM2:"
echo "  pm2 restart voxis-backend"
