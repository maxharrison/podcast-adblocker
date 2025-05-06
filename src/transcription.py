import logging
from google.cloud import storage
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech
from google.api_core.client_options import ClientOptions
import json
from urllib.parse import urlparse
import hashlib
from typing import Protocol

logger = logging.getLogger(__name__)


class Transcriber(Protocol):
    def transcribe(self, audio_content: bytes, audio_url: str) -> str: ...


class GoogleCloudTranscriber:
    def __init__(self, project_id: str, bucket_name: str):
        self.project_id = project_id
        self.bucket_name = bucket_name

    def transcribe(self, audio_content: bytes, audio_url: str) -> str:
        episode_url_hash = hashlib.md5(audio_url.encode("utf-8")).hexdigest()
        audio_filename = f"{episode_url_hash}.mp3"

        logger.info("Uploading podcast...")
        episode_url_hash = hashlib.md5(audio_url.encode("utf-8")).hexdigest()
        audio_filename = f"{episode_url_hash}.mp3"
        storage_client = storage.Client()
        bucket = storage_client.get_bucket(self.bucket_name)
        audio_blob = bucket.blob(f"audio-files/{audio_filename}")
        audio_blob.upload_from_string(audio_content)
        audio_gcs_uri = f"gs://{self.bucket_name}/audio-files/{audio_filename}"

        logger.info("Transcribing audio...")
        client = SpeechClient(
            client_options=ClientOptions(
                api_endpoint="europe-west4-speech.googleapis.com",
            )
        )
        config = cloud_speech.RecognitionConfig(
            auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
            features=cloud_speech.RecognitionFeatures(
                enable_word_time_offsets=True,
                enable_automatic_punctuation=True,
            ),
            model="chirp_2",
            language_codes=["en-UK"],
        )
        transcript_folder = f"gs://{self.bucket_name}/transcripts/{episode_url_hash}/"
        output_config = cloud_speech.RecognitionOutputConfig(
            gcs_output_config=cloud_speech.GcsOutputConfig(uri=transcript_folder),
        )
        files = [cloud_speech.BatchRecognizeFileMetadata(uri=audio_gcs_uri)]
        request = cloud_speech.BatchRecognizeRequest(
            recognizer=f"projects/{self.project_id}/locations/europe-west4/recognizers/_",
            config=config,
            files=files,
            recognition_output_config=output_config,
        )
        operation = client.batch_recognize(request=request)
        response = operation.result(timeout=3 * 2 * 60 * 60)

        if not response:
            raise ValueError("No transcription response received")

        if not response.results:
            raise ValueError("No transcription results found")

        first_key = next(iter(response.results))
        transcription_gcs_uri = response.results[first_key].uri

        logger.info("Downloading transcription...")
        parsed_uri = urlparse(transcription_gcs_uri)
        blob_path = parsed_uri.path.lstrip("/")
        storage_client = storage.Client(project=self.project_id)
        bucket = storage_client.get_bucket(self.bucket_name)
        blob = bucket.blob(blob_path)
        json_content = blob.download_as_text()
        transcript_data = json.loads(json_content)

        lines = []
        for result in transcript_data.get("results", []):
            for alt in result.get("alternatives", []):
                if "words" in alt:
                    line = " ".join(
                        f"{w.get('word', '')}<{w.get('startOffset', '0s')}>"
                        for w in alt["words"]
                    )
                    lines.append(line)

        full_transcript = "\n".join(lines)
        return full_transcript
