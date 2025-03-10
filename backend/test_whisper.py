import whisper
import os
import requests
import torch  # Import torch to check for CUDA

print(torch.version.cuda)

# Specify the full path to ffmpeg explicitly
os.environ["PATH"] += os.pathsep + r"C:\ffmpeg\bin"

# Step 1: Download the audio file locally
url = "https://traffic.megaphone.fm/APO1708413358.mp3"
audio_file = "test_audio.mp3"

print("Downloading audio file...")
response = requests.get(url)
with open(audio_file, "wb") as file:
    file.write(response.content)
print("Download complete!")

# Check if CUDA (GPU) is available and use it
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Clear CUDA cache and enable fast algorithms
torch.cuda.empty_cache()
torch.backends.cudnn.benchmark = True

# Step 2: Load model on GPU
model = whisper.load_model("tiny", device=device)

# Convert model to float32 to fix the error
model = model.to(torch.float32)

# Transcribe
result = model.transcribe(audio_file)
print("Transcription result:")
print(result["text"])
