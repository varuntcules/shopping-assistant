declare module 'gtts' {
  import { Readable } from 'stream';

  class gTTS {
    constructor(text: string, lang?: string, debug?: boolean);
    stream(): Readable;
    save(saveFile: string, callback?: (error?: Error) => void): void;
  }

  export = gTTS;
}


