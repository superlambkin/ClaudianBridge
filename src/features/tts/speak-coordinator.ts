/**
 * v0.11.0: latest-wins 読み上げコーディネータ。
 * 読み上げ中に来た新報告は「最新1件のみ保留」し、完了後に読む。
 * WebSpeech は webSpeechSpeak 冒頭の synth.cancel() により真の中断が効く。
 * edge / Plachta は外部から停止できないため本コーディネータで直列化する。
 */
export type SpeakFn = (text: string) => Promise<boolean>;

export function createLatestWinsSpeaker(speak: SpeakFn): (text: string) => void {
  let speaking = false;
  let pending: string | null = null;

  const run = (text: string): void => {
    if (speaking) {
      pending = text; // 最新で上書き（古い保留は破棄）
      return;
    }
    speaking = true;
    void Promise.resolve()
      .then(() => speak(text))
      .catch(() => { /* 失敗 Notice は addTextToTTS 側の責務 */ })
      .finally(() => {
        speaking = false;
        if (pending !== null) {
          const next = pending;
          pending = null;
          run(next);
        }
      });
  };

  return run;
}
