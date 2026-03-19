"""Generate a multi-speaker meeting audio file using ElevenLabs TTS + ffmpeg.

Usage:
    cd backend && uv run python scripts/generate_meeting_audio.py

Output:
    scripts/meeting_q1_enterprise_deal.mp3
"""

import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from elevenlabs import ElevenLabs

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

# 3 distinct voices
VOICES = {
    "Harold": "pNInz6obpgDQGcFmaJgB",   # Adam — deep male
    "Pany": "ErXwobaYiN019PkySvjV",       # Antoni — younger male
    "Sarah": "21m00Tcm4TlvDq8ikWAM",      # Rachel — female
}

# Silence between speakers (seconds)
PAUSE_S = 0.6

SCRIPT = [
    ("Sarah", "Alright, thanks everyone for joining. Harold, Pany, great to finally meet in person here in Beijing. I know we've been going back and forth over email, but I think it's time to really dig into what Plaud AI needs from us and see if there's a real fit here."),
    ("Harold", "Yeah, absolutely. So as I mentioned, we're building out our AI agent infrastructure, and we've been evaluating several platforms. Your enterprise offering caught our attention because of the scalability features."),
    ("Sarah", "That's great to hear. Can you walk me through your current setup and where you see the gaps?"),
    ("Harold", "Sure. Right now we're running everything on our own infrastructure. The main pain point is around multi-tenant orchestration. We need to support thousands of concurrent agent sessions, and our current system starts to degrade around five hundred. We need something that can handle at least five thousand concurrent sessions with sub two hundred millisecond latency."),
    ("Pany", "And from the mobile side, we need reliable real-time streaming. Our PLAUD Note device captures audio and we process it through speech to text, then feed it into the agent pipeline. The end to end latency is critical for our user experience."),
    ("Sarah", "I understand. Our enterprise tier is definitely built for that scale. We've had clients running ten thousand plus concurrent sessions. Let me ask, what's your timeline looking like? When do you need this in production?"),
    ("Harold", "We're targeting end of Q2 for the initial rollout. So ideally we'd want to start a proof of concept within the next two weeks and have a production deployment by June."),
    ("Sarah", "That's aggressive but doable. For the POC, we can get you set up on a dedicated staging environment within a week. Now, regarding pricing, the enterprise tier starts at two million annually, but given the scale you're describing and the multi-year potential, I think we can work with that number. Would a three year commitment be something Plaud would consider?"),
    ("Harold", "We're open to a multi-year deal if the pricing makes sense. Our budget for this initiative is around one point five to two million per year. If we do three years, we'd expect a meaningful discount, maybe fifteen to twenty percent."),
    ("Sarah", "That's reasonable. Let me put together a formal proposal with a three year structure. I can probably get you to around one point seven million per year with that commitment level, which brings the total to about five point one million."),
    ("Pany", "One thing that's important for us. We need a dedicated support engineer during the integration phase. Our mobile team is small and we can't afford to be stuck waiting on support tickets."),
    ("Sarah", "Absolutely. The enterprise tier includes a dedicated technical account manager. For the integration phase, we'll assign a solutions engineer to work directly with your team. Harold, that would be your main point of contact."),
    ("Harold", "Perfect. So let me summarize where we are. We want to move forward with the POC. Sarah, you'll send us the staging environment access this week. Pany, you'll coordinate with their solutions engineer on the mobile SDK integration. And Sarah, you'll put together the three year proposal by, when?"),
    ("Sarah", "I'll have the formal proposal to you by next Friday, March twenty eighth. It'll include the three year pricing, the POC timeline, and the SLA details."),
    ("Harold", "Great. And we should schedule a follow-up call after the POC to review results and discuss the contract. Let's plan for mid April."),
    ("Sarah", "Sounds good. I'll send a calendar invite for April fifteenth. Oh, and one more thing, Harold, could you send me the technical requirements document we discussed? I want to make sure our solutions architect reviews it before the POC."),
    ("Harold", "Will do. I'll send it over by end of day Monday."),
    ("Pany", "I also want to flag, we recently promoted Harold to VP of AI Engineering, so he'll be the final decision maker on the technical side going forward."),
    ("Sarah", "Congratulations, Harold! That's great to know. Well, I think we're in a really good position here. Let's make this happen."),
    ("Harold", "Agreed. Thanks, Sarah. Talk soon."),
]


def generate_segment(voice_id: str, text: str, out_path: str) -> None:
    """Generate a single TTS segment and save to file."""
    audio_gen = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )
    with open(out_path, "wb") as f:
        for chunk in audio_gen:
            f.write(chunk)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "meeting_q1_enterprise_deal.mp3")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Generate silence file
        silence_path = os.path.join(tmpdir, "silence.mp3")
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            f"anullsrc=r=44100:cl=mono:d={PAUSE_S}",
            "-c:a", "libmp3lame", "-b:a", "128k", silence_path,
        ], capture_output=True, check=True)

        # Generate each segment
        segment_paths = []
        print(f"Generating {len(SCRIPT)} audio segments...")

        for i, (speaker, text) in enumerate(SCRIPT):
            voice_id = VOICES[speaker]
            seg_path = os.path.join(tmpdir, f"seg_{i:03d}.mp3")
            print(f"  [{i+1}/{len(SCRIPT)}] {speaker}: {text[:60]}...")
            generate_segment(voice_id, text, seg_path)
            segment_paths.append(seg_path)

        # Build ffmpeg concat file
        concat_path = os.path.join(tmpdir, "concat.txt")
        with open(concat_path, "w") as f:
            for i, seg_path in enumerate(segment_paths):
                if i > 0:
                    f.write(f"file '{silence_path}'\n")
                f.write(f"file '{seg_path}'\n")

        # Concatenate with ffmpeg
        print("\nMerging segments...")
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_path,
            "-c:a", "libmp3lame", "-b:a", "128k",
            output_path,
        ], capture_output=True, check=True)

    # Print result
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    # Get duration via ffprobe
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", output_path],
        capture_output=True, text=True,
    )
    duration_s = float(result.stdout.strip()) if result.stdout.strip() else 0
    print(f"\nDone! Output: {output_path}")
    print(f"Duration: {int(duration_s // 60)}:{int(duration_s % 60):02d}")
    print(f"Size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
