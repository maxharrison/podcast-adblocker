import logging
import os
import feedparser
import requests
from dotenv import load_dotenv
import hashlib
import pickle
from typing import Callable, TypeVar, Optional

from transcription import Transcriber, GoogleCloudTranscriber
from advert_detection import AdvertDetector, GeminiAdvertDetector
from audio_processing import AudioProcessor, PydubAudioProcessor

import warnings

warnings.filterwarnings(
    "ignore",
    message="Your application has authenticated using end user credentials.*",
    category=UserWarning,
    module="google.auth._default",
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

RSS_FEED = os.getenv("RSS_FEED")
if not RSS_FEED:
    raise ValueError("RSS_FEED environment variable is not set")

PROJECT_ID = os.getenv("PROJECT_ID")
if not PROJECT_ID:
    raise ValueError("PROJECT_ID environment variable is not set")

BUCKET_NAME = os.getenv("BUCKET_NAME")
if not BUCKET_NAME:
    raise ValueError("BUCKET_NAME environment variable is not set")


T = TypeVar("T")


def run_with_cache(fn: Callable[[], T], key: str, cache_dir: str = "cache") -> T:
    os.makedirs(cache_dir, exist_ok=True)
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    path = os.path.join(cache_dir, f"{h}.pkl")

    if os.path.exists(path):
        with open(path, "rb") as f:
            logger.info(f"Cache hit for {key}")
            return pickle.load(f)

    result = fn()
    with open(path, "wb") as f:
        pickle.dump(result, f)
    logger.info(f"Cache miss for {key}")
    return result


class PodcastProcessor:
    def __init__(
        self,
        transcriber: Transcriber,
        advert_detector: AdvertDetector,
        audio_processor: AudioProcessor,
        rss_feed_url: str,
    ):
        self.transcriber = transcriber
        self.advert_detector = advert_detector
        self.audio_processor = audio_processor
        self.rss_feed_url = rss_feed_url

    def download_audio(self, episode_url: str) -> bytes:
        logger.info(f"Downloading podcast from {episode_url}...")
        headers = {"User-Agent": "curl/7.85.0"}
        response = requests.get(episode_url, headers=headers, allow_redirects=True)
        return response.content

    def get_latest_episode_url(self) -> str:
        logger.info(f"Parsing RSS feed: {self.rss_feed_url}")
        feed = feedparser.parse(self.rss_feed_url)

        if not feed.entries:
            raise ValueError("No podcast episodes found in the RSS feed")

        episode = feed.entries[0]

        links_source = episode.get("links") or []

        audio_url: Optional[str] = next(
            (
                href_value
                for link_entry in links_source
                if isinstance(link_entry, dict)
                and link_entry.get("type") == "audio/mpeg"
                and isinstance((href_value := link_entry.get("href")), str)
            ),
            None,
        )

        if not audio_url:
            raise ValueError("No audio URL found in the latest episode")

        return audio_url

    def process_latest_episode(self):
        audio_url = self.get_latest_episode_url()

        audio_content = self.download_audio(audio_url)

        transcript = run_with_cache(
            lambda: self.transcriber.transcribe(audio_content, audio_url),
            key=f"transcript-{audio_url}",
        )

        advert_timestamps = run_with_cache(
            lambda: self.advert_detector.detect_adverts(transcript),
            key=f"advert_timestamps-{audio_url}",
        )

        self.audio_processor.strip_adverts(audio_content, advert_timestamps)


if __name__ == "__main__":
    transcriber = GoogleCloudTranscriber(project_id=PROJECT_ID, bucket_name=BUCKET_NAME)
    advert_detector = GeminiAdvertDetector()
    audio_processor = PydubAudioProcessor()

    processor = PodcastProcessor(
        transcriber=transcriber,
        advert_detector=advert_detector,
        audio_processor=audio_processor,
        rss_feed_url=RSS_FEED,
    )

    processor.process_latest_episode()
