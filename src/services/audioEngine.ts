class AudioEngine {
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private startedAt = 0
  private offsetMs = 0
  private _isPlaying = false
  private _playbackRate = 1.0
  // Громкость только музыки: песня идёт через musicGain, а бипы хит-саундов — мимо
  // (прямо в destination), поэтому слайдер музыки на них не влияет.
  private musicGain: GainNode | null = null
  private _volume = 1.0
  private endListeners: Array<() => void> = []
  private loadListeners: Array<() => void> = []
  // Поколение загрузки: параллельные decodeAudioData завершаются в произвольном
  // порядке (быстрое переключение вкладок) — буфер выставляет только последний вызов.
  private loadGen = 0

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  private getMusicGain(): GainNode {
    if (!this.musicGain) {
      const ctx = this.getCtx()
      this.musicGain = ctx.createGain()
      this.musicGain.gain.value = this._volume
      this.musicGain.connect(ctx.destination)
    }
    return this.musicGain
  }

  async loadBlob(blob: Blob): Promise<void> {
    const gen = ++this.loadGen
    const ctx = this.getCtx()
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    if (gen !== this.loadGen) return // за время декодирования запросили другой файл
    this.buffer = buffer
    this.loadListeners.forEach(cb => cb())
  }

  play(fromMs: number): void {
    if (!this.buffer) return
    const ctx = this.getCtx()
    // Контекст, созданный вне пользовательского жеста (загрузка аудио при
    // восстановлении сессии), браузер держит в suspended — без resume() звука нет
    // и ctx.currentTime заморожен. play() всегда вызывается из жеста, resume законен.
    if (ctx.state === 'suspended') void ctx.resume()
    this._stopSource()
    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.playbackRate.value = this._playbackRate
    this.source.connect(this.getMusicGain())
    this.offsetMs = Math.max(0, fromMs)
    this.startedAt = ctx.currentTime
    this.source.start(0, this.offsetMs / 1000)
    this._isPlaying = true
    this.source.onended = () => {
      if (this._isPlaying) {
        // Фиксируем позицию ДО сброса флага: иначе getCurrentMs() вернёт offsetMs
        // момента старта и курсор прыгнет назад к точке, где нажали Play.
        this.offsetMs = this.getCurrentMs()
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

  // Перевод позиции песни (мс) в момент AudioContext-времени — для точного
  // планирования бипов наперёд. Валидно только во время воспроизведения.
  msToCtxTime(ms: number): number | null {
    if (!this._isPlaying || !this.ctx) return null
    return this.startedAt + (ms - this.offsetMs) / (1000 * this._playbackRate)
  }

  // Короткий бип-«ассист-тик» для нот, прилетающих к курсору. Осциллятор создаётся
  // разово под каждый бип; мягкая огибающая (атака/спад ~3мс) убирает щелчки.
  scheduleBeep(freq: number, atCtxTime: number, durationSec = 0.03, peak = 0.8): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = Math.max(atCtxTime, ctx.currentTime)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.003)
    gain.gain.linearRampToValueAtTime(0, t + durationSec)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + durationSec + 0.01)
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

  // Громкость музыки 0..1. Не создаёт AudioContext заранее (на mount): только
  // запоминает значение; узел подхватит его при следующем play (getMusicGain).
  setVolume(v: number): void {
    this._volume = Math.min(1, Math.max(0, v))
    if (this.musicGain) this.musicGain.gain.value = this._volume
  }

  getVolume(): number {
    return this._volume
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
