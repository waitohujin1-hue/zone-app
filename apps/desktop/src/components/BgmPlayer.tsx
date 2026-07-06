import { useEffect, useRef, useState } from 'react'

type BgmMode = 'off' | 'white' | 'brown' | 'binaural-alpha' | 'binaural-gamma' | 'files'
type StoppableNode = AudioNode & { stop?: () => void }

// The slider still reads 0-100%, but actual output is scaled down to ~10%
// of that on top -- generated noise/tones at full slider volume were far
// louder than a background focus aid should be.
const MASTER_ATTENUATION = 0.1

const MODE_LABELS: Record<BgmMode, string> = {
  off: 'オフ',
  white: 'ホワイトノイズ',
  brown: 'ブラウンノイズ(低音・雨音に近い)',
  'binaural-alpha': 'バイノーラルビート α波 10Hz(リラックス集中)',
  'binaural-gamma': 'バイノーラルビート γ波 40Hz(実験的)',
  files: '自分のBGMファイルを使う',
}

export function BgmPlayer() {
  const [mode, setMode] = useState<BgmMode>('off')
  const [volume, setVolume] = useState(0.1)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<StoppableNode[]>([])
  const gainRef = useRef<GainNode | null>(null)
  const [files, setFiles] = useState<{ name: string; url: string }[]>([])
  const [fileIndex, setFileIndex] = useState(0)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const stopGenerated = () => {
    nodesRef.current.forEach((n) => {
      try {
        n.stop?.()
      } catch {
        /* already stopped */
      }
      n.disconnect()
    })
    nodesRef.current = []
  }

  const ensureContext = () => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext()
      const gain = ctx.createGain()
      gain.gain.value = volume * MASTER_ATTENUATION
      gain.connect(ctx.destination)
      audioCtxRef.current = ctx
      gainRef.current = gain
    }
    return audioCtxRef.current
  }

  const playNoise = (kind: 'white' | 'brown') => {
    const ctx = ensureContext()
    const bufferSize = 2 * ctx.sampleRate
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    if (kind === 'white') {
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    } else {
      let lastOut = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        const value = (lastOut + 0.02 * white) / 1.02
        lastOut = value
        data[i] = value * 3.5
      }
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gainRef.current!)
    source.start()
    nodesRef.current = [source]
  }

  const playBinaural = (beatHz: number) => {
    const ctx = ensureContext()
    const base = 200
    const merger = ctx.createChannelMerger(2)
    const left = ctx.createOscillator()
    left.frequency.value = base
    const right = ctx.createOscillator()
    right.frequency.value = base + beatHz
    left.connect(merger, 0, 0)
    right.connect(merger, 0, 1)
    merger.connect(gainRef.current!)
    left.start()
    right.start()
    nodesRef.current = [left, right, merger]
  }

  useEffect(() => {
    stopGenerated()
    audioElRef.current?.pause()
    if (mode === 'white' || mode === 'brown') {
      playNoise(mode)
    } else if (mode === 'binaural-alpha') {
      playBinaural(10)
    } else if (mode === 'binaural-gamma') {
      playBinaural(40)
    }
    // Only the mode should retrigger sound generation; volume/files are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    const ctx = audioCtxRef.current
    const gain = gainRef.current
    if (ctx && gain) {
      // Jumping gain.value directly creates a waveform discontinuity (an
      // audible click/pop), especially while dragging the slider. Ramping
      // to the target over a short time constant keeps it smooth.
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setTargetAtTime(volume * MASTER_ATTENUATION, ctx.currentTime, 0.015)
    }
    if (audioElRef.current) audioElRef.current.volume = volume * MASTER_ATTENUATION
  }, [volume])

  useEffect(() => {
    return () => {
      stopGenerated()
      void audioCtxRef.current?.close()
    }
  }, [])

  const onPickFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const picked = Array.from(fileList).map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))
    setFiles(picked)
    setFileIndex(0)
    setMode('files')
  }

  useEffect(() => {
    if (mode === 'files' && audioElRef.current && files[fileIndex]) {
      audioElRef.current.src = files[fileIndex].url
      audioElRef.current.volume = volume * MASTER_ATTENUATION
      void audioElRef.current.play()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fileIndex, files])

  return (
    <div className="bgm-player">
      <h3>集中BGM</h3>
      <select value={mode} onChange={(e) => setMode(e.target.value as BgmMode)}>
        {(Object.keys(MODE_LABELS) as BgmMode[]).map((m) => (
          <option key={m} value={m}>
            {MODE_LABELS[m]}
          </option>
        ))}
      </select>
      <div className="bgm-volume">
        <label>音量</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
      {mode === 'files' && (
        <div className="bgm-files">
          <input type="file" accept="audio/*" multiple onChange={(e) => onPickFiles(e.target.files)} />
          {files.length > 0 && (
            <div className="bgm-file-list">
              {files.map((f, i) => (
                <button
                  key={f.url}
                  className={i === fileIndex ? 'bgm-file bgm-file--active' : 'bgm-file'}
                  onClick={() => setFileIndex(i)}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <audio ref={audioElRef} onEnded={() => setFileIndex((i) => (i + 1) % Math.max(files.length, 1))} />
        </div>
      )}
    </div>
  )
}
