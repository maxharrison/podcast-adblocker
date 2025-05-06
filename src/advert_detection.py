import logging
from google import genai
from typing import Protocol, List
from pydantic import BaseModel, RootModel

logger = logging.getLogger(__name__)


class AdvertTimestamps(BaseModel):
    start: float
    end: float


class AdvertTimestampsList(RootModel):
    root: List[AdvertTimestamps]


class AdvertDetector(Protocol):
    def detect_adverts(self, transcript: str) -> AdvertTimestampsList: ...


class GeminiAdvertDetector:
    def detect_adverts(self, transcript: str) -> AdvertTimestampsList:
        logger.info("Identifying advert timestamps...")
        client = genai.Client()

        prompt = f"""
            You are given a podcast transcript with time-offset annotations. Words appear like:
                word1<0.00s> word2<0.12s> ... wordN<123.45s>

            Your task is to identify every contiguous block of speech that corresponds to an advertisement segment,
            and return ONLY a JSON array of [start_time_in_seconds, end_time_in_seconds] tuples.
            Example: [[12.3, 56.7], [134.2, 150.0]]

            ---

            transcript:

            {transcript}
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": AdvertTimestampsList,
            },
        )

        if not isinstance(response.parsed, AdvertTimestampsList):
            raise ValueError("Response is not in the expected format")

        return response.parsed
