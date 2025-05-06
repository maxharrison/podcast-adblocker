import logging
from pydub import AudioSegment
from io import BytesIO
from typing import Protocol
from advert_detection import AdvertTimestampsList
from pathlib import Path


logger = logging.getLogger(__name__)


class AudioProcessor(Protocol):
    def strip_adverts(
        self,
        audio_content: bytes,
        advert_timestamps: AdvertTimestampsList,
        output_folder: str = "output",
    ) -> None: ...


class PydubAudioProcessor:
    def strip_adverts(
        self,
        audio_content: bytes,
        advert_timestamps: AdvertTimestampsList,
        output_folder: str = "output",
    ) -> None:
        logger.info("Stripping adverts from audio...")

        output_path = Path(output_folder)
        output_path.mkdir(parents=True, exist_ok=True)

        audio = AudioSegment.from_file(BytesIO(audio_content), format="mp3")

        sorted_timestamps = sorted(advert_timestamps.root, key=lambda x: x.start)
        segments_to_keep = []
        current_position = 0

        for idx, timestamp in enumerate(sorted_timestamps, start=1):
            start_ms = int(timestamp.start * 1000)
            end_ms = int(timestamp.end * 1000)

            advert_segment = audio[start_ms:end_ms]
            advert_file = output_path / f"ad{idx}.mp3"
            advert_segment.export(advert_file.as_posix(), format="mp3")
            logger.debug(f"Saved advert segment to {advert_file}")

            if current_position < start_ms:
                segments_to_keep.append(audio[current_position:start_ms])
            current_position = end_ms

        if current_position < len(audio):
            segments_to_keep.append(audio[current_position:])

        if segments_to_keep:
            ad_free_audio = segments_to_keep[0]
            for segment in segments_to_keep[1:]:
                ad_free_audio += segment
        else:
            ad_free_audio = AudioSegment.empty()

        output_file = output_path / "output.mp3"
        ad_free_audio.export(output_file.as_posix(), format="mp3")
        logger.info(f"Ad-free audio saved to {output_file}")
