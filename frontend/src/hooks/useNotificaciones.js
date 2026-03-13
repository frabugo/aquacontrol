import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getVapidKey, subscribePush } from '../services/pushService'

// Registrar service worker
const registrarSW = async () => {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    return reg
  } catch(e) {
    return null
  }
}

// Suscribir a Web Push
const suscribirPush = async (reg) => {
  try {
    if (!reg?.pushManager) return

    // Verificar si ya hay suscripcion activa
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      // Enviar al backend por si cambio de usuario
      await subscribePush(existing.toJSON())
      return
    }

    // Obtener clave VAPID del backend
    const vapidKey = await getVapidKey()
    if (!vapidKey) return

    // Convertir base64 a Uint8Array
    const padding = '='.repeat((4 - vapidKey.length % 4) % 4)
    const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const key = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i)

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    })

    await subscribePush(subscription.toJSON())
    console.log('Push subscription activa')
  } catch (e) {
    console.error('Error suscribiendo push:', e.message)
  }
}

// Hablar con Web Speech API
const hablar = (texto) => {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(texto)
  utterance.lang   = 'es-PE'
  utterance.rate   = 0.95
  utterance.pitch  = 1.1
  utterance.volume = 1.0

  const voces = window.speechSynthesis.getVoices()
  const vozES = voces.find(v =>
    v.lang.startsWith('es') && v.localService
  ) || voces.find(v =>
    v.lang.startsWith('es')
  )
  if (vozES) utterance.voice = vozES
  window.speechSynthesis.speak(utterance)
}

// Sonido de alerta con Web Audio API
const sonarAlerta = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()

    const secuencia = [
      { freq: 880, t: 0.0,  dur: 0.15 },
      { freq: 880, t: 0.2,  dur: 0.15 },
      { freq: 1100,t: 0.4,  dur: 0.3  },
    ]
    secuencia.forEach(({ freq, t, dur }) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, ctx.currentTime + t)
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + dur + 0.05)
    })
  } catch(e) {}
}

export const useNotificaciones = () => {
  const { user } = useAuth()
  const swRegRef = useRef(null)

  // Registrar SW y cargar voces al inicio
  useEffect(() => {
    if (!user?.notif_pedidos) return

    registrarSW().then(reg => {
      swRegRef.current = reg
      // Si ya tiene permiso, suscribir a push silenciosamente
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && reg) {
        suscribirPush(reg)
      }
    })

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged =
        () => window.speechSynthesis.getVoices()
    }
  }, [user?.notif_pedidos])

  const solicitarPermiso = useCallback(async () => {
    if (!('Notification' in window)) return 'no_soportado'
    if (Notification.permission === 'granted') {
      // Ya tiene permiso, suscribir a push
      if (swRegRef.current) await suscribirPush(swRegRef.current)
      return 'granted'
    }
    if (Notification.permission === 'denied') return 'denied'

    const result = await Notification.requestPermission()
    if (result === 'granted' && swRegRef.current) {
      await suscribirPush(swRegRef.current)
    }
    return result
  }, [])

  const notificarNuevoPedido = useCallback(
    async (pedido) => {
      const nombre = user?.nombre?.split(' ')[0] || 'Repartidor'
      const texto  = `Hola ${nombre}, tienes un nuevo pedido`

      // 1. Sonido
      sonarAlerta()

      // 2. Voz
      setTimeout(() => hablar(texto), 300)

      // 3. Notification nativa (bonus — la push real viene del servidor)
      try {
        const permiso = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
        if (swRegRef.current?.active && permiso === 'granted') {
          swRegRef.current.active.postMessage({
            tipo: 'nuevo_pedido', nombre,
            numero: pedido.numero || '', cantidad: pedido.cantidad || 1,
          })
        } else if (permiso === 'granted') {
          new Notification('Nuevo pedido', { body: texto, icon: '/icons/icon-192.png' })
        }
      } catch(e) {}
    },
    [user?.nombre]
  )

  return { solicitarPermiso, notificarNuevoPedido }
}

export default useNotificaciones
