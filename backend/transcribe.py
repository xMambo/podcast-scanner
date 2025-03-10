import whisper
import torch
import os
import requests

# Specify the full path to ffmpeg explicitly if needed
os.environ["PATH"] += os.pathsep + r"C:\ffmpeg\bin"

# Force UTF-8 encoding for Windows CMD
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Function to download and save audio file locally
def download_audio(url, filename="downloaded_audio.mp3"):
    print(f"Downloading audio file from {url}")  # Removed emoji to avoid Unicode error

    response = requests.get(url, stream=True)
    with open(filename, "wb") as file:
        for chunk in response.iter_content(chunk_size=8192):
            file.write(chunk)
    print("Download complete!")  # Removed emoji to avoid Unicode error

    return filename

# Function to transcribe audio using Whisper
def transcribe_audio(audio_url):
    # Download audio file
    audio_file = download_audio(audio_url)

    # Check if CUDA (GPU) is available and use it
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")  # Removed emoji to avoid Unicode error

    # Clear CUDA cache and enable fast algorithms if using GPU
    if device == "cuda":
        torch.cuda.empty_cache()
        torch.backends.cudnn.benchmark = True

    # Load Whisper model and convert model to float32 to fix Half precision error
    model = whisper.load_model("tiny", device=device)
    model = model.to(dtype=torch.float32)

    # Transcribe the audio
    print("Transcribing audio...")  # Removed emoji to avoid Unicode error
    result = model.transcribe(audio_file)
    print("Transcription complete!")  # Removed emoji to avoid Unicode error
    

    # Cleanup downloaded audio file
    os.remove(audio_file)

    return result["text"]

# Test function if running this script directly
if __name__ == "__main__":
    test_audio_url = "https://traffic.megaphone.fm/APO1708413358.mp3"  # Replace with your audio URL
    transcription = transcribe_audio(test_audio_url)
    print("Transcription:")
    print(transcription)
