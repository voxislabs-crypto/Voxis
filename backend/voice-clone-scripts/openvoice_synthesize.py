#!/usr/bin/env python3
"""
openvoice_synthesize.py
=======================
OpenVoice v2 inference script called by openVoiceAdapter.js.

One-shot:
    python3 openvoice_synthesize.py \
        --reference /path/to/reference.wav \
        --text "Hello, world." \
        --output /path/to/output.wav \
        --rate 1.0

Resident worker (models stay loaded; stdout is JSON lines only):
    python3 -u openvoice_synthesize.py --serve
"""

import argparse
import json
import os
import sys
import tempfile
import time
import wave


def reference_seconds(path):
    with wave.open(path, "rb") as handle:
        rate = handle.getframerate() or 1
        return handle.getnframes() / float(rate)


def extract_target_embedding(reference, converter, speaker_extractor):
    duration = reference_seconds(reference)
    if duration < 9.5:
        print(
            f"[openvoice_synthesize] reference={duration:.1f}s, using the whole clip",
            file=sys.stderr,
        )
        return converter.extract_se([reference])

    try:
        embedding, _ = speaker_extractor.get_se(reference, converter, vad=True)
        return embedding
    except Exception as error:
        print(
            f"[openvoice_synthesize] VAD split failed ({error}). Using the whole clip.",
            file=sys.stderr,
        )
        return converter.extract_se([reference])


def resolve_converter():
    candidates = []
    env_dir = os.environ.get("OPENVOICE_CHECKPOINTS_DIR", "").strip()
    if env_dir:
        candidates.append(os.path.join(env_dir, "converter"))
    repo_converter = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "OpenVoice",
            "checkpoints_v2",
            "converter",
        )
    )
    candidates.append(repo_converter)
    candidates.append(os.path.abspath(os.path.join("checkpoints_v2", "converter")))
    for path in candidates:
        if os.path.isfile(os.path.join(path, "config.json")) and os.path.isfile(
            os.path.join(path, "checkpoint.pth")
        ):
            return path
    return None


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


class Engine:
    """Same MeloTTS + tone-color path the one-shot CLI uses. Loaded once."""

    def __init__(self):
        try:
            import torch
            from melo.api import TTS
            from openvoice import se_extractor
            from openvoice.api import ToneColorConverter
        except ImportError as error:
            raise RuntimeError(
                f"ImportError: {error}. Install MeloTTS and OpenVoice in OPENVOICE_PYTHON."
            ) from error

        self.torch = torch
        self.TTS = TTS
        self.se_extractor = se_extractor
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[openvoice_synthesize] device={self.device}", file=sys.stderr)

        ckpt_converter = resolve_converter()
        if ckpt_converter is None:
            raise RuntimeError(
                "Local checkpoints_v2/converter was not found. "
                "Set OPENVOICE_CHECKPOINTS_DIR or place weights in X:\\Voxis\\OpenVoice\\checkpoints_v2."
            )
        self.ckpt_converter = ckpt_converter
        print(f"[openvoice_synthesize] converter={ckpt_converter}", file=sys.stderr)
        self.converter = ToneColorConverter(
            os.path.join(ckpt_converter, "config.json"), device=self.device
        )
        self.converter.load_ckpt(os.path.join(ckpt_converter, "checkpoint.pth"))
        self._tts = {}
        self._target_se = {}
        self._source_se = {}

    def _speaker(self, language):
        cached = self._tts.get(language)
        if cached is not None:
            return cached
        tts_model = self.TTS(language=language, device=self.device)
        speaker_ids = tts_model.hps.data.spk2id
        preferred = {
            "EN": ["EN-US", "EN_US", "EN-NEWEST", "EN_NEWEST", "EN-Default", "EN_DEFAULT"],
        }.get(str(language).upper(), [])
        speaker_name = next((key for key in preferred if key in speaker_ids), None)
        if speaker_name is None:
            speaker_name = next(iter(speaker_ids.keys()))
        speaker_key = speaker_name.lower().replace("_", "-")
        print(
            f"[openvoice_synthesize] speaker={speaker_name} embedding={speaker_key}.pth",
            file=sys.stderr,
        )
        loaded = {
            "model": tts_model,
            "speaker_id": speaker_ids[speaker_name],
            "speaker_key": speaker_key,
        }
        self._tts[language] = loaded
        return loaded

    def _target(self, reference):
        stat = os.stat(reference)
        key = (os.path.abspath(reference), stat.st_mtime_ns, stat.st_size)
        cached = self._target_se.get(key)
        if cached is not None:
            return cached
        embedding = extract_target_embedding(reference, self.converter, self.se_extractor)
        self._target_se = {key: embedding}
        return embedding

    def _source(self, speaker_key):
        cached = self._source_se.get(speaker_key)
        if cached is not None:
            return cached
        embedding = self.torch.load(
            os.path.join(
                os.path.dirname(self.ckpt_converter),
                "base_speakers",
                "ses",
                f"{speaker_key}.pth",
            ),
            map_location=self.device,
        )
        self._source_se[speaker_key] = embedding
        return embedding

    def synthesize(self, reference, text, output, rate, language):
        rate = max(0.7, min(1.3, float(rate or 1)))
        language = str(language or "EN")
        speaker = self._speaker(language)
        target_se = self._target(reference)
        source_se = self._source(speaker["speaker_key"])

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_base = tmp.name
        try:
            speaker["model"].tts_to_file(
                text,
                speaker["speaker_id"],
                tmp_base,
                speed=rate,
                quiet=True,
            )
            self.converter.convert(
                audio_src_path=tmp_base,
                src_se=source_se,
                tgt_se=target_se,
                output_path=output,
                message="@MyShell",
            )
        finally:
            if os.path.exists(tmp_base):
                os.unlink(tmp_base)
        print(f"[openvoice_synthesize] Written to {output}", file=sys.stderr)


