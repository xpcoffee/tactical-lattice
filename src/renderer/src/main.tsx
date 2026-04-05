import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'
import { EventBus } from './phaser/EventBus'

performance.mark('app:js-start')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

performance.mark('app:react-mounted')

EventBus.once('scene-ready', () => {
  performance.mark('app:phaser-ready')
  const jsStart   = performance.getEntriesByName('app:js-start')[0].startTime
  const reactTime = performance.measure('react-mount', 'app:js-start', 'app:react-mounted').duration
  const phaserTime = performance.measure('phaser-init', 'app:react-mounted', 'app:phaser-ready').duration
  const totalTime  = performance.now() - jsStart
  console.log(
    `[startup] react: ${reactTime.toFixed(0)} ms | phaser: ${phaserTime.toFixed(0)} ms | total: ${totalTime.toFixed(0)} ms`
  )
})
