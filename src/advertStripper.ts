import { TimeRange } from './models';

export type StrippedResult = {
  podcast: ArrayBuffer;
  adverts: ArrayBuffer[];
};

export interface AdvertStripper {
  stripAdverts(
    url: string,  
    advertRanges: TimeRange[]
  ): Promise<StrippedResult>;
}



export class FlyAdvertStripper implements AdvertStripper {

  constructor(
    private endpoint: string,
    private apiKey: string
  ) {}

  async stripAdverts(
    url: string,
    advertRanges: TimeRange[]
  ): Promise<StrippedResult> {
    const formData = new FormData();
    formData.append('url', url);

    for (const range of advertRanges) {
      formData.append('ranges', `${range.startSeconds}-${range.endSeconds}`);
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to strip adverts: ${response.statusText}`);
    }

    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();

    return {
      podcast: buffer,
      adverts: [],
    };
  }
}