def serve():
    started = time.perf_counter()
    try:
        engine = Engine()
        # Warm the English voice Ara uses so the first request skips model load.
        engine._speaker("EN")
    except Exception as error:
        print(f"[openvoice_synthesize] Worker failed to load: {error}", file=sys.stderr)
        emit({"ready": False, "error": str(error)})
        sys.exit(1)

    emit({
        "ready": True,
        "device": engine.device,
        "load_ms": int((time.perf_counter() - started) * 1000),
    })

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        job_started = time.perf_counter()
        try:
            job = json.loads(raw)
            reference = str(job.get("reference") or "")
            text = str(job.get("text") or "").strip()
            output = str(job.get("output") or "")
            if not reference or not text or not output:
                raise ValueError("reference, text, and output are required.")
            if not os.path.isfile(reference):
                raise ValueError(f"Reference clip not found: {reference}")
            engine.synthesize(
                reference,
                text,
                output,
                job.get("rate", 1),
                job.get("language", "EN"),
            )
        except Exception as error:
            print(f"[openvoice_synthesize] Synthesis or conversion failed: {error}", file=sys.stderr)
            emit({"ok": False, "error": str(error)})
            continue
        emit({
            "ok": True,
            "elapsed_ms": int((time.perf_counter() - job_started) * 1000),
        })


def one_shot(args):
    rate = max(0.7, min(1.3, args.rate))
    try:
        engine = Engine()
        engine.synthesize(args.reference, args.text, args.output, rate, args.language)
    except Exception as error:
        print(f"[openvoice_synthesize] {error}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="OpenVoice v2 synthesis")
    parser.add_argument("--serve", action="store_true", help="Keep models loaded and read JSON jobs from stdin")
    parser.add_argument("--reference", help="Path to reference WAV clip")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--output", help="Path for output WAV file")
    parser.add_argument("--rate", type=float, default=1.0, help="Speech rate (0.7–1.3)")
    parser.add_argument("--language", default="EN", help="MeloTTS language code (EN, ES, FR, ZH, JP, KR)")
    args = parser.parse_args()

    if args.serve:
        serve()
        return

    missing = [name for name in ("reference", "text", "output") if not getattr(args, name)]
    if missing:
        parser.error("one-shot mode requires " + ", ".join(f"--{name}" for name in missing))
    one_shot(args)


if __name__ == "__main__":
    main()
