/**
 * v0.18.1: 即割り込み型 latest-wins スピーカー。
 * 読み上げ中に新しいテキストが来たら、前の読み上げを停止して新しいテキストを即座に再生する（後勝ち）。
 * 世代カウンタで、旧スピーチの finally が新スピーチの speaking フラグを誤解除しないようにする。
 */
export type SpeakFn = (text: string) => Promise<boolean>;

export function createLatestWinsSpeaker(speak: SpeakFn, stop?: () => void): (text: string) => void {
  let speaking = false;
  let generation = 0;

  const run = (text: string): void => {
    if (speaking) {
      // 即割り込み: 前の読み上げを停止して新しいテキストを即座に開始（後勝ち）
      generation++;
      const gen = generation;
      stop?.();
      void speak(text)
        .catch(() => { /* 失敗 Notice は addTextToTTS 側の責務 */ })
        .finally(() => {
          if (gen === generation) speaking = false;
        });
      return;
    }
    speaking = true;
    generation++;
    const gen = generation;
    void speak(text)
      .catch(() => { /* 失敗 Notice は addTextToTTS 側の責務 */ })
      .finally(() => {
        if (gen === generation) speaking = false;
      });
  };

  return run;
}
