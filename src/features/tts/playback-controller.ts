/**
 * v0.35.0: MD 読み上げの再生制御（一時停止/再開/スキップ）を司るシングルトン。
 * playObjectUrl が再生開始時に bindAudio() し、speakChunks ループが
 * チャンク境界で onChunkBoundary() を await する。
 */
type AudioHandles = { pause(): void; resume(): void };

class PlaybackController {
  private audio: AudioHandles | null = null;
  private paused = false;
  private skipRequested = false;
  private resolvers: Array<() => void> = [];

  /** 再生開始時に playObjectUrl から呼ばれる */
  bindAudio(h: AudioHandles): void { this.audio = h; }

  /** ⏸/▶: 一時停止⇔再開。true = 一時停止中になった（audio 未 bind でも state は切替） */
  togglePause(): boolean {
    this.paused = !this.paused;
    if (this.paused) this.audio?.pause();
    else { this.audio?.resume(); this.releaseAll(); }
    return this.paused;
  }

  /** 現在一時停止中か */
  isPaused(): boolean { return this.paused; }

  /** ⏭/🔇: 現チャンクを打ち切り次へ（一時停止の待ちも解除） */
  skipNext(): void {
    this.skipRequested = true;
    this.audio?.pause();
    this.releaseAll();
  }

  /** チャンク境界で speakChunks から呼ぶ。要求されたスキップを 1 回だけ消費する */
  consumeSkip(): boolean {
    if (!this.skipRequested) return false;
    this.skipRequested = false;
    return true;
  }

  /** チャンク境界で speakChunks から呼ぶ。一時停止中は再開まで待機 */
  async onChunkBoundary(): Promise<void> {
    while (this.paused && !this.skipRequested) {
      await new Promise<void>((r) => this.resolvers.push(r));
    }
  }

  /** 読み上げ開始ごとの初期化 */
  reset(): void {
    this.audio = null;
    this.paused = false;
    this.skipRequested = false;
    this.releaseAll();
  }

  private releaseAll(): void {
    const rs = this.resolvers; this.resolvers = [];
    rs.forEach((r) => r());
  }
}

const controller = new PlaybackController();
export function getPlaybackController(): PlaybackController { return controller; }
