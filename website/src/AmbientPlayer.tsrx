import { useEffect, useRef, useState } from "octane"

export function AmbientPlayer() @{
  const audio = useRef<
    { context: AudioContext; gain: GainNode; voices: OscillatorNode[] } | null
  >(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.35)

  useEffect(() => {
    return () => {
      audio.current?.voices.forEach((voice) => voice.stop())
      void audio.current?.context.close()
    }
  }, [])

  async function toggle() {
    if (!audio.current) {
      const context = new AudioContext()
      const gain = context.createGain()
      gain.gain.value = volume * 0.09
      gain.connect(context.destination)
      const voices = [110, 164.81, 220].map((frequency, index) => {
        const oscillator = context.createOscillator()
        oscillator.type = index === 1 ? "triangle" : "sine"
        oscillator.frequency.value = frequency
        oscillator.detune.value = index * 4 - 4
        oscillator.connect(gain)
        oscillator.start()
        return oscillator
      })
      audio.current = { context, gain, voices }
    }
    if (playing) await audio.current.context.suspend()
    else await audio.current.context.resume()
    setPlaying(!playing)
  }

  <div class="player">
    <button
      class="icon-button"
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause ambient audio" : "Play ambient audio"}
    >
      {playing ? "Ⅱ" : "▶"}
    </button>
    <span>ambient</span>
    <input
      aria-label="Ambient volume"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={volume}
      onInput={(event) => {
        const next = Number((event.currentTarget as HTMLInputElement).value)
        setVolume(next)
        if (audio.current) audio.current.gain.gain.value = next * 0.09
      }}
    />
  </div>
}
