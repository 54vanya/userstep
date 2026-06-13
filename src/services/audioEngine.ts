class AudioEngine {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private startedAt = 0
  private offsetMs = 0
  private _isPlaying = false
  private _playbackRate = 1.0
  private endListeners: Array<() => void> = []
  private loadListeners: Array<() => void> = []

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  async loadBlob(blob: Blob): Promise<void> {
    const ctx = this.getCtx()
    const arrayBuffer = await blob.arrayBuffer()
    this.buffer = await ctx.decodeAudioData(arrayBuffer)
    this.loadListeners.forEach(cb => cb())
  }

  play(fromMs: number): void {
    if (!this.buffer) return
    const ctx = this.getCtx()
    this._stopSource()
    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.playbackRate.value = this._playbackRate
    this.source.connect(ctx.destination)
    this.offsetMs = Math.max(0, fromMs)
    this.startedAt = ctx.currentTime
    this.source.start(0, this.offsetMs / 1000)
    this._isPlaying = true
    this.source.onended = () => {
      if (this._isPlaying) {
        this._isPlaying = false
        this.endListeners.forEach(cb => cb())
      }
    }
  }

  pause(): void {
    if (!this._isPlaying) return
    this.offsetMs = this.getCurrentMs()
    this._stopSource()
  }

  private _stopSource(): void {
    if (this.source) {
      this.source.onended = null
      try { this.source.stop() } catch { /* already stopped */ }
      this.source.disconnect()
      this.source = null
    }
    this._isPlaying = false
  }

  getCurrentMs(): number {
    if (!this._isPlaying || !this.ctx) return this.offsetMs
    return this.offsetMs + (this.ctx.currentTime - this.startedAt) * 1000 * this._playbackRate
  }

  setPlaybackRate(rate: number): void {
    if (this._isPlaying) {
      const currentMs = this.getCurrentMs()
      this._playbackRate = rate
      this.play(currentMs)
    } else {
      this._playbackRate = rate
    }
  }

  isPlaying(): boolean {
    return this._isPlaying
  }

  getPlaybackRate(): number {
    return this._playbackRate
  }

  hasAudio(): boolean {
    return this.buffer !== null
  }

  on(event: 'end' | 'load', cb: () => void): void {
    if (event === 'load') this.loadListeners.push(cb)
    else this.endListeners.push(cb)
  }

  off(event: 'end' | 'load', cb: () => void): void {
    if (event === 'load') this.loadListeners = this.loadListeners.filter(l => l !== cb)
    else this.endListeners = this.endListeners.filter(l => l !== cb)
  }
}

export const audioEngine = new AudioEngine()
