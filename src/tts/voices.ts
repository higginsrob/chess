import { useEffect, useState } from 'react'

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return window.speechSynthesis.getVoices()
}

export function findVoice(voiceURI: string): SpeechSynthesisVoice | null {
  if (!voiceURI) return null
  return listVoices().find((v) => v.voiceURI === voiceURI) ?? null
}

export function voiceLabel(voice: SpeechSynthesisVoice): string {
  return `${voice.name} (${voice.lang})`
}

export function previewVoice(voiceURI: string, text = 'Knight to f 3'): void {
  if (!speechSupported()) return
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = findVoice(voiceURI)
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}

export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices)

  useEffect(() => {
    if (!speechSupported()) return
    const update = () => setVoices(listVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  return voices
}
